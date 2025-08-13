const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { DateTime } = require('luxon');
const GerenciadorMidia = require('../../BOT/utils/midia.js');
const { sendFacebookEvent, generateEventId, generateHashedUserData } = require('../../services/facebook');
const { mergeTrackingData, isRealTrackingData } = require('../../services/trackingValidation');
const { formatForCAPI } = require('../../services/purchaseValidation');
const { getInstance: getSessionTracking } = require('../../services/sessionTracking');
const { enviarConversaoParaUtmify } = require('../../services/utmify');
const googleSheetsService = require('../../services/googleSheets.js');

// Fila global para controlar a geração de cobranças e evitar erros 429
const cobrancaQueue = [];
let processingCobrancaQueue = false;

async function processCobrancaQueue() {
  if (processingCobrancaQueue) return;
  processingCobrancaQueue = true;
  try {
    while (cobrancaQueue.length > 0) {
      const task = cobrancaQueue.shift();
      try {
        await task();
      } catch (err) {
        console.error('Erro ao processar fila de cobrança:', err.message);
      }
      await new Promise(r => setTimeout(r, 200));
    }
  } finally {
    // Garante desbloqueio em caso de erro
    processingCobrancaQueue = false;
  }
}


class TelegramBotService {
  constructor(options = {}) {
    this.token = options.token;
    this.baseUrl = options.baseUrl;
    // url utilizada na geração dos links enviados aos usuários
    this.frontendUrl = options.frontendUrl || process.env.FRONTEND_URL || options.baseUrl;
    this.config = options.config || {};
    this.postgres = options.postgres;
    this.sqlite = options.sqlite;
    this.botId = options.bot_id || 'bot';
    let grupo = 'G1';
    if (this.token === process.env.TELEGRAM_TOKEN_BOT2) grupo = 'G2';
    this.grupo = grupo;
    this.pgPool = this.postgres ? this.postgres.createPool() : null;
    if (this.pgPool) {
      this.postgres.limparDownsellsAntigos(this.pgPool);
      setInterval(() => this.postgres.limparDownsellsAntigos(this.pgPool), 60 * 60 * 1000);
    }
    this.processingDownsells = new Map();
    // Registrar arquivos de mídia de downsell ausentes já reportados
    this.loggedMissingDownsellFiles = new Set();
    // Map para armazenar fbp/fbc/ip de cada usuário (legacy - será removido)
    this.trackingData = new Map();
    // Map para deduplicação do evento AddToCart por usuário
    this.addToCartCache = new Map();
    // Serviço de rastreamento de sessão invisível
    this.sessionTracking = getSessionTracking();
    this.bot = null;
    this.db = null;
    this.gerenciadorMidia = new GerenciadorMidia();
    this.agendarMensagensPeriodicas();
    this.agendarLimpezaTrackingData();
  }

  iniciar() {
    if (!this.token) {
      console.error(`[${this.botId}] TELEGRAM_TOKEN não definido`);
      return;
    }
    if (!this.baseUrl) {
      console.error(`[${this.botId}] BASE_URL não definida`);
    }
    this.db = this.sqlite ? this.sqlite.initialize() : null;
    if (this.db) {
      try {
        this.db.prepare(`ALTER TABLE tokens ADD COLUMN usado INTEGER DEFAULT 0`).run();
        console.log(`[${this.botId}] 🧩 Coluna 'usado' adicionada ao SQLite`);
      } catch (e) {
        if (!e.message.includes('duplicate column name')) {
          console.error(`[${this.botId}] ⚠️ Erro ao adicionar coluna 'usado' no SQLite:`, e.message);
        }
      }
    }

    console.log(`\n[${this.botId}] 🔍 Verificando integridade das mídias...`);
    const integridade = this.gerenciadorMidia.verificarIntegridade();
    console.log(`[${this.botId}] ✅ Sistema de mídias inicializado (${integridade.porcentagem}% das mídias disponíveis)\n`);

    this.bot = new TelegramBot(this.token, { polling: false });
    if (this.baseUrl) {
      const webhookUrl = `${this.baseUrl}/${this.botId}/webhook`;
      this.bot
        .setWebHook(webhookUrl)
        .then(() => {
          console.log(`[${this.botId}] ✅ Webhook configurado: ${webhookUrl}`);
          return this.bot.getWebHookInfo();
        })
        .then(info => {
          console.log(
            `[${this.botId}] ℹ️ getWebhookInfo -> URL: ${info.url}, erro: ${info.last_error_message || 'nenhum'}`
          );
        })
        .catch(err =>
          console.error(`[${this.botId}] ❌ Erro ao configurar webhook:`, err)
        );
    }

    this.registrarComandos();
    console.log(`[${this.botId}] ✅ Bot iniciado`);
  }

  normalizeTelegramId(id) {
    if (id === null || id === undefined) return null;
    const parsed = parseInt(id.toString(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  getTrackingData(id) {
    const cleanId = this.normalizeTelegramId(id);
    if (cleanId === null) {
      console.warn(`[${this.botId}] ID inválido ao acessar trackingData:`, id);
      return undefined;
    }
    return this.trackingData.get(cleanId);
  }

  async salvarTrackingData(telegramId, data, forceOverwrite = false) {
    const cleanTelegramId = this.normalizeTelegramId(telegramId);
    if (cleanTelegramId === null || !data) return;

    const newQuality = isRealTrackingData(data) ? 'real' : 'fallback';
    const existing = this.getTrackingData(telegramId);
    const existingQuality = existing
      ? existing.quality || (isRealTrackingData(existing) ? 'real' : 'fallback')
      : null;

    // 🔥 NOVO: Verificar se UTMs são diferentes
    const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    let hasUtmChanges = false;
    
    if (existing) {
      hasUtmChanges = utmFields.some(field => {
        const existingValue = existing[field] || null;
        const newValue = data[field] || null;
        return existingValue !== newValue;
      });
    }

    console.log(`[${this.botId}] [DEBUG] UTMs diferentes detectados: ${hasUtmChanges} para ${telegramId}`);
    if (hasUtmChanges) {
      console.log(`[${this.botId}] [DEBUG] UTMs existentes:`, utmFields.reduce((acc, field) => ({ ...acc, [field]: existing?.[field] || null }), {}));
      console.log(`[${this.botId}] [DEBUG] UTMs novos:`, utmFields.reduce((acc, field) => ({ ...acc, [field]: data[field] || null }), {}));
    }

    // ✅ REGRA 1: Se forceOverwrite é true (vem de payload), sempre sobrescrever
    if (forceOverwrite) {
      console.log(
        `[${this.botId}] [DEBUG] Forçando sobrescrita de tracking para ${telegramId} (payload associado)`
      );
      // Pula todas as verificações e força a sobrescrita
    }
    // ✅ REGRA 2: Se tracking é real mas UTMs são diferentes, permitir atualização
    else if (existingQuality === 'real' && newQuality === 'fallback' && !hasUtmChanges) {
      console.log(
        `[${this.botId}] [DEBUG] Dados reais já existentes e UTMs iguais. Fallback ignorado para ${telegramId}`
      );
      return;
    }

    // ✅ REGRA 3: Se tracking é real e UTMs são diferentes, forçar atualização
    else if (existingQuality === 'real' && hasUtmChanges) {
      console.log(
        `[${this.botId}] [DEBUG] UTMs diferentes detectados. Atualizando tracking real para ${telegramId}`
      );
      // Força atualização independente da qualidade dos novos dados
    } else if (!forceOverwrite) {
      // ✅ REGRA 4: Lógica original para casos sem mudança de UTMs (só se não for forceOverwrite)
      let shouldOverwrite = true;
      if (existing) {
        if (newQuality === 'fallback' && existingQuality === 'fallback') {
          const campos = ['fbp', 'fbc', 'ip', 'user_agent'];
          const countExisting = campos.reduce((acc, c) => acc + (existing[c] ? 1 : 0), 0);
          const countNew = campos.reduce((acc, c) => acc + (data[c] ? 1 : 0), 0);
          shouldOverwrite = countNew > countExisting;
        }
      }

      if (!shouldOverwrite) {
        console.log(
          `[${this.botId}] [DEBUG] Tracking data existente é melhor ou igual. Não sobrescrevendo para ${telegramId}`
        );
        return;
      }
    }

    // ✅ REGRA 4: Preservar dados de qualidade quando apenas UTMs mudam
    let finalEntry;
    if (existingQuality === 'real' && hasUtmChanges && newQuality === 'fallback') {
      // Manter dados de qualidade existentes, mas atualizar UTMs
      finalEntry = {
        utm_source: data.utm_source || existing.utm_source || null,
        utm_medium: data.utm_medium || existing.utm_medium || null,
        utm_campaign: data.utm_campaign || existing.utm_campaign || null,
        utm_term: data.utm_term || existing.utm_term || null,
        utm_content: data.utm_content || existing.utm_content || null,
        fbp: existing.fbp || data.fbp || null, // Priorizar dados existentes de qualidade
        fbc: existing.fbc || data.fbc || null,
        ip: existing.ip || data.ip || null,
        user_agent: existing.user_agent || data.user_agent || null,
        quality: existingQuality, // Manter qualidade real
        created_at: Date.now()
      };
      console.log(`[${this.botId}] [DEBUG] Preservando qualidade real e atualizando UTMs para ${telegramId}`);
    } else {
      // Comportamento padrão
      finalEntry = {
        utm_source: data.utm_source || null,
        utm_medium: data.utm_medium || null,
        utm_campaign: data.utm_campaign || null,
        utm_term: data.utm_term || null,
        utm_content: data.utm_content || null,
        fbp: data.fbp || null,
        fbc: data.fbc || null,
        ip: data.ip || null,
        user_agent: data.user_agent || null,
        quality: newQuality,
        created_at: Date.now()
      };
    }
    this.trackingData.set(cleanTelegramId, finalEntry);
    console.log(`[${this.botId}] [DEBUG] Tracking data salvo para ${cleanTelegramId}:`, finalEntry);
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT OR REPLACE INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)'
        ).run(
          cleanTelegramId,
          finalEntry.utm_source,
          finalEntry.utm_medium,
          finalEntry.utm_campaign,
          finalEntry.utm_term,
          finalEntry.utm_content,
          finalEntry.fbp,
          finalEntry.fbc,
          finalEntry.ip,
          finalEntry.user_agent
        );
      } catch (e) {
        console.error(`[${this.botId}] Erro ao salvar tracking SQLite:`, e.message);
      }
    }
    if (this.pgPool) {
      try {
        await this.postgres.executeQuery(
          this.pgPool,
          `INSERT INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (telegram_id) DO UPDATE SET utm_source=EXCLUDED.utm_source, utm_medium=EXCLUDED.utm_medium, utm_campaign=EXCLUDED.utm_campaign, utm_term=EXCLUDED.utm_term, utm_content=EXCLUDED.utm_content, fbp=EXCLUDED.fbp, fbc=EXCLUDED.fbc, ip=EXCLUDED.ip, user_agent=EXCLUDED.user_agent, created_at=EXCLUDED.created_at`,
          [cleanTelegramId, finalEntry.utm_source, finalEntry.utm_medium, finalEntry.utm_campaign, finalEntry.utm_term, finalEntry.utm_content, finalEntry.fbp, finalEntry.fbc, finalEntry.ip, finalEntry.user_agent]
        );
      } catch (e) {
        console.error(`[${this.botId}] Erro ao salvar tracking PG:`, e.message);
      }
    }
  }

  async buscarTrackingData(telegramId) {
    const cleanTelegramId = this.normalizeTelegramId(telegramId);
    if (cleanTelegramId === null) return null;
    let row = null;
    if (this.db) {
      try {
        row = this.db
          .prepare('SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent FROM tracking_data WHERE telegram_id = ?')
          .get(cleanTelegramId);
      } catch (e) {
        console.error(`[${this.botId}] Erro ao buscar tracking SQLite:`, e.message);
      }
    }
    if (!row && this.pgPool) {
      try {
        const res = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent FROM tracking_data WHERE telegram_id = $1',
          [cleanTelegramId]
        );
        row = res.rows[0];
      } catch (e) {
        console.error(`[${this.botId}] Erro ao buscar tracking PG:`, e.message);
      }
    }
    if (row) {
      row.created_at = Date.now();
      this.trackingData.set(cleanTelegramId, row);
    }
    return row;
  }

  /**
   * Busca o token mais recente de um usuário pelo telegram_id
   * @param {number} chatId - ID do chat do Telegram
   * @returns {string|null} Token mais recente ou null se não encontrado
   */
  async buscarTokenUsuario(chatId) {
    const cleanTelegramId = this.normalizeTelegramId(chatId);
    if (cleanTelegramId === null) return null;
    
    let row = null;
    
    // Tentar SQLite primeiro
    if (this.db) {
      try {
        row = this.db.prepare(`
          SELECT token 
          FROM tokens 
          WHERE telegram_id = ? AND status = 'valido' AND token IS NOT NULL
          ORDER BY criado_em DESC
          LIMIT 1
        `).get(cleanTelegramId);
      } catch (error) {
        console.warn(`[${this.botId}] Erro ao buscar token SQLite para usuário ${chatId}:`, error.message);
      }
    }
    
    // Se não encontrou no SQLite, tentar PostgreSQL
    if (!row && this.pgPool) {
      try {
        const result = await this.postgres.executeQuery(
          this.pgPool,
          `SELECT token 
           FROM tokens 
           WHERE telegram_id = $1 AND status = 'valido' AND token IS NOT NULL
           ORDER BY criado_em DESC
           LIMIT 1`,
          [cleanTelegramId]
        );
        row = result.rows[0];
      } catch (error) {
        console.warn(`[${this.botId}] Erro ao buscar token PostgreSQL para usuário ${chatId}:`, error.message);
      }
    }
    
    return row ? row.token : null;
  }

  async cancelarDownsellPorBloqueio(chatId) {
    console.warn(`⚠️ Usuário bloqueou o bot, cancelando downsell para chatId: ${chatId}`);
    if (!this.pgPool) return;
    try {
      const cleanTelegramId = this.normalizeTelegramId(chatId);
      if (cleanTelegramId === null) return;
      await this.postgres.executeQuery(
        this.pgPool,
        'DELETE FROM downsell_progress WHERE telegram_id = $1',
        [cleanTelegramId]
      );
    } catch (err) {
      console.error(`[${this.botId}] Erro ao remover downsell de ${chatId}:`, err.message);
    }
  }

  async processarImagem(imageBuffer) {
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      sharp = null;
    }
    if (!sharp) return imageBuffer;
    try {
      return await sharp(imageBuffer)
        .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
    } catch (err) {
      console.warn(`[${this.botId}] Erro ao processar imagem:`, err.message);
      return imageBuffer;
    }
  }

  async enviarMidiaComFallback(chatId, tipo, caminho, opcoes = {}) {
    if (!caminho) return false;
    try {
      // 🔥 OTIMIZAÇÃO 1: Verificar cache de file_id primeiro
      if (!caminho.startsWith('http') && this.gerenciadorMidia && this.gerenciadorMidia.temFileIdCache(caminho)) {
        const fileId = this.gerenciadorMidia.obterFileId(caminho);
        console.log(`[${this.botId}] 🚀 Usando file_id cacheado para: ${caminho}`);
        
        try {
          switch (tipo) {
            case 'photo':
              await this.bot.sendPhoto(chatId, fileId, opcoes); break;
            case 'video':
              await this.bot.sendVideo(chatId, fileId, opcoes); break;
            case 'audio':
              await this.bot.sendVoice(chatId, fileId, opcoes); break;
            default:
              return false;
          }
          console.log(`[${this.botId}] ✅ Mídia enviada com sucesso usando file_id cacheado`);
          return true;
        } catch (fileIdError) {
          // 🔥 Se file_id falhar, remover do cache e tentar upload normal
          console.warn(`[${this.botId}] ⚠️ File ID falhou, removendo do cache: ${caminho}`);
          this.gerenciadorMidia.removerFileId(caminho);
          // Continuar para upload normal
        }
      }

      // Upload normal (primeira vez ou após falha do file_id)
      if (caminho.startsWith('http')) {
        switch (tipo) {
          case 'photo':
            await this.bot.sendPhoto(chatId, caminho, opcoes); break;
          case 'video':
            await this.bot.sendVideo(chatId, caminho, opcoes); break;
          case 'audio':
            await this.bot.sendVoice(chatId, caminho, opcoes); break;
          default:
            return false;
        }
        return true;
      }
      
      const abs = path.resolve(path.join(__dirname, '..', 'BOT'), caminho);
      if (!fs.existsSync(abs)) {
        const downsellPath = path.join('midia', 'downsells') + path.sep;
        if (abs.includes(downsellPath)) {
          if (!this.loggedMissingDownsellFiles.has(abs)) {
            this.loggedMissingDownsellFiles.add(abs);
            console.warn(`[${this.botId}] Arquivo não encontrado ${abs}`);
          }
        } else {
          console.warn(`[${this.botId}] Arquivo não encontrado ${abs}`);
        }
        return false;
      }
      
      const stream = fs.createReadStream(abs);
      let result;
      
      switch (tipo) {
        case 'photo':
          result = await this.bot.sendPhoto(chatId, stream, opcoes); break;
        case 'video':
          result = await this.bot.sendVideo(chatId, stream, opcoes); break;
        case 'audio':
          result = await this.bot.sendVoice(chatId, stream, opcoes); break;
        default:
          return false;
      }
      
      // 🔥 OTIMIZAÇÃO 1: Salvar file_id no cache após upload bem-sucedido
      if (result && result.photo && result.photo[0] && result.photo[0].file_id) {
        this.gerenciadorMidia.salvarFileId(caminho, result.photo[0].file_id);
      } else if (result && result.video && result.video.file_id) {
        this.gerenciadorMidia.salvarFileId(caminho, result.video.file_id);
      } else if (result && result.voice && result.voice.file_id) {
        this.gerenciadorMidia.salvarFileId(caminho, result.voice.file_id);
      }
      
      return true;
    } catch (err) {
      if (err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
        err.blockedByUser = true;
        throw err;
      }
      console.error(`[${this.botId}] Erro ao enviar mídia ${tipo}:`, err.message);
      return false;
    }
  }

  async enviarMidiasHierarquicamente(chatId, midias) {
    if (!midias) return;
    const ordem = ['audio', 'video', 'photo'];
    for (const tipo of ordem) {
      let caminho = null;
      if (tipo === 'photo') {
        caminho = midias.foto || midias.imagem;
      } else {
        caminho = midias[tipo];
      }
      if (!caminho) continue;
      await this.enviarMidiaComFallback(chatId, tipo, caminho);
    }
  }

async _executarGerarCobranca(req, res) {
  // 🔥 CORREÇÃO IMPLEMENTADA: Priorização de UTMs da requisição atual
  // ===================================================================
  // Esta função agora garante que UTMs vindos na requisição atual (req.body)
  // sempre sobrescrevam os dados antigos de tracking, conforme solicitado.
  // 
  // Implementação:
  // 1. UTMs do req.body têm prioridade absoluta sobre dados salvos
  // 2. trackingFinal é criado com merge + sobrescrita manual dos UTMs do req.body
  // 3. Todos os destinos (banco, PushinPay, Facebook CAPI) usam os UTMs finais
  // 
  // Campos afetados: utm_source, utm_medium, utm_campaign, utm_term, utm_content
  // ===================================================================
  
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const {
    plano,
    valor,
    event_source_url,
    telegram_id
  } = req.body;

  // 🔥 NOVO: Obter nome da oferta baseado no plano
  let nomeOferta = 'Oferta Desconhecida';
  if (plano) {
    // Buscar o plano na configuração
    const planoEncontrado = this.config.planos.find(p => p.id === plano || p.nome === plano);
    if (planoEncontrado) {
      nomeOferta = planoEncontrado.nome;
    } else {
      // Buscar nos downsells
      for (const ds of this.config.downsells) {
        const p = ds.planos.find(pl => pl.id === plano || pl.nome === plano);
        if (p) {
          nomeOferta = p.nome;
          break;
        }
      }
    }
  }
  
  console.log('[DEBUG] Nome da oferta identificado:', nomeOferta);

  // Garantir que trackingData seja sempre um objeto
  const tracking = req.body.trackingData || {};

  // 🔧 LOGS DE SEGURANÇA ADICIONAIS PARA DEBUG
  console.log('[SECURITY DEBUG] req.body.trackingData tipo:', typeof req.body.trackingData);
  console.log('[SECURITY DEBUG] req.body.trackingData valor:', req.body.trackingData);
  console.log('[SECURITY DEBUG] tracking após fallback:', tracking);
  console.log('[SECURITY DEBUG] tracking é null?', tracking === null);
  console.log('[SECURITY DEBUG] tracking é undefined?', tracking === undefined);
  console.log('[SECURITY DEBUG] typeof tracking:', typeof tracking);

  // Acesso seguro aos campos individuais
  const utm_source = tracking.utm_source || null;
  const utm_medium = tracking.utm_medium || null;
  const utm_campaign = tracking.utm_campaign || null;
  const utm_term = tracking.utm_term || null;
  const utm_content = tracking.utm_content || null;
  const reqFbp = tracking.fbp || null;
  const reqFbc = tracking.fbc || null;
  const reqIp = tracking.ip || req.ip || null;
  const reqUa = tracking.user_agent || req.headers['user-agent'] || null;

  console.log('📡 API: POST /api/gerar-cobranca');
  console.log('🔍 Tracking recebido:', {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    fbp: reqFbp,
    fbc: reqFbc,
    ip: reqIp,
    user_agent: reqUa
  });
  console.log('[DEBUG] Dados recebidos:', { telegram_id, plano, valor });
  console.log('[DEBUG] trackingData do req.body:', req.body.trackingData);
  
  // 🔥 CORREÇÃO: Log detalhado dos UTMs recebidos
  console.log('[DEBUG] 🎯 UTMs extraídos da requisição:', {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content
  });
  console.log('[DEBUG] 🎯 UTMs origem - req.body.trackingData:', {
    utm_source: req.body.trackingData?.utm_source,
    utm_medium: req.body.trackingData?.utm_medium,
    utm_campaign: req.body.trackingData?.utm_campaign
  });
  console.log('[DEBUG] 🎯 UTMs origem - req.query:', {
    utm_source: req.query?.utm_source,
    utm_medium: req.query?.utm_medium,
    utm_campaign: req.query?.utm_campaign
  });

  if (!plano || !valor) {
    return res.status(400).json({ error: 'Parâmetros inválidos: plano e valor são obrigatórios.' });
  }

  const valorCentavos = this.config.formatarValorCentavos(valor);
  if (isNaN(valorCentavos) || valorCentavos < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
  }

  let pushPayload;
  try {
    console.log(`[DEBUG] Buscando tracking data para telegram_id: ${telegram_id}`);

    // 🔥 NOVO: Primeiro tentar buscar do SessionTracking (invisível)
    const sessionTrackingData = this.sessionTracking.getTrackingData(telegram_id);
    console.log('[DEBUG] SessionTracking data:', sessionTrackingData ? { fbp: !!sessionTrackingData.fbp, fbc: !!sessionTrackingData.fbc } : null);

    // 1. Tentar buscar do cache
    const trackingDataCache = this.getTrackingData(telegram_id);
    console.log('[DEBUG] trackingData cache:', trackingDataCache);

    // 2. Se cache vazio ou incompleto, buscar do banco
    let trackingDataDB = null;
    if (!isRealTrackingData(trackingDataCache)) {
      console.log('[DEBUG] Cache vazio ou incompleto, buscando no banco...');
      trackingDataDB = await this.buscarTrackingData(telegram_id);
      console.log('[DEBUG] trackingData banco:', trackingDataDB);
    }

    // 3. Combinar SessionTracking + cache + banco (prioridade para SessionTracking)
    let dadosSalvos = mergeTrackingData(trackingDataCache, trackingDataDB);
    if (sessionTrackingData) {
      dadosSalvos = mergeTrackingData(dadosSalvos, sessionTrackingData);
    }
    console.log('[DEBUG] dadosSalvos após merge SessionTracking+cache+banco:', dadosSalvos);

    // 2. Extrair novos dados da requisição (cookies, IP, user_agent)
    const ipRawList = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ipRaw = typeof ipRawList === 'string' ? ipRawList.split(',')[0].trim() : '';
    const ipBody = req.body.client_ip_address || req.body.ip;
    let ipCriacao = ipBody || ipRaw;
    if (ipCriacao === '::1' || ipCriacao === '127.0.0.1') ipCriacao = undefined;

    const uaCriacao = req.body.user_agent || req.get('user-agent');

    function parseCookies(str) {
      const out = {};
      if (!str) return out;
      for (const part of str.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = decodeURIComponent(part.slice(idx + 1).trim());
        out[k] = v;
      }
      return out;
    }

    const cookies = parseCookies(req.headers['cookie']);

    const dadosRequisicao = {
      fbp: reqFbp || req.body.fbp || req.body._fbp || cookies._fbp || cookies.fbp || null,
      fbc: reqFbc || req.body.fbc || req.body._fbc || cookies._fbc || cookies.fbc || null,
      ip: reqIp || ipBody || ipRaw || null,
      user_agent: reqUa || uaCriacao || null,
      // 🔥 CORREÇÃO: Incluir UTMs da URL atual
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null
    };
    console.log('[DEBUG] Dados da requisição atual:', dadosRequisicao);

    // 3. Fazer mergeTrackingData(dadosSalvos, dadosRequisicao)
    let finalTrackingData = mergeTrackingData(dadosSalvos, dadosRequisicao) || {};

    // 🔧 PROTEÇÃO CRÍTICA: Garantir que finalTrackingData nunca seja null
    if (!finalTrackingData || typeof finalTrackingData !== 'object') {
      console.error('[ERRO CRÍTICO] finalTrackingData está null ou inválido. Prosseguindo com objeto vazio.');
      finalTrackingData = {};
    }

    console.log('[DEBUG] Final tracking data após merge:', finalTrackingData);
    
    // 🔥 CORREÇÃO: Log específico dos UTMs finais
    console.log('[DEBUG] 🎯 UTMs FINAIS após merge:', {
      utm_source: finalTrackingData?.utm_source,
      utm_medium: finalTrackingData?.utm_medium,
      utm_campaign: finalTrackingData?.utm_campaign,
      utm_term: finalTrackingData?.utm_term,
      utm_content: finalTrackingData?.utm_content
    });

    // 🔥 NOVO: NUNCA gerar fallbacks para _fbp/_fbc - usar apenas dados reais do navegador
    // Se não existir, o evento CAPI será enviado sem esses campos (conforme regra 8)
    if (!finalTrackingData.fbp) {
      console.log('[INFO] 🔥 fbp não encontrado - evento CAPI será enviado sem este campo (anonimato preservado)');
    }

    if (!finalTrackingData.fbc) {
      console.log('[INFO] 🔥 fbc não encontrado - evento CAPI será enviado sem este campo (anonimato preservado)');
    }

    // IP e user_agent podem ter fallback pois são mais genéricos
    if (!finalTrackingData.ip) {
      console.log('[INFO] ip está null, usando fallback do request');
      finalTrackingData.ip = ipCriacao || '127.0.0.1';
    }

    if (!finalTrackingData.user_agent) {
      console.log('[INFO] user_agent está null, usando fallback do request');
      finalTrackingData.user_agent = uaCriacao || 'Unknown';
    }

    // 5. Salvar se o resultado final for real e o cache estiver vazio ou com fallback
    const finalReal = isRealTrackingData(finalTrackingData);
    const cacheEntry = this.getTrackingData(telegram_id);
    const cacheQuality = cacheEntry
      ? cacheEntry.quality || (isRealTrackingData(cacheEntry) ? 'real' : 'fallback')
      : null;
    console.log('[DEBUG] finalTrackingData é real?', finalReal);
    console.log('[DEBUG] Qualidade no cache:', cacheQuality);

    const shouldSave = finalReal && (!cacheEntry || cacheQuality === 'fallback');

    if (shouldSave) {
      console.log('[DEBUG] Salvando tracking data atualizado no cache');
      await this.salvarTrackingData(telegram_id, finalTrackingData);
    } else {
      console.log('[DEBUG] Tracking data não precisa ser atualizado');
    }

    console.log('[DEBUG] Tracking data final que será usado:', finalTrackingData);

    // 🔥 CORREÇÃO: Usar UTMs finais após merge (prioridade para requisição atual)
    const camposUtm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    let trackingFinal = { ...(finalTrackingData || {}) };

    // 🔧 PROTEÇÃO ADICIONAL: Garantir que trackingFinal nunca seja null ou tenha propriedades indefinidas
    if (!trackingFinal || typeof trackingFinal !== 'object') {
      console.error('[ERRO CRÍTICO] trackingFinal está null ou inválido. Recriando como objeto vazio.');
      trackingFinal = {};
    }

    console.log('[SECURITY DEBUG] trackingFinal após criação:', trackingFinal);
    console.log('[SECURITY DEBUG] trackingFinal é null?', trackingFinal === null);
    console.log('[SECURITY DEBUG] typeof trackingFinal:', typeof trackingFinal);

    // 🔧 CORREÇÃO DO BUG: Verificar se req.body.trackingData existe e não é null antes de acessar suas propriedades
    const requestTrackingData = req.body.trackingData;
    if (requestTrackingData && typeof requestTrackingData === 'object') {
      // Garantir que UTMs da requisição atual sempre sobrescrevam os dados antigos
      camposUtm.forEach(campo => {
        if (requestTrackingData[campo]) {
          trackingFinal[campo] = requestTrackingData[campo];
        }
      });
    } else {
      console.log('[DEBUG] req.body.trackingData está null, undefined ou não é um objeto - pulando sobrescrita de UTMs');
    }

    console.log('[DEBUG] 🎯 UTMs FINAIS após priorização da requisição atual:', {
      utm_source: trackingFinal?.utm_source,
      utm_medium: trackingFinal?.utm_medium,
      utm_campaign: trackingFinal?.utm_campaign,
      utm_term: trackingFinal?.utm_term,
      utm_content: trackingFinal?.utm_content
    });

    const eventTime = Math.floor(DateTime.now().setZone('America/Sao_Paulo').toSeconds());

    // 🔧 PROTEÇÃO CRÍTICA: Criar metadata de forma segura para evitar erro "Cannot read properties of null"
    const metadata = {};
    
    // Verificar se trackingFinal existe e é um objeto antes de acessar suas propriedades
    if (trackingFinal && typeof trackingFinal === 'object') {
      if (trackingFinal.utm_source) metadata.utm_source = trackingFinal.utm_source;
      if (trackingFinal.utm_medium) metadata.utm_medium = trackingFinal.utm_medium;
      if (trackingFinal.utm_campaign) metadata.utm_campaign = trackingFinal.utm_campaign;
      if (trackingFinal.utm_term) metadata.utm_term = trackingFinal.utm_term;
      if (trackingFinal.utm_content) metadata.utm_content = trackingFinal.utm_content;
    } else {
      console.error('[ERRO CRÍTICO] trackingFinal é null ou não é um objeto na criação do metadata!');
      console.error('[DEBUG] trackingFinal:', trackingFinal);
      console.error('[DEBUG] typeof trackingFinal:', typeof trackingFinal);
    }

    const webhookUrl =
      typeof this.baseUrl === 'string'
        ? `${this.baseUrl}/${this.botId}/webhook`
        : undefined;

    const pushPayload = {
      value: valorCentavos,
      split_rules: []
    };
    if (webhookUrl) pushPayload.webhook_url = webhookUrl;
    if (Object.keys(metadata).length) pushPayload.metadata = metadata;

    console.log('[DEBUG] Corpo enviado à PushinPay:', pushPayload);

    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      pushPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    const { qr_code_base64, qr_code, id: apiId } = response.data;
    const normalizedId = apiId ? apiId.toLowerCase() : null;

    if (!normalizedId) {
      throw new Error('ID da transação não retornado pela PushinPay');
    }

    if (this.db) {
      console.log('[DEBUG] Salvando token no SQLite com tracking data:', {
        telegram_id,
        valor: valorCentavos,
        utm_source: trackingFinal?.utm_source,
        utm_medium: trackingFinal?.utm_medium,
        utm_campaign: trackingFinal?.utm_campaign,
        fbp: finalTrackingData.fbp,
        fbc: finalTrackingData.fbc,
        ip: finalTrackingData.ip,
        user_agent: finalTrackingData.user_agent
      });

      this.db.prepare(
        `INSERT INTO tokens (id_transacao, token, valor, telegram_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, bot_id, status, event_time, nome_oferta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`
      ).run(
        normalizedId,
        normalizedId,
        valorCentavos,
        telegram_id,
        trackingFinal?.utm_source || null,
        trackingFinal?.utm_campaign || null,
        trackingFinal?.utm_medium || null,
        trackingFinal?.utm_term || null,
        trackingFinal?.utm_content || null,
        finalTrackingData.fbp,
        finalTrackingData.fbc,
        finalTrackingData.ip,
        finalTrackingData.user_agent,
        this.botId,
        eventTime,
        nomeOferta
      );

      console.log('✅ Token salvo no SQLite:', normalizedId);
    }

    const eventName = 'InitiateCheckout';
    const eventId = generateEventId(eventName, telegram_id, eventTime);

    console.log('[DEBUG] Enviando evento InitiateCheckout para Facebook com:', {
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      value: formatForCAPI(valorCentavos),
      utm_source: trackingFinal?.utm_source,
      utm_medium: trackingFinal?.utm_medium,
      utm_campaign: trackingFinal?.utm_campaign,
      fbp: finalTrackingData.fbp,
      fbc: finalTrackingData.fbc,
      client_ip_address: finalTrackingData.ip,
      client_user_agent: finalTrackingData.user_agent
    });

    await sendFacebookEvent({
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      value: formatForCAPI(valorCentavos),
      currency: 'BRL',
      fbp: finalTrackingData.fbp,
      fbc: finalTrackingData.fbc,
      client_ip_address: finalTrackingData.ip,
      client_user_agent: finalTrackingData.user_agent,
      custom_data: {
        utm_source: trackingFinal?.utm_source,
        utm_medium: trackingFinal?.utm_medium,
        utm_campaign: trackingFinal?.utm_campaign,
        utm_term: trackingFinal?.utm_term,
        utm_content: trackingFinal?.utm_content
      }
    });

    // 🔥 NOVO: Chamada de tracking para registrar geração de PIX
    try {
      await googleSheetsService.appendDataToSheet(
        'pix_generated!A1',
        [[new Date().toISOString().split('T')[0], 1]]
      );
      console.log(`[${this.botId}] ✅ Tracking de geração de PIX registrado para transação ${normalizedId}`);
    } catch (error) {
      console.error('Falha ao registrar o evento de geração de PIX:', error.message);
    }

    return res.json({
      qr_code_base64,
      qr_code,
      pix_copia_cola: qr_code,
      transacao_id: normalizedId
    });

  } catch (err) {
    if (err.response?.status === 429) {
      console.warn(`[${this.botId}] Erro 429 na geração de cobrança`);
      return res.status(429).json({ error: '⚠️ Erro 429: Limite de requisições atingido.' });
    }

    console.error(
      `[${this.botId}] Erro ao gerar cobrança:`,
      err.response?.status,
      err.response?.data,
      pushPayload
    );
    return res.status(500).json({
      error: 'Erro ao gerar cobrança na API PushinPay.',
      detalhes: err.response?.data || err.message
    });
  }
}

  gerarCobranca(req, res) {
    cobrancaQueue.push(() => this._executarGerarCobranca(req, res));
    processCobrancaQueue();
  }

  async webhookPushinPay(req, res) {
    try {
      // Proteção contra payloads vazios
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).send('Payload inválido');
      }

      // Segurança simples no webhook
      if (process.env.WEBHOOK_SECRET) {
        const auth = req.headers['authorization'];
        if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
          return res.sendStatus(403);
        }
      }

      const payload = req.body;
      const { status } = payload || {};
      const idBruto = payload.id || payload.token || payload.transaction_id || null;
      const normalizedId = idBruto ? idBruto.toLowerCase().trim() : null;

      console.log(`[${this.botId}] 🔔 Webhook recebido`);
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('Headers:', req.headers);
      console.log('ID normalizado:', normalizedId);
      console.log('Status:', status);

      if (!normalizedId || !['paid', 'approved', 'pago'].includes(status)) return res.sendStatus(200);
      
      // Extrair dados pessoais do payload para hashing
      const payerName = payload.payer_name || payload.payer?.name || null;
      const payerCpf = payload.payer_national_registration || payload.payer?.national_registration || null;
      
      // Gerar hashes de dados pessoais se disponíveis
      let hashedUserData = null;
      if (payerName && payerCpf) {
        hashedUserData = generateHashedUserData(payerName, payerCpf);
        console.log(`[${this.botId}] 🔐 Dados pessoais hasheados gerados para Purchase`);
      }
      
      const row = this.db ? this.db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get(normalizedId) : null;
      console.log('[DEBUG] Token recuperado após pagamento:', row);
      if (!row) return res.status(400).send('Transação não encontrada');
      // Evita processamento duplicado em caso de retries
      if (row.status === 'valido') return res.status(200).send('Pagamento já processado');
      const novoToken = uuidv4().toLowerCase();
      if (this.db) {
        this.db.prepare(
          `UPDATE tokens SET token = ?, status = 'valido', usado = 0, fn_hash = ?, ln_hash = ?, external_id_hash = ? WHERE id_transacao = ?`
        ).run(
          novoToken, 
          hashedUserData?.fn_hash || null,
          hashedUserData?.ln_hash || null,
          hashedUserData?.external_id_hash || null,
          normalizedId
        );
      }
      if (this.pgPool) {
        try {
          // Buscar dados de rastreamento atualizados do SQLite
          let track = null;
          if (this.db) {
            track = this.db
              .prepare(
                'SELECT fbp, fbc, ip_criacao, user_agent_criacao FROM tokens WHERE id_transacao = ?'
              )
              .get(normalizedId);
          }

          row.token = novoToken;
          row.status = 'valido';

          await this.postgres.executeQuery(
            this.pgPool,
            `INSERT INTO tokens (id_transacao, token, telegram_id, valor, status, usado, bot_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, event_time, fn_hash, ln_hash, external_id_hash, nome_oferta)
             VALUES ($1,$2,$3,$4,'valido',FALSE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             ON CONFLICT (id_transacao) DO UPDATE SET token = EXCLUDED.token, status = 'valido', usado = FALSE, fn_hash = EXCLUDED.fn_hash, ln_hash = EXCLUDED.ln_hash, external_id_hash = EXCLUDED.external_id_hash, nome_oferta = EXCLUDED.nome_oferta`,
            [
              normalizedId,
              row.token,
              row.telegram_id,
              row.valor ? row.valor / 100 : null,
              row.bot_id,
              row.utm_source,
              row.utm_medium,
              row.utm_campaign,
              row.utm_term,
              row.utm_content,
              track?.fbp || row.fbp,
              track?.fbc || row.fbc,
              track?.ip_criacao || row.ip_criacao,
              track?.user_agent_criacao || row.user_agent_criacao,
              row.event_time,
              hashedUserData?.fn_hash || null,
              hashedUserData?.ln_hash || null,
              hashedUserData?.external_id_hash || null,
              row.nome_oferta || 'Oferta Desconhecida'
            ]
          );
          console.log(`✅ Token ${normalizedId} copiado para o PostgreSQL`);
        } catch (pgErr) {
          console.error(`❌ Falha ao inserir token ${normalizedId} no PostgreSQL:`, pgErr.message);
        }
      }
      if (row.telegram_id && this.pgPool) {
        const tgId = this.normalizeTelegramId(row.telegram_id);
        if (tgId !== null) {
          await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
        }
      }
      if (row.telegram_id && this.bot) {
        const valorReais = (row.valor / 100).toFixed(2);
        let track = this.getTrackingData(row.telegram_id);
        if (!track) {
          track = await this.buscarTrackingData(row.telegram_id);
        }
        track = track || {};
        const utmParams = [];
        if (track.utm_source) utmParams.push(`utm_source=${encodeURIComponent(track.utm_source)}`);
        if (track.utm_medium) utmParams.push(`utm_medium=${encodeURIComponent(track.utm_medium)}`);
        if (track.utm_campaign) utmParams.push(`utm_campaign=${encodeURIComponent(track.utm_campaign)}`);
        if (track.utm_term) utmParams.push(`utm_term=${encodeURIComponent(track.utm_term)}`);
        if (track.utm_content) utmParams.push(`utm_content=${encodeURIComponent(track.utm_content)}`);
        const utmString = utmParams.length ? '&' + utmParams.join('&') : '';
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${encodeURIComponent(novoToken)}&valor=${valorReais}&${this.grupo}${utmString}`;
        console.log(`[${this.botId}] ✅ Enviando link para`, row.telegram_id);
        console.log(`[${this.botId}] Link final:`, linkComToken);
        await this.bot.sendMessage(row.telegram_id, `🎉 <b>Pagamento aprovado!</b>\n\n💰 Valor: R$ ${valorReais}\n🔗 Acesse seu conteúdo: ${linkComToken}\n\n⚠️ O link irá expirar em 5 minutos.`, { parse_mode: 'HTML' });

        // Enviar conversão para UTMify
        const transactionValueCents = row.valor;
        const telegramId = row.telegram_id;
        await enviarConversaoParaUtmify({
          payer_name: payload.payer_name,
          telegram_id: telegramId,
          transactionValueCents,
          trackingData: track,
          orderId: normalizedId,
          nomeOferta: row.nome_oferta || 'Oferta Desconhecida'
        });
      }

      // Registro de Purchase no Google Sheets
      try {
        const purchaseData = [
          new Date().toISOString(),
          row.valor / 100,
          row.utm_source,
          row.utm_medium,
          row.utm_campaign
        ];
        console.log(
          `[${this.botId}] Registrando tracking de Purchase no Google Sheets para transação ${normalizedId}`
        );
        await googleSheetsService.appendDataToSheet('purchase!A1', [purchaseData]);

      } catch (gsErr) {
        console.error(
          `[${this.botId}] Erro ao registrar Purchase no Google Sheets para transação ${normalizedId}:`,
          gsErr.message
        );
      }

      // ✅ CORRIGIDO: Marcar apenas flag capi_ready = TRUE no banco,
      // deixando o envio real do CAPI para o cron ou fallback
      try {
        // Atualizar flag para indicar que CAPI está pronto para ser enviado
        await this.pgPool.query(
          'UPDATE tokens SET capi_ready = TRUE WHERE token = $1',
          [novoToken]
        );
        console.log(`[${this.botId}] ✅ Flag capi_ready marcada para token ${novoToken} - CAPI será enviado pelo cron/fallback`);
      } catch (dbErr) {
        console.error(`[${this.botId}] ❌ Erro ao marcar flag capi_ready:`, dbErr.message);
      }

      // ❌ REMOVIDO: Envio imediato do CAPI via sendFacebookEvent()
      // O envio agora acontece via cron ou fallback, evitando duplicação

      // Purchase também será enviado via Pixel ou cron de fallback

      return res.sendStatus(200);
    } catch (err) {
      console.error(`[${this.botId}] Erro no webhook:`, err.message);
      return res.sendStatus(500);
    }
  }

  agendarMensagensPeriodicas() {
    const mensagens = this.config.mensagensPeriodicas;
    if (!Array.isArray(mensagens) || mensagens.length === 0) return;
    const mapa = new Map();
    for (const msg of mensagens) {
      if (msg.horario) mapa.set(msg.horario, msg);
    }
    for (const msg of mensagens) {
      let texto = msg.texto;
      let midia = msg.midia;
      if (msg.copiarDe && mapa.get(msg.copiarDe)) {
        const base = mapa.get(msg.copiarDe);
        texto = base.texto;
        midia = base.midia;
      }
      if (!texto) continue;
      const dt = DateTime.fromFormat(msg.horario, 'HH:mm', { zone: 'America/Sao_Paulo' });
      if (!dt.isValid) continue;
      const hora = dt.hour;
      const minuto = dt.minute;
      const cronExp = `0 ${minuto} ${hora} * * *`;
      cron.schedule(cronExp, () => {
        if (!this.bot) return;
        this.enviarMensagemPeriodica(texto, midia).catch(err =>
          console.error(`[${this.botId}] Erro em mensagem periódica:`, err.message)
        );
      }, { timezone: 'America/Sao_Paulo' });
    }
  }

  async enviarMensagemPeriodica(texto, midia) {
    const ids = new Set();
    if (this.pgPool) {
      try {
        const res = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM downsell_progress WHERE pagou = 0');
        res.rows.forEach(r => ids.add(r.telegram_id));
      } catch (err) {
        console.error(`[${this.botId}] Erro ao buscar usuários PG:`, err.message);
      }
    }
    if (this.db) {
      try {
        const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='downsell_progress'").all();
        if (table.length > 0) {
          const rows = this.db.prepare('SELECT telegram_id FROM downsell_progress WHERE pagou = 0').all();
          rows.forEach(r => ids.add(r.telegram_id));
        }
      } catch (err) {
        console.error(`[${this.botId}] Erro ao buscar usuários SQLite:`, err.message);
      }
    }
    for (const chatId of ids) {
      try {
        if (midia) {
          await this.enviarMidiaComFallback(chatId, 'video', midia);
        }
        await this.bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
        await this.bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
          reply_markup: { inline_keyboard: this.config.inicio.menuInicial.opcoes.map(o => [{ text: o.texto, callback_data: o.callback }]) }
        });
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[${this.botId}] Erro ao enviar periódica para ${chatId}:`, err.message);
      }
    }
  }

  agendarLimpezaTrackingData() {
    cron.schedule('0 * * * *', async () => {
      const limiteMs = Date.now() - 24 * 60 * 60 * 1000;
      for (const [id, data] of this.trackingData.entries()) {
        if (data && data.created_at && data.created_at < limiteMs) {
          this.trackingData.delete(id);
        }
      }
      // Limpar cache AddToCart após 24 horas (permitir re-envio em casos específicos)
      const addToCartEntries = [...this.addToCartCache.entries()];
      if (addToCartEntries.length > 10000) { // Limitar tamanho máximo
        this.addToCartCache.clear();
        console.log(`[${this.botId}] 🧹 Cache AddToCart limpo (tamanho máximo atingido)`);
      }
      if (this.db) {
        try {
          const stmt = this.db.prepare(
            'DELETE FROM tracking_data WHERE created_at < datetime("now", "-24 hours")'
          );
          stmt.run();
        } catch (e) {
          console.error(`[${this.botId}] Erro ao limpar tracking SQLite:`, e.message);
        }
      }
      if (this.pgPool) {
        try {
          await this.postgres.executeQuery(
            this.pgPool,
            "DELETE FROM tracking_data WHERE created_at < NOW() - INTERVAL '24 hours'"
          );
        } catch (e) {
          console.error(`[${this.botId}] Erro ao limpar tracking PG:`, e.message);
        }
      }
    });
  }

  registrarComandos() {
    if (!this.bot) return;

    this.bot.onText(/\/start(?:\s+(.*))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      
      // 🔥 NOVO: Chamada de tracking para o comando /start
      try {
        await googleSheetsService.appendDataToSheet(
          'bot_start!A1',
          [[new Date().toISOString().split('T')[0], 1]]
        );
        console.log(`[${this.botId}] ✅ Tracking do comando /start registrado para ${chatId}`);
      } catch (error) {
        console.error('Falha ao registrar o evento /start do bot:', error.message);
      }
      
      // 🔥 OTIMIZAÇÃO 2: Enviar evento Facebook AddToCart em background (não-bloqueante)
      if (!this.addToCartCache.has(chatId)) {
        this.addToCartCache.set(chatId, true);
        
        // 🔥 DISPARAR E ESQUECER: Não aguardar resposta do Facebook
        (async () => {
          try {
            // Gerar valor aleatório entre 9.90 e 19.90 com máximo 2 casas decimais
            const randomValue = (Math.random() * (19.90 - 9.90) + 9.90).toFixed(2);
            
            // Buscar dados de tracking do usuário
            let trackingData = this.getTrackingData(chatId) || await this.buscarTrackingData(chatId);
            
            // Buscar token do usuário para external_id
            const userToken = await this.buscarTokenUsuario(chatId);
            
            const eventTime = Math.floor(Date.now() / 1000);
            const eventData = {
              event_name: 'AddToCart',
              event_time: eventTime,
              event_id: generateEventId('AddToCart', chatId, eventTime),
              value: parseFloat(randomValue),
              currency: 'BRL',
              telegram_id: chatId, // 🔥 NOVO: Habilita rastreamento invisível automático
              token: userToken, // 🔥 NOVO: Token para external_id
              custom_data: {
                content_name: 'Entrada pelo Bot',
                content_category: 'Telegram Funil +18'
              }
            };

            // Adicionar dados de tracking se disponíveis (mantido para compatibilidade)
            if (trackingData) {
              if (trackingData.fbp) eventData.fbp = trackingData.fbp;
              if (trackingData.fbc) eventData.fbc = trackingData.fbc;
              if (trackingData.ip) eventData.client_ip_address = trackingData.ip;
              if (trackingData.user_agent) eventData.client_user_agent = trackingData.user_agent;
            }
            
            // Enviar evento Facebook (com rastreamento invisível automático)
            const result = await sendFacebookEvent(eventData);
            
            if (result.success) {
              console.log(`[${this.botId}] ✅ Evento AddToCart enviado para ${chatId} - Valor: R$ ${randomValue} - Token: ${userToken ? 'SIM' : 'NÃO'}`);
            } else if (!result.duplicate) {
              console.warn(`[${this.botId}] ⚠️ Falha ao enviar evento AddToCart para ${chatId}:`, result.error);
              if (result.available_params) {
                console.log(`[${this.botId}] 📊 Parâmetros disponíveis: [${result.available_params.join(', ')}] - Necessários: ${result.required_count}`);
              }
            }
            
          } catch (error) {
            console.error(`[${this.botId}] ❌ Erro ao processar evento AddToCart para ${chatId}:`, error.message);
          }
        })().catch(error => {
          // 🔥 CAPTURAR ERROS SILENCIOSOS: Log de erros não capturados
          console.error(`[${this.botId}] 💥 Erro não capturado no evento AddToCart para ${chatId}:`, error.message);
        });
      }
      
      const payloadRaw = match && match[1] ? match[1].trim() : '';
      if (payloadRaw) {
        console.log('[payload-debug] payloadRaw detectado', { chatId, payload_id: payloadRaw });
      }
      
      // 🔥 NOVO: Capturar parâmetros de cookies do Facebook diretamente da URL
      let directParams = null;
      try {
        // Verificar se há parâmetros na forma de query string no payload
        if (payloadRaw.includes('fbp=') || payloadRaw.includes('fbc=') || payloadRaw.includes('utm_')) {
          const urlParams = new URLSearchParams(payloadRaw);
          directParams = {
            fbp: urlParams.get('fbp'),
            fbc: urlParams.get('fbc'),
            user_agent: urlParams.get('user_agent'),
            utm_source: urlParams.get('utm_source'),
            utm_medium: urlParams.get('utm_medium'),
            utm_campaign: urlParams.get('utm_campaign'),
            utm_term: urlParams.get('utm_term'),
            utm_content: urlParams.get('utm_content')
          };
          
          // Se encontrou parâmetros diretos, armazenar imediatamente
          if (directParams.fbp || directParams.fbc) {
            this.sessionTracking.storeTrackingData(chatId, directParams);
            console.log(`[${this.botId}] 🔥 Cookies do Facebook capturados via URL:`, {
              fbp: !!directParams.fbp,
              fbc: !!directParams.fbc,
              utm_source: directParams.utm_source
            });
          }
        }
      } catch (e) {
        console.warn(`[${this.botId}] Erro ao processar parâmetros diretos:`, e.message);
      }
      
      if (payloadRaw) {
        try {
          let fbp, fbc, ip, user_agent;
          let utm_source, utm_medium, utm_campaign;
          
          // Usar parâmetros diretos se disponíveis
          if (directParams) {
            fbp = directParams.fbp;
            fbc = directParams.fbc;
            user_agent = directParams.user_agent;
            utm_source = directParams.utm_source;
            utm_medium = directParams.utm_medium;
            utm_campaign = directParams.utm_campaign;
            console.log('[payload-debug] Merge directParams', { chatId, payload_id: payloadRaw, fbp, fbc, user_agent });
          }

          if (/^[a-zA-Z0-9]{6,10}$/.test(payloadRaw)) {
            let row = null;
            let payloadRow = null;
            if (this.pgPool) {
              try {
                const res = await this.postgres.executeQuery(
                  this.pgPool,
                  'SELECT fbp, fbc, ip, user_agent FROM payload_tracking WHERE payload_id = $1',
                  [payloadRaw]
                );
                row = res.rows[0];
                console.log('[payload-debug] payload_tracking PG', { chatId, payload_id: payloadRaw, row });
                if (!row) {
                  console.log('[payload-debug] Origem PG sem resultado payload_tracking', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payload PG:`, err.message);
              }
              try {
                const res2 = await this.postgres.executeQuery(
                  this.pgPool,
                  'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent FROM payloads WHERE payload_id = $1',
                  [payloadRaw]
                );
                payloadRow = res2.rows[0];
                console.log('[payload-debug] payloadRow PG', { chatId, payload_id: payloadRaw, payloadRow });
                if (!payloadRow) {
                  console.log('[payload-debug] Origem PG sem resultado payloadRow', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payloads PG:`, err.message);
              }
            }
            if (!row && this.db) {
              try {
                row = this.db
                  .prepare('SELECT fbp, fbc, ip, user_agent FROM payload_tracking WHERE payload_id = ?')
                  .get(payloadRaw);
                console.log('[payload-debug] payload_tracking SQLite', { chatId, payload_id: payloadRaw, row });
                if (!row) {
                  console.log('[payload-debug] Origem SQLite sem resultado payload_tracking', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payload SQLite:`, err.message);
              }
            }
            if (!payloadRow && this.db) {
              try {
                payloadRow = this.db
                  .prepare('SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent FROM payloads WHERE payload_id = ?')
                  .get(payloadRaw);
                console.log('[payload-debug] payloadRow SQLite', { chatId, payload_id: payloadRaw, payloadRow });
                if (!payloadRow) {
                  console.log('[payload-debug] Origem SQLite sem resultado payloadRow', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payloads SQLite:`, err.message);
              }
            }

            if (row) {
              ({ fbp, fbc, ip, user_agent } = row);
              console.log('[payload-debug] Merge payload_tracking', { chatId, payload_id: payloadRaw, fbp, fbc, ip, user_agent });
              if (this.pgPool) {
                try {
                  const cleanTelegramId = this.normalizeTelegramId(chatId);
                  if (cleanTelegramId !== null) {
                    await this.postgres.executeQuery(
                      this.pgPool,
                      'UPDATE payload_tracking SET telegram_id = $1 WHERE payload_id = $2',
                      [cleanTelegramId, payloadRaw]
                    );
                    console.log(`[payload] Associado payload_tracking: ${chatId} \u21D2 ${payloadRaw}`);
                  }
                } catch (err) {
                  console.warn(`[${this.botId}] Erro ao associar payload PG:`, err.message);
                }
              }
              if (this.db) {
                try {
                  const cleanTelegramId = this.normalizeTelegramId(chatId);
                  if (cleanTelegramId !== null) {
                    this.db
                      .prepare('UPDATE payload_tracking SET telegram_id = ? WHERE payload_id = ?')
                      .run(cleanTelegramId, payloadRaw);
                    console.log(`[payload] Associado payload_tracking: ${chatId} \u21D2 ${payloadRaw}`);
                  }
                } catch (err) {
                  console.warn(`[${this.botId}] Erro ao associar payload SQLite:`, err.message);
                }
              }
            }
            // 🔥 NOVO: Se encontrou payload válido, associar todos os dados ao telegram_id
            let trackingSalvoDePayload = false;
            if (!payloadRow) {
              console.log('[payload-debug] payloadRow null', { chatId, payload_id: payloadRaw });
            }
            if (payloadRow) {
              if (!fbp) fbp = payloadRow.fbp;
              if (!fbc) fbc = payloadRow.fbc;
              if (!ip) ip = payloadRow.ip;
              if (!user_agent) user_agent = payloadRow.user_agent;
              utm_source = payloadRow.utm_source;
              utm_medium = payloadRow.utm_medium;
              utm_campaign = payloadRow.utm_campaign;
              console.log('[payload-debug] Merge payloadRow', { chatId, payload_id: payloadRaw, fbp, fbc, ip, user_agent });
              
              // 🔥 Garantir que utm_term e utm_content também sejam associados
              const utm_term = payloadRow.utm_term;
              const utm_content = payloadRow.utm_content;
              
              // 🔥 Salvar imediatamente na tabela tracking_data (sobrescrever qualquer tracking antigo)
              const payloadTrackingData = {
                utm_source,
                utm_medium,
                utm_campaign,
                utm_term,
                utm_content,
                fbp,
                fbc,
                ip,
                user_agent
              };

              console.log('[payload-debug] Salvando tracking', { chatId, payload_id: payloadRaw, forceOverwrite: true, payloadTrackingData });
              await this.salvarTrackingData(chatId, payloadTrackingData, true);
              console.log('[payload-debug] Tracking salvo com sucesso');
              console.log(`[payload] bot${this.botId} → Associado payload ${payloadRaw} ao telegram_id ${chatId}`);
              trackingSalvoDePayload = true;
            }
          }

          const trackingExtraido = fbp || fbc || ip || user_agent;
          if (trackingExtraido && !trackingSalvoDePayload) {
            let row = null;

            if (this.pgPool) {
              try {
                const res = await this.postgres.executeQuery(
                  this.pgPool,
                  'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent FROM tracking_data WHERE telegram_id = $1',
                  [chatId]
                );
                row = res.rows[0];
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao verificar tracking PG:`, err.message);
              }
            }

            const cacheEntry = this.getTrackingData(chatId);
            const existingQuality = cacheEntry
              ? cacheEntry.quality || (isRealTrackingData(cacheEntry) ? 'real' : 'fallback')
              : (row ? (isRealTrackingData(row) ? 'real' : 'fallback') : null);

            const newIsReal = isRealTrackingData({ fbp, fbc, ip, user_agent });

            if ((!cacheEntry || existingQuality === 'fallback') && newIsReal) {
              console.log('[payload-debug] Salvando tracking', { chatId, payload_id: payloadRaw, forceOverwrite: false, utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent });
              await this.salvarTrackingData(chatId, {
                utm_source,
                utm_medium,
                utm_campaign,
                fbp,
                fbc,
                ip,
                user_agent
              });
              console.log('[payload-debug] Tracking salvo com sucesso');
              if (this.pgPool && !row) {
                console.log(`[payload] ${this.botId} → Associado payload ${payloadRaw} ao telegram_id ${chatId}`);
              }
            }
          }

          // 🔥 NOVO: Armazenar dados no SessionTrackingService para rastreamento invisível (sempre que há tracking)
          if (trackingExtraido) {
            this.sessionTracking.storeTrackingData(chatId, {
              fbp,
              fbc,
              ip,
              user_agent,
              utm_source,
              utm_medium,
              utm_campaign,
              utm_term: null, // Pode vir de outros parâmetros
              utm_content: null // Pode vir de outros parâmetros
            });
          }

          if (this.pgPool && !trackingExtraido) {
            console.warn(`[${this.botId}] ⚠️ Nenhum dado de tracking recuperado para ${chatId}`);
          }
          if (trackingExtraido) {
            console.log('[DEBUG] trackData extraído:', { utm_source, utm_medium, utm_campaign, utm_term: payloadRow?.utm_term, utm_content: payloadRow?.utm_content, fbp, fbc, ip, user_agent });
          }
        } catch (e) {
          console.warn(`[${this.botId}] Falha ao processar payload do /start:`, e.message);
        }
      }
      await this.enviarMidiasHierarquicamente(chatId, this.config.midias.inicial);
      await this.bot.sendMessage(chatId, this.config.inicio.textoInicial, { parse_mode: 'HTML' });
      await this.bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
        reply_markup: {
          inline_keyboard: this.config.inicio.menuInicial.opcoes.map(o => [{ text: o.texto, callback_data: o.callback }])
        }
      });
      if (this.pgPool) {
        const cleanTelegramId = this.normalizeTelegramId(chatId);
        if (cleanTelegramId !== null) {
          const existeRes = await this.postgres.executeQuery(
            this.pgPool,
            'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1',
            [cleanTelegramId]
          );
          if (existeRes.rows.length === 0) {
            await this.postgres.executeQuery(
              this.pgPool,
              'INSERT INTO downsell_progress (telegram_id, index_downsell, last_sent_at) VALUES ($1,$2,NULL)',
              [cleanTelegramId, 0]
            );
          }
        }
      }
    });

    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      if (data === 'mostrar_planos') {
        const botoesPlanos = this.config.planos.map(pl => ([{ text: `${pl.emoji} ${pl.nome} — por R$${pl.valor.toFixed(2)}`, callback_data: pl.id }]));
        return this.bot.sendMessage(chatId, '💖 Escolha seu plano abaixo:', { reply_markup: { inline_keyboard: botoesPlanos } });
      }
      if (data === 'ver_previas') {
        return this.bot.sendMessage(chatId, `🙈 <b>Prévias:</b>\n\n💗 Acesse nosso canal:\n👉 ${this.config.canalPrevias}`, { parse_mode: 'HTML' });
      }
      if (data.startsWith('verificar_pagamento_')) {
        const transacaoId = data.replace('verificar_pagamento_', '');
        const tokenRow = this.db ? this.db.prepare('SELECT token, status, valor, telegram_id FROM tokens WHERE id_transacao = ? LIMIT 1').get(transacaoId) : null;
        if (!tokenRow) return this.bot.sendMessage(chatId, '❌ Pagamento não encontrado.');
        if (tokenRow.status !== 'valido' || !tokenRow.token) return this.bot.sendMessage(chatId, 'Pagamento ainda não foi realizado.');
        if (this.pgPool) {
          const tgId = this.normalizeTelegramId(chatId);
          if (tgId !== null) {
            await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
          }
        }
        const valorReais = (tokenRow.valor / 100).toFixed(2);
        let track = this.getTrackingData(chatId);
        if (!track) {
          track = await this.buscarTrackingData(chatId);
        }
        track = track || {};
        const utmParams = [];
        if (track.utm_source) utmParams.push(`utm_source=${encodeURIComponent(track.utm_source)}`);
        if (track.utm_medium) utmParams.push(`utm_medium=${encodeURIComponent(track.utm_medium)}`);
        if (track.utm_campaign) utmParams.push(`utm_campaign=${encodeURIComponent(track.utm_campaign)}`);
        if (track.utm_term) utmParams.push(`utm_term=${encodeURIComponent(track.utm_term)}`);
        if (track.utm_content) utmParams.push(`utm_content=${encodeURIComponent(track.utm_content)}`);
        const utmString = utmParams.length ? '&' + utmParams.join('&') : '';
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${encodeURIComponent(tokenRow.token)}&valor=${valorReais}&${this.grupo}${utmString}`;
        console.log(`[${this.botId}] Link final:`, linkComToken);
        await this.bot.sendMessage(chatId, this.config.pagamento.aprovado);
        await this.bot.sendMessage(chatId, `<b>🎉 Pagamento aprovado!</b>\n\n🔗 Acesse: ${linkComToken}\n\n⚠️ O link irá expirar em 5 minutos.`, { parse_mode: 'HTML' });
        return;
      }
      let plano = this.config.planos.find(p => p.id === data);
      if (!plano) {
        for (const ds of this.config.downsells) {
          const p = ds.planos.find(pl => pl.id === data);
          if (p) {
            plano = { ...p, valor: p.valorComDesconto };
            break;
          }
        }
      }
      if (!plano) return;
      
      // 🔥 OTIMIZAÇÃO 3: Feedback imediato para melhorar UX na geração de PIX
      const mensagemAguarde = await this.bot.sendMessage(chatId, '⏳ Aguarde um instante, estou gerando seu PIX...', {
        reply_markup: { inline_keyboard: [[{ text: '🔄 Processando...', callback_data: 'processing' }]] }
      });
      
      try {
        // ✅ Gerar cobrança
        let track = this.getTrackingData(chatId);
        if (!track) {
          track = await this.buscarTrackingData(chatId);
        }
        track = track || {};
        
        // 🔥 CORREÇÃO: Log detalhado do tracking data usado
        console.log('[DEBUG] 🎯 TRACKING DATA usado na cobrança para chatId', chatId, ':', {
          utm_source: track.utm_source,
          utm_medium: track.utm_medium, 
          utm_campaign: track.utm_campaign,
          fbp: !!track.fbp,
          fbc: !!track.fbc,
          source: track ? 'tracking_encontrado' : 'vazio'
        });
        
        // 🔥 CORREÇÃO: Buscar também do sessionTracking
        const sessionTrack = this.sessionTracking.getTrackingData(chatId);
        console.log('[DEBUG] 🎯 SESSION TRACKING data:', sessionTrack ? {
          utm_source: sessionTrack.utm_source,
          utm_medium: sessionTrack.utm_medium,
          utm_campaign: sessionTrack.utm_campaign
        } : 'vazio');
        
        // 🔥 CORREÇÃO: Se há dados mais recentes no sessionTracking, usar eles
        const finalUtms = {
          utm_source: (sessionTrack?.utm_source && sessionTrack.utm_source !== 'unknown') ? sessionTrack.utm_source : (track.utm_source || 'telegram'),
          utm_campaign: (sessionTrack?.utm_campaign && sessionTrack.utm_campaign !== 'unknown') ? sessionTrack.utm_campaign : (track.utm_campaign || 'bot_principal'),
          utm_medium: (sessionTrack?.utm_medium && sessionTrack.utm_medium !== 'unknown') ? sessionTrack.utm_medium : (track.utm_medium || 'telegram_bot')
        };
        
        console.log('[DEBUG] 🎯 UTMs FINAIS para cobrança:', finalUtms);
        
        const resposta = await axios.post(`${this.baseUrl}/api/gerar-cobranca`, {
          telegram_id: chatId,
          plano: plano.id, // Enviar o ID do plano para identificação correta
          valor: plano.valor,
          bot_id: this.botId,
          trackingData: {
            utm_source: finalUtms.utm_source,
            utm_campaign: finalUtms.utm_campaign,
            utm_medium: finalUtms.utm_medium,
            utm_term: track.utm_term,
            utm_content: track.utm_content,
            fbp: track.fbp,
            fbc: track.fbc,
            ip: track.ip,
            user_agent: track.user_agent
          }
        });
        
        // 🔥 OTIMIZAÇÃO 3: Remover mensagem de "Aguarde" e enviar resultado
        await this.bot.deleteMessage(chatId, mensagemAguarde.message_id);
        
        const { qr_code_base64, pix_copia_cola, transacao_id } = resposta.data;
        let buffer;
        if (qr_code_base64) {
          const base64Image = qr_code_base64.replace(/^data:image\/png;base64,/, '');
          const imageBuffer = Buffer.from(base64Image, 'base64');
          buffer = await this.processarImagem(imageBuffer);
        }
        const legenda = this.config.mensagemPix(plano.nome, plano.valor, pix_copia_cola);
        if (buffer) {
          await this.bot.sendPhoto(chatId, buffer, {
            caption: legenda,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]] }
          });
        } else {
          await this.bot.sendMessage(chatId, legenda, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '✅ Verificar Status', callback_data: `verificar_pagamento_${transacao_id}` }]] }
          });
        }
        
      } catch (error) {
        // 🔥 OTIMIZAÇÃO 3: Em caso de erro, editar mensagem de "Aguarde" para mostrar erro
        console.error(`[${this.botId}] ❌ Erro ao gerar PIX para ${chatId}:`, error.message);
        
        await this.bot.editMessageText('❌ Ops! Ocorreu um erro ao gerar seu PIX. Por favor, tente novamente ou contate o suporte.', {
          chat_id: chatId,
          message_id: mensagemAguarde.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Tentar Novamente', callback_data: data }],
              [{ text: '💬 Falar com Suporte', url: 'https://t.me/suporte_bot' }]
            ]
          }
        });
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.pgPool) return;
      const cleanTelegramId = this.normalizeTelegramId(chatId);
      if (cleanTelegramId === null) return;
      const usuarioRes = await this.postgres.executeQuery(
        this.pgPool,
        'SELECT index_downsell, pagou FROM downsell_progress WHERE telegram_id = $1',
        [cleanTelegramId]
      );
      const usuario = usuarioRes.rows[0];
      if (!usuario) return this.bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
      const statusPagamento = usuario.pagou === 1 ? 'JÁ PAGOU ✅' : 'NÃO PAGOU ❌';
      const totalDownsells = this.config.downsells.length;
      const mensagem = `📊 <b>SEU STATUS:</b>\n\n💰 <b>Pagamento:</b> ${statusPagamento}\n📈 <b>Downsell atual:</b> ${usuario.index_downsell}/${totalDownsells}\n🔄 <b>Próximo downsell:</b> ${usuario.index_downsell >= totalDownsells ? 'Finalizado' : 'Em breve'}\n\n${usuario.pagou === 0 ? '💡 <i>Você receberá ofertas especiais automaticamente!</i>' : '🎉 <i>Obrigado pela sua compra!</i>'}`.trim();
      await this.bot.sendMessage(chatId, mensagem, { parse_mode: 'HTML' });
    });

    this.bot.onText(/\/resert/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.pgPool) return;
      const cleanTelegramId = this.normalizeTelegramId(chatId);
      if (cleanTelegramId === null) return;
      const usuarioRes = await this.postgres.executeQuery(
        this.pgPool,
        'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1',
        [cleanTelegramId]
      );
      const usuario = usuarioRes.rows[0];
      if (!usuario) return this.bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
      await this.postgres.executeQuery(
        this.pgPool,
        'UPDATE downsell_progress SET pagou = 0, index_downsell = 0, last_sent_at = NULL WHERE telegram_id = $1',
        [cleanTelegramId]
      );
      await this.bot.sendMessage(chatId, `🔄 <b>Funil reiniciado com sucesso!</b>\n\n✅ Status de pagamento resetado\n✅ Downsells reiniciados\n📬 Você voltará a receber ofertas automaticamente\n\n💡 <i>Use /status para verificar seu novo status</i>`, { parse_mode: 'HTML' });
    });
  }

  async enviarDownsell(chatId) {
    if (!this.pgPool) return;
    const cleanTelegramId = this.normalizeTelegramId(chatId);
    if (cleanTelegramId === null) return;
    const progressoRes = await this.postgres.executeQuery(
      this.pgPool,
      'SELECT index_downsell FROM downsell_progress WHERE telegram_id = $1',
      [cleanTelegramId]
    );
    const progresso = progressoRes.rows[0] || { index_downsell: 0 };
    const idx = progresso.index_downsell;
    const lista = this.config.downsells;
    if (idx >= lista.length) return;
    const downsell = lista[idx];
    try {
      await this.enviarMidiasHierarquicamente(chatId, this.config.midias.downsells[downsell.id] || {});
      let replyMarkup = null;
      if (downsell.planos && downsell.planos.length > 0) {
        const botoes = downsell.planos.map(p => [{ text: `${p.emoji} ${p.nome} — R$${p.valorComDesconto.toFixed(2)}`, callback_data: p.id }]);
        replyMarkup = { inline_keyboard: botoes };
      }
      await this.bot.sendMessage(chatId, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
      await this.postgres.executeQuery(
        this.pgPool,
        'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2',
        [idx + 1, cleanTelegramId]
      );
      if (idx + 1 < lista.length) {
        setTimeout(() => this.enviarDownsell(chatId).catch(err => console.error('Erro no próximo downsell:', err.message)), 20 * 60 * 1000);
      }
    } catch (err) {
      if (err.blockedByUser || err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
        await this.cancelarDownsellPorBloqueio(chatId);
        return;
      }
      console.error(`[${this.botId}] Erro ao enviar downsell para ${chatId}:`, err.message);
    }
  }

  async enviarDownsells(targetId = null) {
    if (!this.pgPool) return;
    const flagKey = targetId || 'GLOBAL';
    if (this.processingDownsells.get(flagKey)) return;
    this.processingDownsells.set(flagKey, true);
    try {
      let usuariosRes;
      const cleanTargetId = targetId ? this.normalizeTelegramId(targetId) : null;
      if (targetId) {
        if (cleanTargetId === null) return;
        usuariosRes = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0 AND telegram_id = $1',
          [cleanTargetId]
        );
      } else {
        usuariosRes = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0'
        );
      }
      const usuarios = usuariosRes.rows;
      for (const usuario of usuarios) {
        const { telegram_id, index_downsell, last_sent_at } = usuario;
        const cleanTelegramIdLoop = this.normalizeTelegramId(telegram_id);
        if (cleanTelegramIdLoop === null) continue;
        if (index_downsell >= this.config.downsells.length) continue;
        if (last_sent_at) {
          const diff = DateTime.now().toMillis() - DateTime.fromISO(last_sent_at).toMillis();
          if (diff < 20 * 60 * 1000) continue;
        }
        const downsell = this.config.downsells[index_downsell];
        try {
          await this.enviarMidiasHierarquicamente(cleanTelegramIdLoop, this.config.midias.downsells[downsell.id] || {});
          let replyMarkup = null;
          if (downsell.planos && downsell.planos.length > 0) {
            const botoes = downsell.planos.map(plano => [{ text: `${plano.emoji} ${plano.nome} — R$${plano.valorComDesconto.toFixed(2)}`, callback_data: plano.id }]);
            replyMarkup = { inline_keyboard: botoes };
          }
          await this.bot.sendMessage(cleanTelegramIdLoop, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
          await this.postgres.executeQuery(
            this.pgPool,
            'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2',
            [index_downsell + 1, cleanTelegramIdLoop]
          );
        } catch (err) {
          if (err.blockedByUser || err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
            await this.cancelarDownsellPorBloqueio(cleanTelegramIdLoop);
            continue;
          }
          console.error(`[${this.botId}] Erro ao enviar downsell para ${telegram_id}:`, err.message);
          continue;
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error(`[${this.botId}] Erro geral na função enviarDownsells:`, err.message);
    } finally {
      this.processingDownsells.delete(flagKey);
    }
  }
}

module.exports = TelegramBotService;
