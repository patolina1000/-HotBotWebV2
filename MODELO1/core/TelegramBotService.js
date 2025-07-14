const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { DateTime } = require('luxon');
const GerenciadorMidia = require('../BOT/utils/midia');
const { sendFacebookEvent, generateEventId } = require('../../services/facebook');
const { mergeTrackingData, isRealTrackingData } = require('../../services/trackingValidation');

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
    // Map para armazenar fbp/fbc/ip de cada usuário
    this.trackingData = new Map();
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
      this.bot.setWebHook(webhookUrl)
        .then(() => console.log(`[${this.botId}] ✅ Webhook configurado: ${webhookUrl}`))
        .catch(err => console.error(`[${this.botId}] ❌ Erro ao configurar webhook:`, err));
    }

    this.registrarComandos();
    console.log(`[${this.botId}] ✅ Bot iniciado`);
  }

  normalizeTelegramId(id) {
    if (id === null || id === undefined) return null;
    const parsed = parseInt(id.toString(), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  async salvarTrackingData(telegramId, data) {
    if (!telegramId || !data) return;

    const newQuality = isRealTrackingData(data) ? 'real' : 'fallback';
    const existing = this.trackingData.get(telegramId);
    const existingQuality = existing
      ? existing.quality || (isRealTrackingData(existing) ? 'real' : 'fallback')
      : null;

    if (existingQuality === 'real' && newQuality === 'fallback') {
      console.log(
        `[${this.botId}] [DEBUG] Dados reais já existentes. Fallback ignorado para ${telegramId}`
      );
      return;
    }

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

    const entry = {
      utm_source: data.utm_source || null,
      utm_medium: data.utm_medium || null,
      utm_campaign: data.utm_campaign || null,
      fbp: data.fbp || null,
      fbc: data.fbc || null,
      ip: data.ip || null,
      user_agent: data.user_agent || null,
      quality: newQuality,
      created_at: Date.now()
    };
    this.trackingData.set(telegramId, entry);
    console.log(`[${this.botId}] [DEBUG] Tracking data salvo para ${telegramId}:`, entry);
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT OR REPLACE INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent, created_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)'
        ).run(
          telegramId,
          entry.utm_source,
          entry.utm_medium,
          entry.utm_campaign,
          entry.fbp,
          entry.fbc,
          entry.ip,
          entry.user_agent
        );
      } catch (e) {
        console.error(`[${this.botId}] Erro ao salvar tracking SQLite:`, e.message);
      }
    }
    if (this.pgPool) {
      try {
        await this.postgres.executeQuery(
          this.pgPool,
          `INSERT INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
           ON CONFLICT (telegram_id) DO UPDATE SET utm_source=EXCLUDED.utm_source, utm_medium=EXCLUDED.utm_medium, utm_campaign=EXCLUDED.utm_campaign, fbp=EXCLUDED.fbp, fbc=EXCLUDED.fbc, ip=EXCLUDED.ip, user_agent=EXCLUDED.user_agent, created_at=EXCLUDED.created_at`,
          [telegramId, entry.utm_source, entry.utm_medium, entry.utm_campaign, entry.fbp, entry.fbc, entry.ip, entry.user_agent]
        );
      } catch (e) {
        console.error(`[${this.botId}] Erro ao salvar tracking PG:`, e.message);
      }
    }
  }

  async buscarTrackingData(telegramId) {
    if (!telegramId) return null;
    let row = null;
    if (this.db) {
      try {
        row = this.db
          .prepare('SELECT utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent FROM tracking_data WHERE telegram_id = ?')
          .get(telegramId);
      } catch (e) {
        console.error(`[${this.botId}] Erro ao buscar tracking SQLite:`, e.message);
      }
    }
    if (!row && this.pgPool) {
      try {
        const res = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent FROM tracking_data WHERE telegram_id = $1',
          [telegramId]
        );
        row = res.rows[0];
      } catch (e) {
        console.error(`[${this.botId}] Erro ao buscar tracking PG:`, e.message);
      }
    }
    if (row) {
      row.created_at = Date.now();
      this.trackingData.set(telegramId, row);
    }
    return row;
  }

  async cancelarDownsellPorBloqueio(chatId) {
    console.warn(`⚠️ Usuário bloqueou o bot, cancelando downsell para chatId: ${chatId}`);
    if (!this.pgPool) return;
    try {
      await this.postgres.executeQuery(this.pgPool, 'DELETE FROM downsell_progress WHERE telegram_id = $1', [chatId]);
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
      switch (tipo) {
        case 'photo':
          await this.bot.sendPhoto(chatId, stream, opcoes); break;
        case 'video':
          await this.bot.sendVideo(chatId, stream, opcoes); break;
        case 'audio':
          await this.bot.sendVoice(chatId, stream, opcoes); break;
        default:
          return false;
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
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Payload inválido' });
  }

  const {
    plano,
    valor,
    utm_source,
    utm_campaign,
    utm_medium,
    utm_term,
    utm_content,
    event_source_url,
    telegram_id
  } = req.body;

  const {
    fbp: reqFbp,
    fbc: reqFbc,
    ip: reqIp,
    user_agent: reqUa
  } = req.body.trackingData || {};

  console.log('📡 API: POST /api/gerar-cobranca');
  console.log('[DEBUG] Dados recebidos:', { telegram_id, plano, valor });
  console.log('[DEBUG] trackingData do req.body:', req.body.trackingData);

  if (!plano || !valor) {
    return res.status(400).json({ error: 'Parâmetros inválidos: plano e valor são obrigatórios.' });
  }

  const valorCentavos = this.config.formatarValorCentavos(valor);
  if (isNaN(valorCentavos) || valorCentavos < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
  }

  try {
    console.log(`[DEBUG] Buscando tracking data para telegram_id: ${telegram_id}`);

    // 1. Tentar buscar do cache
    const trackingDataCache = this.trackingData.get(telegram_id);
    console.log('[DEBUG] trackingData cache:', trackingDataCache);

    // 2. Se cache vazio ou incompleto, buscar do banco
    let trackingDataDB = null;
    if (!isRealTrackingData(trackingDataCache)) {
      console.log('[DEBUG] Cache vazio ou incompleto, buscando no banco...');
      trackingDataDB = await this.buscarTrackingData(telegram_id);
      console.log('[DEBUG] trackingData banco:', trackingDataDB);
    }

    // 3. Combinar cache e banco
    const dadosSalvos = mergeTrackingData(trackingDataCache, trackingDataDB);
    console.log('[DEBUG] dadosSalvos após merge cache+banco:', dadosSalvos);

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
      user_agent: reqUa || uaCriacao || null
    };
    console.log('[DEBUG] Dados da requisição atual:', dadosRequisicao);

    // 3. Fazer mergeTrackingData(dadosSalvos, dadosRequisicao)
    const finalTrackingData = mergeTrackingData(dadosSalvos, dadosRequisicao);

    console.log('[DEBUG] Final tracking data após merge:', finalTrackingData);

    // 4. Gerar fallbacks apenas se finalTrackingData estiver incompleto
    if (!finalTrackingData.fbp) {
      console.log('[WARNING] fbp está null, gerando fallback');
      finalTrackingData.fbp = `fb.1.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!finalTrackingData.fbc) {
      console.log('[WARNING] fbc está null, gerando fallback');
      finalTrackingData.fbc = `fb.1.${Date.now()}.FALLBACK`;
    }

    if (!finalTrackingData.ip) {
      console.log('[WARNING] ip está null, usando fallback');
      finalTrackingData.ip = ipCriacao || '127.0.0.1';
    }

    if (!finalTrackingData.user_agent) {
      console.log('[WARNING] user_agent está null, usando fallback');
      finalTrackingData.user_agent = uaCriacao || 'Unknown';
    }

    // 5. Salvar se o resultado final for real e o cache estiver vazio ou com fallback
    const finalReal = isRealTrackingData(finalTrackingData);
    const cacheEntry = this.trackingData.get(telegram_id);
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

    const eventTime = Math.floor(DateTime.now().setZone('America/Sao_Paulo').toSeconds());

    const response = await axios.post('https://api.pushinpay.com.br/api/pix/cashIn', {
      value: valorCentavos,
      webhook_url: `${this.baseUrl}/webhook/pushinpay`
    }, {
      headers: {
        Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    const { qr_code_base64, qr_code, id: apiId } = response.data;
    const normalizedId = apiId ? apiId.toLowerCase() : null;

    if (!normalizedId) {
      throw new Error('ID da transação não retornado pela PushinPay');
    }

    if (this.db) {
      console.log('[DEBUG] Salvando token no SQLite com tracking data:', {
        telegram_id,
        valor: valorCentavos,
        fbp: finalTrackingData.fbp,
        fbc: finalTrackingData.fbc,
        ip: finalTrackingData.ip,
        user_agent: finalTrackingData.user_agent
      });

      this.db.prepare(
        `INSERT INTO tokens (id_transacao, token, valor, telegram_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, bot_id, status, event_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`
      ).run(
        normalizedId,
        normalizedId,
        valorCentavos,
        telegram_id,
        utm_source,
        utm_campaign,
        utm_medium,
        utm_term,
        utm_content,
        finalTrackingData.fbp,
        finalTrackingData.fbc,
        finalTrackingData.ip,
        finalTrackingData.user_agent,
        this.botId,
        eventTime
      );

      console.log('✅ Token salvo no SQLite:', normalizedId);
    }

    const eventName = 'InitiateCheckout';
    const eventId = generateEventId(eventName);

    console.log('[DEBUG] Enviando evento InitiateCheckout para Facebook com:', {
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      value: valorCentavos / 100,
      fbp: finalTrackingData.fbp,
      fbc: finalTrackingData.fbc,
      client_ip_address: finalTrackingData.ip,
      client_user_agent: finalTrackingData.user_agent
    });

    await sendFacebookEvent({
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      value: valorCentavos / 100,
      currency: 'BRL',
      fbp: finalTrackingData.fbp,
      fbc: finalTrackingData.fbc,
      client_ip_address: finalTrackingData.ip,
      client_user_agent: finalTrackingData.user_agent,
      custom_data: {
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content
      }
    });

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

    console.error(`[${this.botId}] Erro ao gerar cobrança:`, err.response?.data || err.message);
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
      const row = this.db ? this.db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get(normalizedId) : null;
      console.log('[DEBUG] Token recuperado após pagamento:', row);
      if (!row) return res.status(400).send('Transação não encontrada');
      // Evita processamento duplicado em caso de retries
      if (row.status === 'valido') return res.status(200).send('Pagamento já processado');
      const novoToken = uuidv4().toLowerCase();
      if (this.db) {
        this.db.prepare(
          `UPDATE tokens SET token = ?, status = 'valido', usado = 0 WHERE id_transacao = ?`
        ).run(novoToken, normalizedId);
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
            `INSERT INTO tokens (id_transacao, token, telegram_id, valor, status, usado, bot_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, event_time)
             VALUES ($1,$2,$3,$4,'valido',FALSE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (id_transacao) DO UPDATE SET token = EXCLUDED.token, status = 'valido', usado = FALSE`,
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
              row.event_time
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
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${encodeURIComponent(novoToken)}&valor=${valorReais}&${this.grupo}`;
        console.log(`[${this.botId}] ✅ Enviando link para`, row.telegram_id);
        console.log(`[${this.botId}] Link final:`, `${this.frontendUrl}/obrigado.html?token=${novoToken}&valor=${valorReais}&${this.grupo}`);
        await this.bot.sendMessage(row.telegram_id, `🎉 <b>Pagamento aprovado!</b>\n\n💰 Valor: R$ ${valorReais}\n🔗 Acesse seu conteúdo: ${linkComToken}\n\n⚠️ O link irá expirar em 5 minutos.`, { parse_mode: 'HTML' });
      }

      // Enviar evento Purchase via CAPI utilizando dados de tracking do usuário
      try {
        const trackingRow = row.telegram_id ? await this.buscarTrackingData(row.telegram_id) : null;
        const mergeData = mergeTrackingData(
          { fbp: row.fbp, fbc: row.fbc, ip: row.ip_criacao, user_agent: row.user_agent_criacao },
          trackingRow
        );
        const eventName = 'Purchase';
        const eventId = generateEventId(eventName, novoToken);
        await sendFacebookEvent({
          event_name: eventName,
          event_time: row.event_time || Math.floor(Date.now() / 1000),
          event_id: eventId,
          value: (row.valor || 0) / 100,
          currency: 'BRL',
          fbp: mergeData.fbp,
          fbc: mergeData.fbc,
          client_ip_address: mergeData.ip,
          client_user_agent: mergeData.user_agent,
          custom_data: {
            utm_source: trackingRow?.utm_source || row.utm_source,
            utm_medium: trackingRow?.utm_medium || row.utm_medium,
            utm_campaign: trackingRow?.utm_campaign || row.utm_campaign,
            utm_term: row.utm_term,
            utm_content: row.utm_content
          }
        });
      } catch (fbErr) {
        console.error(`[${this.botId}] Erro ao enviar Purchase CAPI:`, fbErr.message);
      }

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
      const payloadRaw = match && match[1] ? match[1].trim() : '';
      if (payloadRaw) {
        try {
          let fbp, fbc, ip, user_agent;
          let utm_source, utm_medium, utm_campaign;

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
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payload PG:`, err.message);
              }
              try {
                const res2 = await this.postgres.executeQuery(
                  this.pgPool,
                  'SELECT utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent FROM payloads WHERE payload_id = $1',
                  [payloadRaw]
                );
                payloadRow = res2.rows[0];
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payloads PG:`, err.message);
              }
            }
            if (!row && this.db) {
              try {
                row = this.db
                  .prepare('SELECT fbp, fbc, ip, user_agent FROM payload_tracking WHERE payload_id = ?')
                  .get(payloadRaw);
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payload SQLite:`, err.message);
              }
            }
            if (!payloadRow && this.db) {
              try {
                payloadRow = this.db
                  .prepare('SELECT utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent FROM payloads WHERE payload_id = ?')
                  .get(payloadRaw);
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payloads SQLite:`, err.message);
              }
            }

            if (row) {
              ({ fbp, fbc, ip, user_agent } = row);
              if (this.pgPool) {
                try {
                  await this.postgres.executeQuery(
                    this.pgPool,
                    'UPDATE payload_tracking SET telegram_id = $1 WHERE payload_id = $2',
                    [chatId, payloadRaw]
                  );
                  console.log(`[payload] Associado: ${chatId} \u21D2 ${payloadRaw}`);
                } catch (err) {
                  console.warn(`[${this.botId}] Erro ao associar payload PG:`, err.message);
                }
              }
              if (this.db) {
                try {
                  this.db
                    .prepare('UPDATE payload_tracking SET telegram_id = ? WHERE payload_id = ?')
                    .run(chatId, payloadRaw);
                  console.log(`[payload] Associado: ${chatId} \u21D2 ${payloadRaw}`);
                } catch (err) {
                  console.warn(`[${this.botId}] Erro ao associar payload SQLite:`, err.message);
                }
              }
            }
            if (payloadRow) {
              if (!fbp) fbp = payloadRow.fbp;
              if (!fbc) fbc = payloadRow.fbc;
              if (!ip) ip = payloadRow.ip;
              if (!user_agent) user_agent = payloadRow.user_agent;
              utm_source = payloadRow.utm_source;
              utm_medium = payloadRow.utm_medium;
              utm_campaign = payloadRow.utm_campaign;
            }
          }

          const trackingExtraido = fbp || fbc || ip || user_agent;
          if (trackingExtraido) {
            let row = null;

            if (this.pgPool) {
              try {
                const res = await this.postgres.executeQuery(
                  this.pgPool,
                  'SELECT utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent FROM tracking_data WHERE telegram_id = $1',
                  [chatId]
                );
                row = res.rows[0];
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao verificar tracking PG:`, err.message);
              }
            }

            const cacheEntry = this.trackingData.get(chatId);
            const existingQuality = cacheEntry
              ? cacheEntry.quality || (isRealTrackingData(cacheEntry) ? 'real' : 'fallback')
              : (row ? (isRealTrackingData(row) ? 'real' : 'fallback') : null);

            const newIsReal = isRealTrackingData({ fbp, fbc, ip, user_agent });

            if ((!cacheEntry || existingQuality === 'fallback') && newIsReal) {
              await this.salvarTrackingData(chatId, {
                utm_source,
                utm_medium,
                utm_campaign,
                fbp,
                fbc,
                ip,
                user_agent
              });
              if (this.pgPool && !row) {
                console.log(`[payload] ${this.botId} → Associado payload ${payloadRaw} ao telegram_id ${chatId}`);
              }
            }
          }

          if (this.pgPool && !trackingExtraido) {
            console.warn(`[${this.botId}] ⚠️ Nenhum dado de tracking recuperado para ${chatId}`);
          }
          if (trackingExtraido) {
            console.log('[DEBUG] trackData extraído:', { utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent });
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
        const existeRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1', [chatId]);
        if (existeRes.rows.length === 0) {
          await this.postgres.executeQuery(this.pgPool, 'INSERT INTO downsell_progress (telegram_id, index_downsell, last_sent_at) VALUES ($1,$2,NULL)', [chatId, 0]);
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
        const linkComToken = `${this.frontendUrl}/obrigado.html?token=${encodeURIComponent(tokenRow.token)}&valor=${valorReais}&${this.grupo}`;
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
      let track = this.trackingData.get(chatId);
      if (!track) {
        track = await this.buscarTrackingData(chatId);
      }
      track = track || {};
      const resposta = await axios.post(`${this.baseUrl}/api/gerar-cobranca`, {
        telegram_id: chatId,
        plano: plano.nome,
        valor: plano.valor,
        utm_source: track.utm_source || 'telegram',
        utm_campaign: track.utm_campaign || 'bot_principal',
        utm_medium: track.utm_medium || 'telegram_bot',
        bot_id: this.botId,
        trackingData: {
          fbp: track.fbp,
          fbc: track.fbc,
          ip: track.ip,
          user_agent: track.user_agent
        }
      });
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
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      if (!this.pgPool) return;
      const usuarioRes = await this.postgres.executeQuery(this.pgPool, 'SELECT index_downsell, pagou FROM downsell_progress WHERE telegram_id = $1', [chatId]);
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
      const usuarioRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id FROM downsell_progress WHERE telegram_id = $1', [chatId]);
      const usuario = usuarioRes.rows[0];
      if (!usuario) return this.bot.sendMessage(chatId, '❌ Usuário não encontrado. Use /start primeiro.');
      await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 0, index_downsell = 0, last_sent_at = NULL WHERE telegram_id = $1', [chatId]);
      await this.bot.sendMessage(chatId, `🔄 <b>Funil reiniciado com sucesso!</b>\n\n✅ Status de pagamento resetado\n✅ Downsells reiniciados\n📬 Você voltará a receber ofertas automaticamente\n\n💡 <i>Use /status para verificar seu novo status</i>`, { parse_mode: 'HTML' });
    });
  }

  async enviarDownsell(chatId) {
    if (!this.pgPool) return;
    const progressoRes = await this.postgres.executeQuery(this.pgPool, 'SELECT index_downsell FROM downsell_progress WHERE telegram_id = $1', [chatId]);
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
      await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2', [idx + 1, chatId]);
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
      if (targetId) {
        usuariosRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0 AND telegram_id = $1', [targetId]);
      } else {
        usuariosRes = await this.postgres.executeQuery(this.pgPool, 'SELECT telegram_id, index_downsell, last_sent_at FROM downsell_progress WHERE pagou = 0');
      }
      const usuarios = usuariosRes.rows;
      for (const usuario of usuarios) {
        const { telegram_id, index_downsell, last_sent_at } = usuario;
        if (index_downsell >= this.config.downsells.length) continue;
        if (last_sent_at) {
          const diff = DateTime.now().toMillis() - DateTime.fromISO(last_sent_at).toMillis();
          if (diff < 20 * 60 * 1000) continue;
        }
        const downsell = this.config.downsells[index_downsell];
        try {
          await this.enviarMidiasHierarquicamente(telegram_id, this.config.midias.downsells[downsell.id] || {});
          let replyMarkup = null;
          if (downsell.planos && downsell.planos.length > 0) {
            const botoes = downsell.planos.map(plano => [{ text: `${plano.emoji} ${plano.nome} — R$${plano.valorComDesconto.toFixed(2)}`, callback_data: plano.id }]);
            replyMarkup = { inline_keyboard: botoes };
          }
          await this.bot.sendMessage(telegram_id, downsell.texto, { parse_mode: 'HTML', reply_markup: replyMarkup });
          await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET index_downsell = $1, last_sent_at = NOW() WHERE telegram_id = $2', [index_downsell + 1, telegram_id]);
        } catch (err) {
          if (err.blockedByUser || err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
            await this.cancelarDownsellPorBloqueio(telegram_id);
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
