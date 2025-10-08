const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { DateTime } = require('luxon');
const GerenciadorMidia = require('../../BOT/utils/midia.js');
const {
  sendFacebookEvent,
  generateEventId,
  generateHashedUserData,
  sendInitiateCheckoutCapi,
  sendLeadCapi,
  sendPurchaseCapi
} = require('../../services/facebook');
const { toIntOrNull, centsToValue } = require('../../helpers/price');
const { isTransactionAlreadySent } = require('../../services/purchaseDedup');
const { mergeTrackingData, isRealTrackingData } = require('../../services/trackingValidation');
const { formatForCAPI } = require('../../services/purchaseValidation');
const { getInstance: getSessionTracking } = require('../../services/sessionTracking');
const { enviarConversaoParaUtmify, postOrder: postUtmifyOrder } = require('../../services/utmify');
const { appendDataToSheet } = require('../../services/googleSheets.js');
const UnifiedPixService = require('../../services/unifiedPixService');
const funnelMetrics = require('../../services/funnelMetrics');
const {
  normalizeTransactionId,
  normalizeCpf,
  generatePurchaseEventId,
  buildObrigadoUrl,
  extractUtmsFromSource
} = require('../../helpers/purchaseFlow');

const TRACKING_UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const TRACKING_FIELDS = [...TRACKING_UTM_FIELDS, 'fbp', 'fbc', 'ip', 'user_agent', 'kwai_click_id', 'src', 'sck'];

const HEX_64_REGEX = /^[a-f0-9]{64}$/i;
const MAX_START_UTM_LENGTH = 200;
const MAX_START_PIXEL_LENGTH = 256;
const MAX_START_IP_LENGTH = 100;
const MAX_START_USER_AGENT_LENGTH = 512;
const MAX_START_URL_LENGTH = 500;

function sanitizeOptionalString(value, { maxLength = 255, lowercase = false } = {}) {
  if (value === null || value === undefined) {
    return null;
  }

  let str = typeof value === 'string' ? value : String(value);
  str = str.trim();

  if (!str) {
    return null;
  }

  const lower = str.toLowerCase();
  if (lower === 'null' || lower === 'undefined') {
    return null;
  }

  if (lowercase) {
    str = lower;
  }

  if (str.length > maxLength) {
    return str.slice(0, maxLength);
  }

  return str;
}

/**
 * Verifica se um IP é privado (RFC 1918, loopback, etc.)
 */
function isPrivateIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return true;
  }

  const cleanIp = ip.replace(/^::ffff:/, '');
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  if (!ipv4Pattern.test(cleanIp)) {
    if (cleanIp === '::1' || cleanIp === 'localhost') {
      return true;
    }
    // Para IPv6 público válido, aceitar como público
    // Para IPs malformados ou inválidos, rejeitar como privado
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv6Pattern.test(cleanIp)) {
      return false;
    }
    return true;
  }

  const parts = cleanIp.split('.').map(Number);
  if (parts.some(part => part < 0 || part > 255 || isNaN(part))) {
    return true;
  }

  const [a, b] = parts;

  // RFC 1918 ranges + loopback + link-local
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (cleanIp === '0.0.0.0' || cleanIp === 'localhost') return true;

  return false;
}

function normalizeHashCandidate(value) {
  const sanitized = sanitizeOptionalString(value, { lowercase: true, maxLength: 512 });
  if (!sanitized) {
    return null;
  }

  if (HEX_64_REGEX.test(sanitized)) {
    return sanitized;
  }

  return crypto.createHash('sha256').update(sanitized).digest('hex');
}

function extractStartParameter(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'string') {
    return null;
  }

  let candidate = rawPayload.trim();
  if (!candidate) {
    return null;
  }

  const startIndex = candidate.toLowerCase().indexOf('start=');
  if (startIndex >= 0) {
    candidate = candidate.slice(startIndex + 6);
  }

  candidate = candidate.split('&')[0];
  candidate = candidate.split(/\s+/)[0];

  if (!candidate) {
    return null;
  }

  try {
    candidate = decodeURIComponent(candidate);
  } catch (err) {
    // Ignorar erros de decodificação e usar valor original
  }

  return candidate || null;
}

function decodeStartPayload(base64Payload) {
  if (!base64Payload || typeof base64Payload !== 'string') {
    return null;
  }

  let normalized = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  if (padding) {
    normalized += '='.repeat(padding);
  }

  const buffer = Buffer.from(normalized, 'base64');
  const jsonString = buffer.toString('utf8');
  return JSON.parse(jsonString);
}

function sanitizeTrackingValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.toLowerCase() === 'unknown') {
      return null;
    }
    return trimmed;
  }
  return value;
}

function pickFirstMeaningful(...values) {
  for (const value of values) {
    const sanitized = sanitizeTrackingValue(value);
    if (sanitized !== null && sanitized !== undefined) {
      return sanitized;
    }
  }
  return null;
}

function sanitizeTrackingFields(source, fields = TRACKING_FIELDS) {
  const sanitized = {};
  fields.forEach(field => {
    sanitized[field] = sanitizeTrackingValue(source?.[field]);
  });
  return sanitized;
}

function sanitizeTrackingForPartners(tracking) {
  if (!tracking || typeof tracking !== 'object') {
    return {};
  }
  return {
    ...tracking,
    ...sanitizeTrackingFields(tracking)
  };
}

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
    const normalizedBaseUrl = typeof options.baseUrl === 'string' && options.baseUrl.trim()
      ? options.baseUrl.trim().replace(/\/+$/, '')
      : null;
    this.botId = options.bot_id || 'bot';
    // url utilizada na geração dos links enviados aos usuários
    const resolvedFrontendUrl = options.frontendUrl || process.env.FRONTEND_URL || options.baseUrl;
    this.frontendUrl = typeof resolvedFrontendUrl === 'string'
      ? resolvedFrontendUrl.trim().replace(/\/+$/, '')
      : resolvedFrontendUrl;
    this.baseUrl = normalizedBaseUrl || (typeof this.frontendUrl === 'string'
      ? this.frontendUrl
      : null);
    if (!normalizedBaseUrl && this.baseUrl) {
      console.warn(`[${this.botId}] BASE_URL não fornecida — usando FRONTEND_URL como fallback: ${this.baseUrl}`);
    }
    this.config = options.config || {};
    this.postgres = options.postgres;
    this.sqlite = options.sqlite;
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
    // 🚀 CACHE OTIMIZADO: Cache em memória para dados de tracking frequentemente acessados
    this.trackingCache = new Map();
    this.cacheExpiry = new Map();
    this.CACHE_TTL = 30 * 60 * 1000; // 30 minutos em millisegundos
    this.trackingDataColumnInfo = null;
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
          'INSERT OR REPLACE INTO tracking_data (telegram_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)'
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
          finalEntry.kwai_click_id
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

  normalizeStartPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const normalized = {};

    const externalIdHash = normalizeHashCandidate(payload.external_id);
    if (externalIdHash) {
      normalized.external_id_hash = externalIdHash;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'zip')) {
      const zipHash = normalizeHashCandidate(payload.zip);
      if (zipHash) {
        normalized.zip_hash = zipHash;
      }
    }

    const fbp = sanitizeOptionalString(payload.fbp, { maxLength: MAX_START_PIXEL_LENGTH });
    if (fbp) {
      normalized.fbp = fbp;
    }

    const fbc = sanitizeOptionalString(payload.fbc, { maxLength: MAX_START_PIXEL_LENGTH });
    if (fbc) {
      normalized.fbc = fbc;
    }

    const clientIp = sanitizeOptionalString(payload.client_ip_address, { maxLength: MAX_START_IP_LENGTH });
    if (clientIp) {
      normalized.client_ip_address = clientIp;
    }

    const clientUserAgent = sanitizeOptionalString(payload.client_user_agent, { maxLength: MAX_START_USER_AGENT_LENGTH });
    if (clientUserAgent) {
      normalized.client_user_agent = clientUserAgent;
    }

    const utmSource = payload.utm_data && typeof payload.utm_data === 'object' ? payload.utm_data : payload;
    TRACKING_UTM_FIELDS.forEach(field => {
      const utmValue = sanitizeOptionalString(utmSource[field], { maxLength: MAX_START_UTM_LENGTH });
      if (utmValue) {
        normalized[field] = utmValue;
      }
    });

    if (payload.event_source_url) {
      const eventSourceUrl = sanitizeOptionalString(payload.event_source_url, { maxLength: MAX_START_URL_LENGTH });
      if (eventSourceUrl) {
        normalized.event_source_url = eventSourceUrl;
      }
    } else if (payload.presell_url) {
      const presellUrl = sanitizeOptionalString(payload.presell_url, { maxLength: MAX_START_URL_LENGTH });
      if (presellUrl) {
        normalized.event_source_url = presellUrl;
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  mergeStartTracking(existing = {}, normalized = {}) {
    const merged = { ...existing };

    TRACKING_UTM_FIELDS.forEach(field => {
      if (normalized[field]) {
        merged[field] = normalized[field];
      } else if (merged[field] === undefined) {
        merged[field] = existing[field] ?? null;
      }
    });

    if (normalized.fbp) {
      merged.fbp = normalized.fbp;
    } else if (merged.fbp === undefined) {
      merged.fbp = existing.fbp ?? null;
    }

    if (normalized.fbc) {
      merged.fbc = normalized.fbc;
    } else if (merged.fbc === undefined) {
      merged.fbc = existing.fbc ?? null;
    }

    if (normalized.client_ip_address) {
      merged.ip = normalized.client_ip_address;
      merged.client_ip_address = normalized.client_ip_address;
    } else {
      if (merged.ip === undefined) {
        merged.ip = existing.ip ?? null;
      }
      if (merged.client_ip_address === undefined && existing.client_ip_address !== undefined) {
        merged.client_ip_address = existing.client_ip_address;
      }
    }

    if (normalized.client_user_agent) {
      merged.user_agent = normalized.client_user_agent;
      merged.client_user_agent = normalized.client_user_agent;
    } else {
      if (merged.user_agent === undefined) {
        merged.user_agent = existing.user_agent ?? null;
      }
      if (merged.client_user_agent === undefined && existing.client_user_agent !== undefined) {
        merged.client_user_agent = existing.client_user_agent;
      }
    }

    if (normalized.external_id_hash) {
      merged.external_id_hash = normalized.external_id_hash;
    } else if (merged.external_id_hash === undefined && existing.external_id_hash) {
      merged.external_id_hash = existing.external_id_hash;
    }

    if (normalized.zip_hash) {
      merged.zip_hash = normalized.zip_hash;
    } else if (merged.zip_hash === undefined && existing.zip_hash) {
      merged.zip_hash = existing.zip_hash;
    }

    if (normalized.event_source_url) {
      merged.event_source_url = normalized.event_source_url;
    } else if (merged.event_source_url === undefined && existing.event_source_url) {
      merged.event_source_url = existing.event_source_url;
    }

    if (merged.kwai_click_id === undefined && existing.kwai_click_id !== undefined) {
      merged.kwai_click_id = existing.kwai_click_id;
    } else if (merged.kwai_click_id === undefined) {
      merged.kwai_click_id = null;
    }

    if (!merged.created_at) {
      merged.created_at = Date.now();
    }

    if (!merged.quality) {
      merged.quality = merged.fbp && merged.fbc ? 'real' : 'fallback';
    }

    return merged;
  }

  async ensureTrackingDataColumnInfo() {
    if (!this.pgPool || !this.postgres) {
      return { hasExternalIdHash: false, hasZipHash: false, hasUpdatedAt: false };
    }

    if (!this.trackingDataColumnInfo) {
      try {
        const res = await this.postgres.executeQuery(
          this.pgPool,
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'tracking_data'"
        );
        const columns = new Set(res.rows.map(row => row.column_name));
        this.trackingDataColumnInfo = {
          hasExternalIdHash: columns.has('external_id_hash'),
          hasZipHash: columns.has('zip_hash'),
          hasUpdatedAt: columns.has('updated_at')
        };
      } catch (error) {
        console.warn(`[${this.botId}] [START] falha ao verificar colunas tracking_data: ${error.message}`);
        this.trackingDataColumnInfo = {
          hasExternalIdHash: false,
          hasZipHash: false,
          hasUpdatedAt: false
        };
      }
    }

    return this.trackingDataColumnInfo;
  }

  async persistStartTrackingData(telegramId, mergedTracking, normalized) {
    if (!this.pgPool || !this.postgres) {
      return;
    }

    const cleanTelegramId = this.normalizeTelegramId(telegramId);
    if (cleanTelegramId === null) {
      return;
    }

    try {
      const columnInfo = await this.ensureTrackingDataColumnInfo();

      const columns = ['telegram_id'];
      const placeholders = ['$1'];
      const values = [cleanTelegramId];
      let paramIndex = 2;

      const addColumn = (column, value) => {
        columns.push(column);
        placeholders.push(`$${paramIndex++}`);
        values.push(value ?? null);
      };

      if (columnInfo.hasExternalIdHash) {
        addColumn('external_id_hash', mergedTracking.external_id_hash || null);
      }

      if (columnInfo.hasZipHash) {
        addColumn('zip_hash', mergedTracking.zip_hash || null);
      }

      addColumn('utm_source', mergedTracking.utm_source || null);
      addColumn('utm_medium', mergedTracking.utm_medium || null);
      addColumn('utm_campaign', mergedTracking.utm_campaign || null);
      addColumn('utm_term', mergedTracking.utm_term || null);
      addColumn('utm_content', mergedTracking.utm_content || null);
      addColumn('fbp', mergedTracking.fbp || null);
      addColumn('fbc', mergedTracking.fbc || null);
      addColumn('ip', mergedTracking.ip || null);
      addColumn('user_agent', mergedTracking.user_agent || null);

      let insertColumnsSql = columns.join(', ');
      let insertValuesSql = placeholders.join(', ');

      const updateAssignments = columns
        .slice(1)
        .map(column => `${column} = COALESCE(EXCLUDED.${column}, tracking_data.${column})`);

      if (columnInfo.hasUpdatedAt) {
        insertColumnsSql += ', updated_at';
        insertValuesSql += ', NOW()';
        updateAssignments.push('updated_at = NOW()');
      }

      const query = `
        INSERT INTO tracking_data (${insertColumnsSql})
        VALUES (${insertValuesSql})
        ON CONFLICT (telegram_id) DO UPDATE SET
        ${updateAssignments.join(', ')}
      `;

      await this.postgres.executeQuery(this.pgPool, query, values);

      const usefulFields = Object.entries(normalized).filter(([, value]) => value !== null && value !== undefined).length;
      console.log(`[${this.botId}] [DB] tracking upsert ok para tg=${cleanTelegramId} campos=${usefulFields}`);
    } catch (error) {
      console.warn(`[${this.botId}] [DB] tracking upsert falhou para tg=${cleanTelegramId}: ${error.message}`);
    }
  }

  async enqueueStartInitiateCheckout(telegramId, mergedTracking, normalized) {
    const externalIdHash = normalized.external_id_hash || mergedTracking.external_id_hash;
    if (!externalIdHash) {
      console.warn(`[${this.botId}] [CAPI] InitiateCheckout não enviado - external_id ausente tg=${telegramId}`);
      return;
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = `ic:${telegramId}:${Date.now()}`;

    const utms = {};
    TRACKING_UTM_FIELDS.forEach(field => {
      const value = mergedTracking[field];
      if (value) {
        utms[field] = value;
      }
    });

    const clientIp = normalized.client_ip_address || mergedTracking.client_ip_address || mergedTracking.ip || null;
    const clientUserAgent =
      normalized.client_user_agent || mergedTracking.client_user_agent || mergedTracking.user_agent || null;
    const zipHash = normalized.zip_hash || mergedTracking.zip_hash || null;
    const fbp = mergedTracking.fbp || null;
    const fbc = mergedTracking.fbc || null;
    const eventSourceUrl = normalized.event_source_url || mergedTracking.event_source_url || null;
    const hasUtms = Object.keys(utms).length > 0;

    console.log(
      `[${this.botId}] [CAPI] InitiateCheckout queued para tg=${telegramId} event_id=${eventId} utms=${hasUtms} fbp=${Boolean(
        fbp
      )} fbc=${Boolean(fbc)}`
    );

    try {
      const result = await sendInitiateCheckoutCapi({
        telegramId,
        eventTime,
        eventId,
        eventSourceUrl,
        externalIdHash,
        zipHash,
        fbp,
        fbc,
        client_ip_address: clientIp,
        client_user_agent: clientUserAgent,
        utms
      });

      if (result?.success) {
        console.log(`[${this.botId}] [CAPI] InitiateCheckout sent para tg=${telegramId} event_id=${eventId}`);
      } else if (result?.duplicate) {
        console.log(`[${this.botId}] [CAPI] InitiateCheckout duplicado tg=${telegramId} event_id=${eventId}`);
      } else {
        const errorMessage = result?.error || 'unknown_error';
        console.warn(`[${this.botId}] [CAPI] InitiateCheckout falhou tg=${telegramId} event_id=${eventId}: ${errorMessage}`);
      }
    } catch (error) {
      console.warn(`[${this.botId}] [CAPI] InitiateCheckout erro tg=${telegramId} event_id=${eventId}: ${error.message}`);
    }
  }

  async sendLeadForStart(telegramId, { startTimestamp = null } = {}) {
    const cleanTelegramId = this.normalizeTelegramId(telegramId);
    if (cleanTelegramId === null) {
      return;
    }

    let tracking = this.getTrackingData(cleanTelegramId);
    if (!tracking) {
      tracking = (await this.buscarTrackingData(cleanTelegramId)) || {};
    }

    const externalIdHash = tracking.external_id_hash || null;
    const fbp = tracking.fbp || null;
    const fbc = tracking.fbc || null;
    const clientIp = tracking.client_ip_address || tracking.ip || null;
    const clientUserAgent = tracking.client_user_agent || tracking.user_agent || null;
    const eventSourceUrl = tracking.event_source_url || null;

    const availableFields = [];
    if (externalIdHash) availableFields.push('external_id');
    if (fbp) availableFields.push('fbp');
    if (fbc) availableFields.push('fbc');
    if (clientIp) availableFields.push('client_ip_address');
    if (clientUserAgent) availableFields.push('client_user_agent');

    if (availableFields.length < 2) {
      console.warn(
        `[${this.botId}] [CAPI] SKIP_LEAD_MISSING_USER_DATA tg=${cleanTelegramId} campos=${availableFields.length}`
      );
      funnelMetrics.recordEvent('lead_fail', {
        telegramId: cleanTelegramId,
        meta: { source: 'capi', reason: 'missing_user_data', fields: availableFields.length }
      });
      return;
    }

    const eventTime =
      typeof startTimestamp === 'number' && Number.isFinite(startTimestamp)
        ? startTimestamp
        : Math.floor(Date.now() / 1000);

    const utms = {};
    TRACKING_UTM_FIELDS.forEach(field => {
      if (tracking[field]) {
        utms[field] = tracking[field];
      }
    });

    const leadOptions = {
      telegramId: cleanTelegramId,
      eventTime,
      externalIdHash,
      fbp,
      fbc,
      client_ip_address: clientIp,
      client_user_agent: clientUserAgent,
      eventSourceUrl: eventSourceUrl || this.frontendUrl || null,
      utms
    };

    const result = await sendLeadCapi(leadOptions);
    const resolvedEventId = result?.eventId || null;

    if (result?.skipped) {
      const reason = result.reason || 'unknown';
      console.warn(
        `[${this.botId}] [CAPI] Lead não enviado (skipped) tg=${cleanTelegramId} motivo=${reason}`
      );
      return;
    }

    if (result?.duplicate) {
      console.log(`[${this.botId}] [CAPI] Lead duplicado tg=${cleanTelegramId} event_id=${resolvedEventId}`);
      return;
    }

    if (result?.success) {
      console.log(
        `[${this.botId}] [CAPI] Lead enviado tg=${cleanTelegramId} event_id=${resolvedEventId} campos=${availableFields.length}`
      );
      return;
    }

    const errorMessage = result?.error || 'unknown_error';
    console.warn(`[${this.botId}] [CAPI] Lead falhou tg=${cleanTelegramId} event_id=${resolvedEventId}: ${errorMessage}`);
  }

  async handleStartPayload(telegramId, rawPayload) {
    const cleanTelegramId = this.normalizeTelegramId(telegramId);
    if (cleanTelegramId === null) {
      return;
    }

    const encodedStart = extractStartParameter(rawPayload);
    if (!encodedStart) {
      return;
    }

    let parsedPayload;
    try {
      parsedPayload = decodeStartPayload(encodedStart);
    } catch (error) {
      console.warn(`[${this.botId}] [START] payload inválido para tg=${cleanTelegramId}`);
      return;
    }

    if (!parsedPayload || typeof parsedPayload !== 'object') {
      console.warn(`[${this.botId}] [START] payload inválido para tg=${cleanTelegramId}`);
      return;
    }

    const normalized = this.normalizeStartPayload(parsedPayload);
    if (!normalized) {
      console.warn(`[${this.botId}] [START] payload sem dados úteis para tg=${cleanTelegramId}`);
      return;
    }

    const fieldCount = Object.keys(normalized).length;
    console.log(`[${this.botId}] [START] payload ok para tg=${cleanTelegramId} campos=${fieldCount}`);

    let existingTracking = this.getTrackingData(cleanTelegramId);
    if (!existingTracking) {
      existingTracking = (await this.buscarTrackingData(cleanTelegramId)) || {};
    }

    const mergedTracking = this.mergeStartTracking(existingTracking || {}, normalized);
    this.trackingData.set(cleanTelegramId, mergedTracking);

    if (normalized.fbp || normalized.fbc || normalized.client_ip_address || normalized.client_user_agent) {
      try {
        this.sessionTracking.storeTrackingData(cleanTelegramId, {
          fbp: mergedTracking.fbp || null,
          fbc: mergedTracking.fbc || null,
          ip: mergedTracking.ip || null,
          user_agent: mergedTracking.user_agent || null
        });
      } catch (error) {
        console.warn(`[${this.botId}] [START] falha ao atualizar sessionTracking tg=${cleanTelegramId}: ${error.message}`);
      }
    }

    await this.persistStartTrackingData(cleanTelegramId, mergedTracking, normalized);
    await this.enqueueStartInitiateCheckout(cleanTelegramId, mergedTracking, normalized);
  }

  async buscarTrackingData(telegramId) {
    const cleanTelegramId = this.normalizeTelegramId(telegramId);
    if (cleanTelegramId === null) return null;
    let row = null;
    if (this.db) {
      try {
        row = this.db
          .prepare(
            'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id, external_id_hash, zip_hash FROM tracking_data WHERE telegram_id = ?'
          )
          .get(cleanTelegramId);
      } catch (e) {
        const message = e?.message || '';
        if (message.includes('no such column')) {
          try {
            row = this.db
              .prepare(
                'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id FROM tracking_data WHERE telegram_id = ?'
              )
              .get(cleanTelegramId);
          } catch (fallbackError) {
            console.error(`[${this.botId}] Erro ao buscar tracking SQLite (fallback):`, fallbackError.message);
          }
        } else {
          console.error(`[${this.botId}] Erro ao buscar tracking SQLite:`, message);
        }
      }
    }
    if (!row && this.pgPool) {
      try {
        const res = await this.postgres.executeQuery(
          this.pgPool,
          'SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id, external_id_hash, zip_hash FROM tracking_data WHERE telegram_id = $1',
          [cleanTelegramId]
        );
        row = res.rows[0];
      } catch (e) {
        console.error(`[${this.botId}] Erro ao buscar tracking PG:`, e.message);
      }
    }
    if (row) {
      if (row.ip && !row.client_ip_address) {
        row.client_ip_address = row.ip;
      }
      if (row.user_agent && !row.client_user_agent) {
        row.client_user_agent = row.user_agent;
      }
      row.created_at = Date.now();
      this.trackingData.set(cleanTelegramId, row);
    }
    return row;
  }

  async handleSuccessfulPayment(msg) {
    const payment = msg?.successful_payment;
    if (!payment) {
      return;
    }

    const rawTelegramId = msg?.chat?.id ?? msg?.from?.id;
    const telegramId = this.normalizeTelegramId(rawTelegramId);
    if (telegramId === null) {
      console.warn(`[${this.botId}] [CAPI] successful_payment ignorado - telegram_id inválido`);
      return;
    }

    const tokenCandidates = [
      payment.provider_payment_charge_id,
      payment.telegram_payment_charge_id,
      payment.invoice_payload,
      payment.order_info?.order_id
    ];
    const transactionToken = tokenCandidates
      .map(candidate => (candidate === null || candidate === undefined ? null : String(candidate).trim()))
      .find(candidate => candidate);

    if (!transactionToken) {
      console.warn(`[${this.botId}] [CAPI] Purchase não enviado - token ausente tg=${telegramId}`);
      return;
    }

    const totalAmount = payment.total_amount;
    const value =
      typeof totalAmount === 'number' && !Number.isNaN(totalAmount)
        ? totalAmount / 100
        : Number(totalAmount);

    if (!Number.isFinite(value)) {
      console.warn(`[${this.botId}] [CAPI] Purchase não enviado - valor inválido tg=${telegramId}`);
      return;
    }

    const currency = payment.currency || 'BRL';
    const eventTime = typeof msg?.date === 'number' ? msg.date : Math.floor(Date.now() / 1000);

    let trackingData = this.getTrackingData(telegramId) || null;
    let trackingSource = 'cache-hit';

    if (!trackingData) {
      trackingData = await this.buscarTrackingData(telegramId);
      trackingSource = trackingData ? 'db' : 'none';
    }

    const sessionTrackingData = (() => {
      try {
        return this.sessionTracking?.getTrackingData(telegramId) || null;
      } catch (error) {
        console.warn(`[${this.botId}] [CAPI] erro ao acessar sessionTracking: ${error.message}`);
        return null;
      }
    })();

    if (trackingData) {
      console.log(`[${this.botId}] [DB] tracking ok tg=${telegramId} origem=${trackingSource}`);
    } else if (sessionTrackingData) {
      console.log(`[${this.botId}] [DB] tracking ok tg=${telegramId} origem=session`);
    } else {
      console.log(`[${this.botId}] [DB] tracking ausente tg=${telegramId}`);
    }

    const mergedTracking = { ...(trackingData || {}) };

    if (sessionTrackingData) {
      if (!mergedTracking.fbp && sessionTrackingData.fbp) {
        mergedTracking.fbp = sessionTrackingData.fbp;
      }
      if (!mergedTracking.fbc && sessionTrackingData.fbc) {
        mergedTracking.fbc = sessionTrackingData.fbc;
      }
      if (!mergedTracking.ip && sessionTrackingData.ip) {
        mergedTracking.ip = sessionTrackingData.ip;
      }
      if (!mergedTracking.user_agent && sessionTrackingData.user_agent) {
        mergedTracking.user_agent = sessionTrackingData.user_agent;
      }
      if (!mergedTracking.client_ip_address && sessionTrackingData.client_ip_address) {
        mergedTracking.client_ip_address = sessionTrackingData.client_ip_address;
      }
      if (!mergedTracking.client_user_agent && sessionTrackingData.client_user_agent) {
        mergedTracking.client_user_agent = sessionTrackingData.client_user_agent;
      }
    }

    if (!mergedTracking.client_ip_address && mergedTracking.ip) {
      mergedTracking.client_ip_address = mergedTracking.ip;
    }
    if (!mergedTracking.client_user_agent && mergedTracking.user_agent) {
      mergedTracking.client_user_agent = mergedTracking.user_agent;
    }

    const utms = {};
    TRACKING_UTM_FIELDS.forEach(field => {
      const valueField = mergedTracking[field];
      if (valueField) {
        utms[field] = valueField;
      }
    });

    const purchaseContext = {
      telegramId,
      eventTime,
      value,
      currency,
      token: transactionToken,
      eventSourceUrl: mergedTracking.event_source_url || null,
      externalIdHash: mergedTracking.external_id_hash || null,
      zipHash: mergedTracking.zip_hash || null,
      fbp: mergedTracking.fbp || null,
      fbc: mergedTracking.fbc || null,
      client_ip_address: mergedTracking.client_ip_address || mergedTracking.ip || null,
      client_user_agent: mergedTracking.client_user_agent || mergedTracking.user_agent || null,
      utms
    };

    const hasUtms = Object.keys(utms).length > 0;
    const hasFbp = Boolean(purchaseContext.fbp);
    const hasFbc = Boolean(purchaseContext.fbc);

    try {
      const result = await sendPurchaseCapi(purchaseContext);

      if (result?.duplicate) {
        console.log(
          `[${this.botId}] [CAPI] Purchase duplicate tg=${telegramId} event_id=${result.eventId} value=${result.normalizedValue} currency=${currency} utms=${hasUtms} fbp=${hasFbp} fbc=${hasFbc}`
        );
        return;
      }

      if (result?.success) {
        console.log(
          `[${this.botId}] [CAPI] Purchase sent tg=${telegramId} event_id=${result.eventId} value=${result.normalizedValue} currency=${currency} utms=${hasUtms} fbp=${hasFbp} fbc=${hasFbc}`
        );

        try {
          const utmifyResult = await postUtmifyOrder({
            order_id: transactionToken,
            value: result.normalizedValue,
            currency,
            utm: utms,
            ids: {
              external_id_hash: purchaseContext.externalIdHash || null,
              fbp: purchaseContext.fbp || null,
              fbc: purchaseContext.fbc || null,
              zip_hash: purchaseContext.zipHash || null
            },
            client: {
              ip: purchaseContext.client_ip_address || null,
              user_agent: purchaseContext.client_user_agent || null
            }
          });

          if (utmifyResult?.sent) {
            console.log(
              `[${this.botId}] [UTMify] Conversão enviada tg=${telegramId} order=${transactionToken} tentativa=${utmifyResult.attempt}`
            );
          } else if (utmifyResult?.skipped) {
            console.log(
              `[${this.botId}] [UTMify] Conversão não enviada tg=${telegramId} motivo=${utmifyResult.reason || 'desconhecido'}`
            );
          } else if (utmifyResult && utmifyResult.ok === false) {
            console.warn(
              `[${this.botId}] [UTMify] Falha ao enviar conversão tg=${telegramId} tentativa=${utmifyResult.attempt || 0}`
            );
          }
        } catch (utmifyError) {
          console.warn(`[${this.botId}] [UTMify] Erro ao enviar conversão tg=${telegramId}: ${utmifyError.message}`);
        }
      } else {
        const errorMessage = result?.error || 'unknown_error';
        console.warn(
          `[${this.botId}] [CAPI] Purchase erro tg=${telegramId} event_id=${result?.eventId || 'n/a'} motivo=${errorMessage}`
        );
      }
    } catch (error) {
      console.warn(`[${this.botId}] [CAPI] Purchase exception tg=${telegramId}: ${error.message}`);
    }
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
    // Priorizar X-Forwarded-For e pegar primeiro IP público
    let ipCriacao = null;
    const ipBody = req.body.client_ip_address || req.body.ip;
    
    if (ipBody && !isPrivateIP(ipBody)) {
      ipCriacao = ipBody;
    } else {
      const ipRawList = req.headers['x-forwarded-for'];
      if (ipRawList && typeof ipRawList === 'string') {
        const ips = ipRawList.split(',').map(ip => ip.trim()).filter(Boolean);
        for (const ip of ips) {
          if (!isPrivateIP(ip)) {
            ipCriacao = ip;
            console.log('[IP-CAPTURE-TELEGRAM-BOT] IP público encontrado no X-Forwarded-For:', ip);
            break;
          }
        }
      }
      
      // Fallback para socket.remoteAddress se público
      if (!ipCriacao && req.socket?.remoteAddress && !isPrivateIP(req.socket.remoteAddress)) {
        ipCriacao = req.socket.remoteAddress;
      }
    }
    
    if (!ipCriacao) {
      console.warn('[IP-CAPTURE-TELEGRAM-BOT] ⚠️ Nenhum IP público encontrado');
    }

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
    finalTrackingData = {
      ...finalTrackingData,
      ...sanitizeTrackingFields(finalTrackingData)
    };

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

    camposUtm.forEach(campo => {
      const sanitizedValue = sanitizeTrackingValue(trackingFinal[campo]);
      if (sanitizedValue === null) {
        delete trackingFinal[campo];
      } else {
        trackingFinal[campo] = sanitizedValue;
      }
    });

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
        const candidate = sanitizeTrackingValue(requestTrackingData[campo]);
        if (candidate !== null) {
          trackingFinal[campo] = candidate;
        }
      });
    } else {
              // console.log('[DEBUG] req.body.trackingData está null, undefined ou não é um objeto - pulando sobrescrita de UTMs');
    }

    camposUtm.forEach(campo => {
      const sanitizedValue = sanitizeTrackingValue(trackingFinal[campo]);
      if (sanitizedValue === null) {
        delete trackingFinal[campo];
      } else {
        trackingFinal[campo] = sanitizedValue;
      }
    });

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
      amount_unit: 'reais',
      client: {
        name: finalTrackingData.name || `Telegram User ${telegram_id}`,
        email: finalTrackingData.email || `${telegram_id}@telegram.local`,
        document: finalTrackingData.document || '00000000000'
      },
      description: nomeOferta,
      callbackUrl: webhookUrl,
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
        `INSERT INTO tokens (id_transacao, token, valor, telegram_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content, fbp, fbc, ip_criacao, user_agent_criacao, tipo, bot_id, status, event_time, nome_oferta, gateway, pix_copia_cola, qr_code_base64, identifier)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'principal', ?, 'pendente', ?, ?, ?, ?, ?, ?)`
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

      // 🎯 VALIDAÇÃO PUSHINPAY: Header customizado é OPCIONAL
      // A PushinPay permite configurar um header customizado no painel deles (OPCIONAL)
      if (process.env.PUSHINPAY_WEBHOOK_TOKEN) {
        const pushinpayToken = req.headers['x-pushinpay-token'];
        if (pushinpayToken !== process.env.PUSHINPAY_WEBHOOK_TOKEN) {
          console.log(`[${this.botId}] ❌ Token PushinPay inválido`);
          return res.sendStatus(403);
        }
        console.log(`[${this.botId}] ✅ Token PushinPay validado com sucesso`);
      }

      const payload = req.body;
      const requestId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidv4();
      const { status } = payload || {};
      const idBruto = payload.id || payload.token || payload.transaction_id || null;
      const normalizedId = normalizeTransactionId(idBruto);
      const normalizedStatus = typeof status === 'string' ? status.toLowerCase().trim() : '';

      console.log('[PURCHASE-WEBHOOK] 📥 Entrada recebida', {
        bot_id: this.botId,
        request_id: requestId,
        payload,
        headers: req.headers
      });
      console.log('[PURCHASE-WEBHOOK] 🔄 Normalização inicial', {
        bot_id: this.botId,
        request_id: requestId,
        transaction_id_raw: idBruto,
        transaction_id_normalized: normalizedId,
        status_raw: status,
        status_normalized: normalizedStatus
      });
      console.log(`[${this.botId}] 📬 [PurchaseWebhook] Status recebido da PushinPay`, {
        transaction_id: normalizedId,
        status: normalizedStatus || null,
        raw_value: payload?.value || null,
        currency_hint: 'BRL'
      });

      if (!normalizedId) {
        console.log(`[${this.botId}] ⛔ Purchase ignorado - transaction_id ausente`);
        return res.sendStatus(200);
      }

      if (!['paid', 'approved', 'pago'].includes(normalizedStatus)) {
        console.log(`[${this.botId}] ⏭️ Purchase não enviado - status ainda não confirmado`, {
          transaction_id: normalizedId,
          status: normalizedStatus
        });
        return res.sendStatus(200);
      }

      try {
        const alreadySent = await isTransactionAlreadySent(normalizedId, 'Purchase');
        if (alreadySent) {
          console.log(`[${this.botId}] 🔄 Purchase suprimido por dedupe/idempotência`, {
            transaction_id: normalizedId
          });
          return res.sendStatus(200);
        }
      } catch (dedupeError) {
        console.error(`[${this.botId}] ⚠️ Falha ao verificar dedupe por transaction_id`, {
          transaction_id: normalizedId,
          error: dedupeError.message
        });
      }

      // Extrair dados pessoais do payload para hashing
      const payerName = payload.payer_name || payload.payer?.name || null;
      const payerCpf = normalizeCpf(
        payload.payer_national_registration ||
        payload.payer?.national_registration ||
        payload.payer?.cpf ||
        null
      );
      const payerCpfNormalized = payerCpf || null;
      const endToEndId = payload.end_to_end_id || payload.pix_end_to_end_id || payload.endToEndId || null;

      // 🎯 PURCHASE FLOW: Extrair value e currency do webhook
      let priceCents = toIntOrNull(payload.value);
      const currency = 'BRL';
      const eventIdPurchase = generatePurchaseEventId(normalizedId);

      console.log('[PURCHASE-WEBHOOK] 📦 Dados normalizados', {
        bot_id: this.botId,
        request_id: requestId,
        transaction_id: normalizedId,
        payer_name: payerName,
        payer_cpf: payerCpf,
        price_cents: priceCents,
        currency,
        event_id_purchase: eventIdPurchase
      });
      
      // Gerar hashes de dados pessoais se disponíveis
      let hashedUserData = null;
      if (payerName && payerCpf) {
        hashedUserData = generateHashedUserData(payerName, payerCpf);
        console.log(`[${this.botId}] 🔐 Dados pessoais hasheados gerados para Purchase`);
      }
      
      let row = this.db ? this.db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get(normalizedId) : null;
      const hadRowInitially = !!row;

      if (this.pgPool) {
        try {
          await this.pgPool.query(
            `
              INSERT INTO tokens (
                id_transacao, price_cents, currency,
                event_id_purchase, capi_ready, payer_name, payer_cpf
              ) VALUES ($1,$2,$3,$4, TRUE, $5,$6)
              ON CONFLICT (id_transacao) DO UPDATE SET
                price_cents       = EXCLUDED.price_cents,
                currency          = EXCLUDED.currency,
                event_id_purchase = COALESCE(tokens.event_id_purchase, EXCLUDED.event_id_purchase),
                capi_ready        = TRUE,
                payer_name        = COALESCE(EXCLUDED.payer_name, tokens.payer_name),
                payer_cpf         = COALESCE(EXCLUDED.payer_cpf,  tokens.payer_cpf)
            `,
            [
              normalizedId,
              Number.isFinite(priceCents) ? priceCents : null,
              currency,
              eventIdPurchase,
              payerName || null,
              payerCpfNormalized
            ]
          );

          if (!hadRowInitially && payerCpfNormalized) {
            console.log(`[${this.botId}] 🧩 Backfilled payer no PG com payerCpf preenchido`, {
              transaction_id: normalizedId,
              payer_cpf: payerCpfNormalized
            });
          } else if (!hadRowInitially) {
            console.log(`[${this.botId}] 🧩 Backfilled payer no PG`, {
              transaction_id: normalizedId
            });
          }
        } catch (pgBackfillError) {
          console.error(`[${this.botId}] ❌ Falha ao realizar backfill no PG`, {
            transaction_id: normalizedId,
            error: pgBackfillError.message
          });
        }
      }

      if (!row && this.pgPool) {
        try {
          const pgResult = await this.pgPool.query(
            `SELECT token, status, telegram_id, valor, price_cents, nome_oferta,
                    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                    fbp, fbc, ip_criacao, user_agent_criacao, kwai_click_id,
                    payer_name, payer_cpf, bot_id, event_time
               FROM tokens
              WHERE id_transacao = $1
              LIMIT 1`,
            [normalizedId]
          );

          if (pgResult.rows.length > 0) {
            const pgRow = pgResult.rows[0];
            const hasPgPrice = pgRow.price_cents !== null && pgRow.price_cents !== undefined;
            const pgPriceCents = hasPgPrice
              ? Number(pgRow.price_cents)
              : (pgRow.valor !== null && pgRow.valor !== undefined
                  ? Math.round(Number(pgRow.valor) * 100)
                  : null);

            row = {
              token: pgRow.token || null,
              status: pgRow.status || null,
              telegram_id: pgRow.telegram_id || null,
              valor: Number.isFinite(pgPriceCents) ? pgPriceCents : null,
              nome_oferta: pgRow.nome_oferta || null,
              utm_source: pgRow.utm_source || null,
              utm_medium: pgRow.utm_medium || null,
              utm_campaign: pgRow.utm_campaign || null,
              utm_term: pgRow.utm_term || null,
              utm_content: pgRow.utm_content || null,
              fbp: pgRow.fbp || null,
              fbc: pgRow.fbc || null,
              ip_criacao: pgRow.ip_criacao || null,
              user_agent_criacao: pgRow.user_agent_criacao || null,
              kwai_click_id: pgRow.kwai_click_id || null,
              payer_name: pgRow.payer_name || null,
              payer_cpf: pgRow.payer_cpf || null,
              bot_id: pgRow.bot_id || null,
              event_time: pgRow.event_time || null
            };
          }
        } catch (pgFetchError) {
          console.error(`[${this.botId}] ❌ Erro ao recuperar token do PG`, {
            transaction_id: normalizedId,
            error: pgFetchError.message
          });
        }
      }

      if (!row) {
        console.log('[PURCHASE-WEBHOOK] ❌ Token não encontrado após backfill', {
          bot_id: this.botId,
          request_id: requestId,
          transaction_id: normalizedId
        });
        return res.sendStatus(200);
      }
      console.log('[PURCHASE-TOKEN] 🔎 Registro localizado', {
        bot_id: this.botId,
        request_id: requestId,
        transaction_id: normalizedId,
        token: row.token,
        telegram_id: row.telegram_id
      });
      let tokenToUse = row?.token || null;

      if (!tokenToUse && this.pgPool) {
        try {
          const existingToken = await this.pgPool.query(
            'SELECT token FROM tokens WHERE id_transacao = $1 AND token IS NOT NULL LIMIT 1',
            [normalizedId]
          );
          if (existingToken.rows.length > 0 && existingToken.rows[0].token) {
            tokenToUse = existingToken.rows[0].token;
          }
        } catch (pgTokenError) {
          console.error(`[${this.botId}] ❌ Erro ao consultar token existente no PG`, {
            transaction_id: normalizedId,
            error: pgTokenError.message
          });
        }
      }

      if (!tokenToUse) {
        tokenToUse = uuidv4().toLowerCase();
      }

      if (!row?.token || row?.status !== 'valido') {
        if (this.db) {
          const nomeParaExibir = (this.botId === 'bot_especial' && payerName) ? payerName : null;
          const cpfParaExibir = (this.botId === 'bot_especial' && payerCpf) ? payerCpf : null;
          const endToEndIdParaExibir = (this.botId === 'bot_especial' && endToEndId) ? endToEndId : null;

          this.db.prepare(
            `UPDATE tokens SET token = ?, status = 'valido', usado = 0, fn_hash = ?, ln_hash = ?, external_id_hash = ?, payer_name_temp = ?, payer_cpf_temp = ?, end_to_end_id_temp = ? WHERE id_transacao = ?`
          ).run(
            tokenToUse,
            null,
            null,
            null,
            nomeParaExibir,
            cpfParaExibir,
            endToEndIdParaExibir,
            normalizedId
          );
        }
      }

      row.token = tokenToUse;
      row.status = 'valido';

      let track = null;
      let sanitizedTrack = {};
      if (row.telegram_id) {
        track = this.getTrackingData(row.telegram_id);
        if (!track) {
          track = await this.buscarTrackingData(row.telegram_id);
        }
        track = track || {};
        sanitizedTrack = sanitizeTrackingForPartners(track);
        console.log('[UTM] 🔍 Tracking consolidado', {
          bot_id: this.botId,
          request_id: requestId,
          telegram_id: row.telegram_id,
          token: row.token,
          utms: extractUtmsFromSource({ row, track }),
          sanitized: sanitizedTrack
        });
      }
      const utmPayload = extractUtmsFromSource({ row, track, sanitizedTrack });
      if (priceCents === null) {
        priceCents = toIntOrNull(row?.price_cents ?? row?.valor);
      }

      if (priceCents !== null) {
        priceCents = Math.trunc(priceCents);
      }

      if (this.pgPool) {
        try {
          let trackRecord = null;
          if (this.db) {
            trackRecord = this.db
              .prepare('SELECT fbp, fbc, ip_criacao, user_agent_criacao FROM tokens WHERE id_transacao = ?')
              .get(normalizedId);
          }

          row.token = tokenToUse;
          row.status = 'valido';

          const nomeParaExibir = (this.botId === 'bot_especial' && payerName) ? payerName : null;
          const cpfParaExibir = (this.botId === 'bot_especial' && payerCpf) ? payerCpf : null;
          const endToEndIdParaExibir = (this.botId === 'bot_especial' && endToEndId) ? endToEndId : null;

          const valorHumano = Number.isFinite(priceCents) ? priceCents / 100 : (row.valor ? row.valor / 100 : null);

          await this.postgres.executeQuery(
            this.pgPool,
            `INSERT INTO tokens (
              id_transacao, token, telegram_id, valor, status, tipo, usado, bot_id,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              fbp, fbc, ip_criacao, user_agent_criacao, event_time,
              fn_hash, ln_hash, external_id_hash, nome_oferta,
              payer_name_temp, payer_cpf_temp, end_to_end_id_temp,
              first_name, last_name, phone,
              payer_name, payer_cpf, transaction_id, price_cents, currency,
              event_id_purchase, capi_ready, pixel_sent, capi_sent
            )
             VALUES ($1,$2,$3,$4,'valido','principal',FALSE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,TRUE,FALSE,FALSE)
             ON CONFLICT (id_transacao) DO UPDATE SET
               token = COALESCE(tokens.token, EXCLUDED.token),
               status = 'valido',
               tipo = EXCLUDED.tipo,
               usado = FALSE,
               fn_hash = EXCLUDED.fn_hash,
               ln_hash = EXCLUDED.ln_hash,
               external_id_hash = EXCLUDED.external_id_hash,
               nome_oferta = EXCLUDED.nome_oferta,
               payer_name_temp = EXCLUDED.payer_name_temp,
               payer_cpf_temp = EXCLUDED.payer_cpf_temp,
               end_to_end_id_temp = EXCLUDED.end_to_end_id_temp,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               phone = EXCLUDED.phone,
               payer_name = COALESCE(EXCLUDED.payer_name, tokens.payer_name),
               payer_cpf = COALESCE(EXCLUDED.payer_cpf, tokens.payer_cpf),
               transaction_id = EXCLUDED.transaction_id,
               price_cents = EXCLUDED.price_cents,
               currency = EXCLUDED.currency,
               event_id_purchase = COALESCE(tokens.event_id_purchase, EXCLUDED.event_id_purchase),
               capi_ready = TRUE`,
            [
              normalizedId,
              tokenToUse,
              row.telegram_id ? String(row.telegram_id) : null,
              valorHumano,
              row.bot_id || this.botId,
              utmPayload.utm_source || row.utm_source,
              utmPayload.utm_medium || row.utm_medium,
              utmPayload.utm_campaign || row.utm_campaign,
              utmPayload.utm_term || row.utm_term,
              utmPayload.utm_content || row.utm_content,
              trackRecord?.fbp || track?.fbp || row.fbp,
              trackRecord?.fbc || track?.fbc || row.fbc,
              trackRecord?.ip_criacao || track?.ip || row.ip_criacao,
              trackRecord?.user_agent_criacao || track?.user_agent || row.user_agent_criacao,
              typeof row.event_time === 'number' ? row.event_time : Math.floor(Date.now() / 1000),
              hashedUserData?.fn_hash || null,
              hashedUserData?.ln_hash || null,
              hashedUserData?.external_id_hash || null,
              row.nome_oferta || 'Oferta Desconhecida',
              nomeParaExibir,
              cpfParaExibir,
              endToEndIdParaExibir,
              null,
              null,
              null,
              payerName,
              payerCpf,
              normalizedId,
              Number.isFinite(priceCents) ? priceCents : null,
              currency,
              eventIdPurchase
            ]
          );

          console.log('[PURCHASE-TOKEN] 💾 Upsert PG OK', {
            id_transacao: normalizedId,
            token: tokenToUse,
            event_id_purchase: eventIdPurchase,
            price_cents: Number.isFinite(priceCents) ? priceCents : null,
            currency
          });
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
        try {
          // 🎯 CORREÇÃO: Usar price_cents do webhook (fonte canônica)
          const normalizedPriceCents = toIntOrNull(row.price_cents ?? priceCents ?? row.valor);
          priceCents = normalizedPriceCents;
          const valorReais = normalizedPriceCents && normalizedPriceCents > 0
            ? centsToValue(normalizedPriceCents)
            : null;

          const extras = {};
          if (this.grupo) {
            const [groupKey, groupValue] = this.grupo.split('=');
            if (groupValue !== undefined) {
              extras[groupKey] = groupValue;
            } else if (groupKey) {
              extras.grupo = groupKey;
            }
          }

          const paginaObrigado = this.config.paginaObrigado || 'obrigado_purchase_flow.html';
          const urlData = buildObrigadoUrl({
            frontendUrl: this.frontendUrl,
            path: paginaObrigado,
            token: tokenToUse,
            valor: valorReais, // Será null se não disponível, buildObrigadoUrl vai omitir o parâmetro
            utms: utmPayload,
            extras
          });

          console.log('[URL-BUILDER] 🛠️ Composição', {
            bot_id: this.botId,
            request_id: requestId,
            token: tokenToUse,
            transaction_id: normalizedId,
            raw_base: urlData.rawBase,
            normalized_base: urlData.normalizedBase,
            normalized_url: urlData.normalizedUrl,
            utms: utmPayload,
            extras,
            price_cents: normalizedPriceCents,
            valor_reais: valorReais
          });

          // 🎯 LOG: Detectar se valor foi omitido
          if (valorReais !== null) {
            console.log(`[BOT-LINK] token=${tokenToUse} price_cents=${normalizedPriceCents} valor=${valorReais} url=${urlData.normalizedUrl}`);
          } else {
            console.log(`[BOT-LINK] omitindo parâmetro "valor" por ausência de price_cents. token=${tokenToUse} url=${urlData.normalizedUrl}`);
          }

          console.log('[UTM] 📤 Propagação Obrigado', {
            bot_id: this.botId,
            request_id: requestId,
            token: tokenToUse,
            transaction_id: normalizedId,
            utms: utmPayload
          });

          const linkComToken = urlData.normalizedUrl;
          console.log(`[${this.botId}] ✅ Enviando link para`, row.telegram_id);
          console.log(`[${this.botId}] Link final:`, linkComToken);
          
          // 🎯 CORREÇÃO: Mensagem ajustada - mostrar valor somente se disponível
          const mensagem = valorReais !== null
            ? `🎉 <b>Pagamento aprovado!</b>\n\n💰 Valor: R$ ${valorReais}\n🔗 Acesse seu conteúdo: ${linkComToken}\n\n⚠️ O link irá expirar em 5 minutos.`
            : `🎉 <b>Pagamento aprovado!</b>\n\n🔗 Acesse seu conteúdo: ${linkComToken}\n\n⚠️ O link irá expirar em 5 minutos.`;
          
          await this.bot.sendMessage(row.telegram_id, mensagem, { parse_mode: 'HTML' });

          // Enviar conversão para UTMify
          const transactionValueCents = Number.isFinite(priceCents) ? priceCents : row.valor;
          const telegramId = row.telegram_id;
          await enviarConversaoParaUtmify({
            payer_name: payload.payer_name,
            telegram_id: telegramId,
            transactionValueCents,
            trackingData: sanitizedTrack,
            orderId: normalizedId,
            nomeOferta: row.nome_oferta || 'Oferta Desconhecida'
          });

          // 🎯 KWAI TRACKING: Enviar evento PURCHASE quando pagamento for aprovado
          try {
            const { getInstance: getKwaiEventAPI } = require('../../services/kwaiEventAPI');
            const kwaiEventAPI = getKwaiEventAPI();
            
            // Buscar click_id do tracking data
            const kwaiClickId = sanitizedTrack?.kwai_click_id || track?.kwai_click_id;
            
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
        } catch (telegramError) {
          console.error(`[${this.botId}] ❌ Erro ao processar notificação Telegram/UTMify/Kwai (não crítico):`, telegramError.message);
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
          [tokenToUse]
        );
        console.log('[PURCHASE-TOKEN] 🔔 Flag capi_ready confirmada', {
          bot_id: this.botId,
          request_id: requestId,
          token: tokenToUse,
          transaction_id: normalizedId,
          event_id_purchase: eventIdPurchase
        });
        // console.log(`[${this.botId}] ✅ Flag capi_ready marcada para token ${tokenToUse} - CAPI será enviado pelo cron/fallback`);
      } catch (dbErr) {
        console.error(`[${this.botId}] ❌ Erro ao marcar flag capi_ready:`, dbErr.message);
      }

      // Purchase será enviado pelo fluxo browser + CAPI após a página de obrigado

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
        const trackingData = sanitizeTrackingForPartners(this.getTrackingData(row.telegram_id) || {});
        
        // Facebook Pixel
        if (trackingData.utm_source === 'facebook' || trackingData.fbclid) {
          const hashedUserData = generateHashedUserData(
            transaction?.client?.name || 'Cliente Oasyfy',
            transaction?.client?.cpf || transaction?.client?.cnpj || '00000000000'
          );

          let purchaseValue = undefined;
          if (transaction?.amount !== undefined && transaction?.amount !== null) {
            const parsedAmount = Number(transaction.amount);
            if (!Number.isNaN(parsedAmount)) {
              purchaseValue = parsedAmount;
            }
          }

          if (purchaseValue === undefined) {
            purchaseValue = formatForCAPI(row?.valor);
          }

          const telegramIdForEvent = row?.telegram_id !== undefined && row?.telegram_id !== null
            ? String(row.telegram_id)
            : undefined;

          const eventTimestampSource =
            transaction?.paid_at ||
            transaction?.paidAt ||
            transaction?.completed_at ||
            transaction?.completedAt ||
            transaction?.updated_at ||
            transaction?.updatedAt ||
            transaction?.created_at ||
            transaction?.createdAt ||
            null;

          let eventTime = Math.floor(Date.now() / 1000);
          if (eventTimestampSource) {
            if (typeof eventTimestampSource === 'number') {
              eventTime = Math.floor(
                eventTimestampSource > 1e12
                  ? eventTimestampSource / 1000
                  : eventTimestampSource
              );
            } else if (typeof eventTimestampSource === 'string') {
              const parsed = DateTime.fromISO(eventTimestampSource, { zone: 'utc' });
              if (parsed?.isValid) {
                eventTime = Math.floor(parsed.toSeconds());
              } else {
                const fallbackDate = new Date(eventTimestampSource);
                if (!Number.isNaN(fallbackDate.getTime())) {
                  eventTime = Math.floor(fallbackDate.getTime() / 1000);
                }
              }
            }
          }

          const dedupTokenRaw = row?.token || transactionId || null;
          const dedupToken = typeof dedupTokenRaw === 'string'
            ? dedupTokenRaw
            : dedupTokenRaw !== null && dedupTokenRaw !== undefined
              ? String(dedupTokenRaw)
              : null;

          const eventId = dedupToken
            ? generateEventId('Purchase', dedupToken, eventTime)
            : generateEventId('Purchase', transactionId || telegramIdForEvent || '', eventTime);

          const eventData = {
            event_name: 'Purchase',
            event_time: eventTime,
            event_id: eventId,
            value: purchaseValue,
            currency: 'BRL',
            fbp: trackingData.fbp,
            fbc: trackingData.fbc,
            client_ip_address: trackingData.ip,
            client_user_agent: trackingData.user_agent,
            telegram_id: telegramIdForEvent,
            source: trackingData.src || 'telegram_bot_oasyfy',
            token: dedupToken,
            user_data_hash: hashedUserData,
            custom_data: {
              value: purchaseValue,
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
          const transactionValueRaw = typeof row.valor === 'number' ? row.valor : Number(row.valor);
          const transactionValueCents = Number.isFinite(transactionValueRaw)
            ? Math.round(transactionValueRaw)
            : 0;

          if (!Number.isFinite(transactionValueRaw)) {
            console.warn(`[${this.botId}] ⚠️ Valor inválido para transactionValueCents ao enviar para UTMify`, {
              valorOriginal: row.valor
            });
          }

          const utmifyPayload = {
            payer_name: transaction?.client?.name || null,
            telegram_id: row.telegram_id,
            transactionValueCents,
            trackingData,
            orderId: transactionId,
            nomeOferta: row.nome_oferta || 'Oferta Desconhecida'
          };

          console.log(`[${this.botId}] 📨 Dados de conversão para UTMify`, utmifyPayload);
          await enviarConversaoParaUtmify(utmifyPayload);
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
        tamanho: this.trackingData.size
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

        try {
          await this.handleStartPayload(chatId, payloadRaw);
        } catch (error) {
          console.warn(`[${this.botId}] [START] erro inesperado para tg=${chatId}: ${error.message}`);
        }

        const startTimestamp = typeof msg?.date === 'number' ? msg.date : Math.floor(Date.now() / 1000);
        try {
          await this.sendLeadForStart(chatId, { startTimestamp });
        } catch (error) {
          console.warn(`[${this.botId}] [CAPI] Lead erro tg=${chatId}: ${error.message}`);
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
            let kwai_click_id;

            // Usar parâmetros diretos se disponíveis
            if (directParams) {
              fbp = sanitizeTrackingValue(directParams.fbp);
              fbc = sanitizeTrackingValue(directParams.fbc);
              user_agent = sanitizeTrackingValue(directParams.user_agent);
              utm_source = sanitizeTrackingValue(directParams.utm_source);
              utm_medium = sanitizeTrackingValue(directParams.utm_medium);
              utm_campaign = sanitizeTrackingValue(directParams.utm_campaign);
              // 🔥 NOVO: Capturar kwai_click_id dos parâmetros diretos
              kwai_click_id = sanitizeTrackingValue(directParams.kwai_click_id);
                              // console.log('[payload-debug] Merge directParams', { chatId, payload_id: payloadRaw, fbp, fbc, user_agent, kwai_click_id });
            }

          let trackingSalvoDePayload = false;

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
              const sanitizedRow = sanitizeTrackingFields(row, ['fbp', 'fbc', 'ip', 'user_agent']);
              fbp = pickFirstMeaningful(fbp, sanitizedRow.fbp);
              fbc = pickFirstMeaningful(fbc, sanitizedRow.fbc);
              ip = pickFirstMeaningful(ip, sanitizedRow.ip);
              user_agent = pickFirstMeaningful(user_agent, sanitizedRow.user_agent);
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
            if (!payloadRow) {
              // console.log('[payload-debug] payloadRow null', { chatId, payload_id: payloadRaw });
            }
            if (payloadRow) {
              const sanitizedPayloadRow = sanitizeTrackingFields(payloadRow);
              const existingTracking =
                this.getTrackingData(chatId) ||
                (await this.buscarTrackingData(chatId)) ||
                {};
              const sanitizedExisting = sanitizeTrackingFields(existingTracking);

              fbp = pickFirstMeaningful(fbp, sanitizedPayloadRow.fbp, sanitizedExisting.fbp);
              fbc = pickFirstMeaningful(fbc, sanitizedPayloadRow.fbc, sanitizedExisting.fbc);
              ip = pickFirstMeaningful(ip, sanitizedPayloadRow.ip, sanitizedExisting.ip);
              user_agent = pickFirstMeaningful(
                user_agent,
                sanitizedPayloadRow.user_agent,
                sanitizedExisting.user_agent
              );
              utm_source = pickFirstMeaningful(utm_source, sanitizedPayloadRow.utm_source, sanitizedExisting.utm_source);
              utm_medium = pickFirstMeaningful(utm_medium, sanitizedPayloadRow.utm_medium, sanitizedExisting.utm_medium);
              utm_campaign = pickFirstMeaningful(
                utm_campaign,
                sanitizedPayloadRow.utm_campaign,
                sanitizedExisting.utm_campaign
              );
              const utm_term = pickFirstMeaningful(sanitizedPayloadRow.utm_term, sanitizedExisting.utm_term);
              const utm_content = pickFirstMeaningful(sanitizedPayloadRow.utm_content, sanitizedExisting.utm_content);
              kwai_click_id = pickFirstMeaningful(
                kwai_click_id,
                sanitizedPayloadRow.kwai_click_id,
                sanitizedExisting.kwai_click_id
              );

              // 🔥 Salvar imediatamente na tabela tracking_data (sobrescrever qualquer tracking antigo)
              const payloadTrackingData = {
                utm_source: utm_source ?? null,
                utm_medium: utm_medium ?? null,
                utm_campaign: utm_campaign ?? null,
                utm_term: utm_term ?? null,
                utm_content: utm_content ?? null,
                fbp: fbp ?? null,
                fbc: fbc ?? null,
                ip: ip ?? null,
                user_agent: user_agent ?? null,
                kwai_click_id: kwai_click_id ?? null
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
                kwai_click_id: kwai_click_id ?? null
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
              kwai_click_id: kwai_click_id ?? null
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

    // 🔥 COMANDO DE TESTE: Gerar link válido sem pagamento
    this.bot.onText(/\/teste/, async (msg) => {
      const chatId = msg.chat.id;
      console.log(`[${this.botId}] 🧪 Comando /teste executado por ${chatId}`);
      
      try {
        // Gerar token de teste
        const crypto = require('crypto');
        const testToken = crypto.randomBytes(16).toString('hex');
        const testTransactionId = `teste_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const testValor = 3500; // R$ 35,00 em centavos
        
        // Salvar no SQLite
        if (this.db) {
          this.db.prepare(`
            INSERT INTO tokens (
              id_transacao, token, valor, telegram_id, status, tipo, usado, bot_id,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              fbp, fbc, ip_criacao, user_agent_criacao, nome_oferta,
              event_time, external_id_hash, identifier
            ) VALUES (?, ?, ?, ?, ?, 'principal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            testTransactionId,
            testToken,
            testValor,
            chatId,
            'valido', // Status válido para obrigado_purchase_flow.html aceitar
            0, // Não usado
            this.botId,
            'telegram',
            'bot',
            'teste',
            'comando_teste',
            'link_teste',
            null, // fbp
            null, // fbc
            '127.0.0.1', // ip_criacao
            'Bot Teste', // user_agent_criacao
            'Teste Manual', // nome_oferta
            new Date().toISOString(), // event_time
            null, // external_id_hash
            `teste_${chatId}_${Date.now()}` // identifier
          );
          console.log(`[${this.botId}] ✅ Token de teste salvo no SQLite: ${testToken}`);
        }
        
        // Salvar no PostgreSQL se disponível
        if (this.pgPool) {
          try {
            await this.postgres.executeQuery(
              this.pgPool,
              `INSERT INTO tokens (
                id_transacao, token, telegram_id, valor, status, tipo, usado, bot_id,
                utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                fbp, fbc, ip_criacao, user_agent_criacao, nome_oferta,
                event_time, external_id_hash, kwai_click_id
              ) VALUES ($1,$2,$3,$4,$5,'principal',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
              ON CONFLICT (id_transacao) DO UPDATE SET token = EXCLUDED.token, status = 'valido', tipo = EXCLUDED.tipo, usado = FALSE`,
              [
                testTransactionId,
                testToken,
                String(chatId), // Garantir que telegram_id seja TEXT
                testValor / 100, // Converter para reais (NUMERIC)
                'valido', // status
                false, // usado
                this.botId,
                'telegram',
                'bot',
                'teste',
                'comando_teste',
                'link_teste',
                null, // fbp
                null, // fbc
                '127.0.0.1', // ip_criacao
                'Bot Teste', // user_agent_criacao
                'Teste Manual', // nome_oferta
                Math.floor(Date.now() / 1000), // event_time como INTEGER (timestamp Unix)
                null, // external_id_hash
                null // kwai_click_id
              ]
            );
            console.log(`[${this.botId}] ✅ Token de teste salvo no PostgreSQL: ${testToken}`);
          } catch (pgError) {
            console.error(`[${this.botId}] ❌ Erro ao salvar no PostgreSQL:`, pgError.message);
          }
        }
        
        // Construir link de teste
        const valorReais = (testValor / 100).toFixed(2);
        const utmParams = [];
        utmParams.push(`utm_source=${encodeURIComponent('telegram')}`);
        utmParams.push(`utm_medium=${encodeURIComponent('bot')}`);
        utmParams.push(`utm_campaign=${encodeURIComponent('teste')}`);
        utmParams.push(`utm_term=${encodeURIComponent('comando_teste')}`);
        utmParams.push(`utm_content=${encodeURIComponent('link_teste')}`);
        const utmString = utmParams.length ? '&' + utmParams.join('&') : '';
        
        const linkTeste = `${this.frontendUrl}/obrigado_purchase_flow.html?token=${encodeURIComponent(testToken)}&valor=${valorReais}&${this.grupo}${utmString}`;
        
        // Enviar link de teste
        await this.bot.sendMessage(chatId, 
          `🧪 <b>LINK DE TESTE GERADO!</b>\n\n` +
          `💰 Valor: R$ ${valorReais}\n` +
          `🔗 Link: ${linkTeste}\n\n` +
          `✅ Token salvo no banco com status 'valido'\n` +
          `🎯 Grupo: ${this.grupo}\n` +
          `📊 UTMs incluídas\n\n` +
          `⚠️ Este link deve funcionar na página obrigado_purchase_flow.html!`,
          { parse_mode: 'HTML' }
        );
        
        console.log(`[${this.botId}] 🧪 Link de teste enviado: ${linkTeste}`);
        
      } catch (error) {
        console.error(`[${this.botId}] ❌ Erro ao gerar link de teste:`, error.message);
        await this.bot.sendMessage(chatId, 
          `❌ Erro ao gerar link de teste: ${error.message}`
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
        const rawTransacaoId = data.replace('verificar_pagamento_', '').trim();
        const transacaoIdNormalizado = rawTransacaoId ? rawTransacaoId.toLowerCase() : rawTransacaoId;

        let tokenRow = this.db
          ? this.db
              .prepare(`
                SELECT token, status, valor, price_cents, telegram_id, gateway,
                       payer_name, payer_cpf, payer_name_temp, payer_cpf_temp
                  FROM tokens
                 WHERE id_transacao = ?
                 LIMIT 1`)
              .get(transacaoIdNormalizado)
          : null;

        const precisaChecarEndpoint = !tokenRow || tokenRow.status !== 'valido' || !tokenRow.token;

        if (precisaChecarEndpoint) {
          try {
            if (!tokenRow) {
              console.log(
                `[${this.botId}] ⚠️ Registro local não encontrado para ${transacaoIdNormalizado}, consultando endpoint unificado`
              );
            } else {
              console.log(`[${this.botId}] 🔍 Verificando status via endpoint unificado: ${rawTransacaoId}`);
            }

            // Usar o endpoint unificado que suporta ambos os gateways (PushinPay + Oasyfy)
            const response = await axios.get(`${this.baseUrl}/api/payment-status/${encodeURIComponent(rawTransacaoId)}`, {
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
              }
            });

            if (response.status === 200 && response.data.success && response.data.is_paid) {
              console.log(`[${this.botId}] ✅ Pagamento confirmado via endpoint unificado: ${rawTransacaoId}`, {
                gateway: response.data.gateway,
                source: response.data.source
              });

              const gateway = response.data.gateway || tokenRow?.gateway || 'unknown';
              let tokenToUse = tokenRow?.token || null;

              if (!tokenToUse && this.pgPool) {
                try {
                  const existingPgToken = await this.pgPool.query(
                    'SELECT token FROM tokens WHERE id_transacao = $1 AND token IS NOT NULL LIMIT 1',
                    [transacaoIdNormalizado]
                  );
                  if (existingPgToken.rows.length > 0 && existingPgToken.rows[0].token) {
                    tokenToUse = existingPgToken.rows[0].token;
                  }
                } catch (pgTokenLookupError) {
                  console.error(`[${this.botId}] ❌ Erro ao consultar token existente no PG`, {
                    transaction_id: transacaoIdNormalizado,
                    error: pgTokenLookupError.message
                  });
                }
              }

              if (!tokenToUse) {
                tokenToUse = uuidv4().toLowerCase();
              }
              const eventIdPurchase = generatePurchaseEventId(transacaoIdNormalizado);

              const normalizeNumericInput = (input) => {
                if (input === null || input === undefined) return null;
                if (typeof input === 'number') {
                  return Number.isFinite(input) ? input : null;
                }
                if (typeof input === 'string') {
                  const trimmed = input.trim();
                  if (!trimmed) return null;
                  const normalized = trimmed.replace(',', '.');
                  const parsed = Number(normalized);
                  return Number.isFinite(parsed) ? parsed : null;
                }
                if (typeof input === 'bigint') {
                  return Number(input);
                }
                const coerced = Number(input);
                return Number.isFinite(coerced) ? coerced : null;
              };

              const toCents = (value, unit = 'cents') => {
                const numeric = normalizeNumericInput(value);
                if (numeric === null) return null;
                const cents = unit === 'reais' ? Math.round(numeric * 100) : Math.round(numeric);
                return Number.isFinite(cents) && cents > 0 ? cents : null;
              };

              const candidates = [
                { source: 'response.price_cents', value: toCents(response.data?.price_cents ?? response.data?.priceCents, 'cents') },
                { source: 'response.value_cents', value: toCents(response.data?.value_cents ?? response.data?.valueCents, 'cents') },
                { source: 'response.valor_centavos', value: toCents(response.data?.valor_centavos ?? response.data?.valorCentavos, 'cents') },
                { source: 'response.raw_value', value: toCents(response.data?.raw_value ?? response.data?.raw?.value, 'cents') },
                { source: 'token.price_cents', value: toCents(tokenRow?.price_cents, 'cents') },
                { source: 'token.valor', value: toCents(tokenRow?.valor, 'cents') },
                { source: 'response.valor', value: toCents(response.data?.valor, 'reais') }
              ];

              const selectedCandidate = candidates.find((entry) => entry.value !== null) || { source: 'none', value: null };
              const valorCentavos = selectedCandidate.value;

              let telegramIdParaPersistir = tokenRow?.telegram_id;
              if (!telegramIdParaPersistir) {
                telegramIdParaPersistir = chatId !== undefined && chatId !== null ? String(chatId) : null;
              }

              const paidAtIso = response.data.paid_at || new Date().toISOString();

              if (this.db) {
                try {
                  this.db
                    .prepare(`
                      INSERT INTO tokens (id_transacao, token, valor, price_cents, telegram_id, status, tipo, usado, bot_id, gateway, is_paid, paid_at)
                      VALUES (?, ?, ?, ?, ?, 'valido', 'principal', 0, ?, ?, 1, ?)
                      ON CONFLICT(id_transacao) DO UPDATE SET
                        token = excluded.token,
                        valor = COALESCE(excluded.valor, tokens.valor),
                        price_cents = COALESCE(excluded.price_cents, tokens.price_cents),
                        telegram_id = COALESCE(excluded.telegram_id, tokens.telegram_id),
                        status = 'valido',
                        tipo = COALESCE(excluded.tipo, tokens.tipo),
                        usado = 0,
                        bot_id = COALESCE(excluded.bot_id, tokens.bot_id),
                        gateway = COALESCE(excluded.gateway, tokens.gateway),
                        is_paid = 1,
                        paid_at = COALESCE(excluded.paid_at, tokens.paid_at)
                    `)
                    .run(
                      transacaoIdNormalizado,
                      tokenToUse,
                      valorCentavos,
                      valorCentavos,
                      telegramIdParaPersistir,
                      this.botId,
                      gateway,
                      paidAtIso
                    );
                  console.log(`[${this.botId}] 💾 Registro sincronizado no SQLite para ${transacaoIdNormalizado}`);
                  tokenRow = this.db
                    .prepare(`
                      SELECT token, status, valor, price_cents, telegram_id, gateway,
                             payer_name, payer_cpf, payer_name_temp, payer_cpf_temp
                        FROM tokens
                       WHERE id_transacao = ?
                       LIMIT 1`)
                    .get(transacaoIdNormalizado);
                } catch (sqliteError) {
                  console.error(
                    `[${this.botId}] ❌ Erro ao sincronizar registro no SQLite para ${transacaoIdNormalizado}:`,
                    sqliteError.message
                  );
                  tokenRow = {
                    token: tokenToUse,
                    status: 'valido',
                    valor: valorCentavos,
                    price_cents: valorCentavos,
                    telegram_id: telegramIdParaPersistir,
                    gateway
                  };
                }
              } else {
                tokenRow = {
                  token: tokenToUse,
                  status: 'valido',
                  valor: valorCentavos,
                  price_cents: valorCentavos,
                  telegram_id: telegramIdParaPersistir,
                  gateway
                };
              }

              if (this.pgPool) {
                try {
                  const tgIdNormalizado = telegramIdParaPersistir ? this.normalizeTelegramId(telegramIdParaPersistir) : null;
                  const telegramIdPg = tgIdNormalizado !== null ? String(tgIdNormalizado) : telegramIdParaPersistir;
                  const priceCentsPg = typeof valorCentavos === 'number' && Number.isFinite(valorCentavos)
                    ? Math.round(valorCentavos)
                    : null;
                  const valorReaisPg = priceCentsPg !== null ? priceCentsPg / 100 : null;
                  const currency = 'BRL';

                  let paidAtDate = null;
                  if (paidAtIso) {
                    const parsedDate = new Date(paidAtIso);
                    paidAtDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
                  }

                  const payerCpfFromResponse = response.data?.payer_cpf
                    || response.data?.payer?.cpf
                    || response.data?.payer?.national_registration
                    || null;
                  const resolvedPayerName = tokenRow?.payer_name || tokenRow?.payer_name_temp || response.data?.payer_name || null;
                  const normalizedPayerCpf = normalizeCpf(
                    payerCpfFromResponse
                    || tokenRow?.payer_cpf
                    || tokenRow?.payer_cpf_temp
                    || null
                  );
                  const resolvedPayerCpf = normalizedPayerCpf
                    || tokenRow?.payer_cpf
                    || tokenRow?.payer_cpf_temp
                    || null;

                  await this.postgres.executeQuery(
                    this.pgPool,
                    `INSERT INTO tokens (
                        id_transacao, token, telegram_id, valor, status, tipo, usado, bot_id,
                        is_paid, paid_at, event_time,
                        transaction_id, price_cents, currency, event_id_purchase, capi_ready,
                        payer_name, payer_cpf
                     )
                     VALUES ($1,$2,$3,$4,$5,'principal',$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,$15,$16)
                     ON CONFLICT (id_transacao) DO UPDATE SET
                       token = COALESCE(tokens.token, EXCLUDED.token),
                       status = 'valido',
                       tipo = EXCLUDED.tipo,
                       usado = FALSE,
                       valor = COALESCE(EXCLUDED.valor, tokens.valor),
                       telegram_id = COALESCE(EXCLUDED.telegram_id, tokens.telegram_id),
                       bot_id = COALESCE(EXCLUDED.bot_id, tokens.bot_id),
                       is_paid = TRUE,
                       paid_at = COALESCE(EXCLUDED.paid_at, tokens.paid_at),
                       event_time = COALESCE(EXCLUDED.event_time, tokens.event_time),
                       transaction_id = EXCLUDED.transaction_id,
                       price_cents = COALESCE(EXCLUDED.price_cents, tokens.price_cents),
                       currency = EXCLUDED.currency,
                       event_id_purchase = COALESCE(tokens.event_id_purchase, EXCLUDED.event_id_purchase),
                       capi_ready = TRUE,
                       payer_name = COALESCE(EXCLUDED.payer_name, tokens.payer_name),
                       payer_cpf = COALESCE(EXCLUDED.payer_cpf, tokens.payer_cpf)` ,
                    [
                      transacaoIdNormalizado,
                      tokenToUse,
                      telegramIdPg,
                      valorReaisPg,
                      'valido',
                      false,
                      this.botId,
                      true,
                      paidAtDate,
                      Math.floor(Date.now() / 1000),
                      transacaoIdNormalizado,
                      priceCentsPg,
                      currency,
                      eventIdPurchase,
                      resolvedPayerName,
                      resolvedPayerCpf
                    ]
                  );
                  console.log(`[${this.botId}] 💾 Registro sincronizado no PostgreSQL para ${transacaoIdNormalizado}`, {
                    event_id_purchase: eventIdPurchase,
                    price_cents: priceCentsPg,
                    currency
                  });
                } catch (pgError) {
                  console.error(
                    `[${this.botId}] ❌ Erro ao sincronizar registro no PostgreSQL para ${transacaoIdNormalizado}:`,
                    pgError.message
                  );
                }
              }

              if (this.pgPool && tokenRow?.telegram_id) {
                const tgId = this.normalizeTelegramId(tokenRow.telegram_id);
                if (tgId !== null) {
                  await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
                }
              }
            } else {
              console.log(`[${this.botId}] ⏳ Pagamento ainda pendente via endpoint unificado: ${rawTransacaoId}`, {
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

        if (!tokenRow || !tokenRow.token) {
          console.error(`[${this.botId}] ❌ Token não encontrado após verificação para ${transacaoIdNormalizado}`);
          return this.bot.sendMessage(chatId, this.config.pagamento.erro);
        }

        // Se chegou até aqui, o pagamento já está válido ou foi confirmado
        if (this.pgPool) {
          const tgId = this.normalizeTelegramId(chatId);
          if (tgId !== null) {
            await this.postgres.executeQuery(this.pgPool, 'UPDATE downsell_progress SET pagou = 1 WHERE telegram_id = $1', [tgId]);
          }
        }
        const priceCents = [
          toIntOrNull(tokenRow.price_cents),
          toIntOrNull(tokenRow.valor)
        ].find((value) => typeof value === 'number' && value > 0) || null;
        const valorReais = priceCents !== null ? centsToValue(priceCents) : null;
        let track = this.getTrackingData(chatId);
        if (!track) {
          track = await this.buscarTrackingData(chatId);
        }
        track = track || {};
        const paginaObrigado = this.config.paginaObrigado || 'obrigado_purchase_flow.html';
        const normalizedBaseUrl = typeof this.frontendUrl === 'string' && this.frontendUrl.trim()
          ? this.frontendUrl.trim()
          : (process.env.FRONTEND_URL || 'https://ohvips.xyz');
        const baseForUrl = normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`;
        const normalizedPath = paginaObrigado.startsWith('/') ? paginaObrigado.slice(1) : paginaObrigado;
        const linkUrl = new URL(normalizedPath || 'obrigado_purchase_flow.html', baseForUrl);
        linkUrl.searchParams.set('token', tokenRow.token);
        linkUrl.searchParams.set('grupo', this.grupo);
        linkUrl.searchParams.set('g', this.grupo);
        linkUrl.searchParams.set(this.grupo, '1');
        if (priceCents !== null) {
          linkUrl.searchParams.set('price_cents', String(priceCents));
          linkUrl.searchParams.set('valor', valorReais.toFixed(2));
        }
        const utmEntries = {
          utm_source: track.utm_source,
          utm_medium: track.utm_medium,
          utm_campaign: track.utm_campaign,
          utm_term: track.utm_term,
          utm_content: track.utm_content
        };
        Object.entries(utmEntries).forEach(([key, value]) => {
          if (value) {
            linkUrl.searchParams.set(key, value);
          }
        });
        const linkComToken = linkUrl.toString();
        console.log('[BOT-LINK]', {
          source: 'telegram_purchase_link',
          token: tokenRow.token,
          grupo: this.grupo,
          price_cents: priceCents,
          valor: valorReais !== null ? valorReais.toFixed(2) : null,
          url: linkComToken
        });
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
        
        // 1. Primeiro enviar a imagem PIX (sem texto)
        try {
          const sucessoImagem = await this.enviarMidiaComFallback(chatId, 'photo', './midia/pix_image.png');
          
          if (!sucessoImagem) {
            console.log(`[${this.botId}] ⚠️ Falha ao enviar imagem PIX via sistema otimizado, tentando upload direto`);
            await this.bot.sendPhoto(chatId, './midia/pix_image.png');
          }
        } catch (error) {
          console.log(`[${this.botId}] ⚠️ Erro ao enviar imagem PIX, continuando sem imagem:`, error.message);
        }
        
        // 2. Enviar instruções passo a passo
        const instrucoes = `✅ <b>Como realizar o pagamento:</b>

1. Abra o aplicativo do seu banco.

2. Selecione a opção "Pagar" ou "PIX".

3. Escolha "PIX Copia e Cola".

4. Cole a chave que está abaixo e finalize o pagamento com segurança.`;
        
        await this.bot.sendMessage(chatId, instrucoes, { parse_mode: 'HTML' });
        
        // 3. Enviar código PIX
        await this.bot.sendMessage(chatId, 'Copie o código abaixo:', { parse_mode: 'HTML' });
        
        // 4. Enviar código PIX
        await this.bot.sendMessage(chatId, `<pre>${pix_copia_cola}</pre>`, { parse_mode: 'HTML' });
        
        // 5. Enviar mensagem final com botões
        const botaoPagar = { text: 'EFETUEI O PAGAMENTO', callback_data: `verificar_pagamento_${transacao_id}` };
        const botaoQr = { text: 'Qr code', callback_data: `qr_code_${transacao_id}` };
        
        await this.bot.sendMessage(chatId, 'Após efetuar o pagamento, clique no botão abaixo ⬇️', {
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

    this.bot.on('message', async (msg) => {
      if (!msg?.successful_payment) {
        return;
      }

      try {
        await this.handleSuccessfulPayment(msg);
      } catch (error) {
        console.warn(`[${this.botId}] [CAPI] erro ao processar successful_payment: ${error.message}`);
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
