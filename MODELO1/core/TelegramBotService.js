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
const { appendDataToSheet } = require('../../services/googleSheets.js');
const UnifiedPixService = require('../../services/unifiedPixService');

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
    if (this.token === process.env.TELEGRAM_TOKEN_ESPECIAL) grupo = 'G3';
    if (this.token === process.env.TELEGRAM_TOKEN_BOT4) grupo = 'G4';
    if (this.token === process.env.TELEGRAM_TOKEN_BOT5) grupo = 'G5';
    if (this.token === process.env.TELEGRAM_TOKEN_BOT6) grupo = 'G6';
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
    // 🚀 CACHE OTIMIZADO: Cache em memória para dados de tracking frequentemente acessados
    this.trackingCache = new Map();
    this.cacheExpiry = new Map();
    this.CACHE_TTL = 30 * 60 * 1000; // 30 minutos em millisegundos
    // Serviço de rastreamento de sessão invisível
    this.sessionTracking = getSessionTracking();
    this.bot = null;
    this.db = null;
    this.gerenciadorMidia = new GerenciadorMidia(); // Será configurado após inicialização do bot
    // 🔥 NOVO: Serviço unificado de PIX para usar múltiplos gateways
    this.unifiedPixService = new UnifiedPixService();
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
      
      // Adicionar colunas temporárias para dados do comprador (apenas bot especial)
      if (this.botId === 'bot_especial') {
        try {
          this.db.prepare(`ALTER TABLE tokens ADD COLUMN payer_name_temp TEXT`).run();
          console.log(`[${this.botId}] 🧩 Coluna 'payer_name_temp' adicionada ao SQLite`);
        } catch (e) {
          if (!e.message.includes('duplicate column name')) {
            console.error(`[${this.botId}] ⚠️ Erro ao adicionar coluna 'payer_name_temp':`, e.message);
          }
        }
        
        try {
          this.db.prepare(`ALTER TABLE tokens ADD COLUMN payer_cpf_temp TEXT`).run();
          console.log(`[${this.botId}] 🧩 Coluna 'payer_cpf_temp' adicionada ao SQLite`);
        } catch (e) {
          if (!e.message.includes('duplicate column name')) {
            console.error(`[${this.botId}] ⚠️ Erro ao adicionar coluna 'payer_cpf_temp':`, e.message);
          }
        }
        
        try {
          this.db.prepare(`ALTER TABLE tokens ADD COLUMN end_to_end_id_temp TEXT`).run();
          console.log(`[${this.botId}] 🧩 Coluna 'end_to_end_id_temp' adicionada ao SQLite`);
        } catch (e) {
          if (!e.message.includes('duplicate column name')) {
            console.error(`[${this.botId}] ⚠️ Erro ao adicionar coluna 'end_to_end_id_temp':`, e.message);
          }
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
    
    // 🚀 PRE-WARMING: Configurar apenas o gerenciador, sistema centralizado cuida do resto
    this.configurarPreWarming();
    
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

    // console.log(`[${this.botId}] [DEBUG] UTMs diferentes detectados: ${hasUtmChanges} para ${telegramId}`);
    if (hasUtmChanges) {
      // console.log(`[${this.botId}] [DEBUG] UTMs existentes:`, utmFields.reduce((acc, field) => ({ ...acc, [field]: existing?.[field] || null }), {}));
      // console.log(`[${this.botId}] [DEBUG] UTMs novos:`, utmFields.reduce((acc, field) => ({ ...acc, [field]: data[field] || null }), {}));
    }

    // ✅ REGRA 1: Se forceOverwrite é true (vem de payload), sempre sobrescrever
    if (forceOverwrite) {
      // console.log(
      //   `[${this.botId}] [DEBUG] Forçando sobrescrita de tracking para ${telegramId} (payload associado)`
      // );
      // Pula todas as verificações e força a sobrescrita
    }
    // ✅ REGRA 2: Se tracking é real mas UTMs são diferentes, permitir atualização
    else if (existingQuality === 'real' && newQuality === 'fallback' && !hasUtmChanges) {
      // console.log(
      //   `[${this.botId}] [DEBUG] Dados reais já existentes e UTMs iguais. Fallback ignorado para ${telegramId}`
      // );
      return;
    }

    // ✅ REGRA 3: Se tracking é real e UTMs são diferentes, forçar atualização
    else if (existingQuality === 'real' && hasUtmChanges) {
      // console.log(
      //   `[${this.botId}] [DEBUG] UTMs diferentes detectados. Atualizando tracking real para ${telegramId}`
      // );
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
        // console.log(
        //   `[${this.botId}] [DEBUG] Tracking data existente é melhor ou igual. Não sobrescrevendo para ${telegramId}`
        // );
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
        kwai_click_id: data.kwai_click_id || existing.kwai_click_id || null,
        quality: existingQuality, // Manter qualidade real
        created_at: Date.now()
      };
      // console.log(`[${this.botId}] [DEBUG] Preservando qualidade real e atualizando UTMs para ${telegramId}`);
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
        kwai_click_id: data.kwai_click_id || null,
        quality: newQuality,
        created_at: Date.now()
      };
    }
    this.trackingData.set(cleanTelegramId, finalEntry);
    // console.log(`[${this.botId}] [DEBUG] Tracking data salvo para ${cleanTelegramId}:`, finalEntry);
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT OR REPLACE INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)'
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
          finalEntry.user_agent,
          finalEntry.kwai_click_id,
          finalEntry.quality
        );
      } catch (e) {
        console.error(`[${this.botId}] Erro ao salvar tracking SQLite:`, e.message);
      }
    }
    if (this.pgPool) {
      try {
        await this.postgres.executeQuery(
          this.pgPool,
          `INSERT INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
           ON CONFLICT (telegram_id) DO UPDATE SET utm_source=EXCLUDED.utm_source, utm_medium=EXCLUDED.utm_medium, utm_campaign=EXCLUDED.utm_campaign, utm_term=EXCLUDED.utm_term, utm_content=EXCLUDED.utm_content, fbp=EXCLUDED.fbp, fbc=EXCLUDED.fbc, ip=EXCLUDED.ip, user_agent=EXCLUDED.user_agent, kwai_click_id=EXCLUDED.kwai_click_id, created_at=EXCLUDED.created_at`,
          [cleanTelegramId, finalEntry.utm_source, finalEntry.utm_medium, finalEntry.utm_campaign, finalEntry.utm_term, finalEntry.utm_content, finalEntry.fbp, finalEntry.fbc, finalEntry.ip, finalEntry.user_agent, finalEntry.kwai_click_id]
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
          .prepare('SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id FROM tracking_data WHERE telegram_id = ?')
          .get(cleanTelegramId);
      } catch (e) {
        console.error(`[${this.botId}] Erro ao buscar tracking SQLite:`, e.message);
      }
    }
    if (!row && this.pgPool) {
      try {
        const res = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id FROM tracking_data WHERE telegram_id = $1',
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

  /**
   * 🚀 NOVO: Enviar mídia instantânea usando pool pré-aquecido
   */
  async enviarMidiaInstantanea(chatId, midias) {
    if (!midias) return false;
    
    const ordem = ['video', 'photo', 'audio']; // Prioridade para usuários novos
    let midiaEnviada = false;
    
    for (const tipo of ordem) {
      let caminho = null;
      if (tipo === 'photo') {
        caminho = midias.foto || midias.imagem;
      } else {
        caminho = midias[tipo];
      }
      
      if (!caminho) continue;
      
      try {
        // 🚀 ESTRATÉGIA 1: Tentar pool pré-aquecido primeiro
        if (this.gerenciadorMidia && this.gerenciadorMidia.temPoolAtivo(caminho)) {
          const fileId = this.gerenciadorMidia.obterProximoFileIdPool(caminho);
          if (fileId) {
            console.log(`🚀 MÍDIA INSTANTÂNEA: Usando pool para ${caminho}`);
            
            switch (tipo) {
              case 'photo':
                await this.bot.sendPhoto(chatId, fileId);
                break;
              case 'video':
                await this.bot.sendVideo(chatId, fileId, { supports_streaming: true });
                break;
              case 'audio':
                await this.bot.sendVoice(chatId, fileId);
                break;
            }
            
            console.log(`🚀 MÍDIA INSTANTÂNEA: Sucesso via pool - ${tipo}`);
            midiaEnviada = true;
            break; // Enviar apenas a primeira mídia disponível para máxima velocidade
          }
        }
        
        // 🚀 ESTRATÉGIA 2: Fallback para cache tradicional
        if (!midiaEnviada && this.gerenciadorMidia && this.gerenciadorMidia.temFileIdCache(caminho)) {
          const fileId = this.gerenciadorMidia.obterFileId(caminho);
          if (fileId) {
            console.log(`🔥 MÍDIA INSTANTÂNEA: Usando cache para ${caminho}`);
            
            try {
              switch (tipo) {
                case 'photo':
                  await this.bot.sendPhoto(chatId, fileId);
                  break;
                case 'video':
                  await this.bot.sendVideo(chatId, fileId, { supports_streaming: true });
                  break;
                case 'audio':
                  await this.bot.sendVoice(chatId, fileId);
                  break;
              }
              
              console.log(`🔥 MÍDIA INSTANTÂNEA: Sucesso via cache - ${tipo}`);
              midiaEnviada = true;
              break;
            } catch (fileIdError) {
              console.warn(`🚀 MÍDIA INSTANTÂNEA: Cache falhou, tentando upload - ${caminho}`);
              // Continuar para upload normal
            }
          }
        }
        
        // 🚀 ESTRATÉGIA 3: Tentar recriar pool se necessário
        if (!midiaEnviada && this.gerenciadorMidia && this.gerenciadorMidia.preWarmingEnabled) {
          console.log(`🔄 MÍDIA INSTANTÂNEA: Tentando recriar pool para ${caminho}`);
          const poolRecriado = await this.gerenciadorMidia.recriarPoolSeNecessario(caminho, tipo === 'photo' ? 'imagem' : tipo);
          
          if (poolRecriado) {
            const fileId = this.gerenciadorMidia.obterProximoFileIdPool(caminho);
            if (fileId) {
              try {
                switch (tipo) {
                  case 'photo':
                    await this.bot.sendPhoto(chatId, fileId);
                    break;
                  case 'video':
                    await this.bot.sendVideo(chatId, fileId, { supports_streaming: true });
                    break;
                  case 'audio':
                    await this.bot.sendVoice(chatId, fileId);
                    break;
                }
                console.log(`🔄 MÍDIA INSTANTÂNEA: Sucesso com pool recriado - ${tipo}`);
                midiaEnviada = true;
                break;
              } catch (poolError) {
                console.warn(`🔄 MÍDIA INSTANTÂNEA: Pool recriado falhou:`, poolError.message);
              }
            }
          }
        }
        
        // 🚀 ESTRATÉGIA 4: Upload normal como último recurso
        if (!midiaEnviada) {
          console.log(`⏳ MÍDIA INSTANTÂNEA: Fallback para upload normal - ${caminho}`);
          const inicioUpload = Date.now();
          // Adicionar opções de compressão para vídeos
          const opcoes = tipo === 'video' ? { supports_streaming: true } : {};
          const sucesso = await this.enviarMidiaComFallback(chatId, tipo, caminho, opcoes);
          
          if (sucesso) {
            const tempoUpload = Date.now() - inicioUpload;
            console.log(`⏳ MÍDIA INSTANTÂNEA: Upload normal concluído em ${tempoUpload}ms`);
            
            if (this.gerenciadorMidia) {
              this.gerenciadorMidia.metricas.usoUpload++;
              this.gerenciadorMidia.registrarTempoEnvio(tempoUpload, 'FALLBACK_UPLOAD');
            }
            
            midiaEnviada = true;
            break;
          }
        }
        
      } catch (error) {
        console.error(`🚀 MÍDIA INSTANTÂNEA: Erro ao enviar ${tipo}:`, error.message);
        continue; // Tentar próximo tipo de mídia
      }
    }
    
    if (!midiaEnviada) {
      console.warn(`🚀 MÍDIA INSTANTÂNEA: Nenhuma mídia foi enviada para ${chatId}`);
      return false;
    }
    
    return true;
  }

  async enviarMidiaComFallback(chatId, tipo, caminho, opcoes = {}) {
    if (!caminho) return false;
    try {
      // 🚀 ESTRATÉGIA 1: Pool pré-aquecido (PRIORIDADE MÁXIMA)
      if (!caminho.startsWith('http') && this.gerenciadorMidia && this.gerenciadorMidia.temPoolAtivo(caminho)) {
        const fileId = this.gerenciadorMidia.obterProximoFileIdPool(caminho);
        if (fileId) {
          console.log(`[${this.botId}] 🚀 DOWNSELL INSTANTÂNEO: Usando pool aquecido para: ${caminho}`);
          
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
            console.log(`[${this.botId}] ✅ DOWNSELL INSTANTÂNEO: Sucesso via pool - ${tipo}`);
            return true;
          } catch (poolError) {
            console.warn(`[${this.botId}] ⚠️ Pool aquecido falhou, tentando cache tradicional: ${caminho}`);
            // Continuar para cache tradicional
          }
        }
      }

      // 🔥 ESTRATÉGIA 2: Cache tradicional (FALLBACK)
      if (!caminho.startsWith('http') && this.gerenciadorMidia && this.gerenciadorMidia.temFileIdCache(caminho)) {
        const fileId = this.gerenciadorMidia.obterFileId(caminho);
        console.log(`[${this.botId}] 🔥 Usando file_id cacheado para: ${caminho}`);
        
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

      // 📤 ESTRATÉGIA 3: Upload tradicional (ÚLTIMO RECURSO)
      if (caminho.startsWith('http')) {
        console.log(`[${this.botId}] 📤 Upload via URL para: ${caminho}`);
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
        console.log(`[${this.botId}] ✅ Upload via URL concluído - ${tipo}`);
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
      
      console.log(`[${this.botId}] 📤 Upload de arquivo local: ${caminho}`);
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
      
      console.log(`[${this.botId}] ✅ Upload de arquivo local concluído - ${tipo}`);
      
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
    
    // 🚀 OTIMIZAÇÃO: Enviar TODAS as mídias disponíveis em paralelo
    const promises = [];
    
    // Enviar todos os vídeos disponíveis (video, video2, video3, etc.)
    Object.keys(midias).forEach(key => {
      if (key.startsWith('video') && midias[key]) {
        const opcoes = { supports_streaming: true };
        promises.push(this.enviarMidiaComFallback(chatId, 'video', midias[key], opcoes));
      }
    });
    
    // Enviar outras mídias (photo, audio)
    const ordem = ['photo', 'audio'];
    for (const tipo of ordem) {
      let caminho = null;
      if (tipo === 'photo') {
        caminho = midias.foto || midias.imagem;
      } else {
        caminho = midias[tipo];
      }
      if (!caminho) continue;
      const opcoes = {};
      promises.push(this.enviarMidiaComFallback(chatId, tipo, caminho, opcoes));
    }
    
    // Executar todas as mídias em paralelo para melhor performance
    if (promises.length > 0) {
      console.log(`[${this.botId}] 🚀 Enviando ${promises.length} mídias em paralelo para ${chatId}`);
      await Promise.allSettled(promises);
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
  
          // console.log('[DEBUG] Nome da oferta identificado:', nomeOferta);

  // Garantir que trackingData seja sempre um objeto
  const tracking = req.body.trackingData || {};

  // 🔧 LOGS DE SEGURANÇA ADICIONAIS PARA DEBUG
          // console.log('[SECURITY DEBUG] req.body.trackingData tipo:', typeof req.body.trackingData);
        // console.log('[SECURITY DEBUG] req.body.trackingData valor:', req.body.trackingData);
        // console.log('[SECURITY DEBUG] tracking após fallback:', tracking);
        // console.log('[SECURITY DEBUG] tracking é null?', tracking === null);
        // console.log('[SECURITY DEBUG] tracking é undefined?', tracking === undefined);
        // console.log('[SECURITY DEBUG] typeof tracking:', typeof tracking);

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
          // console.log('[DEBUG] Dados recebidos:', { telegram_id, plano, valor });
          // console.log('[DEBUG] trackingData do req.body:', req.body.trackingData);
        
        // 🔥 CORREÇÃO: Log detalhado dos UTMs recebidos
        // console.log('[DEBUG] 🎯 UTMs extraídos da requisição:', {
        //   utm_source,
        //   utm_campaign,
        //   utm_campaign,
        //   utm_term,
        //   utm_content
        // });
        // console.log('[DEBUG] 🎯 UTMs origem - req.body.trackingData:', {
        //   utm_source: req.body.trackingData?.utm_source,
        //   utm_medium: req.body.trackingData?.utm_medium,
        //   utm_campaign: req.body.trackingData?.utm_campaign
        // });
        // console.log('[DEBUG] 🎯 UTMs origem - req.query:', {
        //   utm_source: req.query?.utm_source,
        //   utm_medium: req.query?.utm_campaign,
        //   utm_campaign: req.query?.utm_campaign
        // });

  if (!plano || !valor) {
    return res.status(400).json({ error: 'Parâmetros inválidos: plano e valor são obrigatórios.' });
  }

  const valorCentavos = this.config.formatarValorCentavos(valor);
  if (isNaN(valorCentavos) || valorCentavos < 50) {
    return res.status(400).json({ error: 'Valor mínimo é R$0,50.' });
  }

  let pushPayload;
  try {
            // console.log(`[DEBUG] Buscando tracking data para telegram_id: ${telegram_id}`);

    // 🔥 NOVO: Primeiro tentar buscar do SessionTracking (invisível)
    const sessionTrackingData = this.sessionTracking.getTrackingData(telegram_id);
            // console.log('[DEBUG] SessionTracking data:', sessionTrackingData ? { fbp: !!sessionTrackingData.fbp, fbc: !!sessionTrackingData.fbc } : null);

    // 1. Tentar buscar do cache
    const trackingDataCache = this.getTrackingData(telegram_id);
            // console.log('[DEBUG] trackingData cache:', trackingDataCache);

    // 2. Se cache vazio ou incompleto, buscar do banco
    let trackingDataDB = null;
    if (!isRealTrackingData(trackingDataCache)) {
              // console.log('[DEBUG] Cache vazio ou incompleto, buscando no banco...');
      trackingDataDB = await this.buscarTrackingData(telegram_id);
              // console.log('[DEBUG] trackingData banco:', trackingDataDB);
    }

    // 3. Combinar SessionTracking + cache + banco (prioridade para SessionTracking)
    let dadosSalvos = mergeTrackingData(trackingDataCache, trackingDataDB);
    if (sessionTrackingData) {
      dadosSalvos = mergeTrackingData(dadosSalvos, sessionTrackingData);
    }
            // console.log('[DEBUG] dadosSalvos após merge SessionTracking+cache+banco:', dadosSalvos);

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
      utm_content: utm_content || null,
      // 🔥 NOVO: Incluir kwai_click_id da requisição
      kwai_click_id: req.body.kwai_click_id || req.query.kwai_click_id || null
    };

    // 🔍 DEBUG: Log detalhado do kwai_click_id na requisição
    console.log(`[${this.botId}] 🔍 [KWAI-DEBUG] Dados da requisição:`, {
      telegram_id,
      kwai_click_id_body: req.body.kwai_click_id,
      kwai_click_id_query: req.query.kwai_click_id,
      kwai_click_id_final: dadosRequisicao.kwai_click_id,
      hasKwaiClickId: !!dadosRequisicao.kwai_click_id
    });
            // console.log('[DEBUG] Dados da requisição atual:', dadosRequisicao);

    // 3. Fazer mergeTrackingData(dadosSalvos, dadosRequisicao)
    let finalTrackingData = mergeTrackingData(dadosSalvos, dadosRequisicao) || {};

    // 🔍 DEBUG: Log detalhado do kwai_click_id após merge
    console.log(`[${this.botId}] 🔍 [KWAI-DEBUG] Dados após merge:`, {
      telegram_id,
      dadosSalvos_kwai: dadosSalvos?.kwai_click_id,
      dadosRequisicao_kwai: dadosRequisicao?.kwai_click_id,
      finalTrackingData_kwai: finalTrackingData?.kwai_click_id,
      hasKwaiClickId: !!finalTrackingData?.kwai_click_id
    });

    // 🔧 PROTEÇÃO CRÍTICA: Garantir que finalTrackingData nunca seja null
    if (!finalTrackingData || typeof finalTrackingData !== 'object') {
      console.error('[ERRO CRÍTICO] finalTrackingData está null ou inválido. Prosseguindo com objeto vazio.');
      finalTrackingData = {};
    }

            // console.log('[DEBUG] Final tracking data após merge:', finalTrackingData);
        
        // 🔥 CORREÇÃO: Log específico dos UTMs finais
        // console.log('[DEBUG] 🎯 UTMs FINAIS após merge:', {
        //   utm_source: finalTrackingData?.utm_source,
        //   utm_medium: finalTrackingData?.utm_campaign,
        //   utm_campaign: finalTrackingData?.utm_campaign,
        //   utm_term: finalTrackingData?.utm_term,
        //   utm_content: finalTrackingData?.utm_content
        // });

    // 🔥 NOVO: NUNCA gerar fallbacks para _fbp/_fbc - usar apenas dados reais do navegador
    // Se não existir, o evento CAPI será enviado sem esses campos (conforme regra 8)
    if (!finalTrackingData.fbp) {
              // console.log('[INFO] 🔥 fbp não encontrado - evento CAPI será enviado sem este campo (anonimato preservado)');
    }

    if (!finalTrackingData.fbc) {
              // console.log('[INFO] 🔥 fbc não encontrado - evento CAPI será enviado sem este campo (anonimato preservado)');
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
            // console.log('[DEBUG] finalTrackingData é real?', finalReal);
        // console.log('[DEBUG] Qualidade no cache:', cacheQuality);

        const shouldSave = finalReal && (!cacheEntry || cacheQuality === 'fallback');

        if (shouldSave) {
          // console.log('[DEBUG] Salvando tracking data atualizado no cache');
          await this.salvarTrackingData(telegram_id, finalTrackingData);
        } else {
          // console.log('[DEBUG] Tracking data não precisa ser atualizado');
        }

        // console.log('[DEBUG] Tracking data final que será usado:', finalTrackingData);

    // 🔥 CORREÇÃO: Usar UTMs finais após merge (prioridade para requisição atual)
    const camposUtm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    let trackingFinal = { ...(finalTrackingData || {}) };

    // 🔧 PROTEÇÃO ADICIONAL: Garantir que trackingFinal nunca seja null ou tenha propriedades indefinidas
    if (!trackingFinal || typeof trackingFinal !== 'object') {
      console.error('[ERRO CRÍTICO] trackingFinal está null ou inválido. Recriando como objeto vazio.');
      trackingFinal = {};
    }

            // console.log('[SECURITY DEBUG] trackingFinal após criação:', trackingFinal);
        // console.log('[SECURITY DEBUG] trackingFinal é null?', trackingFinal === null);
        // console.log('[SECURITY DEBUG] typeof trackingFinal:', typeof trackingFinal);

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
              // console.log('[DEBUG] req.body.trackingData está null, undefined ou não é um objeto - pulando sobrescrita de UTMs');
    }

            // console.log('[DEBUG] 🎯 UTMs FINAIS após priorização da requisição atual:', {
        //   utm_source: trackingFinal?.utm_source,
        //   utm_medium: trackingFinal?.utm_campaign,
        //   utm_campaign: trackingFinal?.utm_campaign,
        //   utm_term: trackingFinal?.utm_term,
        //   utm_content: trackingFinal?.utm_content
        // });

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

    // 🔥 NOVO: Usar UnifiedPixService para criar cobrança com múltiplos gateways
    console.log(`[${this.botId}] 🚀 Criando cobrança PIX via UnifiedPixService`);
    
    const paymentData = {
      identifier: `telegram_${telegram_id}_${Date.now()}`,
      amount: valorCentavos / 100, // Converter centavos para reais
      client: {
        name: finalTrackingData.name || `Telegram User ${telegram_id}`,
        email: finalTrackingData.email || `${telegram_id}@telegram.local`,
        document: finalTrackingData.document || '00000000000'
      },
      description: nomeOferta,
      metadata: {
        ...metadata,
        telegram_id: telegram_id,
        bot_id: this.botId,
        webhook_url: webhookUrl
      }
    };

    console.log(`[${this.botId}] 📊 Dados da cobrança PIX:`, {
      identifier: paymentData.identifier,
      amount: paymentData.amount,
      client_name: paymentData.client.name,
      client_email: paymentData.client.email,
      gateway: this.unifiedPixService.gatewaySelector.getActiveGateway()
    });

    const pixResult = await this.unifiedPixService.createPixPayment(paymentData);
    
    if (!pixResult.success) {
      throw new Error(`Erro ao criar cobrança PIX: ${pixResult.error}`);
    }

    const { qr_code_base64, qr_code, pix_copia_cola, transaction_id: apiId, gateway } = pixResult;
    const normalizedId = apiId ? apiId.toLowerCase() : null;

    if (!normalizedId) {
      throw new Error(`ID da transação não retornado pelo gateway ${gateway}`);
    }

    console.log(`[${this.botId}] ✅ Cobrança PIX criada com sucesso via ${gateway}:`, normalizedId);

    if (this.db) {
      // console.log('[DEBUG] Salvando token no SQLite com tracking data:', {
      //   telegram_id,
      //   valor: valorCentavos,
      //   utm_source: trackingFinal?.utm_source,
      //   utm_medium: trackingFinal?.utm_medium,
      //   utm_campaign: trackingFinal?.utm_campaign,
      //   fbp: finalTrackingData.fbp,
      //   fbc: finalTrackingData.fbc,
      //   ip: finalTrackingData.ip,
      //   user_agent: finalTrackingData.user_agent
      // });

      // 🔥 NOVO: Verificar se coluna gateway existe, se não existir, adicionar
      try {
        this.db.prepare(`ALTER TABLE tokens ADD COLUMN gateway TEXT DEFAULT 'pushinpay'`).run();
        console.log(`[${this.botId}] 🧩 Coluna 'gateway' adicionada ao SQLite`);
      } catch (e) {
        if (!e.message.includes('duplicate column name')) {
          console.error(`[${this.botId}] ⚠️ Erro ao adicionar coluna 'gateway' no SQLite:`, e.message);
        }
      }

      // Gerar identifier único para esta transação
      const identifier = `bot_${this.botId}_${telegram_id}_${Date.now()}`;
      
      this.db.prepare(
        `INSERT INTO tokens (id_transacao, token, valor, telegram_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, bot_id, status, event_time, nome_oferta, gateway, pix_copia_cola, qr_code_base64, identifier)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?)`
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
        nomeOferta,
        gateway || 'unknown',
        pix_copia_cola,
        qr_code_base64,
        identifier
      );

      console.log(`✅ Token salvo no SQLite com gateway ${gateway}:`, normalizedId);
    }

    const eventName = 'InitiateCheckout';
    const eventId = generateEventId(eventName, telegram_id, eventTime);

    // console.log('[DEBUG] Enviando evento InitiateCheckout para Facebook com:', {
    //   event_name: eventName,
    //   event_time: eventTime,
    //   event_id: eventId,
    //   value: formatForCAPI(valorCentavos),
    //   utm_source: trackingFinal?.utm_source,
    //   utm_medium: trackingFinal?.utm_campaign,
    //   utm_campaign: trackingFinal?.utm_campaign,
    //   fbp: finalTrackingData.fbp,
    //   fbc: finalTrackingData.fbc,
    //   client_ip_address: finalTrackingData.ip,
    //   client_user_agent: finalTrackingData.user_agent
    // });

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
      await appendDataToSheet(
        'pix_generated!A1',
        [[new Date().toISOString().split('T')[0], 1]]
      );
      console.log(`[${this.botId}] ✅ Tracking de geração de PIX registrado para transação ${normalizedId}`);
    } catch (error) {
      console.error('Falha ao registrar o evento de geração de PIX:', error.message);
    }

    // 🎯 KWAI TRACKING: Enviar evento ADD_TO_CART quando PIX for gerado
    try {
      const { getInstance: getKwaiEventAPI } = require('../../services/kwaiEventAPI');
      const kwaiEventAPI = getKwaiEventAPI();
      
      // 🔍 DEBUG: Log detalhado antes de buscar click_id
      console.log(`[${this.botId}] 🔍 [KWAI-DEBUG] Buscando click_id para ADD_TO_CART:`, {
        telegram_id,
        finalTrackingData_kwai: finalTrackingData?.kwai_click_id,
        trackingFinal_kwai: trackingFinal?.kwai_click_id,
        hasFinalTrackingData: !!finalTrackingData?.kwai_click_id,
        hasTrackingFinal: !!trackingFinal?.kwai_click_id
      });
      
      // Buscar click_id do tracking data (pode ter sido capturado na landing page)
      const kwaiClickId = finalTrackingData.kwai_click_id || trackingFinal?.kwai_click_id;
      
      if (kwaiClickId) {
        console.log(`[${this.botId}] 🎯 Enviando Kwai ADD_TO_CART para click_id: ${kwaiClickId.substring(0, 10)}...`);
        
        const kwaiResult = await kwaiEventAPI.sendAddToCartEvent(telegram_id, {
          content_id: normalizedId,
          content_name: nomeOferta,
          value: formatForCAPI(valorCentavos),
          currency: 'BRL',
          quantity: 1
        }, kwaiClickId);
        
        if (kwaiResult.success) {
          console.log(`[${this.botId}] ✅ Kwai ADD_TO_CART enviado com sucesso`);
        } else {
          console.log(`[${this.botId}] ❌ Erro ao enviar Kwai ADD_TO_CART:`, kwaiResult.error);
        }
      } else {
        console.log(`[${this.botId}] ℹ️ Kwai click_id não encontrado, evento ADD_TO_CART não será enviado`);
      }
    } catch (kwaiError) {
      console.error(`[${this.botId}] ❌ Erro no Kwai tracking ADD_TO_CART:`, kwaiError.message);
    }

    return res.json({
      qr_code_base64,
      qr_code: pix_copia_cola || qr_code,
      pix_copia_cola: pix_copia_cola || qr_code,
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

      console.log(`[${this.botId}] 🔔 Webhook PushinPay recebido`);
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('Headers:', req.headers);
      console.log('ID normalizado:', normalizedId);
      console.log('Status:', status);

      if (!normalizedId || !['paid', 'approved', 'pago'].includes(status)) return res.sendStatus(200);
      
      // Extrair dados pessoais do payload para hashing
      const payerName = payload.payer_name || payload.payer?.name || null;
      const payerCpf = payload.payer_national_registration || payload.payer?.national_registration || null;
      const endToEndId = payload.end_to_end_id || payload.pix_end_to_end_id || payload.endToEndId || null;
      
      // Gerar hashes de dados pessoais se disponíveis
      let hashedUserData = null;
      if (payerName && payerCpf) {
        hashedUserData = generateHashedUserData(payerName, payerCpf);
        console.log(`[${this.botId}] 🔐 Dados pessoais hasheados gerados para Purchase`);
      }
      
      const row = this.db ? this.db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get(normalizedId) : null;
              // console.log('[DEBUG] Token recuperado após pagamento:', row);
      if (!row) return res.status(400).send('Transação não encontrada');
      // Evita processamento duplicado em caso de retries
      if (row.status === 'valido') return res.status(200).send('Pagamento já processado');
      const novoToken = uuidv4().toLowerCase();
      if (this.db) {
        // Para bot especial, armazenar dados originais temporariamente para exibição
        const nomeParaExibir = (this.botId === 'bot_especial' && payerName) ? payerName : null;
        const cpfParaExibir = (this.botId === 'bot_especial' && payerCpf) ? payerCpf : null;
        const endToEndIdParaExibir = (this.botId === 'bot_especial' && endToEndId) ? endToEndId : null;
        
        this.db.prepare(
          `UPDATE tokens SET token = ?, status = 'valido', usado = 0, fn_hash = ?, ln_hash = ?, external_id_hash = ?, payer_name_temp = ?, payer_cpf_temp = ?, end_to_end_id_temp = ? WHERE id_transacao = ?`
        ).run(
          novoToken, 
          null, // 🔥 REMOVIDO: Hash removido para facilitar visualização dos logs do Kwai
          null, // 🔥 REMOVIDO: Hash removido para facilitar visualização dos logs do Kwai
          null, // 🔥 REMOVIDO: Hash removido para facilitar visualização dos logs do Kwai
          nomeParaExibir,
          cpfParaExibir,
          endToEndIdParaExibir,
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

          // Para bot especial, incluir dados temporários para exibição
          const nomeParaExibir = (this.botId === 'bot_especial' && payerName) ? payerName : null;
          const cpfParaExibir = (this.botId === 'bot_especial' && payerCpf) ? payerCpf : null;
          const endToEndIdParaExibir = (this.botId === 'bot_especial' && endToEndId) ? endToEndId : null;
          
          await this.postgres.executeQuery(
            this.pgPool,
            `INSERT INTO tokens (id_transacao, token, telegram_id, valor, status, usado, bot_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, event_time, fn_hash, ln_hash, external_id_hash, nome_oferta, payer_name_temp, payer_cpf_temp, end_to_end_id_temp)
             VALUES ($1,$2,$3,$4,'valido',FALSE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             ON CONFLICT (id_transacao) DO UPDATE SET token = EXCLUDED.token, status = 'valido', usado = FALSE, fn_hash = EXCLUDED.fn_hash, ln_hash = EXCLUDED.ln_hash, external_id_hash = EXCLUDED.external_id_hash, nome_oferta = EXCLUDED.nome_oferta, payer_name_temp = EXCLUDED.payer_name_temp, payer_cpf_temp = EXCLUDED.payer_cpf_temp, end_to_end_id_temp = EXCLUDED.end_to_end_id_temp`,
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
              row.nome_oferta || 'Oferta Desconhecida',
              nomeParaExibir,
              cpfParaExibir,
              endToEndIdParaExibir
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
        // Usar página personalizada se configurada
        const paginaObrigado = this.config.paginaObrigado || 'obrigado.html';
        const linkComToken = `${this.frontendUrl}/${paginaObrigado}?token=${encodeURIComponent(novoToken)}&valor=${valorReais}&${this.grupo}${utmString}`;
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

        // 🎯 KWAI TRACKING: Enviar evento PURCHASE quando pagamento for aprovado
        try {
          const { getInstance: getKwaiEventAPI } = require('../../services/kwaiEventAPI');
          const kwaiEventAPI = getKwaiEventAPI();
          
          // Buscar click_id do tracking data
          const kwaiClickId = track?.kwai_click_id;
          
          if (kwaiClickId) {
            console.log(`[${this.botId}] 🎯 Enviando Kwai PURCHASE para click_id: ${kwaiClickId.substring(0, 10)}...`);
            
            const kwaiResult = await kwaiEventAPI.sendPurchaseEvent(telegramId, {
              content_id: normalizedId,
              content_name: row.nome_oferta || 'Oferta Desconhecida',
              value: parseFloat((transactionValueCents / 100).toFixed(2)),
              currency: 'BRL',
              quantity: 1
            }, kwaiClickId);
            
            if (kwaiResult.success) {
              console.log(`[${this.botId}] ✅ Kwai PURCHASE enviado com sucesso`);
            } else {
              console.log(`[${this.botId}] ❌ Erro ao enviar Kwai PURCHASE:`, kwaiResult.error);
            }
          } else {
            console.log(`[${this.botId}] ℹ️ Kwai click_id não encontrado, evento PURCHASE não será enviado`);
          }
        } catch (kwaiError) {
          console.error(`[${this.botId}] ❌ Erro no Kwai tracking PURCHASE:`, kwaiError.message);
        }
      }

      // Registro de Purchase no Google Sheets - MODELO ANTIGO RESTAURADO
      try {
        const purchaseData = [
          new Date().toISOString().split('T')[0], // Data simplificada como era antes
          1,                                      // Quantidade sempre 1 como era antes  
          row.nome_oferta || 'Oferta Desconhecida', // Nome da oferta (mantido como está)
          row.utm_source,                         // UTM source como campo separado
          row.utm_medium,                         // UTM medium como campo separado
          row.utm_campaign                        // UTM campaign como campo separado
        ];
        console.log(
          `[${this.botId}] Registrando tracking de Purchase no Google Sheets para transação ${normalizedId}`
        );
        await appendDataToSheet('purchase!A1', [purchaseData]);
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
        // console.log(`[${this.botId}] ✅ Flag capi_ready marcada para token ${novoToken} - CAPI será enviado pelo cron/fallback`);
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

  /**
   * Webhook da Oasyfy para processar pagamentos confirmados
   */
  async webhookOasyfy(req, res) {
    try {
      // Proteção contra payloads vazios
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).send('Payload inválido');
      }

      const payload = req.body;
      const { event, transaction } = payload || {};
      const transactionId = transaction?.id || transaction?.transactionId || null;

      console.log(`[${this.botId}] 🔔 Webhook Oasyfy recebido`);
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('Headers:', req.headers);
      console.log('Event:', event);
      console.log('Transaction ID:', transactionId);

      // Só processar eventos de pagamento confirmado
      if (!transactionId || event !== 'TRANSACTION_PAID' || transaction?.status !== 'COMPLETED') {
        console.log(`[${this.botId}] ⏭️ Evento ignorado: ${event}, Status: ${transaction?.status}`);
        return res.sendStatus(200);
      }

      console.log(`[${this.botId}] 💰 Pagamento confirmado via Oasyfy: ${transactionId}`);

      // Buscar transação no banco
      const row = this.db ? this.db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get(transactionId.toLowerCase()) : null;
      
      if (!row) {
        console.log(`[${this.botId}] ⚠️ Transação não encontrada no banco: ${transactionId}`);
        return res.status(400).send('Transação não encontrada');
      }

      // Evitar processamento duplicado
      if (row.status === 'valido') {
        console.log(`[${this.botId}] ✅ Transação já processada: ${transactionId}`);
        return res.sendStatus(200);
      }

      // Atualizar status no banco
      if (this.db) {
        const updateStmt = this.db.prepare('UPDATE tokens SET status = ? WHERE id_transacao = ?');
        updateStmt.run('valido', transactionId.toLowerCase());
        console.log(`[${this.botId}] ✅ Status atualizado para 'valido' no banco: ${transactionId}`);
      }

      // Atualizar PostgreSQL se disponível
      if (this.pgPool && row.telegram_id) {
        const tgId = this.normalizeTelegramId(row.telegram_id);
        if (tgId !== null) {
          await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
          console.log(`[${this.botId}] ✅ Status atualizado no PostgreSQL para telegram_id: ${tgId}`);
        }
      }

      // Enviar eventos de tracking se disponível
      try {
        const trackingData = this.getTrackingData(row.telegram_id) || {};
        
        // Facebook Pixel
        if (trackingData.utm_source === 'facebook' || trackingData.fbclid) {
          const eventData = {
            event_name: 'Purchase',
            event_id: generateEventId(),
            user_data: generateHashedUserData(
              transaction?.client?.name || 'Cliente Oasyfy',
              transaction?.client?.cpf || transaction?.client?.cnpj || '00000000000'
            ),
            custom_data: {
              value: transaction?.amount || row.valor / 100,
              currency: 'BRL',
              content_type: 'product',
              content_ids: [row.plano_id || 'plano_telegram']
            }
          };
          
          await sendFacebookEvent(eventData, trackingData);
          console.log(`[${this.botId}] 📊 Evento Facebook Purchase enviado`);
        }

        // Google Sheets
        if (trackingData.utm_source) {
          await appendDataToSheet({
            timestamp: new Date().toISOString(),
            source: 'telegram_bot_oasyfy',
            event: 'purchase',
            transaction_id: transactionId,
            telegram_id: row.telegram_id,
            valor: row.valor / 100,
            gateway: 'oasyfy',
            ...trackingData
          });
          console.log(`[${this.botId}] 📊 Dados enviados para Google Sheets`);
        }

        // UTMify
        if (trackingData.utm_source) {
          await enviarConversaoParaUtmify({
            transaction_id: transactionId,
            valor: row.valor / 100,
            gateway: 'oasyfy',
            source: 'telegram_bot',
            ...trackingData
          });
          console.log(`[${this.botId}] 📊 Conversão enviada para UTMify`);
        }

      } catch (trackingError) {
        console.error(`[${this.botId}] ⚠️ Erro ao enviar eventos de tracking:`, trackingError.message);
      }

      console.log(`[${this.botId}] ✅ Webhook Oasyfy processado com sucesso: ${transactionId}`);
      res.sendStatus(200);

    } catch (error) {
      console.error(`[${this.botId}] ❌ Erro no webhook Oasyfy:`, error);
      res.status(500).json({ error: 'Erro interno do servidor' });
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
          await this.enviarMidiaComFallback(chatId, 'video', midia, { supports_streaming: true });
        }
        await this.bot.sendMessage(chatId, texto, { parse_mode: 'HTML' });
        await this.bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
          reply_markup: { 
            inline_keyboard: this.config.inicio.menuInicial.opcoes.map(o => {
              // Se a opção tiver uma URL, crie um botão de link
              if (o.url) {
                return [{ text: o.texto, url: o.url }];
              }
              // Senão, crie um botão de callback
              return [{ text: o.texto, callback_data: o.callback }];
            })
          }
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

  // 🚀 NOVO: Métodos de cache para otimização de performance
  getCachedTrackingData(chatId) {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(chatId);
    
    if (expiry && now > expiry) {
      this.trackingCache.delete(chatId);
      this.cacheExpiry.delete(chatId);
      return null;
    }
    
    return this.trackingCache.get(chatId);
  }

  setCachedTrackingData(chatId, data) {
    this.trackingCache.set(chatId, data);
    this.cacheExpiry.set(chatId, Date.now() + this.CACHE_TTL);
  }

  limparCacheExpirado() {
    const now = Date.now();
    let removidos = 0;
    
    for (const [chatId, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.trackingCache.delete(chatId);
        this.cacheExpiry.delete(chatId);
        removidos++;
      }
    }
    
    if (removidos > 0) {
      console.log(`[${this.botId}] 🧹 Cache limpo: ${removidos} entradas expiradas removidas`);
    }
  }

  /**
   * 🚀 MÉTRICAS: Obter relatório completo de performance
   */
  obterRelatorioCompleto() {
    const relatorioMidia = this.gerenciadorMidia ? this.gerenciadorMidia.obterRelatorioPerformance() : null;
    const estatisticasCache = this.gerenciadorMidia ? this.gerenciadorMidia.obterEstatisticasCache() : null;
    
    return {
      botId: this.botId,
      timestamp: new Date().toISOString(),
      preWarming: relatorioMidia,
      cacheFileIds: estatisticasCache,
      trackingCache: {
        tamanho: this.trackingData.size,
        addToCartCache: this.addToCartCache.size
      },
      sistema: {
        memoria: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
  }

  /**
   * 🚀 MÉTRICAS: Log detalhado de performance
   */
  logMetricasPerformance() {
    const relatorio = this.obterRelatorioCompleto();
    
    console.log(`\n📊 [${this.botId}] RELATÓRIO DE PERFORMANCE:`);
    console.log('='.repeat(50));
    
    if (relatorio.preWarming) {
      console.log(`🚀 PRE-WARMING:`);
      console.log(`   Status: ${relatorio.preWarming.preWarmingAtivo ? '✅ ATIVO' : '❌ INATIVO'}`);
      console.log(`   File_IDs pré-aquecidos: ${relatorio.preWarming.totalPreAquecidos}`);
      console.log(`   Pools ativos: ${relatorio.preWarming.poolsAtivos}`);
      console.log(`   Taxa de cache: ${relatorio.preWarming.taxaCache}`);
      console.log(`   Tempo médio: ${relatorio.preWarming.tempoMedioMs}ms`);
      console.log(`   Eficiência: ${relatorio.preWarming.eficiencia}`);
    }
    
    if (relatorio.cacheFileIds) {
      console.log(`🔥 CACHE FILE_IDS:`);
      console.log(`   Total cached: ${relatorio.cacheFileIds.total}`);
      console.log(`   Pool size: ${relatorio.cacheFileIds.poolSize}`);
      console.log(`   Pré-aquecidos: ${relatorio.cacheFileIds.preAquecidos}`);
    }
    
    console.log(`📈 TRACKING:`);
    console.log(`   Cache tracking: ${relatorio.trackingCache.tamanho} entradas`);
    console.log(`   Cache AddToCart: ${relatorio.trackingCache.addToCartCache} entradas`);
    
    console.log(`💾 SISTEMA:`);
    console.log(`   Memória RSS: ${(relatorio.sistema.memoria.rss / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   Uptime: ${Math.round(relatorio.sistema.uptime)}s`);
    
    console.log('='.repeat(50) + '\n');
  }

  /**
   * 🚀 PRE-WARMING: Configurar apenas o gerenciador (sistema centralizado cuida da execução)
   */
  configurarPreWarming() {
    try {
      // Obter chat ID específico para este bot
      let testChatId = null;
      let variavel = '';
      
      switch (this.botId) {
        case 'bot1':
          testChatId = process.env.TEST_CHAT_ID_BOT1 || process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID_BOT1';
          break;
        case 'bot2':
          testChatId = process.env.TEST_CHAT_ID_BOT2 || process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID_BOT2';
          break;
        case 'bot_especial':
          testChatId = process.env.TEST_CHAT_ID_BOT_ESPECIAL || process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID_BOT_ESPECIAL';
          break;
        case 'bot4':
          testChatId = process.env.TEST_CHAT_ID_BOT4 || process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID_BOT4';
          break;
        case 'bot5':
          testChatId = process.env.TEST_CHAT_ID_BOT5 || process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID_BOT5';
          break;
        case 'bot6':
          testChatId = process.env.TEST_CHAT_ID_BOT6 || process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID_BOT6';
          break;
        default:
          testChatId = process.env.TEST_CHAT_ID;
          variavel = 'TEST_CHAT_ID';
      }
      
      if (!testChatId) {
        console.warn(`[${this.botId}] 🚀 PRE-WARMING: ${variavel} não configurado - sistema desabilitado`);
        console.warn(`[${this.botId}] 💡 Configure ${variavel} ou TEST_CHAT_ID como fallback`);
        return;
      }

      // Configurar GerenciadorMidia com instância do bot e chat de teste específico
      this.gerenciadorMidia.botInstance = this.bot;
      this.gerenciadorMidia.testChatId = testChatId;
      
      console.log(`[${this.botId}] 🚀 PRE-WARMING: Gerenciador configurado com chat ${testChatId}`);
      console.log(`[${this.botId}] 📱 Usando variável: ${variavel}`);

    } catch (error) {
      console.error(`[${this.botId}] 🚀 PRE-WARMING: Erro na configuração:`, error.message);
    }
  }

  /**
   * 🚀 NOVO: Detectar se usuário é novo (nunca usou /start antes)
   */
  async detectarUsuarioNovo(chatId) {
    try {
      const cleanTelegramId = this.normalizeTelegramId(chatId);
      if (cleanTelegramId === null) return false;

      // 🚀 CACHE: Verificar se já conhecemos este usuário (FASE 1)
      if (!this.userCache) {
        this.userCache = new Map();
        this.USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
      }
      
      const cached = this.userCache.get(cleanTelegramId);
      if (cached && (Date.now() - cached.timestamp) < this.USER_CACHE_TTL) {
        console.log(`💾 CACHE-HIT: Usuário ${chatId} é ${cached.isNew ? '🆕 NOVO' : '👥 RECORRENTE'} (cached)`);
        return cached.isNew;
      }

      // 🚀 OTIMIZAÇÃO FASE 1: Consulta unificada (1 query em vez de 2)
      if (this.pgPool) {
        const unifiedQuery = `
          SELECT 'downsell' as source, telegram_id FROM downsell_progress WHERE telegram_id = $1
          UNION ALL
          SELECT 'tracking' as source, telegram_id FROM tracking_data WHERE telegram_id = $1
          LIMIT 1
        `;
        
        const userExistsRes = await this.postgres.executeQuery(
          this.pgPool,
          unifiedQuery,
          [cleanTelegramId]
        );
        
        if (userExistsRes.rows.length > 0) {
          this.userCache.set(cleanTelegramId, { isNew: false, timestamp: Date.now() });
          const source = userExistsRes.rows[0].source;
          console.log(`👥 USUÁRIO RECORRENTE detectado: ${chatId} (via ${source} - consulta otimizada)`);
          return false; // Usuário já existe
        }
      }

      // 🚀 FALLBACK SQLite se PostgreSQL não estiver disponível
      if (!this.pgPool && this.db) {
        try {
          const downsellRow = this.db
            .prepare('SELECT telegram_id FROM downsell_progress WHERE telegram_id = ? LIMIT 1')
            .get(cleanTelegramId);
          
          if (downsellRow) {
            console.log(`👥 USUÁRIO RECORRENTE detectado: ${chatId} (via SQLite downsell_progress)`);
            return false;
          }

          const trackingRow = this.db
            .prepare('SELECT telegram_id FROM tracking_data WHERE telegram_id = ? LIMIT 1')
            .get(cleanTelegramId);
          
          if (trackingRow) {
            console.log(`👥 USUÁRIO RECORRENTE detectado: ${chatId} (via SQLite tracking_data)`);
            return false;
          }
        } catch (err) {
          console.warn(`[${this.botId}] Erro ao verificar usuário novo via SQLite:`, err.message);
        }
      }

      // Se chegou até aqui, é usuário novo
      this.userCache.set(cleanTelegramId, { isNew: true, timestamp: Date.now() });
      console.log(`🆕 USUÁRIO NOVO detectado: ${chatId} (cached para próximas verificações)`);
      return true;

    } catch (error) {
      console.error(`[${this.botId}] Erro ao detectar usuário novo:`, error.message);
      // Em caso de erro, assumir que é usuário recorrente (mais seguro)
      return false;
    }
  }

  registrarComandos() {
    if (!this.bot) return;

    this.bot.onText(/\/start(?:\s+(.*))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      
      // 🚀 FLUXO ÚNICO: MÍDIA INSTANTÂNEA SEMPRE!
      console.log(`🚀 MÍDIA INSTANTÂNEA: Enviando mídia PRIMEIRO para ${chatId}`);
      try {
        // 🔥 CORREÇÃO: Verificar configuração para enviar múltiplas mídias
        if (this.config.inicio && this.config.inicio.enviarTodasMidias) {
          console.log(`🚀 MÚLTIPLAS MÍDIAS: Enviando TODAS as mídias iniciais para ${chatId}`);
          await this.enviarMidiasHierarquicamente(chatId, this.config.midias.inicial);
        } else {
          console.log(`🚀 MÍDIA ÚNICA: Enviando apenas primeira mídia disponível para ${chatId}`);
          await this.enviarMidiaInstantanea(chatId, this.config.midias.inicial);
        }
      } catch (error) {
        console.error(`[${this.botId}] Erro ao enviar mídias:`, error.message);
        // Fallback para mídia instantânea se falhar
        await this.enviarMidiaInstantanea(chatId, this.config.midias.inicial);
      }
      
      // Depois enviar texto e menu
      await this.bot.sendMessage(chatId, this.config.inicio.textoInicial, { parse_mode: 'HTML' });
      await this.bot.sendMessage(chatId, this.config.inicio.menuInicial.texto, {
        reply_markup: {
          inline_keyboard: this.config.inicio.menuInicial.opcoes.map(o => {
            // Se a opção tiver uma URL, crie um botão de link
            if (o.url) {
              return [{ text: o.texto, url: o.url }];
            }
            // Senão, crie um botão de callback
            return [{ text: o.texto, callback_data: o.callback }];
          })
        }
      });
      
      // 🚀 OTIMIZAÇÃO CRÍTICA: Mover tracking para background (não-bloqueante)
      setImmediate(async () => {
        try {
          await appendDataToSheet(
            'bot_start!A1',
            [[new Date().toISOString().split('T')[0], 1]]
          );
          console.log(`[${this.botId}] ✅ Tracking do comando /start registrado para ${chatId}`);
        } catch (error) {
          console.error('Falha ao registrar o evento /start do bot:', error.message);
        }
      });
      
      // 🚀 BACKGROUND: Processamento de payload e eventos Facebook
      setImmediate(async () => {
        const payloadRaw = match && match[1] ? match[1].trim() : '';
        
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
        
        // 🚀 PROCESSAMENTO COMPLETO DE PAYLOAD EM BACKGROUND
        if (payloadRaw) {
          // console.log('[payload-debug] payloadRaw detectado (background)', { chatId, payload_id: payloadRaw });
          
          try {
            // 🔥 NOVO: Capturar parâmetros de cookies do Facebook e kwai_click_id diretamente da URL
            let directParams = null;
            try {
              // Verificar se há parâmetros na forma de query string no payload
              if (payloadRaw.includes('fbp=') || payloadRaw.includes('fbc=') || payloadRaw.includes('utm_') || payloadRaw.includes('kwai_click_id=')) {
                const urlParams = new URLSearchParams(payloadRaw);
                directParams = {
                  fbp: urlParams.get('fbp'),
                  fbc: urlParams.get('fbc'),
                  user_agent: urlParams.get('user_agent'),
                  utm_source: urlParams.get('utm_source'),
                  utm_medium: urlParams.get('utm_medium'),
                  utm_campaign: urlParams.get('utm_campaign'),
                  utm_term: urlParams.get('utm_term'),
                  utm_content: urlParams.get('utm_content'),
                  kwai_click_id: urlParams.get('kwai_click_id')
                };
                
                // 🔍 DEBUG: Log detalhado para entender o problema
                console.log(`[${this.botId}] 🔍 [DEBUG] Parâmetros capturados via URL:`, {
                  payloadRaw,
                  hasKwaiClickId: payloadRaw.includes('kwai_click_id='),
                  kwai_click_id: urlParams.get('kwai_click_id'),
                  directParams
                });
                
                // Se encontrou parâmetros diretos, armazenar imediatamente
                if (directParams.fbp || directParams.fbc || directParams.kwai_click_id) {
                  this.sessionTracking.storeTrackingData(chatId, directParams);
                  console.log(`[${this.botId}] 🔥 Parâmetros capturados via URL:`, {
                    fbp: !!directParams.fbp,
                    fbc: !!directParams.fbc,
                    utm_source: directParams.utm_source,
                    kwai_click_id: directParams.kwai_click_id ? directParams.kwai_click_id.substring(0, 10) + '...' : null
                  });
                }
              }
            } catch (e) {
              console.warn(`[${this.botId}] Erro ao processar parâmetros diretos:`, e.message);
            }
            
            // Processamento completo do payload
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
              // 🔥 NOVO: Capturar kwai_click_id dos parâmetros diretos
              const kwai_click_id = directParams.kwai_click_id;
                              // console.log('[payload-debug] Merge directParams', { chatId, payload_id: payloadRaw, fbp, fbc, user_agent, kwai_click_id });
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
                // console.log('[payload-debug] payload_tracking PG', { chatId, payload_id: payloadRaw, row });
                if (!row) {
                  // console.log('[payload-debug] Origem PG sem resultado payload_tracking', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payload PG:`, err.message);
              }
              try {
                const res2 = await this.postgres.executeQuery(
                  this.pgPool,
                  'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id FROM payloads WHERE payload_id = $1',
                  [payloadRaw]
                );
                payloadRow = res2.rows[0];
                // console.log('[payload-debug] payloadRow PG', { chatId, payload_id: payloadRaw, payloadRow });
                if (!payloadRow) {
                  // console.log('[payload-debug] Origem PG sem resultado payloadRow', { chatId, payload_id: payloadRaw });
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
                // console.log('[payload-debug] payload_tracking SQLite', { chatId, payload_id: payloadRaw, row });
                if (!row) {
                  // console.log('[payload-debug] Origem SQLite sem resultado payload_tracking', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payload SQLite:`, err.message);
              }
            }
            if (!payloadRow && this.db) {
              try {
                payloadRow = this.db
                  .prepare('SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id FROM payloads WHERE payload_id = ?')
                  .get(payloadRaw);
                // console.log('[payload-debug] payloadRow SQLite', { chatId, payload_id: payloadRaw, payloadRow });
                if (!payloadRow) {
                  // console.log('[payload-debug] Origem SQLite sem resultado payloadRow', { chatId, payload_id: payloadRaw });
                }
              } catch (err) {
                console.warn(`[${this.botId}] Erro ao buscar payloads SQLite:`, err.message);
              }
            }

            if (row) {
              ({ fbp, fbc, ip, user_agent } = row);
              // console.log('[payload-debug] Merge payload_tracking', { chatId, payload_id: payloadRaw, fbp, fbc, ip, user_agent });
              if (this.pgPool) {
                try {
                  const cleanTelegramId = this.normalizeTelegramId(chatId);
                  if (cleanTelegramId !== null) {
                    await this.postgres.executeQuery(
                      this.pgPool,
                      'UPDATE payload_tracking SET telegram_id = $1 WHERE payload_id = $2',
                      [cleanTelegramId, payloadRaw]
                    );
                    // console.log(`[payload] Associado payload_tracking: ${chatId} \u21D2 ${payloadRaw}`);
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
                    // console.log(`[payload] Associado payload_tracking: ${chatId} \u21D2 ${payloadRaw}`);
                  }
                } catch (err) {
                  console.warn(`[${this.botId}] Erro ao associar payload SQLite:`, err.message);
                }
              }
            }
            // 🔥 NOVO: Se encontrou payload válido, associar todos os dados ao telegram_id
            let trackingSalvoDePayload = false;
            if (!payloadRow) {
              // console.log('[payload-debug] payloadRow null', { chatId, payload_id: payloadRaw });
            }
            if (payloadRow) {
              if (!fbp) fbp = payloadRow.fbp;
              if (!fbc) fbc = payloadRow.fbc;
              if (!ip) ip = payloadRow.ip;
              if (!user_agent) user_agent = payloadRow.user_agent;
              utm_source = payloadRow.utm_source;
              utm_medium = payloadRow.utm_medium;
              utm_campaign = payloadRow.utm_campaign;
              // console.log('[payload-debug] Merge payloadRow', { chatId, payload_id: payloadRaw, fbp, fbc, ip, user_agent });
              
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
                user_agent,
                kwai_click_id: payloadRow.kwai_click_id
              };

              // console.log('[payload-debug] Salvando tracking', { chatId, payload_id: payloadRaw, forceOverwrite: true, payloadTrackingData });
              await this.salvarTrackingData(chatId, payloadTrackingData, true);
              // console.log('[payload-debug] Tracking salvo com sucesso');
              // console.log(`[payload] bot${this.botId} → Associado payload ${payloadRaw} ao telegram_id ${chatId}`);
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
              // console.log('[payload-debug] Salvando tracking', { chatId, payload_id: payloadRaw, forceOverwrite: false, utm_source, utm_medium, utm_campaign, fbp, fbc, ip, user_agent, kwai_click_id });
              await this.salvarTrackingData(chatId, {
                utm_source,
                utm_medium,
                utm_campaign,
                fbp,
                fbc,
                ip,
                user_agent,
                kwai_click_id: kwai_click_id || null
              });
              // console.log('[payload-debug] Tracking salvo com sucesso');
              if (this.pgPool && !row) {
                // console.log(`[payload] ${this.botId} → Associado payload ${payloadRaw} ao telegram_id ${chatId}`);
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
              utm_content: null, // Pode vir de outros parâmetros
              kwai_click_id: kwai_click_id || null
            });
          }

                  // if (this.pgPool && !trackingExtraido) {
        //   console.warn(`[${this.botId}] ⚠️ Nenhum dado de tracking recuperado para ${chatId}`);
        // }
          if (trackingExtraido) {
            // console.log('[DEBUG] trackData extraído:', { utm_source, utm_medium, utm_campaign, utm_term: payloadRow?.utm_term, utm_content: payloadRow?.utm_content, fbp, fbc, ip, user_agent, kwai_click_id });
          }
        } catch (e) {
          console.warn(`[${this.botId}] Falha ao processar payload do /start (background):`, e.message);
        }
        }
      });
      
      // 🚀 BACKGROUND: Operações de banco (não-bloqueante)
      setImmediate(async () => {
        try {
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
                console.log(`[${this.botId}] 📝 Usuário ${chatId} adicionado ao downsell_progress`);
              }
            }
          }
        } catch (error) {
          console.warn(`[${this.botId}] Erro ao processar downsell_progress:`, error.message);
        }
      });
    });

    // 🚀 NOVO: Comando /reset para tratar usuário como novo
    this.bot.onText(/\/reset/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        console.log(`🔄 RESET: Processando reset para usuário ${chatId}`);
        
        const cleanTelegramId = this.normalizeTelegramId(chatId);
        if (cleanTelegramId === null) {
          await this.bot.sendMessage(chatId, '❌ Erro ao processar reset. Tente novamente.');
          return;
        }

        let resetsSucess = 0;
        let resetsTotal = 0;

        // 🗑️ LIMPAR DADOS: PostgreSQL
        if (this.pgPool) {
          try {
            // Remover de downsell_progress
            const downsellRes = await this.postgres.executeQuery(
              this.pgPool,
              'DELETE FROM downsell_progress WHERE telegram_id = $1',
              [cleanTelegramId]
            );
            resetsTotal++;
            if (downsellRes.rowCount > 0) {
              resetsSucess++;
              console.log(`🗑️ RESET: Removido de downsell_progress (PG): ${downsellRes.rowCount} registros`);
            }

            // Remover de tracking_data
            const trackingRes = await this.postgres.executeQuery(
              this.pgPool,
              'DELETE FROM tracking_data WHERE telegram_id = $1',
              [cleanTelegramId]
            );
            resetsTotal++;
            if (trackingRes.rowCount > 0) {
              resetsSucess++;
              console.log(`🗑️ RESET: Removido de tracking_data (PG): ${trackingRes.rowCount} registros`);
            }

          } catch (error) {
            console.error(`🔄 RESET: Erro ao limpar dados PG:`, error.message);
          }
        }

        // 🗑️ LIMPAR DADOS: SQLite (fallback)
        if (this.db) {
          try {
            // Remover de downsell_progress
            const downsellStmt = this.db.prepare('DELETE FROM downsell_progress WHERE telegram_id = ?');
            const downsellResult = downsellStmt.run(cleanTelegramId);
            resetsTotal++;
            if (downsellResult.changes > 0) {
              resetsSucess++;
              console.log(`🗑️ RESET: Removido de downsell_progress (SQLite): ${downsellResult.changes} registros`);
            }

            // Remover de tracking_data
            const trackingStmt = this.db.prepare('DELETE FROM tracking_data WHERE telegram_id = ?');
            const trackingResult = trackingStmt.run(cleanTelegramId);
            resetsTotal++;
            if (trackingResult.changes > 0) {
              resetsSucess++;
              console.log(`🗑️ RESET: Removido de tracking_data (SQLite): ${trackingResult.changes} registros`);
            }

          } catch (error) {
            console.error(`🔄 RESET: Erro ao limpar dados SQLite:`, error.message);
          }
        }

        // 🧹 LIMPAR CACHE LOCAL
        this.trackingData.delete(chatId);
        this.addToCartCache.delete(chatId);
        console.log(`🧹 RESET: Cache local limpo para ${chatId}`);

        // ⏳ AGUARDAR um pouco para garantir que todas as operações de background terminem
        await new Promise(resolve => setTimeout(resolve, 1000));

        // ✅ RESPOSTA AO USUÁRIO
        const emoji = resetsSucess > 0 ? '✅' : '⚠️';
        const status = resetsSucess > 0 ? 'concluído' : 'parcial';
        
        await this.bot.sendMessage(chatId, 
          `${emoji} <b>Reset ${status}!</b>\n\n` +
          `🗑️ Dados removidos: ${resetsSucess}/${resetsTotal} tabelas\n` +
          `🆕 Próximo /start será tratado como usuário NOVO\n` +
          `🚀 Mídia será enviada INSTANTANEAMENTE!\n\n` +
          `⚡ <i>Pode testar o /start agora!</i>`,
          { parse_mode: 'HTML' }
        );

        console.log(`🔄 RESET: Concluído para ${chatId} - ${resetsSucess}/${resetsTotal} sucessos`);

      } catch (error) {
        console.error(`🔄 RESET: Erro geral para ${chatId}:`, error.message);
        await this.bot.sendMessage(chatId, '❌ Erro interno durante reset. Tente novamente em alguns segundos.');
      }
    });

    // 🚀 NOVO: Comando /enviar_vip para enviar mensagem VIP para o canal
    this.bot.onText(/\/enviar_vip/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        console.log(`📤 ENVIAR_VIP: Processando comando para usuário ${chatId}`);
        
        // Verificar se é um administrador (opcional - você pode remover essa verificação)
        // const adminIds = ['123456789', '987654321']; // Adicione os IDs dos admins
        // if (!adminIds.includes(chatId.toString())) {
        //   await this.bot.sendMessage(chatId, '❌ Apenas administradores podem usar este comando.');
        //   return;
        // }
        
        await this.bot.sendMessage(chatId, '📤 Enviando mensagem VIP para o canal...');
        
        const resultado = await this.enviarMensagemVIPParaCanal();
        
        await this.bot.sendMessage(chatId, 
          `✅ <b>Mensagem VIP enviada com sucesso!</b>\n\n` +
          `📊 ID da mensagem: <code>${resultado.message_id}</code>\n` +
          `📢 Canal: <code>-1002891140776</code>\n` +
          `🔗 Botão direciona para: <code>@vipshadrie2_bot</code>`,
          { parse_mode: 'HTML' }
        );
        
        console.log(`📤 ENVIAR_VIP: Mensagem enviada com sucesso por ${chatId}`);
        
      } catch (error) {
        console.error(`📤 ENVIAR_VIP: Erro para ${chatId}:`, error.message);
        await this.bot.sendMessage(chatId, 
          `❌ <b>Erro ao enviar mensagem VIP:</b>\n\n` +
          `<code>${error.message}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    });

    // 🚀 NOVO: Comando /enviar_vip2 para enviar segunda mensagem VIP para o canal
    this.bot.onText(/\/enviar_vip2/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        console.log(`📤 ENVIAR_VIP2: Processando comando para usuário ${chatId}`);
        
        await this.bot.sendMessage(chatId, '📤 Enviando segunda mensagem VIP para o canal...');
        
        const resultado = await this.enviarMensagemVIP2ParaCanal();
        
        await this.bot.sendMessage(chatId, 
          `✅ <b>Segunda mensagem VIP enviada com sucesso!</b>\n\n` +
          `📊 ID da mensagem: <code>${resultado.message_id}</code>\n` +
          `📢 Canal: <code>-1002899221642</code>\n` +
          `🔗 Botão direciona para: <code>@V4Z4D0SD4D33PW3BD_bot</code>`,
          { parse_mode: 'HTML' }
        );
        
        console.log(`📤 ENVIAR_VIP2: Mensagem enviada com sucesso por ${chatId}`);
        
      } catch (error) {
        console.error(`📤 ENVIAR_VIP2: Erro para ${chatId}:`, error.message);
        await this.bot.sendMessage(chatId, 
          `❌ <b>Erro ao enviar segunda mensagem VIP:</b>\n\n` +
          `<code>${error.message}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    });

    // 🚀 NOVO: Comando /enviar_vip3 para enviar terceira mensagem VIP para o canal
    this.bot.onText(/\/enviar_vip3/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        console.log(`📤 ENVIAR_VIP3: Processando comando para usuário ${chatId}`);
        
        await this.bot.sendMessage(chatId, '📤 Enviando terceira mensagem VIP para o canal...');
        
        const resultado = await this.enviarMensagemVIP3ParaCanal();
        
        await this.bot.sendMessage(chatId, 
          `✅ <b>Terceira mensagem VIP enviada com sucesso!</b>\n\n` +
          `📊 ID da mensagem: <code>${resultado.message_id}</code>\n` +
          `📢 Canal: <code>-1002940490277</code>\n` +
          `🔗 Botão direciona para: <code>@wpphadriiie_bot</code>`,
          { parse_mode: 'HTML' }
        );
        
        console.log(`📤 ENVIAR_VIP3: Mensagem enviada com sucesso por ${chatId}`);
        
      } catch (error) {
        console.error(`📤 ENVIAR_VIP3: Erro para ${chatId}:`, error.message);
        await this.bot.sendMessage(chatId, 
          `❌ <b>Erro ao enviar terceira mensagem VIP:</b>\n\n` +
          `<code>${error.message}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    });

    // 🚀 NOVO: Comando /enviar_vip4 para enviar quarta mensagem VIP para o canal
    this.bot.onText(/\/enviar_vip4/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        console.log(`📤 ENVIAR_VIP4: Processando comando para usuário ${chatId}`);
        
        await this.bot.sendMessage(chatId, '📤 Enviando quarta mensagem VIP para o canal...');
        
        const resultado = await this.enviarMensagemVIP4ParaCanal();
        
        await this.bot.sendMessage(chatId, 
          `✅ <b>Quarta mensagem VIP enviada com sucesso!</b>\n\n` +
          `📊 ID da mensagem: <code>${resultado.message_id}</code>\n` +
          `📢 Canal: <code>-1003057704838</code>\n` +
          `🔗 Botão direciona para: <code>@agendamentodahadrielle_bot</code>`,
          { parse_mode: 'HTML' }
        );
        
        console.log(`📤 ENVIAR_VIP4: Mensagem enviada com sucesso por ${chatId}`);
        
      } catch (error) {
        console.error(`📤 ENVIAR_VIP4: Erro para ${chatId}:`, error.message);
        await this.bot.sendMessage(chatId, 
          `❌ <b>Erro ao enviar quarta mensagem VIP:</b>\n\n` +
          `<code>${error.message}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    });

    // 🚀 NOVO: Comando /enviar_vip_all para enviar todas as mensagens VIP
    this.bot.onText(/\/enviar_vip_all/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        console.log(`📤 ENVIAR_VIP_ALL: Processando comando para usuário ${chatId}`);
        
        await this.bot.sendMessage(chatId, '📤 Enviando todas as mensagens VIP para os canais...');
        
        const resultados = [];
        const erros = [];
        
        // Enviar VIP1
        try {
          console.log(`📤 ENVIAR_VIP_ALL: Enviando VIP1...`);
          const resultado1 = await this.enviarMensagemVIPParaCanal();
          resultados.push({
            tipo: 'VIP1',
            canal: '-1002891140776',
            bot: '@vipshadrie2_bot',
            message_id: resultado1.message_id,
            sucesso: true
          });
          console.log(`📤 ENVIAR_VIP_ALL: VIP1 enviado com sucesso`);
        } catch (error) {
          erros.push({
            tipo: 'VIP1',
            canal: '-1002891140776',
            bot: '@vipshadrie2_bot',
            erro: error.message
          });
          console.error(`📤 ENVIAR_VIP_ALL: Erro ao enviar VIP1:`, error.message);
        }
        
        // Aguardar um pouco entre envios
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Enviar VIP2
        try {
          console.log(`📤 ENVIAR_VIP_ALL: Enviando VIP2...`);
          const resultado2 = await this.enviarMensagemVIP2ParaCanal();
          resultados.push({
            tipo: 'VIP2',
            canal: '-1002899221642',
            bot: '@V4Z4D0SD4D33PW3BD_bot',
            message_id: resultado2.message_id,
            sucesso: true
          });
          console.log(`📤 ENVIAR_VIP_ALL: VIP2 enviado com sucesso`);
        } catch (error) {
          erros.push({
            tipo: 'VIP2',
            canal: '-1002899221642',
            bot: '@V4Z4D0SD4D33PW3BD_bot',
            erro: error.message
          });
          console.error(`📤 ENVIAR_VIP_ALL: Erro ao enviar VIP2:`, error.message);
        }
        
        // Aguardar um pouco entre envios
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Enviar VIP3
        try {
          console.log(`📤 ENVIAR_VIP_ALL: Enviando VIP3...`);
          const resultado3 = await this.enviarMensagemVIP3ParaCanal();
          resultados.push({
            tipo: 'VIP3',
            canal: '-1002940490277',
            bot: '@wpphadriiie_bot',
            message_id: resultado3.message_id,
            sucesso: true
          });
          console.log(`📤 ENVIAR_VIP_ALL: VIP3 enviado com sucesso`);
        } catch (error) {
          erros.push({
            tipo: 'VIP3',
            canal: '-1002940490277',
            bot: '@wpphadriiie_bot',
            erro: error.message
          });
          console.error(`📤 ENVIAR_VIP_ALL: Erro ao enviar VIP3:`, error.message);
        }
        
        // Aguardar um pouco entre envios
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Enviar VIP4
        try {
          console.log(`📤 ENVIAR_VIP_ALL: Enviando VIP4...`);
          const resultado4 = await this.enviarMensagemVIP4ParaCanal();
          resultados.push({
            tipo: 'VIP4',
            canal: '-1003057704838',
            bot: '@agendamentodahadrielle_bot',
            message_id: resultado4.message_id,
            sucesso: true
          });
          console.log(`📤 ENVIAR_VIP_ALL: VIP4 enviado com sucesso`);
        } catch (error) {
          erros.push({
            tipo: 'VIP4',
            canal: '-1003057704838',
            bot: '@agendamentodahadrielle_bot',
            erro: error.message
          });
          console.error(`📤 ENVIAR_VIP_ALL: Erro ao enviar VIP4:`, error.message);
        }
        
        // Montar relatório final
        let relatorio = `📊 <b>RELATÓRIO DE ENVIO VIP_ALL</b>\n\n`;
        
        if (resultados.length > 0) {
          relatorio += `✅ <b>MENSAGENS ENVIADAS COM SUCESSO:</b>\n`;
          resultados.forEach(resultado => {
            relatorio += `• ${resultado.tipo}: Canal <code>${resultado.canal}</code> | Bot: <code>${resultado.bot}</code> | ID: <code>${resultado.message_id}</code>\n`;
          });
          relatorio += `\n`;
        }
        
        if (erros.length > 0) {
          relatorio += `❌ <b>ERROS ENCONTRADOS:</b>\n`;
          erros.forEach(erro => {
            relatorio += `• ${erro.tipo}: Canal <code>${erro.canal}</code> | Bot: <code>${erro.bot}</code> | Erro: <code>${erro.erro}</code>\n`;
          });
          relatorio += `\n`;
        }
        
        relatorio += `📈 <b>RESUMO:</b>\n`;
        relatorio += `✅ Sucessos: ${resultados.length}/4\n`;
        relatorio += `❌ Erros: ${erros.length}/4\n`;
        
        if (resultados.length === 4) {
          relatorio += `\n🎉 <b>TODAS AS MENSAGENS VIP FORAM ENVIADAS COM SUCESSO!</b>`;
        } else if (resultados.length > 0) {
          relatorio += `\n⚠️ <b>ENVIO PARCIALMENTE CONCLUÍDO</b>`;
        } else {
          relatorio += `\n💥 <b>FALHA TOTAL NO ENVIO</b>`;
        }
        
        await this.bot.sendMessage(chatId, relatorio, { parse_mode: 'HTML' });
        
        console.log(`📤 ENVIAR_VIP_ALL: Processamento concluído por ${chatId} - Sucessos: ${resultados.length}/4, Erros: ${erros.length}/4`);
        
      } catch (error) {
        console.error(`📤 ENVIAR_VIP_ALL: Erro geral para ${chatId}:`, error.message);
        await this.bot.sendMessage(chatId, 
          `❌ <b>Erro geral ao processar envio VIP_ALL:</b>\n\n` +
          `<code>${error.message}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    });

    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      
      console.log(`[${this.botId}] 🔔 CALLBACK RECEBIDO:`, {
        chatId,
        data,
        messageId: query.message.message_id,
        from: query.from.username || query.from.first_name
      });
      
      if (data === 'liberar_acesso_agora') {
        // Deletar a mensagem anterior
        try {
          await this.bot.deleteMessage(chatId, query.message.message_id);
        } catch (error) {
          console.log('Erro ao deletar mensagem:', error.message);
        }
        
        // Enviar a segunda mensagem com as ofertas como na segunda imagem
        const textoOfertas = `Escolha uma oferta abaixo:`;
        const botoesOfertas = [
          [{ text: `GALERIA COMPLETA - R$ ${this.config.planos[0].valor.toFixed(2)}`, callback_data: this.config.planos[0].id }],
          [{ text: `GALERIA COMPLETA + AMADORES - R$ ${this.config.planos[1].valor.toFixed(2)}`, callback_data: this.config.planos[1].id }]
        ];
        
        return this.bot.sendMessage(chatId, textoOfertas, { 
          reply_markup: { inline_keyboard: botoesOfertas } 
        });
      }
      
      if (data === 'mostrar_planos') {
          // Deletar a mensagem anterior que continha os botões "ESCOLHER VIP" e "Instagram"
          try {
            await this.bot.deleteMessage(chatId, query.message.message_id);
          } catch (error) {
            console.log('Erro ao deletar mensagem:', error.message);
          }
          
          // Usar o menu de planos configurado se existir, senão usar o padrão
          if (this.config.menuPlanos) {
            const botoesPlanos = this.config.menuPlanos.opcoes.map(op => ([{ text: op.texto, callback_data: op.callback }]));
            return this.bot.sendMessage(chatId, this.config.menuPlanos.texto, { reply_markup: { inline_keyboard: botoesPlanos } });
          } else {
            const botoesPlanos = this.config.planos.map(pl => ([{ text: `${pl.emoji} ${pl.nome} — por R$${pl.valor.toFixed(2)}`, callback_data: pl.id }]));
            return this.bot.sendMessage(chatId, '💖 Escolha seu plano abaixo:', { reply_markup: { inline_keyboard: botoesPlanos } });
          }
        }
      
            if (data === 'plano_periodico_unico') {
        // Deletar a mensagem anterior que continha os botões
        try {
          await this.bot.deleteMessage(chatId, query.message.message_id);
        } catch (error) {
          console.log('Erro ao deletar mensagem:', error.message);
        }

        // Usar o plano periódico configurado
        const planoPeriodico = this.config.planoPeriodico;
        if (planoPeriodico) {
          const botoesPlano = [[{ text: `R$ ${planoPeriodico.valor.toFixed(2)}`, callback_data: planoPeriodico.id }]];
          return this.bot.sendMessage(chatId, `💖 ${planoPeriodico.descricao}:`, { reply_markup: { inline_keyboard: botoesPlano } });
        } else {
          // Fallback para plano padrão de R$ 20,00
          const botoesPlano = [[{ text: 'R$ 20,00', callback_data: 'plano_periodico_unico' }]];
          return this.bot.sendMessage(chatId, '💖 R$ 20,00:', { reply_markup: { inline_keyboard: botoesPlano } });
        }
      }
      if (data === 'ver_previas') {
        return this.bot.sendMessage(chatId, `🙈 <b>Prévias:</b>\n\n💗 Acesse nosso canal:\n👉 ${this.config.canalPrevias}`, { parse_mode: 'HTML' });
      }
      if (data.startsWith('verificar_pagamento_')) {
        const transacaoId = data.replace('verificar_pagamento_', '');
        const tokenRow = this.db ? this.db.prepare('SELECT token, status, valor, telegram_id, gateway FROM tokens WHERE id_transacao = ? LIMIT 1').get(transacaoId) : null;
        if (!tokenRow) return this.bot.sendMessage(chatId, '❌ Pagamento não encontrado.');
        
        // Se status não é 'valido', tentar verificar via endpoint unificado
        if (tokenRow.status !== 'valido' || !tokenRow.token) {
          try {
            console.log(`[${this.botId}] 🔍 Verificando status via endpoint unificado: ${transacaoId}`);
            
            // Usar o endpoint unificado que suporta ambos os gateways (PushinPay + Oasyfy)
            const response = await axios.get(`${this.baseUrl}/api/payment-status/${encodeURIComponent(transacaoId)}`, {
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              }
            });
            
            if (response.status === 200 && response.data.success && response.data.is_paid) {
              console.log(`[${this.botId}] ✅ Pagamento confirmado via endpoint unificado: ${transacaoId}`, {
                gateway: response.data.gateway,
                source: response.data.source
              });
              
              // Atualizar status no banco
              if (this.db) {
                const updateStmt = this.db.prepare('UPDATE tokens SET status = ? WHERE id_transacao = ?');
                updateStmt.run('valido', transacaoId);
              }
              
              // Atualizar PostgreSQL se disponível
              if (this.pgPool && tokenRow.telegram_id) {
                const tgId = this.normalizeTelegramId(tokenRow.telegram_id);
                if (tgId !== null) {
                  await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
                }
              }
              
              // Continuar com o processamento normal
            } else {
              console.log(`[${this.botId}] ⏳ Pagamento ainda pendente via endpoint unificado: ${transacaoId}`, {
                success: response.data?.success,
                is_paid: response.data?.is_paid,
                source: response.data?.source
              });
              return this.bot.sendMessage(chatId, this.config.pagamento.pendente);
            }
          } catch (error) {
            console.error(`[${this.botId}] ❌ Erro ao verificar status via endpoint unificado:`, error.message);
            return this.bot.sendMessage(chatId, this.config.pagamento.erro);
          }
        }
        
        // Se chegou até aqui, o pagamento já está válido ou foi confirmado
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
        // Usar página personalizada se configurada
        const paginaObrigado = this.config.paginaObrigado || 'obrigado.html';
        const linkComToken = `${this.frontendUrl}/${paginaObrigado}?token=${encodeURIComponent(tokenRow.token)}&valor=${valorReais}&${this.grupo}${utmString}`;
        console.log(`[${this.botId}] Link final:`, linkComToken);
        await this.bot.sendMessage(chatId, this.config.pagamento.aprovado);
        await this.bot.sendMessage(chatId, `<b>🎉 Pagamento aprovado!</b>\n\n🔗 Acesse: ${linkComToken}\n\n⚠️ O link irá expirar em 5 minutos.`, { parse_mode: 'HTML' });
        return;
      }
      
      if (data.startsWith('qr_code_')) {
        const transacaoId = data.replace('qr_code_', '');
        const tokenRow = this.db ? this.db.prepare('SELECT pix_copia_cola, qr_code_base64 FROM tokens WHERE id_transacao = ? LIMIT 1').get(transacaoId) : null;
        if (!tokenRow || !tokenRow.pix_copia_cola) {
          return this.bot.sendMessage(chatId, '❌ Código PIX não encontrado.');
        }
        
        // Se existe QR code base64, enviar a imagem
        if (tokenRow.qr_code_base64) {
          try {
            const base64Image = tokenRow.qr_code_base64.replace(/^data:image\/png;base64,/, '');
            const imageBuffer = Buffer.from(base64Image, 'base64');
            const buffer = await this.processarImagem(imageBuffer);
            
            return this.bot.sendPhoto(chatId, buffer, {
              caption: `<pre>${tokenRow.pix_copia_cola}</pre>`,
              parse_mode: 'HTML',
              reply_markup: { 
                inline_keyboard: [[{ text: 'EFETUEI O PAGAMENTO', callback_data: `verificar_pagamento_${transacaoId}` }]] 
              }
            });
          } catch (error) {
            console.error('Erro ao processar QR code:', error.message);
            // Fallback para texto se houver erro na imagem
          }
        }
        
        // Fallback: enviar apenas o código PIX copia e cola
        return this.bot.sendMessage(chatId, `<pre>${tokenRow.pix_copia_cola}</pre>`, { 
          parse_mode: 'HTML',
          reply_markup: { 
            inline_keyboard: [[{ text: 'EFETUEI O PAGAMENTO', callback_data: `verificar_pagamento_${transacaoId}` }]] 
          }
        });
      }
      console.log(`[${this.botId}] 🔍 BUSCANDO PLANO para callback: ${data}`);
      console.log(`[${this.botId}] 📋 PLANOS DISPONÍVEIS:`, this.config.planos.map(p => ({ id: p.id, nome: p.nome, valor: p.valor })));
      
      let plano = this.config.planos.find(p => p.id === data);
      console.log(`[${this.botId}] 🎯 PLANO ENCONTRADO nos planos principais:`, plano ? { id: plano.id, nome: plano.nome, valor: plano.valor } : 'não encontrado');
      
      if (!plano) {
        // Verificar se é o plano periódico
        if (this.config.planoPeriodico && data === this.config.planoPeriodico.id) {
          plano = this.config.planoPeriodico;
          console.log(`[${this.botId}] 🎯 PLANO ENCONTRADO nos planos periódicos:`, { id: plano.id, nome: plano.nome, valor: plano.valor });
        } else {
          // Verificar nos downsells
          console.log(`[${this.botId}] 🔍 BUSCANDO nos downsells...`);
          for (const ds of this.config.downsells) {
            console.log(`[${this.botId}] 📋 DOWSELL:`, ds.id, 'planos:', ds.planos?.map(p => ({ id: p.id, nome: p.nome, valor: p.valorComDesconto })));
            const p = ds.planos.find(pl => pl.id === data);
            if (p) {
              plano = { ...p, valor: p.valorComDesconto };
              console.log(`[${this.botId}] 🎯 PLANO ENCONTRADO nos downsells:`, { id: plano.id, nome: plano.nome, valor: plano.valor });
              break;
            }
          }
        }
      }
      
      if (!plano) {
        console.log(`[${this.botId}] ❌ PLANO NÃO ENCONTRADO para callback: ${data}`);
        return;
      }
      
      console.log(`[${this.botId}] ✅ PLANO FINAL SELECIONADO:`, { id: plano.id, nome: plano.nome, valor: plano.valor });
      
      // 🔥 OTIMIZAÇÃO 3: Feedback imediato para melhorar UX na geração de PIX
      const mensagemAguarde = await this.bot.sendMessage(chatId, '⏳ Aguarde um instante, estou gerando seu PIX...', {
        reply_markup: { inline_keyboard: [[{ text: '🔄 Processando...', callback_data: 'processing' }]] }
      });
      
      try {
        // ✅ Gerar cobrança
        let track = this.getTrackingData(chatId);
        console.log(`[${this.botId}] 📊 TRACKING DATA obtido:`, track);
        if (!track) {
          track = await this.buscarTrackingData(chatId);
        }
        track = track || {};
        
        // 🔥 CORREÇÃO: Log detalhado do tracking data usado
        // console.log('[DEBUG] 🎯 TRACKING DATA usado na cobrança para chatId', chatId, ':', {
        //   utm_source: track.utm_source,
        //   utm_medium: track.utm_campaign, 
        //   utm_campaign: track.utm_campaign,
        //   fbp: !!track.fbp,
        //   fbc: !!track.fbc,
        //   source: track ? 'tracking_encontrado' : 'vazio'
        // });
        
        // 🔥 CORREÇÃO: Buscar também do sessionTracking
        const sessionTrack = this.sessionTracking.getTrackingData(chatId);
        // console.log('[DEBUG] 🎯 SESSION TRACKING data:', sessionTrack ? {
        //   utm_source: sessionTrack.utm_source,
        //   utm_medium: sessionTrack.utm_medium,
        //   utm_campaign: sessionTrack.utm_campaign
        // } : 'vazio');
        
        // 🔥 CORREÇÃO: Se há dados mais recentes no sessionTracking, usar eles
        const finalUtms = {
          utm_source: (sessionTrack?.utm_source && sessionTrack.utm_source !== 'unknown') ? sessionTrack.utm_source : (track.utm_source || 'telegram'),
          utm_campaign: (sessionTrack?.utm_campaign && sessionTrack.utm_campaign !== 'unknown') ? sessionTrack.utm_campaign : (track.utm_campaign || 'bot_principal'),
          utm_medium: (sessionTrack?.utm_medium && sessionTrack.utm_medium !== 'unknown') ? sessionTrack.utm_medium : (track.utm_medium || 'telegram_bot')
        };
        
        console.log(`[${this.botId}] 🎯 UTMs FINAIS para cobrança:`, finalUtms);
        
        // 🔥 LOGS DETALHADOS: Preparar dados para API
        const requestData = {
          type: 'bot',
          telegram_id: chatId,
          plano: plano.id, // Enviar o ID do plano para identificação correta
          valor: plano.valor,
          bot_id: this.botId,
          tracking_data: {
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
        };
        
        console.log(`[${this.botId}] 📤 DADOS ENVIADOS PARA API:`, JSON.stringify(requestData, null, 2));
        console.log(`[${this.botId}] 🌐 URL DA API: ${this.baseUrl}/api/pix/create`);
        console.log(`[${this.botId}] 🔧 BASE URL configurada:`, this.baseUrl);
        console.log(`[${this.botId}] 🔧 FRONTEND URL configurada:`, this.frontendUrl);
        
        // 🔥 CORREÇÃO: Usar endpoint unificado /api/pix/create como o checkout
        console.log(`[${this.botId}] 🚀 FAZENDO REQUISIÇÃO PARA API...`);
        const resposta = await axios.post(`${this.baseUrl}/api/pix/create`, requestData);
        console.log(`[${this.botId}] ✅ REQUISIÇÃO CONCLUÍDA - Status: ${resposta.status}`);
        
        console.log(`[${this.botId}] ✅ RESPOSTA DA API RECEBIDA:`, JSON.stringify(resposta.data, null, 2));
        console.log(`[${this.botId}] 📊 STATUS DA RESPOSTA:`, resposta.status);
        console.log(`[${this.botId}] 📋 HEADERS DA RESPOSTA:`, resposta.headers);
        
        // 🔥 OTIMIZAÇÃO 3: Remover mensagem de "Aguarde" e enviar resultado
        await this.bot.deleteMessage(chatId, mensagemAguarde.message_id);
        
        const { qr_code_base64, pix_copia_cola, transaction_id: transacao_id } = resposta.data;
        
        console.log(`[${this.botId}] 🔍 DADOS EXTRAÍDOS DA RESPOSTA:`, {
          qr_code_base64: qr_code_base64 ? 'presente' : 'ausente',
          pix_copia_cola: pix_copia_cola ? 'presente' : 'ausente',
          transaction_id: transacao_id || 'ausente'
        });
        
        // 🔥 VALIDAÇÃO: Verificar se os dados essenciais estão presentes
        if (!transacao_id) {
          throw new Error('Transaction ID não encontrado na resposta da API');
        }
        
        if (!pix_copia_cola) {
          throw new Error('PIX copia e cola não encontrado na resposta da API');
        }
        
        console.log(`[${this.botId}] ✅ DADOS VALIDADOS - Prosseguindo com envio da mensagem`);
        
        const legenda = this.config.mensagemPix(plano.nome, plano.valor, pix_copia_cola);
        const botaoPagar = { text: 'EFETUEI O PAGAMENTO', callback_data: `verificar_pagamento_${transacao_id}` };
        const botaoQr = { text: 'Qr code', callback_data: `qr_code_${transacao_id}` };
        
        // Sempre enviar apenas a mensagem de texto (sem QR code)
        await this.bot.sendMessage(chatId, legenda, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[botaoPagar], [botaoQr]] }
        });
        
      } catch (error) {
        // 🔥 OTIMIZAÇÃO 3: Em caso de erro, tentar editar mensagem ou enviar nova
        console.error(`[${this.botId}] ❌ ERRO DETALHADO ao gerar PIX para ${chatId}:`);
        console.error(`[${this.botId}] 📋 ERRO MESSAGE:`, error.message);
        console.error(`[${this.botId}] 📋 ERRO STACK:`, error.stack);
        console.error(`[${this.botId}] 📋 ERRO RESPONSE:`, error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        } : 'Sem response');
        console.error(`[${this.botId}] 📋 ERRO REQUEST:`, error.request ? {
          method: error.request.method,
          url: error.request.url,
          headers: error.request.headers
        } : 'Sem request');
        
        try {
          // Tentar editar a mensagem de "Aguarde"
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
        } catch (editError) {
          // Se não conseguir editar, enviar nova mensagem
          console.log(`[${this.botId}] ⚠️ Não foi possível editar mensagem, enviando nova mensagem de erro`);
          await this.bot.sendMessage(chatId, '❌ Ops! Ocorreu um erro ao gerar seu PIX. Por favor, tente novamente ou contate o suporte.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Tentar Novamente', callback_data: data }],
                [{ text: '💬 Falar com Suporte', url: 'https://t.me/suporte_bot' }]
              ]
            }
          });
        }
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

    this.bot.onText(/\/enviar_todos_ds/, async (msg) => {
      const chatId = msg.chat.id;
      console.log(`[${this.botId}] 📤 Enviando todos os downsells para ${chatId} para avaliação`);
      
      try {
        await this.bot.sendMessage(chatId, `📋 <b>AVALIAÇÃO DOS DOWNSELLS</b>\n\n🚀 Enviando todos os ${this.config.downsells.length} downsells para você avaliar as copy...\n\n⏳ Aguarde, isso pode demorar alguns segundos...`, { parse_mode: 'HTML' });
        
        for (let i = 0; i < this.config.downsells.length; i++) {
          const downsell = this.config.downsells[i];
          const delay = i * 2000; // 2 segundos entre cada downsell
          
          setTimeout(async () => {
            try {
              // Enviar mídia se disponível
              await this.enviarMidiasHierarquicamente(chatId, this.config.midias.downsells[downsell.id] || {});
              
              // Preparar botões dos planos
              let replyMarkup = null;
              if (downsell.planos && downsell.planos.length > 0) {
                const botoes = downsell.planos.map(p => [{ 
                  text: `${p.emoji} ${p.nome} — R$${p.valorComDesconto.toFixed(2)}`, 
                  callback_data: p.id 
                }]);
                replyMarkup = { inline_keyboard: botoes };
              }
              
              // Enviar mensagem do downsell
              await this.bot.sendMessage(chatId, 
                `📊 <b>DOWNSELL ${i + 1}/${this.config.downsells.length}</b>\n\n${downsell.texto}`, 
                { parse_mode: 'HTML', reply_markup: replyMarkup }
              );
              
              console.log(`[${this.botId}] ✅ Downsell ${i + 1} enviado para ${chatId}`);
              
            } catch (err) {
              console.error(`[${this.botId}] ❌ Erro ao enviar downsell ${i + 1}:`, err.message);
            }
          }, delay);
        }
        
        // Mensagem final após todos os downsells
        setTimeout(async () => {
          await this.bot.sendMessage(chatId, 
            `✅ <b>AVALIAÇÃO CONCLUÍDA!</b>\n\n📋 Todos os ${this.config.downsells.length} downsells foram enviados\n\n💡 <i>Avalie as copy e faça os ajustes necessários no arquivo config.js</i>\n\n🔄 <i>Use /enviar_todos_ds novamente após fazer alterações</i>`, 
            { parse_mode: 'HTML' }
          );
        }, (this.config.downsells.length * 2000) + 1000);
        
      } catch (err) {
        console.error(`[${this.botId}] ❌ Erro ao enviar downsells para avaliação:`, err.message);
        await this.bot.sendMessage(chatId, `❌ <b>Erro ao enviar downsells:</b>\n\n${err.message}`, { parse_mode: 'HTML' });
      }
    });

    this.bot.onText(/\/enviar_todas_mensagens_periodicas/, async (msg) => {
      const chatId = msg.chat.id;
      console.log(`[${this.botId}] 📤 Enviando todas as mensagens periódicas para ${chatId} para avaliação`);
      
      try {
        const mensagens = this.config.mensagensPeriodicas;
        if (!Array.isArray(mensagens) || mensagens.length === 0) {
          await this.bot.sendMessage(chatId, `❌ <b>Nenhuma mensagem periódica configurada!</b>\n\n💡 <i>Configure as mensagens periódicas no arquivo config.js</i>`, { parse_mode: 'HTML' });
          return;
        }

        await this.bot.sendMessage(chatId, `📋 <b>AVALIAÇÃO DAS MENSAGENS PERIÓDICAS</b>\n\n🚀 Enviando todas as ${mensagens.length} mensagens periódicas para você avaliar...\n\n⏳ Aguarde, isso pode demorar alguns segundos...`, { parse_mode: 'HTML' });
        
        for (let i = 0; i < mensagens.length; i++) {
          const msg = mensagens[i];
          const delay = i * 3000; // 3 segundos entre cada mensagem
          
          setTimeout(async () => {
            try {
              // Enviar mídia se disponível
              if (msg.midia) {
                await this.enviarMidiaComFallback(chatId, 'photo', msg.midia);
              }
              
              // Enviar mensagem periódica
              await this.bot.sendMessage(chatId, 
                `📊 <b>MENSAGEM PERIÓDICA ${i + 1}/${mensagens.length}</b>\n\n⏰ <b>Horário:</b> ${msg.horario}\n\n${msg.texto}`, 
                { parse_mode: 'HTML' }
              );
              
              // Enviar menu específico para mensagens periódicas (plano único de R$ 20,00)
              const menuPeriodicas = this.config.menuPeriodicas || this.config.inicio.menuInicial;
              await this.bot.sendMessage(chatId, menuPeriodicas.texto, {
                reply_markup: { 
                  inline_keyboard: menuPeriodicas.opcoes.map(o => {
                    if (o.url) {
                      return [{ text: o.texto, url: o.url }];
                    }
                    return [{ text: o.texto, callback_data: o.callback }];
                  })
                }
              });
              
              console.log(`[${this.botId}] ✅ Mensagem periódica ${i + 1} enviada para ${chatId}`);
              
            } catch (err) {
              console.error(`[${this.botId}] ❌ Erro ao enviar mensagem periódica ${i + 1}:`, err.message);
            }
          }, delay);
        }
        
        // Mensagem final após todas as mensagens
        setTimeout(async () => {
          await this.bot.sendMessage(chatId, 
            `✅ <b>AVALIAÇÃO CONCLUÍDA!</b>\n\n📋 Todas as ${mensagens.length} mensagens periódicas foram enviadas\n\n💡 <i>Avalie as copy e faça os ajustes necessários no arquivo config.js</i>\n\n🔄 <i>Use /enviar_todas_mensagens_periodicas novamente após fazer alterações</i>`, 
            { parse_mode: 'HTML' }
          );
        }, (mensagens.length * 3000) + 1000);
        
      } catch (err) {
        console.error(`[${this.botId}] ❌ Erro ao enviar mensagens periódicas para avaliação:`, err.message);
        await this.bot.sendMessage(chatId, `❌ <b>Erro ao enviar mensagens periódicas:</b>\n\n${err.message}`, { parse_mode: 'HTML' });
      }
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

  /**
   * Envia todas as mensagens periódicas para todos os usuários de uma vez
   * Similar à função enviarDownsells, mas para mensagens periódicas
   * @param {string} targetId - ID específico do usuário (opcional)
   */
  async enviarTodasMensagensPeriodicas(targetId = null) {
    if (!this.pgPool) return;
    const flagKey = targetId || 'GLOBAL_PERIODICAS';
    if (this.processingDownsells.get(flagKey)) return;
    this.processingDownsells.set(flagKey, true);
    
    try {
      console.log(`[${this.botId}] 🚀 Iniciando envio de todas as mensagens periódicas...`);
      
      let usuariosRes;
      const cleanTargetId = targetId ? this.normalizeTelegramId(targetId) : null;
      
      if (targetId) {
        if (cleanTargetId === null) return;
        usuariosRes = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id FROM downsell_progress WHERE pagou = 0 AND telegram_id = $1',
          [cleanTargetId]
        );
      } else {
        usuariosRes = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT telegram_id FROM downsell_progress WHERE pagou = 0'
        );
      }
      
      const usuarios = usuariosRes.rows;
      const mensagens = this.config.mensagensPeriodicas;
      
      if (!Array.isArray(mensagens) || mensagens.length === 0) {
        console.log(`[${this.botId}] ⚠️ Nenhuma mensagem periódica configurada`);
        return;
      }
      
      console.log(`[${this.botId}] 📊 Enviando ${mensagens.length} mensagens periódicas para ${usuarios.length} usuários`);
      
      for (const usuario of usuarios) {
        const { telegram_id } = usuario;
        const cleanTelegramIdLoop = this.normalizeTelegramId(telegram_id);
        if (cleanTelegramIdLoop === null) continue;
        
        // Enviar todas as mensagens periódicas para este usuário
        for (let i = 0; i < mensagens.length; i++) {
          const msg = mensagens[i];
          let texto = msg.texto;
          let midia = msg.midia;
          
          // Verificar se é uma mensagem que copia de outra
          if (msg.copiarDe) {
            const msgBase = mensagens.find(m => m.horario === msg.copiarDe);
            if (msgBase) {
              texto = msgBase.texto;
              midia = msgBase.midia;
            }
          }
          
          if (!texto) continue;
          
          try {
            // Enviar mídia se existir
            if (midia) {
              await this.enviarMidiaComFallback(cleanTelegramIdLoop, 'video', midia, { supports_streaming: true });
            }
            
            // Enviar mensagem de texto
            await this.bot.sendMessage(cleanTelegramIdLoop, texto, { parse_mode: 'HTML' });
            
            // Enviar menu específico para mensagens periódicas (plano único de R$ 20,00)
            const menuPeriodicas = this.config.menuPeriodicas || this.config.inicio.menuInicial;
            await this.bot.sendMessage(cleanTelegramIdLoop, menuPeriodicas.texto, {
              reply_markup: { 
                inline_keyboard: menuPeriodicas.opcoes.map(o => {
                  if (o.url) {
                    return [{ text: o.texto, url: o.url }];
                  }
                  return [{ text: o.texto, callback_data: o.callback }];
                })
              }
            });
            
            console.log(`[${this.botId}] ✅ Mensagem periódica ${i + 1}/${mensagens.length} enviada para ${telegram_id}`);
            
            // Aguardar entre mensagens para o mesmo usuário
            await new Promise(r => setTimeout(r, 2000));
            
          } catch (err) {
            if (err.blockedByUser || err.response?.statusCode === 403 || err.message?.includes('bot was blocked by the user')) {
              console.log(`[${this.botId}] ⚠️ Usuário ${telegram_id} bloqueou o bot, pulando...`);
              break; // Pular para o próximo usuário
            }
            console.error(`[${this.botId}] ❌ Erro ao enviar mensagem periódica ${i + 1} para ${telegram_id}:`, err.message);
            continue;
          }
        }
        
        // Aguardar entre usuários
        await new Promise(r => setTimeout(r, 5000));
      }
      
      console.log(`[${this.botId}] ✅ Envio de todas as mensagens periódicas concluído!`);
      
    } catch (err) {
      console.error(`[${this.botId}] ❌ Erro geral na função enviarTodasMensagensPeriodicas:`, err.message);
    } finally {
      this.processingDownsells.delete(flagKey);
    }
  }

  /**
   * Envia mensagem VIP com botão para o canal
   * @param {string} canalId - ID do canal (-1002891140776)
   * @param {string} botUsername - Username do bot2 (@vipshadrie2_bot)
   */
  async enviarMensagemVIPParaCanal(canalId = '-1002891140776', botUsername = '@vipshadrie2_bot') {
    try {
      // 🎬 PRIMEIRO: Enviar mídia enviar_bot.mp4
      console.log(`[${this.botId}] 🎬 Enviando mídia VIP para o canal ${canalId}...`);
      
      const midiaVIP = {
        video: './midia/enviar_bot.mp4'
      };
      
      // Tentar enviar mídia usando o sistema otimizado
      let midiaEnviada = false;
      if (this.gerenciadorMidia) {
        midiaEnviada = await this.enviarMidiaInstantanea(canalId, midiaVIP);
      }
      
      // Fallback se o sistema otimizado falhar
      if (!midiaEnviada) {
        try {
          console.log(`[${this.botId}] ⏳ Fallback: Enviando mídia VIP via upload normal...`);
          await this.bot.sendVideo(canalId, './midia/enviar_bot.mp4', {
            supports_streaming: true, // ✅ Comprime e exibe inline sem download
            caption: '🎬 Conteúdo VIP exclusivo'
          });
          midiaEnviada = true;
          console.log(`[${this.botId}] ✅ Mídia VIP enviada via fallback (comprimida)`);
        } catch (midiaError) {
          console.warn(`[${this.botId}] ⚠️ Erro ao enviar mídia VIP:`, midiaError.message);
          // Continuar mesmo se a mídia falhar
        }
      } else {
        console.log(`[${this.botId}] ✅ Mídia VIP enviada com sucesso`);
      }
      
      // Aguardar um pouco antes de enviar o texto
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 📝 SEGUNDO: Enviar mensagem de texto com botão
      const mensagem = `🚨 URGENTE 🔊 

⬇️⬇️ SIGA AS INSTRUÇÕES ⬇️⬇️

Você avançou na minha intimidade e por isso vou liberar o que sempre mantive trancado a sete chaves. 🗝️

Agora vou te dar duas chaves para escolher qual porta vai abrir primeiro, entendido? 😬

🔴 GALERIA COMPLETA
✅ Mais de 500 fotos e vídeos exclusivos
✅ Transando em todas as posições
✅ Squirt e gozadas intensas no meu rostinho
✅ Vídeos longos de sexo agressivo
✅ Sexo anal violento e sem censura

🔴 CHAMADA ÍNTIMA
✅ Chamada de vídeo sempre que quiser
✅ Namoradinha particular no meu WhatsApp pessoal
✅ Fantasias, fetiches e tudo do jeitinho que você quiser
✅ Provocações e gemidos até você gozar
✅ Facilidade de marcar encontro presencial

Escolha uma das duas chaves abaixo 👇`;

      const botoes = [
        [{
          text: '➡ quero sua galeria completa',
          url: `https://t.me/${botUsername.replace('@', '')}?start=galeria`
        }],
        [{
          text: '➡ quero sua chamada íntima',
          url: 'https://t.me/vipshadrie3_bot?start=chamada'
        }]
      ];

      const replyMarkup = {
        inline_keyboard: botoes
      };

      const resultado = await this.bot.sendMessage(canalId, mensagem, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });

      console.log(`[${this.botId}] ✅ Mensagem VIP enviada para o canal ${canalId}`);
      return resultado;
    } catch (error) {
      console.error(`[${this.botId}] ❌ Erro ao enviar mensagem VIP para canal ${canalId}:`, error.message);
      throw error;
    }
  }

  async enviarMensagemVIP2ParaCanal(canalId = '-1002899221642', botUsername = '@V4Z4D0SD4D33PW3BD_bot') {
    try {
      // 🎬 PRIMEIRO: Enviar mídia enviar_bot_2.mp4
      console.log(`[${this.botId}] 🎬 Enviando segunda mídia VIP para o canal ${canalId}...`);
      
      const midiaVIP2 = {
        video: './midia/enviar_bot_2.mp4'
      };
      
      // Tentar enviar mídia usando o sistema otimizado
      let midiaEnviada = false;
      if (this.gerenciadorMidia) {
        midiaEnviada = await this.enviarMidiaInstantanea(canalId, midiaVIP2);
      }
      
      // Fallback se o sistema otimizado falhar
      if (!midiaEnviada) {
        try {
          console.log(`[${this.botId}] ⏳ Fallback: Enviando segunda mídia VIP via upload normal...`);
          await this.bot.sendVideo(canalId, './midia/enviar_bot_2.mp4', {
            supports_streaming: true, // ✅ Comprime e exibe inline sem download
            caption: '🎬 Conteúdo VIP exclusivo - Parte 2'
          });
          midiaEnviada = true;
          console.log(`[${this.botId}] ✅ Segunda mídia VIP enviada via fallback (comprimida)`);
        } catch (midiaError) {
          console.warn(`[${this.botId}] ⚠️ Erro ao enviar segunda mídia VIP:`, midiaError.message);
          // Continuar mesmo se a mídia falhar
        }
      } else {
        console.log(`[${this.botId}] ✅ Segunda mídia VIP enviada com sucesso`);
      }
      
      // Aguardar um pouco antes de enviar o texto
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 📝 SEGUNDO: Enviar mensagem de texto com botão
      const mensagem = `🔞 ESPERA 🔞 

⬇️ SIGA AS INSTRUÇÕES ⬇️

➡️ Você deu um passo importante em nossa intimidade, e a cada passo eu me sinto cada vez mais pronta para liberar o melhor de mim.

➡️ Assim como no grupo anterior, para você ter acesso aos conteúdos, precisa clicar no botão abaixo, porém ainda não me sinto totalmente segura para te mandar todas as fotos e vídeos.

➡️ Receba agora o conteúdo que você adquiriu clicando no botão abaixo para ter acesso ao meu QUARTO SECRETO e aguarde as atualizações diárias.`;

      const botao = {
        text: '🔞 ACESSAR QUARTO SECRETO 🔞',
        url: `https://t.me/${botUsername.replace('@', '')}?start=quarto_secreto`
      };

      const replyMarkup = {
        inline_keyboard: [[botao]]
      };

      const resultado = await this.bot.sendMessage(canalId, mensagem, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });

      console.log(`[${this.botId}] ✅ Segunda mensagem VIP enviada para o canal ${canalId}`);
      return resultado;
    } catch (error) {
      console.error(`[${this.botId}] ❌ Erro ao enviar segunda mensagem VIP para canal ${canalId}:`, error.message);
      throw error;
    }
  }

  /**
   * Envia terceira mensagem VIP com botão WHATSAPP para o canal
   * @param {string} canalId - ID do canal (-1002940490277)
   * @param {string} botUsername - Username do bot (@wpphadriiie_bot)
   */
  async enviarMensagemVIP3ParaCanal(canalId = '-1002940490277', botUsername = '@wpphadriiie_bot') {
    try {
      // 🎬 PRIMEIRO: Enviar mídia enviar_bot_3.mp4 (ou fallback para enviar_bot_2.mp4)
      console.log(`[${this.botId}] 🎬 Enviando terceira mídia VIP para o canal ${canalId}...`);
      
      const midiaVIP3 = {
        video: './midia/enviar_bot_3.mp4' // Tentar primeiro o vídeo específico
      };
      
      // Tentar enviar mídia usando o sistema otimizado
      let midiaEnviada = false;
      if (this.gerenciadorMidia) {
        midiaEnviada = await this.enviarMidiaInstantanea(canalId, midiaVIP3);
      }
      
      // Fallback se o sistema otimizado falhar ou se o arquivo não existir
      if (!midiaEnviada) {
        try {
          console.log(`[${this.botId}] ⏳ Fallback: Enviando terceira mídia VIP via upload normal...`);
          await this.bot.sendVideo(canalId, './midia/enviar_bot_3.mp4', {
            supports_streaming: true, // ✅ Comprime e exibe inline sem download
            caption: '🎬 Conteúdo VIP exclusivo - Parte 3'
          });
          midiaEnviada = true;
          console.log(`[${this.botId}] ✅ Terceira mídia VIP enviada via fallback (comprimida)`);
        } catch (midiaError) {
          console.warn(`[${this.botId}] ⚠️ Erro ao enviar terceira mídia VIP, tentando fallback para enviar_bot_2.mp4:`, midiaError.message);
          // Fallback para o vídeo anterior se o terceiro não existir
          try {
            await this.bot.sendVideo(canalId, './midia/enviar_bot_2.mp4', {
              supports_streaming: true,
              caption: '🎬 Conteúdo VIP exclusivo - Parte 3'
            });
            midiaEnviada = true;
            console.log(`[${this.botId}] ✅ Terceira mídia VIP enviada usando fallback (enviar_bot_2.mp4)`);
          } catch (fallbackError) {
            console.warn(`[${this.botId}] ⚠️ Erro ao enviar mídia VIP (fallback):`, fallbackError.message);
            // Continuar mesmo se a mídia falhar
          }
        }
      } else {
        console.log(`[${this.botId}] ✅ Terceira mídia VIP enviada com sucesso`);
      }
      
      // Aguardar um pouco antes de enviar o texto
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 📝 SEGUNDO: Enviar mensagem de texto com botão WHATSAPP
      const mensagem = `⚠️ URGENTE ⚠️

⬇️ SIGA AS INSTRUÇÕES ⬇️

➡️ Você deu mais um passo na nossa intimidade, e agora chegou a hora de ter acesso ao meu WhatsApp pessoal.

➡️ É lá que você vai receber todo o conteúdo exclusivo, com atualizações diárias e aquela sensação de ter minha atenção só pra você.

➡️ Clique no botão abaixo para confirmar e garantir sua entrada no meu WhatsApp.`;

      const botao = {
        text: 'WHATSAPP',
        url: `https://t.me/${botUsername.replace('@', '')}?start=whatsapp`
      };

      const replyMarkup = {
        inline_keyboard: [[botao]]
      };

      const resultado = await this.bot.sendMessage(canalId, mensagem, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });

      console.log(`[${this.botId}] ✅ Terceira mensagem VIP enviada para o canal ${canalId}`);
      return resultado;
    } catch (error) {
      console.error(`[${this.botId}] ❌ Erro ao enviar terceira mensagem VIP para canal ${canalId}:`, error.message);
      throw error;
    }
  }

  /**
   * Envia quarta mensagem VIP com botão WHATSAPP para o canal
   * @param {string} canalId - ID do canal (-1003057704838)
   * @param {string} botUsername - Username do bot (@agendamentodahadrielle_bot)
   */
  async enviarMensagemVIP4ParaCanal(canalId = '-1003057704838', botUsername = '@agendamentodahadrielle_bot') {
    try {
      // 🎬 PRIMEIRO: Enviar mídia enviar_bot_4.mp4 (ou fallback para enviar_bot_3.mp4)
      console.log(`[${this.botId}] 🎬 Enviando quarta mídia VIP para o canal ${canalId}...`);
      
      const midiaVIP4 = {
        video: './midia/enviar_bot_4.mp4' // Tentar primeiro o vídeo específico
      };
      
      // Tentar enviar mídia usando o sistema otimizado
      let midiaEnviada = false;
      if (this.gerenciadorMidia) {
        midiaEnviada = await this.enviarMidiaInstantanea(canalId, midiaVIP4);
      }
      
      // Fallback se o sistema otimizado falhar ou se o arquivo não existir
      if (!midiaEnviada) {
        try {
          console.log(`[${this.botId}] ⏳ Fallback: Enviando quarta mídia VIP via upload normal...`);
          await this.bot.sendVideo(canalId, './midia/enviar_bot_4.mp4', {
            supports_streaming: true, // ✅ Comprime e exibe inline sem download
            caption: '🎬 Conteúdo VIP exclusivo - Parte 4'
          });
          midiaEnviada = true;
          console.log(`[${this.botId}] ✅ Quarta mídia VIP enviada via fallback (comprimida)`);
        } catch (midiaError) {
          console.warn(`[${this.botId}] ⚠️ Erro ao enviar quarta mídia VIP, tentando fallback para enviar_bot_3.mp4:`, midiaError.message);
          // Fallback para o vídeo anterior se o quarto não existir
          try {
            await this.bot.sendVideo(canalId, './midia/enviar_bot_3.mp4', {
              supports_streaming: true,
              caption: '🎬 Conteúdo VIP exclusivo - Parte 4'
            });
            midiaEnviada = true;
            console.log(`[${this.botId}] ✅ Quarta mídia VIP enviada usando fallback (enviar_bot_3.mp4)`);
          } catch (fallbackError) {
            console.warn(`[${this.botId}] ⚠️ Erro ao enviar mídia VIP (fallback):`, fallbackError.message);
            // Continuar mesmo se a mídia falhar
          }
        }
      } else {
        console.log(`[${this.botId}] ✅ Quarta mídia VIP enviada com sucesso`);
      }
      
      // Aguardar um pouco antes de enviar o texto
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 📝 SEGUNDO: Enviar mensagem de texto com botão WHATSAPP
      const mensagem = `⚠️ URGENTE ⚠️

👉  Você já garantiu sua chamada íntima exclusiva e mostrou que realmente merece mais da minha atenção.

👉 Agora vou liberar meu WhatsApp pessoal, onde vou te enviar todos os conteúdos que você adquiriu e também combinar nossa chamada íntima do jeitinho que você quiser.

👉 Clique no botão abaixo e se prepare para a melhor experiência online da sua vida.`;

      const botao = {
        text: 'WHATSAPP',
        url: `https://t.me/${botUsername.replace('@', '')}?start=whatsapp`
      };

      const replyMarkup = {
        inline_keyboard: [[botao]]
      };

      const resultado = await this.bot.sendMessage(canalId, mensagem, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });

      console.log(`[${this.botId}] ✅ Quarta mensagem VIP enviada para o canal ${canalId}`);
      return resultado;
    } catch (error) {
      console.error(`[${this.botId}] ❌ Erro ao enviar quarta mensagem VIP para canal ${canalId}:`, error.message);
      throw error;
    }
  }
}

module.exports = TelegramBotService;
