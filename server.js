// server.js - Arquivo de entrada único para o Render
require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('Erro não capturado:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejeição de Promise não tratada:', reason);
});

console.log('Iniciando servidor...');

const { getWhatsAppTrackingEnv } = require('./config/env');
const whatsappTrackingEnv = getWhatsAppTrackingEnv();
const whatsappPixelIdStatus = whatsappTrackingEnv.pixelId ? 'OK' : 'ausente';
const whatsappPixelTokenStatus = whatsappTrackingEnv.pixelToken ? 'OK (mascarado)' : 'ausente';
const whatsappUtmifyStatus = whatsappTrackingEnv.utmifyToken ? 'OK (mascarado)' : 'ausente';
const whatsappBaseUrlLog = whatsappTrackingEnv.baseUrl || '(não definido)';
console.log(
  `[whatsapp-env] pixelId: ${whatsappPixelIdStatus} | pixelToken: ${whatsappPixelTokenStatus} | utmifyToken: ${whatsappUtmifyStatus} | baseUrl: ${whatsappBaseUrlLog}`
);

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const crypto = require('crypto');
const axios = require('axios');
const DEFAULT_GEO_PROVIDER_URL = 'https://api.ipdata.co';
const GEO_PROVIDER_URL = (() => {
  const raw = process.env.GEO_PROVIDER_URL ? process.env.GEO_PROVIDER_URL.trim() : '';
  if (!raw) {
    return DEFAULT_GEO_PROVIDER_URL;
  }
  return raw.replace(/\/+$/, '');
})();
const GEO_API_KEY = process.env.GEO_API_KEY || null;
let lastGeoMissingKeyLog = 0;
const facebookService = require('./services/facebook');
const { sendFacebookEvent, generateEventId, checkIfEventSent, sendPurchaseCapi } = facebookService;
const { formatForCAPI } = require('./services/purchaseValidation');
const { sendPurchaseEvent, validatePurchaseReadiness } = require('./services/purchaseCapi');
const {
  extractUtmsFromSource,
  normalizeCpf,
  generatePurchaseEventId,
  isValidEmail,
  isValidPhone
} = require('./helpers/purchaseFlow');
const {
  normalizeEmail: normalizeEmailField,
  normalizePhone: normalizePhoneDigits,
  normalizeName: normalizeNameField,
  normalizeExternalId: normalizeExternalIdField,
  normalizeUrlForEventSource,
  splitName: splitNameNormalized,
  buildAdvancedMatching,
  buildNormalizationSnapshot
} = require('./shared/purchaseNormalization');
const facebookRouter = facebookService.router;
const {
  initialize: initPurchaseDedup,
  isTransactionAlreadySent,
  markPurchaseAsSent
} = require('./services/purchaseDedup');
const kwaiEventAPI = require('./services/kwaiEventAPI');
const { getInstance: getKwaiEventAPI } = kwaiEventAPI;
const protegerContraFallbacks = require('./services/protegerContraFallbacks');
const linksRoutes = require('./routes/links');
const telegramRouter = require('./routes/telegram');
const debugRouter = require('./routes/debug');
const metricsRouter = require('./routes/metrics');
const { appendDataToSheet } = require('./services/googleSheets.js');
const UnifiedPixService = require('./services/unifiedPixService');
const utmifyService = require('./services/utmify');
const funnelMetrics = require('./services/funnelMetrics');
const { cleanupExpiredPayloads, ensurePayloadIndexes, getPayloadById } = require('./services/payloads');
const { toIntOrNull, centsToValue } = require('./helpers/price');
const { savePurchaseContext } = require('./services/purchasePersistence');
const { getTelegramUserById } = require('./services/telegramUsers');
const { getInstance: getSessionTracking } = require('./services/sessionTracking');
let lastRateLimitLog = 0;

// Funções utilitárias para processamento de nome e telefone
function splitFullName(fullName) {
  return splitNameNormalized(fullName);
}

function normalizePhoneToE164(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');

  if (!cleanPhone) {
    return null;
  }

  // Se já tem código do país, retorna como está
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
    return `+${cleanPhone}`;
  }

  // Se tem 11 dígitos (celular BR) ou 10 dígitos (fixo BR), adiciona +55
  if (cleanPhone.length === 11 || cleanPhone.length === 10) {
    return `+55${cleanPhone}`;
  }

  // Para outros casos, retorna com + se não tiver
  return cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
}

function normalizeTrackingValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function extractFbclidFromFbc(fbc) {
  const normalized = normalizeTrackingValue(fbc);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/fb\.1\.[0-9]+\.([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function buildFbcFromFbclid(fbclid) {
  const normalized = normalizeTrackingValue(fbclid);
  if (!normalized) {
    return null;
  }

  return `fb.1.${Date.now()}.${normalized}`;
}

const PURCHASE_URL_UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

function buildObrigadoEventSourceUrl({ token, valor, utms = {}, extras = {} } = {}) {
  const rawFrontend = process.env.FRONTEND_URL || process.env.BASE_URL || '';
  const trimmedFrontend = typeof rawFrontend === 'string' ? rawFrontend.trim() : '';
  const normalizedFrontend = trimmedFrontend.replace(/\/+$/u, '');
  const base = normalizedFrontend || 'http://localhost:3000';
  const normalized = `${base}/obrigado_purchase_flow.html`;

  console.log(`[URL-BUILDER] frontend_url_raw=${rawFrontend || ''}`);
  console.log(`[URL-BUILDER] normalized=${normalized}`);

  const url = new URL(normalized);

  if (token) {
    url.searchParams.set('token', token);
  }

  if (valor !== null && valor !== undefined) {
    url.searchParams.set('valor', String(valor));
  }

  for (const field of PURCHASE_URL_UTM_FIELDS) {
    const value = utms && typeof utms === 'object' ? utms[field] : null;
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(field, String(value));
    }
  }

  if (extras && typeof extras === 'object') {
    for (const [key, value] of Object.entries(extras)) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const finalUrl = url.toString();
  console.log(`[URL-BUILDER] final_event_source_url=${finalUrl}`);

  return {
    rawFrontend,
    normalizedBase: base,
    normalizedUrl: normalized,
    finalUrl
  };
}

async function resolveFbcFbp(params = {}, options = {}) {
  const { token: rawToken = null, telegram_id: rawTelegramId = null } = params || {};
  const { logPrefix = '[PURCHASE-CAPI][RESOLVE]' } = options || {};

  let sanitizedToken = normalizeTrackingValue(rawToken);
  if (!sanitizedToken && rawToken !== null && rawToken !== undefined && typeof rawToken !== 'string') {
    sanitizedToken = normalizeTrackingValue(String(rawToken));
  }

  let sanitizedTelegramId = normalizeTrackingValue(rawTelegramId);
  if (!sanitizedTelegramId && rawTelegramId !== null && rawTelegramId !== undefined && typeof rawTelegramId !== 'string') {
    sanitizedTelegramId = normalizeTrackingValue(String(rawTelegramId));
  }

  if (!pool) {
    if (logPrefix) {
      console.warn(
        `${logPrefix} pool_unavailable token=${sanitizedToken || 'vazio'} telegram_id=${sanitizedTelegramId || 'vazio'}`
      );
    }

    return {
      fbc: null,
      fbp: null,
      fbclid: null,
      fbc_source: 'none',
      fbp_source: 'none',
      fbclid_source: null,
      telegram_id: sanitizedTelegramId,
      payload_id: sanitizedToken,
      built_from_fbclid: false,
      persisted: false
    };
  }

  const debugScope = '[TRACKING-RESOLVE]';
  let tokenRow = null;

  if (sanitizedToken) {
    try {
      const tokenQuery = await pool.query(
        'SELECT token, telegram_id, fbc, fbp FROM tokens WHERE token = $1 LIMIT 1',
        [sanitizedToken]
      );
      tokenRow = tokenQuery.rows[0] || null;
    } catch (error) {
      console.error(`${debugScope} erro ao buscar token=${sanitizedToken}:`, error.message);
    }
  }

  if (!sanitizedTelegramId && tokenRow && tokenRow.telegram_id !== null && tokenRow.telegram_id !== undefined) {
    sanitizedTelegramId = normalizeTrackingValue(tokenRow.telegram_id);
  }

  let payloadRow = null;
  if (sanitizedToken) {
    try {
      payloadRow = await getPayloadById(sanitizedToken);
    } catch (error) {
      console.error(`${debugScope} erro ao buscar payload_id=${sanitizedToken}:`, error.message);
    }
  }

  let payloadTrackingRow = null;
  if (sanitizedToken) {
    try {
      const payloadTrackingResult = await pool.query(
        'SELECT fbc, fbp FROM payload_tracking WHERE payload_id = $1 LIMIT 1',
        [sanitizedToken]
      );
      payloadTrackingRow = payloadTrackingResult.rows[0] || null;
    } catch (error) {
      console.error(`${debugScope} erro ao buscar payload_tracking payload_id=${sanitizedToken}:`, error.message);
    }
  }

  let trackingDataRow = null;
  if (sanitizedTelegramId) {
    try {
      const trackingDataResult = await pool.query(
        'SELECT fbc, fbp FROM tracking_data WHERE telegram_id = $1 LIMIT 1',
        [sanitizedTelegramId]
      );
      trackingDataRow = trackingDataResult.rows[0] || null;
    } catch (error) {
      console.error(`${debugScope} erro ao buscar tracking_data telegram_id=${sanitizedTelegramId}:`, error.message);
    }
  }

  let telegramUserRow = null;
  if (sanitizedTelegramId) {
    try {
      telegramUserRow = await getTelegramUserById(sanitizedTelegramId);
    } catch (error) {
      console.error(`${debugScope} erro ao buscar telegram_user telegram_id=${sanitizedTelegramId}:`, error.message);
    }
  }

  let sessionTrackingData = null;
  if (sanitizedTelegramId) {
    try {
      const sessionTracking = getSessionTracking();
      sessionTrackingData = sessionTracking ? sessionTracking.getTrackingData(sanitizedTelegramId) : null;
    } catch (error) {
      console.error(`${debugScope} erro ao buscar sessionTracking telegram_id=${sanitizedTelegramId}:`, error.message);
    }
  }

  const presellCandidate = payloadRow
    ? {
        fbc: normalizeTrackingValue(payloadRow.fbc),
        fbp: normalizeTrackingValue(payloadRow.fbp),
        fbclid: normalizeTrackingValue(payloadRow.fbclid) || extractFbclidFromFbc(payloadRow.fbc)
      }
    : null;

  const telegramCandidate = payloadRow
    ? {
        fbc: normalizeTrackingValue(payloadRow.telegram_entry_fbc),
        fbp: normalizeTrackingValue(payloadRow.telegram_entry_fbp),
        fbclid: normalizeTrackingValue(payloadRow.telegram_entry_fbclid)
      }
    : null;

  const cacheCandidates = [];

  if (payloadTrackingRow) {
    cacheCandidates.push({
      fbc: normalizeTrackingValue(payloadTrackingRow.fbc),
      fbp: normalizeTrackingValue(payloadTrackingRow.fbp),
      fbclid: extractFbclidFromFbc(payloadTrackingRow.fbc)
    });
  }

  if (trackingDataRow) {
    cacheCandidates.push({
      fbc: normalizeTrackingValue(trackingDataRow.fbc),
      fbp: normalizeTrackingValue(trackingDataRow.fbp),
      fbclid: extractFbclidFromFbc(trackingDataRow.fbc)
    });
  }

  if (sessionTrackingData) {
    cacheCandidates.push({
      fbc: normalizeTrackingValue(sessionTrackingData.fbc),
      fbp: normalizeTrackingValue(sessionTrackingData.fbp),
      fbclid:
        normalizeTrackingValue(sessionTrackingData.fbclid) || extractFbclidFromFbc(sessionTrackingData.fbc)
    });
  }

  if (telegramUserRow) {
    cacheCandidates.push({
      fbc: normalizeTrackingValue(telegramUserRow.fbc),
      fbp: normalizeTrackingValue(telegramUserRow.fbp),
      fbclid:
        normalizeTrackingValue(telegramUserRow.fbclid) || extractFbclidFromFbc(telegramUserRow.fbc)
    });
  }

  const leadCandidate = tokenRow
    ? {
        fbc: normalizeTrackingValue(tokenRow.fbc),
        fbp: normalizeTrackingValue(tokenRow.fbp),
        fbclid: extractFbclidFromFbc(tokenRow.fbc)
      }
    : null;

  let finalFbc = null;
  let finalFbp = null;
  let finalFbclid = null;
  let fbcSource = 'none';
  let fbpSource = 'none';
  let fbclidSource = null;

  const applyCandidate = (sourceLabel, candidate) => {
    if (!candidate) {
      return;
    }

    if (!finalFbc && candidate.fbc) {
      finalFbc = candidate.fbc;
      fbcSource = sourceLabel;
    }

    if (!finalFbp && candidate.fbp) {
      finalFbp = candidate.fbp;
      fbpSource = sourceLabel;
    }

    if (!finalFbclid && candidate.fbclid) {
      finalFbclid = candidate.fbclid;
      fbclidSource = sourceLabel;
    }
  };

  applyCandidate('presell', presellCandidate);
  applyCandidate('telegram', telegramCandidate);
  for (const candidate of cacheCandidates) {
    applyCandidate('cache', candidate);
  }
  applyCandidate('lead', leadCandidate);

  let builtFromFbclid = false;
  if (!finalFbc && finalFbclid) {
    const constructed = buildFbcFromFbclid(finalFbclid);
    if (constructed) {
      finalFbc = constructed;
      builtFromFbclid = true;
      if (fbcSource === 'none') {
        fbcSource = fbclidSource || 'cache';
      }
    }
  }

  if (!finalFbclid && finalFbc) {
    finalFbclid = extractFbclidFromFbc(finalFbc);
    if (finalFbclid && fbclidSource === null) {
      fbclidSource = fbcSource !== 'none' ? fbcSource : 'lead';
    }
  }

  const payloadId = sanitizedToken;
  let persisted = false;

  if (payloadId && (finalFbc || finalFbp || finalFbclid)) {
    const setClauses = [];
    const values = [payloadId];
    let index = 2;

    const payloadFbc = payloadRow ? normalizeTrackingValue(payloadRow.fbc) : null;
    const payloadFbp = payloadRow ? normalizeTrackingValue(payloadRow.fbp) : null;
    const payloadFbclid = payloadRow
      ? normalizeTrackingValue(payloadRow.telegram_entry_fbclid || payloadRow.fbclid)
      : null;

    if (finalFbc && (!payloadFbc || payloadFbc !== finalFbc)) {
      setClauses.push(`fbc = $${index++}`);
      values.push(finalFbc);
    }

    if (finalFbp && (!payloadFbp || payloadFbp !== finalFbp)) {
      setClauses.push(`fbp = $${index++}`);
      values.push(finalFbp);
    }

    if (finalFbclid && (!payloadFbclid || payloadFbclid !== finalFbclid)) {
      setClauses.push(`telegram_entry_fbclid = $${index++}`);
      values.push(finalFbclid);
    }

    if (setClauses.length > 0) {
      try {
        await pool.query(`UPDATE payloads SET ${setClauses.join(', ')} WHERE payload_id = $1`, values);
        persisted = true;
      } catch (error) {
        console.error(`${debugScope} erro ao atualizar payload_id=${payloadId}:`, error.message);
      }
    }
  }

  if (logPrefix) {
    console.log(
      `${logPrefix} token=${sanitizedToken || 'vazio'} telegram_id=${sanitizedTelegramId || 'vazio'} ` +
        `fbc_source=${fbcSource} fbp_source=${fbpSource} fbc=${finalFbc || 'vazio'} fbp=${finalFbp || 'vazio'}`
    );
  }

  if (builtFromFbclid && logPrefix) {
    console.log(`${logPrefix} constructed_fbc payload_id=${payloadId || 'vazio'} fbclid=${finalFbclid || 'vazio'}`);
  }

  return {
    fbc: finalFbc || null,
    fbp: finalFbp || null,
    fbclid: finalFbclid || null,
    fbc_source: fbcSource,
    fbp_source: fbpSource,
    fbclid_source: fbclidSource,
    telegram_id: sanitizedTelegramId,
    payload_id: payloadId,
    built_from_fbclid: builtFromFbclid,
    persisted
  };
}

/**
 * Verifica se um IP é privado (RFC 1918, loopback, etc.)
 * IPs privados não são aceitos pelo Meta CAPI para matching
 */
function isPrivateIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return true;
  }

  // Remover prefixo IPv6-to-IPv4 se existir
  const cleanIp = ip.replace(/^::ffff:/, '');
  
  // Validar formato IPv4 básico
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Pattern.test(cleanIp)) {
    // Se não for IPv4 válido
    // Verificar se é IPv6 loopback
    if (cleanIp === '::1' || cleanIp === 'localhost') {
      return true;
    }
    // Para IPv6 público válido (ex: 2001:db8::1), aceitar como público
    // Para IPs malformados ou inválidos, rejeitar como privado (mais seguro)
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv6Pattern.test(cleanIp)) {
      // IPv6 válido e não é loopback - aceitar como público
      return false;
    }
    // IP inválido/malformado - tratar como privado
    return true;
  }

  const parts = cleanIp.split('.').map(Number);
  
  // Verificar se todos os octetos estão no range válido
  if (parts.some(part => part < 0 || part > 255 || isNaN(part))) {
    return true;
  }

  const [a, b, c, d] = parts;

  // RFC 1918 - Private IPv4 ranges
  // 10.0.0.0 - 10.255.255.255 (10.0.0.0/8)
  if (a === 10) {
    return true;
  }

  // 172.16.0.0 - 172.31.255.255 (172.16.0.0/12)
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  // 192.168.0.0 - 192.168.255.255 (192.168.0.0/16)
  if (a === 192 && b === 168) {
    return true;
  }

  // Loopback (127.0.0.0/8)
  if (a === 127) {
    return true;
  }

  // Link-local (169.254.0.0/16)
  if (a === 169 && b === 254) {
    return true;
  }

  // Localhost
  if (cleanIp === '0.0.0.0' || cleanIp === 'localhost') {
    return true;
  }

  return false;
}

/**
 * Extrai o IP real do cliente, ignorando IPs privados
 * Prioriza X-Forwarded-For e pega o primeiro IP público da cadeia
 */
function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  
  if (forwarded) {
    const segments = forwarded
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    
    // Percorrer os IPs da esquerda para direita (do cliente para o servidor)
    // e retornar o primeiro IP público encontrado
    for (const ip of segments) {
      if (!isPrivateIP(ip)) {
        console.log('[IP-CAPTURE] IP público encontrado no X-Forwarded-For:', ip);
        return ip;
      }
    }
    
    console.warn('[IP-CAPTURE] ⚠️ Apenas IPs privados encontrados no X-Forwarded-For:', segments);
  }

  // Fallback para req.ip
  if (req.ip && !isPrivateIP(req.ip)) {
    console.log('[IP-CAPTURE] IP público encontrado em req.ip:', req.ip);
    return req.ip;
  }

  // Fallback para req.connection.remoteAddress
  if (req.connection && req.connection.remoteAddress) {
    const remoteIp = req.connection.remoteAddress;
    if (!isPrivateIP(remoteIp)) {
      console.log('[IP-CAPTURE] IP público encontrado em remoteAddress:', remoteIp);
      return remoteIp;
    }
  }

  // Fallback para req.socket.remoteAddress
  if (req.socket && req.socket.remoteAddress) {
    const socketIp = req.socket.remoteAddress;
    if (!isPrivateIP(socketIp)) {
      console.log('[IP-CAPTURE] IP público encontrado em socket.remoteAddress:', socketIp);
      return socketIp;
    }
  }

  // Fallback para req.connection.socket.remoteAddress
  if (req.connection && req.connection.socket && req.connection.socket.remoteAddress) {
    const connectionSocketIp = req.connection.socket.remoteAddress;
    if (!isPrivateIP(connectionSocketIp)) {
      console.log('[IP-CAPTURE] IP público encontrado em connection.socket.remoteAddress:', connectionSocketIp);
      return connectionSocketIp;
    }
  }

  console.warn('[IP-CAPTURE] ⚠️ Nenhum IP público encontrado. Headers disponíveis:', {
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip'],
    'req.ip': req.ip
  });

  return null;
}

function parseWebhookTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000);
    }
  }

  return null;
}

function resolveValueInCents(...values) {
  for (let index = 0; index < values.length; index += 1) {
    const candidate = values[index];
    if (candidate === null || candidate === undefined) {
      continue;
    }
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    if (numeric === 0) {
      continue;
    }
    return Math.round(numeric);
  }
  return null;
}

function normalizeClientIp(ip) {
  if (!ip || typeof ip !== 'string') {
    return null;
  }

  const trimmed = ip.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }

  if (trimmed === '::1') {
    return '127.0.0.1';
  }

  return trimmed;
}

function generateRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function isPrivateIp(ip) {
  if (!ip) {
    return true;
  }

  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) {
    return true;
  }

  if (ip.startsWith('172.')) {
    const segments = ip.split('.');
    if (segments.length > 1) {
      const secondOctet = parseInt(segments[1], 10);
      if (!Number.isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }

  return false;
}

const bot1 = require('./MODELO1/BOT/bot1');
const bot2 = require('./MODELO1/BOT/bot2');
const botEspecial = require('./MODELO1/BOT/bot_especial');
const bot4 = require('./MODELO1/BOT/bot4');
const bot5 = require('./MODELO1/BOT/bot5');
const bot6 = require('./MODELO1/BOT/bot6');
const bot7 = require('./MODELO1/BOT/bot7');
const sqlite = require('./database/sqlite');
const bots = new Map();

/**
 * Função para acessar instâncias dos bots por bot_id
 * @param {string} botId - ID do bot (bot1, bot2, bot_especial, etc.)
 * @returns {Object|null} Instância do bot ou null se não encontrado
 */
function getBotService(botId) {
  const botInstance = bots.get(botId);
  if (!botInstance) {
    console.warn(`⚠️ Bot não encontrado: ${botId}`);
    return null;
  }
  return botInstance;
}

/**
 * Gera token de acesso para o usuário
 * @param {Object} transaction - Dados da transação
 * @returns {string} Token de acesso
 */
async function gerarTokenAcesso(transaction) {
  // Usar o token já existente da transação se disponível
  if (transaction.token) {
    return transaction.token;
  }
  
  // Gerar novo token baseado no ID da transação
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(`${transaction.id_transacao}_${Date.now()}`).digest('hex').substring(0, 32);
}

/**
 * Verifica e cria colunas necessárias para o WhatsApp
 * @param {Object} pool - Pool de conexões PostgreSQL
 */
async function verificarColunasWhatsApp(pool) {
  try {
    console.log('🔍 Verificando colunas do WhatsApp...');
    
    // Verificar se as colunas existem
    const columnsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tokens'
      AND column_name IN ('tipo', 'descricao', 'nome', 'telefone', 'city')
    `);
    
    const existingColumns = columnsResult.rows.map(row => row.column_name);
    
    // Adicionar coluna 'tipo' se não existir
    if (!existingColumns.includes('tipo')) {
      console.log('➕ Adicionando coluna "tipo" para WhatsApp...');
      await pool.query(`
        ALTER TABLE tokens ADD COLUMN tipo TEXT DEFAULT 'principal'
      `);
      console.log('✅ Coluna "tipo" adicionada');
    } else {
      console.log('✅ Coluna "tipo" já existe');
    }
    
    // Adicionar coluna 'descricao' se não existir
    if (!existingColumns.includes('descricao')) {
      console.log('➕ Adicionando coluna "descricao" para WhatsApp...');
      await pool.query(`
        ALTER TABLE tokens ADD COLUMN descricao TEXT
      `);
      console.log('✅ Coluna "descricao" adicionada');
    } else {
      console.log('✅ Coluna "descricao" já existe');
    }

    // Adicionar coluna 'nome' se não existir
    if (!existingColumns.includes('nome')) {
      console.log('➕ Adicionando coluna "nome" para WhatsApp...');
      await pool.query(`
        ALTER TABLE tokens ADD COLUMN nome TEXT
      `);
      console.log('✅ Coluna "nome" adicionada');
    } else {
      console.log('✅ Coluna "nome" já existe');
    }

    // Adicionar coluna 'telefone' se não existir
    if (!existingColumns.includes('telefone')) {
      console.log('➕ Adicionando coluna "telefone" para WhatsApp...');
      await pool.query(`
        ALTER TABLE tokens ADD COLUMN telefone TEXT
      `);
      console.log('✅ Coluna "telefone" adicionada');
    } else {
      console.log('✅ Coluna "telefone" já existe');
    }

    if (!existingColumns.includes('city')) {
      console.log('➕ Adicionando coluna "city" para WhatsApp...');
      await pool.query(`
        ALTER TABLE tokens ADD COLUMN city TEXT
      `);
      console.log('✅ Coluna "city" adicionada');
    } else {
      console.log('✅ Coluna "city" já existe');
    }
    
    // Atualizar registros existentes que não têm tipo definido
    const updateResult = await pool.query(`
      UPDATE tokens 
      SET tipo = 'principal' 
      WHERE tipo IS NULL OR tipo = ''
    `);
    
    if (updateResult.rowCount > 0) {
      console.log(`🔄 ${updateResult.rowCount} registros atualizados com tipo 'principal'`);
    }
    
    console.log('✅ Colunas do WhatsApp verificadas com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao verificar colunas do WhatsApp:', error.message);
    throw error;
  }
}

const initPostgres = require("./init-postgres");
initPostgres();

// Inicializar SQLite
console.log('🔄 Inicializando SQLite...');
const sqliteDb = sqlite.initialize('./pagamentos.db');
if (sqliteDb) {
  console.log('✅ SQLite inicializado com sucesso');
} else {
  console.error('❌ Erro ao inicializar SQLite');
}

// Inicializar sistema de deduplicação de Purchase
let pool = null;
let unifiedPixService = null;

function ensureUnifiedPixServiceInitialized(context = 'startup') {
  if (unifiedPixService) {
    return;
  }

  try {
    unifiedPixService = new UnifiedPixService();
    console.log(`🎯 Serviço unificado de PIX inicializado (${context})`);
  } catch (error) {
    console.error(`❌ Falha ao inicializar serviço unificado de PIX (${context}):`, error.message);
  }
}

ensureUnifiedPixServiceInitialized();

initPostgres().then(async (databasePool) => {
  pool = databasePool;
  initPurchaseDedup(pool);

  // Verificar e criar colunas do WhatsApp se necessário
  try {
    await verificarColunasWhatsApp(pool);
  } catch (error) {
    console.error('❌ Erro ao verificar colunas do WhatsApp:', error);
  }

  try {
    await ensurePayloadIndexes();
    await funnelMetrics.ensureIndexes();
    console.log('[db] índices de payloads e funil verificados');
  } catch (error) {
    console.warn('[db] falha ao garantir índices', { error: error.message });
  }

  // Garantir que o serviço unificado de PIX esteja disponível mesmo que o Postgres demore
  ensureUnifiedPixServiceInitialized('post-init');
  console.log('🔥 Sistema de deduplicação de Purchase inicializado');
}).catch((error) => {
  console.error('❌ Erro ao inicializar sistema de deduplicação:', error);
  ensureUnifiedPixServiceInitialized('post-init-failure');
});

cron.schedule('0 2 * * *', async () => {
  const jobRequestId = generateRequestId();
  try {
    const payloadResult = await cleanupExpiredPayloads({ olderThanHours: 72 });
    let funnelResult = { deleted: 0 };
    try {
      funnelResult = await funnelMetrics.cleanupOldEvents({ olderThanDays: 30 });
    } catch (funnelError) {
      console.warn('[maintenance] falha ao limpar funnel_events', {
        req_id: jobRequestId,
        error: funnelError.message
      });
    }

    console.log('[maintenance] limpeza concluída', {
      req_id: jobRequestId,
      payloads_deleted: payloadResult.deleted,
      funnel_events_deleted: funnelResult.deleted
    });
  } catch (error) {
    console.error('[maintenance] falha na limpeza de payloads', {
      req_id: jobRequestId,
      error: error.message
    });
  }
});

// Heartbeat para indicar que o bot está ativo (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    const horario = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    console.log(`Uptime OK — ${horario}`);
  }, 5 * 60 * 1000);
}


// Verificar variáveis de ambiente
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_TOKEN_BOT2 = process.env.TELEGRAM_TOKEN_BOT2;
const TELEGRAM_TOKEN_ESPECIAL = process.env.TELEGRAM_TOKEN_ESPECIAL;
const sanitizeUrl = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const rawBaseUrl = sanitizeUrl(process.env.BASE_URL);
const fallbackBaseUrl = sanitizeUrl(process.env.FRONTEND_URL);
const BASE_URL = rawBaseUrl || fallbackBaseUrl;
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const URL_ENVIO_1 = process.env.URL_ENVIO_1;
const URL_ENVIO_2 = process.env.URL_ENVIO_2;
const URL_ENVIO_3 = process.env.URL_ENVIO_3;
const URL_ENVIO_4 = process.env.URL_ENVIO_4;
const URL_ENVIO_5 = process.env.URL_ENVIO_5;
const URL_ENVIO_6 = process.env.URL_ENVIO_6;
const URL_ENVIO_7 = process.env.URL_ENVIO_7;
const URL_ENVIO_8 = process.env.URL_ENVIO_8;
const URL_ENVIO_9 = process.env.URL_ENVIO_9;
const URL_ENVIO_10 = process.env.URL_ENVIO_10;

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN não definido');
}
if (!TELEGRAM_TOKEN_BOT2) {
  console.error('TELEGRAM_TOKEN_BOT2 não definido');
}
if (!TELEGRAM_TOKEN_ESPECIAL) {
  console.error('TELEGRAM_TOKEN_ESPECIAL não definido');
}

if (!rawBaseUrl && BASE_URL) {
  console.warn(`BASE_URL não definido — usando fallback: ${BASE_URL}`);
}
if (!BASE_URL) {
  console.error('BASE_URL não definido');
}
if (!URL_ENVIO_1) {
  console.warn('URL_ENVIO_1 não definido');
}
if (!URL_ENVIO_2) {
  console.warn('URL_ENVIO_2 não definido');
}
if (!URL_ENVIO_3) {
  console.warn('URL_ENVIO_3 não definido');
}
if (!URL_ENVIO_4) {
  console.warn('URL_ENVIO_4 não definido');
}
if (!URL_ENVIO_5) {
  console.warn('URL_ENVIO_5 não definido');
}
if (!URL_ENVIO_6) {
  console.warn('URL_ENVIO_6 não definido');
}
if (!URL_ENVIO_7) {
  console.warn('URL_ENVIO_7 não definido');
}
if (!URL_ENVIO_8) {
  console.warn('URL_ENVIO_8 não definido');
}
if (!URL_ENVIO_9) {
  console.warn('URL_ENVIO_9 não definido');
}
if (!URL_ENVIO_10) {
  console.warn('URL_ENVIO_10 não definido');
}

// Inicializar Express
const app = express();

// Middleware para remover headers COOP/COEP
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  next();
});

app.use((req, res, next) => {
  const incomingHeader = req.get ? req.get('x-request-id') : null;
  const trimmedHeader = typeof incomingHeader === 'string' ? incomingHeader.trim().slice(0, 64) : null;
  const isValidHeader = trimmedHeader && /^[A-Za-z0-9-]{8,64}$/.test(trimmedHeader);
  const requestId = isValidHeader ? trimmedHeader : generateRequestId();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  next();
});

app.use(facebookRouter);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Middlewares básicos
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  noCache: false // Permitir cache
}));
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
if (process.env.NODE_ENV === 'production') {
  app.use(
    helmet.hsts({
      maxAge: 15552000,
      includeSubDomains: true,
      preload: true
    })
  );
}
app.use(compression());
const normalizedOrigins = [process.env.BASE_URL, process.env.FRONTEND_URL]
  .map(value => (typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''))
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
app.use(
  cors({
    origin(origin, callback) {
      if (!isProduction) {
        return callback(null, true);
      }

      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (normalizedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Request-Id'],
    maxAge: 600,
    optionsSuccessStatus: 204
  })
);
app.use((err, req, res, next) => {
  if (err && err.message === 'CORS not allowed') {
    const requestId = req.requestId || null;
    console.warn('[security] origem bloqueada por CORS', {
      req_id: requestId,
      has_origin: Boolean(req.headers.origin)
    });
    return res.status(403).json({ ok: false, error: 'forbidden_origin' });
  }
  return next(err);
});
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const obrigadoStaticRoot = path.resolve(__dirname, 'MODELO1', 'WEB');
const publicStaticRoot = path.resolve(__dirname, 'public');
const sharedStaticRoot = path.resolve(__dirname, 'shared');
let obrigadoFirstServeLogged = false;

if (fs.existsSync(obrigadoStaticRoot)) {
  console.log(`[STATIC] root=${obrigadoStaticRoot} route=/`);
  app.use(express.static(obrigadoStaticRoot, {
    index: false,
    maxAge: '1d',
    etag: false,
    setHeaders: (res, servedPath) => {
      if (!obrigadoFirstServeLogged && servedPath.endsWith(`${path.sep}obrigado_purchase_flow.html`)) {
        console.log(`[STATIC] served /obrigado_purchase_flow.html from ${servedPath}`);
        obrigadoFirstServeLogged = true;
      }

      if (servedPath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(servedPath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
      }

      res.setHeader('Vary', 'Accept-Encoding');
    }
  }));
} else if (fs.existsSync(publicStaticRoot)) {
  console.log(`[STATIC] root=${publicStaticRoot} route=/`);
  app.use(express.static(publicStaticRoot, {
    index: false,
    maxAge: '1d',
    etag: false,
    setHeaders: (res, servedPath) => {
      if (servedPath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(servedPath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
      }

      res.setHeader('Vary', 'Accept-Encoding');
    }
  }));
}

if (fs.existsSync(sharedStaticRoot)) {
  app.use('/shared', express.static(sharedStaticRoot, {
    index: false,
    maxAge: '1d',
    etag: false,
    setHeaders: (res, servedPath) => {
      if (servedPath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      res.setHeader('Vary', 'Accept-Encoding');
    }
  }));
}

const obrigadoPurchaseFlowLocations = [
  path.resolve(__dirname, 'MODELO1', 'WEB', 'obrigado_purchase_flow.html'),
  path.resolve(__dirname, 'public', 'obrigado_purchase_flow.html')
];

const resolveObrigadoPurchaseFlowPath = () => {
  for (const location of obrigadoPurchaseFlowLocations) {
    if (fs.existsSync(location)) {
      return location;
    }
  }

  return null;
};

app.get(['/obrigado_purchase_flow', '/obrigado_purchase_flow/'], (req, res) => {
  const resolvedPath = resolveObrigadoPurchaseFlowPath();

  if (!resolvedPath) {
    res.status(404).json({ erro: 'Página não encontrada' });
    return;
  }

  res.sendFile(resolvedPath);
});

const telegramWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const normalized = normalizeClientIp(req.ip || '');
    return normalized === '127.0.0.1';
  },
  handler: (req, res) => {
    const requestId = req.requestId || null;
    console.warn('[rate-limit] /telegram/webhook bloqueado', {
      req_id: requestId,
      ip_present: Boolean(req.ip)
    });
    res.status(429).json({ ok: false, error: 'rate_limited' });
  }
});

app.use('/debug', debugRouter);
// Servir dashboard de métricas (estático)
app.use('/metrics', express.static(path.join(__dirname, 'public/metrics')));
app.use('/metrics', metricsRouter);
app.use('/telegram/webhook', telegramWebhookLimiter);

app.get('/api/geo', async (req, res) => {
  const rawIp = extractClientIp(req);
  const normalizedIp = normalizeClientIp(rawIp);
  const lookupIp = normalizedIp && !isPrivateIp(normalizedIp) ? normalizedIp : '';

  if (!GEO_API_KEY) {
    const now = Date.now();
    if (!lastGeoMissingKeyLog || now - lastGeoMissingKeyLog > 60000) {
      console.warn('[geo] GEO_API_KEY não configurada');
      lastGeoMissingKeyLog = now;
    }

    return res.json({
      city: null,
      region: null,
      country: null,
      postal: null,
      ip: normalizedIp || null,
    });
  }

  try {
    const lookupPath = lookupIp ? `/${encodeURIComponent(lookupIp)}` : '';
    const url = `${GEO_PROVIDER_URL}${lookupPath}?api-key=${encodeURIComponent(GEO_API_KEY)}`;
    const response = await axios.get(url, { timeout: 4000 });
    const data = response.data || {};

    const city = data.city || null;
    const region = data.region || data.region_name || data.regionName || data.region_code || null;
    const country =
      data.country_code || data.countryCode || data.country || data.country_name || null;
    const postal = data.postal || data.postal_code || data.zip || null;
    const resolvedIp = data.ip || normalizedIp || (lookupIp || null);

    return res.json({
      city,
      region,
      country,
      postal,
      ip: resolvedIp,
    });
  } catch (error) {
    const status = error.response?.status;
    const code = error.code;
    const labelParts = [];
    if (status) {
      labelParts.push(`status=${status}`);
    }
    if (code) {
      labelParts.push(`code=${code}`);
    }
    const label = labelParts.length > 0 ? labelParts.join(' ') : 'erro';
    console.warn(`[geo] lookup falhou (${label})`);

    return res.json({
      city: null,
      region: null,
      country: null,
      postal: null,
      ip: normalizedIp || null,
    });
  }
});

// Rotas de redirecionamento
app.use('/', linksRoutes);
app.use(telegramRouter);

// Handler unificado de webhook por bot (Telegram ou PushinPay)
function criarRotaWebhook(botId) {
  return async (req, res) => {
    const botInstance = bots.get(botId);
    if (!botInstance) return res.status(404).json({ error: 'Bot não encontrado' });

    // Tentar parsear o corpo caso venha como texto
    let parsed = req.body;
    if (typeof req.body === 'string') {
      try {
        parsed = JSON.parse(req.body);
      } catch (err) {
        console.error('JSON malformado:', err.message);
        return res.status(400).json({ error: 'JSON inválido' });
      }
    }

    // Se for payload do Telegram
    const isTelegram = parsed && (parsed.update_id || parsed.message || parsed.callback_query);
    if (isTelegram) {
      if (botInstance.bot) {
        botInstance.bot.processUpdate(parsed);
        return res.sendStatus(200);
      }
      return res.sendStatus(500);
    }

    // Caso contrário tratar como webhook da PushinPay
    if (typeof botInstance.webhookPushinPay === 'function') {
      req.body = parsed; // manter compatibilidade com TelegramBotService
      await botInstance.webhookPushinPay(req, res);
    } else {
      res.status(404).json({ error: 'Webhook PushinPay não disponível' });
    }
  };
}

// Webhook para BOT 1
app.post('/bot1/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot1'));

// Webhook para BOT 2
app.post('/bot2/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot2'));

// Webhook para BOT ESPECIAL
app.post('/bot_especial/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot_especial'));

// Webhook para BOT 4
app.post('/bot4/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot4'));

// Webhook para BOT 5
app.post('/bot5/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot5'));

// Webhook para BOT 6
app.post('/bot6/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot6'));

// Webhook para BOT 7
app.post('/bot7/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot7'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => {
    const ignorar = req.path === '/health' || req.path === '/health-basic';
    if (ignorar) {
      const agora = Date.now();
      if (agora - lastRateLimitLog > 60 * 60 * 1000) {
        console.log('Ignorando rate-limit para', req.path);
        lastRateLimitLog = agora;
      }
    }
    return ignorar;
  }
});
app.use(limiter);

// Logging simplificado
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && process.env.NODE_ENV !== 'production') {
    console.log(`API: ${req.method} ${req.path}`);
  }
  next();
});

async function processarCapiWhatsApp({ pool, token, dadosToken: providedDadosToken }) {
  if (!pool) {
    console.log(`❌ [WhatsApp] CAPI abortado: pool indisponível para token ${token}`);
    return { userDataHash: null };
  }

  let dadosToken = providedDadosToken;

  if (!dadosToken) {
    const tokenCompleto = await pool.query(
      `SELECT token, valor, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              fbp, fbc, ip_criacao, user_agent_criacao, event_time, criado_em,
              fn_hash, ln_hash, external_id_hash, pixel_sent, capi_sent, cron_sent, telegram_id,
              capi_ready, capi_processing
       FROM tokens WHERE token = $1`,
      [token]
    );

    if (tokenCompleto.rows.length === 0) {
      console.log(`❌ [WhatsApp] CAPI abortado: token ${token} não encontrado para processamento`);
      return { userDataHash: null };
    }

    dadosToken = tokenCompleto.rows[0];
  }

  const { getInstance: getSessionTracking } = require('./services/sessionTracking');
  if (dadosToken.telegram_id && (!dadosToken.fbp || !dadosToken.fbc)) {
    try {
      const sessionTracking = getSessionTracking();
      const sessionData = sessionTracking.getTrackingData(dadosToken.telegram_id);

      if (sessionData) {
        if (!dadosToken.fbp && sessionData.fbp) {
          dadosToken.fbp = sessionData.fbp;
          console.log(`FBP recuperado do SessionTracking para token ${token} (telegram_id: ${dadosToken.telegram_id})`);
        }
        if (!dadosToken.fbc && sessionData.fbc) {
          dadosToken.fbc = sessionData.fbc;
          console.log(`FBC recuperado do SessionTracking para token ${token} (telegram_id: ${dadosToken.telegram_id})`);
        }
        if (!dadosToken.ip_criacao && sessionData.ip) {
          dadosToken.ip_criacao = sessionData.ip;
        }
        if (!dadosToken.user_agent_criacao && sessionData.user_agent) {
          dadosToken.user_agent_criacao = sessionData.user_agent;
        }
      }
    } catch (error) {
      console.warn('Erro ao buscar dados do SessionTracking para token:', error.message);
    }
  }

  let userDataHash = null;
  if (dadosToken.fn_hash || dadosToken.ln_hash || dadosToken.external_id_hash) {
    userDataHash = {
      fn: dadosToken.fn_hash,
      ln: dadosToken.ln_hash,
      external_id: dadosToken.external_id_hash
    };
  }

  const hasCapiValue = dadosToken.valor !== null && dadosToken.valor !== undefined;
  let shouldProcessWhatsAppCapi = true;

  if (!hasCapiValue) {
    console.log(`❌ [WhatsApp] CAPI abortado: valor ausente para token ${token}`);
    shouldProcessWhatsAppCapi = false;
  }

  if (dadosToken.capi_sent) {
    console.log(`⏸️ [WhatsApp] CAPI já enviado (capi_sent=true) para token ${token}`);
    shouldProcessWhatsAppCapi = false;
  }

  if (dadosToken.capi_processing) {
    console.log(`⏸️ [WhatsApp] CAPI em processamento (capi_processing=true) para token ${token}`);
    shouldProcessWhatsAppCapi = false;
  }

  if (shouldProcessWhatsAppCapi) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateResult = await client.query(
        'UPDATE tokens SET capi_processing = TRUE WHERE token = $1 AND capi_sent = FALSE AND capi_processing = FALSE RETURNING id',
        [token]
      );

      if (updateResult.rows.length === 0) {
        console.log(
          `⏸️ [WhatsApp] CAPI bloqueado: atualização não aplicada (capi_sent=${dadosToken.capi_sent}, capi_processing=${dadosToken.capi_processing}) para token ${token}. Iniciando rollback.`
        );
        await client.query('ROLLBACK');
      } else {
        const eventTime = dadosToken.event_time || Math.floor(new Date(dadosToken.criado_em).getTime() / 1000);
        const eventId = generateEventId('Purchase', token, eventTime);

        console.log(`🆔 [WhatsApp] event_id gerado para token ${token}: ${eventId}`);
        console.log(`💰 [WhatsApp] Valor recuperado do banco para token ${token}: ${dadosToken.valor}`);

        let eventSourceUrl = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/obrigado_purchase_flow.html?token=${token}&valor=${dadosToken.valor}`;

        const urlParams = [];
        if (dadosToken.utm_source) urlParams.push(`utm_source=${encodeURIComponent(dadosToken.utm_source)}`);
        if (dadosToken.utm_medium) urlParams.push(`utm_medium=${encodeURIComponent(dadosToken.utm_medium)}`);
        if (dadosToken.utm_campaign) urlParams.push(`utm_campaign=${encodeURIComponent(dadosToken.utm_campaign)}`);
        if (dadosToken.utm_term) urlParams.push(`utm_term=${encodeURIComponent(dadosToken.utm_term)}`);
        if (dadosToken.utm_content) urlParams.push(`utm_content=${encodeURIComponent(dadosToken.utm_content)}`);

        if (dadosToken.utm_campaign === 'bio-instagram') {
          urlParams.push('G1');
        }

        if (urlParams.length > 0) {
          eventSourceUrl += '&' + urlParams.join('&');
        }

        console.log(`CAPI event_source_url: ${eventSourceUrl}`);

        const utmSource = processUTM(dadosToken.utm_source);
        const utmMedium = processUTM(dadosToken.utm_medium);
        const utmCampaign = processUTM(dadosToken.utm_campaign);
        const utmContent = processUTM(dadosToken.utm_content);
        const utmTerm = processUTM(dadosToken.utm_term);

        let fbclid = null;
        if (dadosToken.fbc) {
          const fbcMatch = dadosToken.fbc.match(/^fb\.1\.\d+\.(.+)$/);
          if (fbcMatch) {
            fbclid = fbcMatch[1];
            console.log(`✅ fbclid extraído do _fbc: ${fbclid}`);
          }
        }

        console.log('📊 UTMs processados para CAPI:', {
          utm_source: { name: utmSource.name, id: utmSource.id },
          utm_medium: { name: utmMedium.name, id: utmMedium.id },
          utm_campaign: { name: utmCampaign.name, id: utmCampaign.id },
          utm_content: { name: utmContent.name, id: utmContent.id },
          utm_term: { name: utmTerm.name, id: utmTerm.id },
          fbclid
        });

        // 🔥 DEBUG: Log dos dados antes de enviar para CAPI
        console.log('🔍 [WHATSAPP-CAPI-DEBUG] Dados que serão enviados para sendFacebookEvent:', {
          fbp: dadosToken.fbp ? dadosToken.fbp.substring(0, 20) + '...' : 'NULL',
          fbc: dadosToken.fbc ? dadosToken.fbc.substring(0, 20) + '...' : 'NULL',
          client_ip_address: dadosToken.ip_criacao || 'NULL',
          client_user_agent: dadosToken.user_agent_criacao ? dadosToken.user_agent_criacao.substring(0, 50) + '...' : 'NULL',
          telegram_id: dadosToken.telegram_id || 'NULL',
          source: 'capi',
          origin: 'whatsapp'
        });

        const capiResult = await sendFacebookEvent({
          event_name: 'Purchase',
          event_time: eventTime,
          event_id: eventId,
          event_source_url: eventSourceUrl,
          value: formatForCAPI(dadosToken.valor),
          currency: 'BRL',
          fbp: dadosToken.fbp,
          fbc: dadosToken.fbc,
          client_ip_address: dadosToken.ip_criacao,
          client_user_agent: dadosToken.user_agent_criacao,
          telegram_id: dadosToken.telegram_id,
          user_data_hash: userDataHash,
          source: 'capi',
          origin: 'whatsapp',
          client_timestamp: dadosToken.event_time,
          custom_data: {
            utm_source: utmSource.name,
            utm_source_id: utmSource.id,
            utm_medium: utmMedium.name,
            utm_medium_id: utmMedium.id,
            utm_campaign: utmCampaign.name,
            utm_campaign_id: utmCampaign.id,
            utm_content: utmContent.name,
            utm_content_id: utmContent.id,
            utm_term: utmTerm.name,
            utm_term_id: utmTerm.id,
            fbclid: fbclid
          }
        });

        if (capiResult.success) {
          await client.query(
            'UPDATE tokens SET capi_sent = TRUE, capi_processing = FALSE, first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP), event_attempts = event_attempts + 1 WHERE token = $1',
            [token]
          );
          await client.query('COMMIT');
          console.log(`CAPI Purchase enviado com sucesso para token ${token} via transação atômica`);
        } else {
          console.error(`❌ [WhatsApp] Falha ao enviar Purchase via CAPI para token ${token}. Iniciando rollback.`, capiResult.error);
          await client.query('ROLLBACK');
        }
      }
    } catch (error) {
      console.error(`❌ [WhatsApp] CAPI abortado: erro inesperado durante transação para token ${token}. Executando rollback.`, error);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error(`❌ [WhatsApp] Erro ao executar rollback da transação CAPI para token ${token}:`, rollbackError);
      }
    } finally {
      client.release();
    }
  }

  return { userDataHash };
}

app.post('/api/verificar-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ status: 'invalido' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ status: 'invalido' });
    }

    const resultado = await pool.query(
      'SELECT usado, status, fn_hash, ln_hash, external_id_hash FROM tokens WHERE token = $1',
      [token]
    );

    if (resultado.rows.length === 0) {
      return res.json({ status: 'invalido' });
    }

    const tokenData = resultado.rows[0];

    if (tokenData.status !== 'valido') {
      return res.json({ status: 'invalido' });
    }

    if (tokenData.usado) {
      return res.json({ status: 'usado' });
    }

    await pool.query(
      'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    );

    const { userDataHash } = await processarCapiWhatsApp({ pool, token });

    const response = { status: 'valido' };

    if (userDataHash) {
      response.user_data_hash = userDataHash;
    }

    return res.json(response);
  } catch (e) {
    console.error('Erro ao verificar token:', e);
    return res.status(500).json({ status: 'invalido' });
  }
});

app.post('/api/marcar-pixel-enviado', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Token requerido' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Banco não disponível' });
    }

    await pool.query(`
      UPDATE tokens 
      SET pixel_sent = TRUE,
          first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP),
          event_attempts = event_attempts + 1
      WHERE token = $1
    `, [token]);

            console.log(`Flag pixel_sent atualizada para token ${token}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar pixel enviado:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// 🔥 NOVO: Endpoint para sincronizar timestamp do cliente com servidor
app.post('/api/sync-timestamp', async (req, res) => {
  try {
    const { token, client_timestamp } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }
    
    if (!client_timestamp || typeof client_timestamp !== 'number') {
      return res.status(400).json({ error: 'client_timestamp deve ser um número (timestamp Unix)' });
    }
    
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ error: 'Erro de conexão com banco' });
    }
    
    // Atualizar o timestamp do evento no banco
    await pool.query(
      'UPDATE tokens SET event_time = $1 WHERE token = $2',
      [client_timestamp, token]
    );
    
            console.log(`Timestamp sincronizado para token ${token}: ${client_timestamp}`);
    
    res.json({ 
      success: true, 
      message: 'Timestamp sincronizado com sucesso',
      server_timestamp: Math.floor(Date.now() / 1000),
      client_timestamp: client_timestamp,
      diff_seconds: Math.abs(Math.floor(Date.now() / 1000) - client_timestamp)
    });
    
  } catch (error) {
    console.error('Erro ao sincronizar timestamp:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// 🔥 NOVO: Endpoint para evento ViewContent via Meta Conversions API
app.post('/api/capi/viewcontent', async (req, res) => {
  try {
    const {
      event_id,
      url: event_source_url,
      fbp,
      fbc,
      ip,
      user_agent,
      external_id,
      content_type = 'product',
      value,
      currency = 'BRL'
    } = req.body;

    // Validação de campos obrigatórios
    if (!event_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'event_id é obrigatório para deduplicação com o Pixel' 
      });
    }

    if (!event_source_url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL da página (event_source_url) é obrigatória' 
      });
    }

    // Extrair IP do cabeçalho se não fornecido no body (usando função que filtra IPs privados)
    const clientIp = ip || extractClientIp(req);

    // Extrair User-Agent do cabeçalho se não fornecido no body
    const clientUserAgent = user_agent || req.get('user-agent');

    // Construir user_data seguindo o padrão existente
    const user_data = {};
    
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (clientIp && clientIp !== '::1' && clientIp !== '127.0.0.1') {
      user_data.client_ip_address = clientIp;
    }
    if (clientUserAgent) user_data.client_user_agent = clientUserAgent;
    
    // Adicionar external_id se fornecido
    if (external_id) {
      // Hashar external_id se não estiver já hasheado (seguindo padrão de segurança)
      if (external_id.length !== 64 || !/^[a-f0-9]+$/i.test(external_id)) {
        const crypto = require('crypto');
        user_data.external_id = crypto.createHash('sha256').update(external_id).digest('hex');
        console.log('🔐 external_id hasheado para ViewContent');
      } else {
        user_data.external_id = external_id;
      }
    }

    // Validação: pelo menos 2 parâmetros obrigatórios conforme documentação Meta
    const requiredParams = ['fbp', 'fbc', 'client_ip_address', 'client_user_agent', 'external_id'];
    const availableParams = requiredParams.filter(param => user_data[param]);
    
    if (availableParams.length < 2) {
      const error = `ViewContent rejeitado: insuficientes parâmetros de user_data. Disponíveis: [${availableParams.join(', ')}]. Necessários: pelo menos 2 entre [${requiredParams.join(', ')}]`;
              console.error(`${error}`);
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetros insuficientes para ViewContent',
        details: error,
        available_params: availableParams,
        required_count: 2
      });
    }

            console.log(`ViewContent validado com ${availableParams.length} parâmetros: [${availableParams.join(', ')}]`);

    // Preparar dados do evento ViewContent
    const eventData = {
      event_name: 'ViewContent',
      event_time: Math.floor(Date.now() / 1000),
      event_id: event_id, // Usar eventID do Pixel para deduplicação
      event_source_url: event_source_url,
      fbp: user_data.fbp,
      fbc: user_data.fbc,
      client_ip_address: user_data.client_ip_address,
      client_user_agent: user_data.client_user_agent,
      source: 'capi',
      custom_data: {
        content_type: content_type
      }
    };

    // Adicionar external_id se disponível
    if (user_data.external_id) {
      eventData.user_data_hash = {
        external_id: user_data.external_id
      };
    }

    // Adicionar value e currency se fornecidos
    if (value) {
      eventData.value = parseFloat(value);
      eventData.currency = currency;
      eventData.custom_data.value = parseFloat(value);
      eventData.custom_data.currency = currency;
    }

    console.log(`📤 Enviando evento ViewContent via CAPI | Event ID: ${event_id} | URL: ${event_source_url}`);

    eventData.__httpRequest = {
      headers: req.headers,
      body: req.body,
      query: req.query
    };

    // Enviar evento usando a função existente
    const result = await sendFacebookEvent(eventData);

    if (result.success) {
              console.log(`Evento ViewContent enviado com sucesso via CAPI | Event ID: ${event_id}`);
      return res.json({ 
        success: true, 
        message: 'Evento ViewContent enviado com sucesso',
        event_id: event_id,
        event_time: eventData.event_time
      });
    } else if (result.duplicate) {
              console.log(`Evento ViewContent duplicado ignorado | Event ID: ${event_id}`);
      return res.json({ 
        success: true, 
        message: 'Evento já foi enviado (deduplicação ativa)',
        event_id: event_id,
        duplicate: true
      });
    } else {
              console.error(`Erro ao enviar evento ViewContent via CAPI:`, result.error);
      return res.status(500).json({ 
        success: false, 
        error: 'Falha ao enviar evento para Meta',
        details: result.error
      });
    }

  } catch (error) {
          console.error('Erro no endpoint ViewContent CAPI:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// Endpoint para monitoramento de eventos Purchase
app.get('/api/purchase-stats', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Banco não disponível' });
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN status = 'valido' AND usado = TRUE THEN 1 END) as tokens_usados,
        COUNT(CASE WHEN pixel_sent = TRUE THEN 1 END) as pixel_enviados,
        COUNT(CASE WHEN capi_sent = TRUE THEN 1 END) as capi_enviados,
        COUNT(CASE WHEN cron_sent = TRUE THEN 1 END) as cron_enviados,
        COUNT(CASE WHEN pixel_sent = TRUE OR capi_sent = TRUE OR cron_sent = TRUE THEN 1 END) as algum_evento_enviado,
        COUNT(CASE WHEN pixel_sent = TRUE AND capi_sent = TRUE THEN 1 END) as pixel_e_capi,
        AVG(event_attempts) as media_tentativas,
        COUNT(CASE WHEN event_attempts >= 3 THEN 1 END) as max_tentativas_atingidas
      FROM tokens 
      WHERE status = 'valido' AND valor IS NOT NULL
    `);

    const recentStats = await pool.query(`
      SELECT 
        COUNT(*) as tokens_recentes,
        COUNT(CASE WHEN pixel_sent = TRUE THEN 1 END) as pixel_recentes,
        COUNT(CASE WHEN capi_sent = TRUE THEN 1 END) as capi_recentes,
        COUNT(CASE WHEN cron_sent = TRUE THEN 1 END) as cron_recentes
      FROM tokens 
      WHERE status = 'valido' 
        AND valor IS NOT NULL 
        AND criado_em > NOW() - INTERVAL '24 hours'
    `);

    const pendingFallback = await pool.query(`
      SELECT COUNT(*) as pendentes_fallback
      FROM tokens 
      WHERE status = 'valido' 
        AND (usado IS NULL OR usado = FALSE)
        AND criado_em < NOW() - INTERVAL '5 minutes'
        AND (
          (pixel_sent = FALSE OR pixel_sent IS NULL)
          OR (capi_ready = TRUE AND capi_sent = FALSE AND capi_processing = FALSE)
        )
        AND (cron_sent = FALSE OR cron_sent IS NULL)
        AND (event_attempts < 3 OR event_attempts IS NULL)
        AND valor IS NOT NULL
    `);

    // ✅ NOVO: Estatísticas das flags de controle CAPI
    const capiStats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN capi_ready = TRUE THEN 1 END) as capi_ready_count,
        COUNT(CASE WHEN capi_processing = TRUE THEN 1 END) as capi_processing_count,
        COUNT(CASE WHEN capi_ready = TRUE AND capi_sent = FALSE THEN 1 END) as capi_ready_pending
      FROM tokens 
      WHERE criado_em > NOW() - INTERVAL '24 hours'
        AND valor IS NOT NULL
    `);

    return res.json({
      geral: stats.rows[0],
      ultimas_24h: recentStats.rows[0],
      pendentes_fallback: pendingFallback.rows[0].pendentes_fallback,
      capi_control: capiStats.rows[0], // ✅ NOVO: Controle CAPI
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de Purchase:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/verificar-token', async (req, res) => {
  let { token } = req.query;

  if (!token) {
    return res.status(400).json({ sucesso: false, erro: 'Token não informado' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ sucesso: false, erro: 'Banco não disponível' });
    }

    token = token.toString().trim();
    console.log('Token recebido:', token);

    const resultado = await pool.query(
      'SELECT status, usado, bot_id FROM tokens WHERE token = $1',
      [token]
    );

    console.log('Resultado da consulta:', resultado.rows);

    const row = resultado.rows[0];
    
    if (!row) {
      return res.json({ sucesso: false, erro: 'Token não encontrado' });
    }
    
    if (row.status !== 'valido') {
      return res.json({ sucesso: false, erro: 'Token inválido' });
    }
    
    if (row.usado) {
      return res.json({ sucesso: false, erro: 'Token já foi usado' });
    }

    // Determinar URL de redirecionamento baseado no bot
    let redirectUrl = 'https://t.me/+0iLdVzcJsq9kOWQ5'; // Default para bot especial
    
    if (row.bot_id === 'bot1') {
      redirectUrl = 'https://t.me/+GCCPdMuNYSAyNmU5';
    } else if (row.bot_id === 'bot2') {
      redirectUrl = 'https://t.me/+Ks-ib0Kqh3FhOWI5';
    }

    return res.json({ 
      sucesso: true, 
      redirectUrl: redirectUrl,
      bot_id: row.bot_id 
    });
  } catch (e) {
    console.error('Erro ao verificar token (GET):', e);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno do servidor' });
  }
});

app.get('/api/marcar-usado', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ sucesso: false });
  }
  try {
    if (!pool) {
      return res.status(500).json({ sucesso: false });
    }
    await pool.query(
      "UPDATE tokens SET status = 'usado', usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1 AND status != 'expirado'",
      [token]
    );

    // ✅ NOVO: disparar CAPI WhatsApp após marcar usado
    await processarCapiWhatsApp({ pool, token });

    return res.json({ sucesso: true });
  } catch (e) {
    console.error('Erro ao marcar token usado:', e);
    return res.status(500).json({ sucesso: false });
  }
});

app.get('/api/purchase/context', async (req, res) => {
  const requestId = generateRequestId();
  const token = String(req.query.token || '').trim();

  console.log('[PURCHASE-BROWSER] 📥 Context request', {
    request_id: requestId,
    token
  });

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Token é obrigatório'
    });
  }

  if (!pool) {
    console.error('[PURCHASE-BROWSER] ❌ Pool indisponível', { request_id: requestId });
    return res.status(500).json({ success: false, error: 'Banco de dados não disponível' });
  }

  try {
    const query = `
      SELECT
        token,
        telegram_id,
        event_id_purchase,
        transaction_id,
        price_cents::int AS price_cents,
        currency,
        payer_name,
        payer_cpf,
        email,
        phone,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        fbp,
        fbc,
        nome_oferta,
        ip_criacao AS client_ip_address,
        user_agent_criacao AS client_user_agent
      FROM tokens
      WHERE token = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [token]);

    if (result.rows.length === 0) {
      console.warn('[PURCHASE-BROWSER] ⚠️ Token não encontrado', { request_id: requestId, token });
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const row = result.rows[0];
    const utms = extractUtmsFromSource(row);
    const priceCents = toIntOrNull(row.price_cents);
    const value = priceCents !== null ? centsToValue(priceCents) : null;

    let eventIdPurchase = row.event_id_purchase;
    if (!eventIdPurchase && row.transaction_id) {
      eventIdPurchase = generatePurchaseEventId(row.transaction_id);
      await pool.query(
        'UPDATE tokens SET event_id_purchase = $1 WHERE token = $2',
        [eventIdPurchase, token]
      );
      console.log('[PURCHASE-TOKEN] 🆔 event_id_purchase preenchido', {
        request_id: requestId,
        token,
        transaction_id: row.transaction_id,
        event_id_purchase: eventIdPurchase
      });
    }

    const urlData = buildObrigadoEventSourceUrl({
      token,
      valor: value,
      utms
    });

    let fbclid = null;
    if (row.fbc && typeof row.fbc === 'string') {
      const fbclidMatch = row.fbc.match(/fb\.1\.[0-9]+\.([A-Za-z0-9_-]+)/);
      if (fbclidMatch) {
        fbclid = fbclidMatch[1];
      }
    }

    // 🎯 Gerar external_id (hash do CPF) para Meta CAPI
    // const { hashCpf } = require('./helpers/purchaseFlow');
    // const externalId = row.payer_cpf ? hashCpf(row.payer_cpf) : null;
    const telegramIdString =
      row.telegram_id !== null && row.telegram_id !== undefined
        ? String(row.telegram_id)
        : null;

    // Construir contents e content_ids
    const planTitle = row.nome_oferta || null;
    const contentId = row.transaction_id ? `txn_${row.transaction_id}` : (planTitle ? planTitle.replace(/\s+/g, '_').toLowerCase() : null);
    const contents = contentId && value ? [{
      id: contentId,
      quantity: 1,
      item_price: value,
      title: planTitle || 'Plano'
    }] : [];
    const contentIds = contentId ? [contentId] : [];

    // 🎯 CONTEXTO UNIFICADO: Fonte única de verdade para browser (Pixel) e server (CAPI)
    const contextPayload = {
      // Identificadores
      token,
      telegram_id: telegramIdString,
      transaction_id: row.transaction_id,
      event_id_purchase: eventIdPurchase,
      event_id: eventIdPurchase, // Alias para compatibilidade
      // Valor
      value,
      value_cents: priceCents,
      price_cents: priceCents,
      currency: row.currency || 'BRL',
      // Dados do pagador (payer_cpf é canônico, NÃO expor payer_national_registration)
      payer_name: row.payer_name,
      payer_cpf: row.payer_cpf,
      // external_id: externalId, // Hash do CPF para Meta
      external_id: telegramIdString,
      email: row.email,
      phone: row.phone,
      // UTMs (objeto + campos individuais)
      utms,
      utm_source: utms.utm_source || null,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_term: utms.utm_term || null,
      utm_content: utms.utm_content || null,
      // Tracking
      fbp: row.fbp,
      fbc: row.fbc,
      fbclid,
      client_ip_address: row.client_ip_address,
      client_user_agent: row.client_user_agent,
      // Produto
      nome_oferta: planTitle,
      plan_title: planTitle,
      contents,
      content_ids: contentIds,
      content_type: contents.length ? 'product' : null,
      // URL normalizada
      event_source_url: urlData.finalUrl
    };

    console.log(
      `[PURCHASE-CONTEXT] token=${token} -> tx=${contextPayload.transaction_id} eid=${contextPayload.event_id_purchase} cents=${contextPayload.price_cents} title="${contextPayload.plan_title || 'N/A'}"`
    );

    if (telegramIdString) {
      console.log(`[AM-CONTEXT] external_id(from=telegram_id)=${telegramIdString} token=${token}`);
    } else {
      console.warn('[AM-WARN] telegram_id ausente — external_id não enviado.', { token });
    }

    return res.json({
      success: true,
      data: contextPayload
    });
  } catch (error) {
    console.error('[PURCHASE-BROWSER] ❌ Erro ao carregar contexto', {
      request_id: requestId,
      token,
      error: error.message
    });
    return res.status(500).json({ success: false, error: 'Erro interno ao carregar contexto' });
  }
});

// 🎯 NOVO: Endpoint para salvar email e telefone na página de obrigado
app.post('/api/save-contact', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const {
      token, email, phone,
      payer_name: payerNameFromBody,
      payer_cpf: payerCpfFromBody,
      payer_national,
      payer_national_registration
    } = req.body;

    console.log('[PURCHASE-TOKEN] 📝 save-contact recebido', {
      request_id: requestId,
      token,
      email,
      phone,
      payer_name_provided: !!payerNameFromBody,
      payer_cpf_provided: !!(payerCpfFromBody || payer_national || payer_national_registration)
    });

    // Validações
    if (!token || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Token, email e telefone são obrigatórios'
      });
    }

    if (!pool) {
      console.error('[PURCHASE-TOKEN] ❌ Pool não disponível', { request_id: requestId });
      return res.status(500).json({
        success: false,
        error: 'Banco de dados não disponível'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Email inválido'
      });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Telefone inválido'
      });
    }

    const resolvedCpf = payerCpfFromBody || payer_national || payer_national_registration || null;
    const normalizedPayerCpf = resolvedCpf ? normalizeCpf(resolvedCpf) : null;

    // Atualizar token com email, phone e CPF (quando enviado)
    const result = await pool.query(
      `UPDATE tokens
       SET email = $1,
           phone = $2,
           payer_name = COALESCE($4, payer_name),
           payer_cpf = COALESCE($5, payer_cpf)
       WHERE token = $3
       RETURNING event_id_purchase, transaction_id, payer_name, payer_cpf, telegram_id`,
      [email, phone, token, payerNameFromBody || null, normalizedPayerCpf]
    );

    if (result.rows.length === 0) {
      console.error('[PURCHASE-TOKEN] ❌ Token não encontrado em save-contact', {
        request_id: requestId,
        token
      });
      return res.status(404).json({
        success: false,
        error: 'Token não encontrado'
      });
    }

    const tokenData = result.rows[0];

    if (!tokenData.event_id_purchase && tokenData.transaction_id) {
      tokenData.event_id_purchase = generatePurchaseEventId(tokenData.transaction_id);
      await pool.query(
        'UPDATE tokens SET event_id_purchase = $1 WHERE token = $2',
        [tokenData.event_id_purchase, token]
      );
      console.log('[PURCHASE-TOKEN] 🆔 event_id_purchase preenchido via save-contact', {
        request_id: requestId,
        token,
        transaction_id: tokenData.transaction_id,
        event_id_purchase: tokenData.event_id_purchase
      });
    }

    console.log('[PURCHASE-TOKEN] ✅ Contato atualizado', {
      request_id: requestId,
      token,
      email,
      phone,
      transaction_id: tokenData.transaction_id,
      event_id_purchase: tokenData.event_id_purchase,
      payer_name: tokenData.payer_name,
      payer_cpf: tokenData.payer_cpf
    });

    return res.json({
      success: true,
      event_id_purchase: tokenData.event_id_purchase,
      transaction_id: tokenData.transaction_id
    });

  } catch (error) {
    console.error('[PURCHASE-TOKEN] ❌ Erro save-contact', {
      request_id: requestId,
      error: error.message
    });
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 NOVO: Endpoint para marcar pixel_sent
app.post('/api/mark-pixel-sent', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token é obrigatório'
      });
    }

    if (!pool) {
      return res.status(500).json({
        success: false,
        error: 'Banco de dados não disponível'
      });
    }

    await pool.query(
      `UPDATE tokens SET pixel_sent = TRUE WHERE token = $1`,
      [token]
    );

    console.log('[PURCHASE-TOKEN] 🏁 pixel_sent marcado', {
      request_id: requestId,
      token
    });

    return res.json({ success: true });

  } catch (error) {
    console.error('[PURCHASE-TOKEN] ❌ Erro mark-pixel-sent', {
      request_id: requestId,
      error: error.message
    });
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 NOVO: Endpoint para Purchase via CAPI (fluxo com deduplicação)
app.post('/api/capi/purchase', async (req, res) => {
  const requestId = generateRequestId();

  try {
    const { 
      token, 
      event_id: eventIdFromBody, 
      event_source_url: eventSourceUrlFromBody,
      custom_data: customDataFromBrowser,
      normalized_user_data: normalizedUserDataFromBrowser,
      advanced_matching: advancedMatchingFromBrowser
    } = req.body || {};

    console.log('[PURCHASE-CAPI] request body=', {
      request_id: requestId,
      ...(req.body || {})
    });

    // Verificar se advanced_matching vem do browser com hashes válidos
    if (advancedMatchingFromBrowser) {
      const browserHashLengths = {};
      for (const [key, value] of Object.entries(advancedMatchingFromBrowser)) {
        browserHashLengths[key] = typeof value === 'string' ? value.length : 'not_string';
      }
      console.log('[PURCHASE-CAPI] 🔍 Hashes recebidos do browser:', browserHashLengths);
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token é obrigatório' });
    }

    if (!pool) {
      console.error('[PURCHASE-CAPI] ❌ Pool de conexões não disponível', { request_id: requestId });
      return res.status(500).json({ success: false, error: 'Banco de dados não disponível' });
    }

    const tokenResult = await pool.query(
      `SELECT
        token,
        telegram_id,
        event_id_purchase,
        transaction_id,
        payer_name,
        payer_cpf,
        price_cents::int AS price_cents,
        currency,
        email,
        phone,
        fbp,
        fbc,
        ip_criacao AS client_ip_address,
        user_agent_criacao AS client_user_agent,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        pixel_sent,
        capi_ready,
        capi_sent,
        capi_processing,
        event_attempts,
        nome_oferta
      FROM tokens
      WHERE token = $1
      LIMIT 1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      console.error('[PURCHASE-CAPI] ❌ Token não encontrado', { request_id: requestId, token });
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const tokenData = tokenResult.rows[0];
    const telegramIdString =
      tokenData.telegram_id !== null && tokenData.telegram_id !== undefined
        ? String(tokenData.telegram_id)
        : null;

    console.log('[PURCHASE-CAPI] 📊 Token encontrado', {
      request_id: requestId,
      token,
      telegram_id: tokenData.telegram_id,
      transaction_id: tokenData.transaction_id,
      event_id_purchase: tokenData.event_id_purchase,
      pixel_sent: tokenData.pixel_sent,
      capi_ready: tokenData.capi_ready,
      capi_sent: tokenData.capi_sent,
      email: tokenData.email,
      phone: tokenData.phone,
      payer_name: tokenData.payer_name,
      payer_cpf: tokenData.payer_cpf
    });

    const readinessValue = (value) => (value === undefined || value === null ? 'null' : value);
    console.log(
      `[PURCHASE-CAPI] readiness token=${token} pixel_sent=${readinessValue(tokenData.pixel_sent)} capi_ready=${readinessValue(
        tokenData.capi_ready
      )} email=${readinessValue(tokenData.email)} phone=${readinessValue(tokenData.phone)}`
    );

    if (!tokenData.pixel_sent || !tokenData.capi_ready) {
      console.warn('[PURCHASE-CAPI] ⚠️ Token ainda não está pronto para envio', {
        request_id: requestId,
        token,
        pixel_sent: tokenData.pixel_sent,
        capi_ready: tokenData.capi_ready
      });

      return res.status(400).json({
        success: false,
        reason: 'not_ready',
        details: {
          pixel_sent: !!tokenData.pixel_sent,
          capi_ready: !!tokenData.capi_ready
        }
      });
    }

    // 🎯 VALIDAÇÃO CRÍTICA: Bloquear se price_cents ausente ou 0
    const priceCents = toIntOrNull(tokenData.price_cents);
    if (!priceCents || priceCents === 0) {
      console.error('[PURCHASE-CAPI] ❌ BLOQUEADO: price_cents ausente ou zero', {
        request_id: requestId,
        token,
        transaction_id: tokenData.transaction_id,
        price_cents: priceCents
      });
      return res.status(422).json({
        success: false,
        error: 'value_missing_or_zero',
        reason: 'Price cents is missing or zero - cannot send Purchase event',
        price_cents: priceCents
      });
    }

    const cpfForValidation = normalizeCpf(tokenData.payer_cpf || '');
    const hasCpf = !!(cpfForValidation && cpfForValidation.length >= 11);
    const hasName = !!(tokenData.payer_name && tokenData.payer_name.trim().length >= 2);

    if (!hasCpf || !hasName) {
      console.warn('[PURCHASE-CAPI] ⚠️ Dados do pagador incompletos', {
        request_id: requestId,
        token,
        hasCpf,
        hasName
      });

      return res.status(400).json({
        success: false,
        reason: 'missing_payer_data',
        details: { hasCpf, hasName }
      });
    }

    const validation = validatePurchaseReadiness(tokenData);

    // 🎯 LOG DE DEDUPLICAÇÃO: Mostrar política de envio cross-channel
    console.log('[CAPI-DEDUPE] policy=cross-channel-allowed', {
      request_id: requestId,
      token,
      pixel_sent: !!tokenData.pixel_sent,
      capi_sent: !!tokenData.capi_sent,
      proceeding: validation.valid
    });

    if (!validation.valid) {
      console.warn('[PURCHASE-CAPI] ⚠️ Pré-condições não atendidas', {
        request_id: requestId,
        token,
        reason: validation.reason,
        pixel_sent: tokenData.pixel_sent,
        capi_ready: tokenData.capi_ready,
        capi_sent: tokenData.capi_sent,
        has_email: !!tokenData.email,
        has_phone: !!tokenData.phone
      });

      return res.status(400).json({
        success: false,
        error: 'Pré-condições não atendidas',
        reason: validation.reason,
        details: {
          pixel_sent: tokenData.pixel_sent,
          capi_ready: tokenData.capi_ready,
          capi_sent: tokenData.capi_sent,
          has_email: !!tokenData.email,
          has_phone: !!tokenData.phone
        }
      });
    }

    await pool.query(
      `UPDATE tokens SET capi_processing = TRUE, event_attempts = event_attempts + 1 WHERE token = $1`,
      [token]
    );

    const resolvedTracking = await resolveFbcFbp({ token, telegram_id: telegramIdString });
    if (resolvedTracking && resolvedTracking.fbc) {
      tokenData.fbc = resolvedTracking.fbc;
    }
    if (resolvedTracking && resolvedTracking.fbp) {
      tokenData.fbp = resolvedTracking.fbp;
    }
    const resolvedFbclid = resolvedTracking ? resolvedTracking.fbclid : null;

    console.log(
      '[PURCHASE-CAPI] user_data.fbc=',
      tokenData.fbc || 'vazio',
      'fbp=',
      tokenData.fbp || 'vazio'
    );

    const tokenEventIdCandidate =
      tokenData.event_id_purchase !== undefined && tokenData.event_id_purchase !== null
        ? String(tokenData.event_id_purchase).trim()
        : '';
    const tokenEventId = tokenEventIdCandidate || null;
    const bodyEventIdCandidate =
      eventIdFromBody !== undefined && eventIdFromBody !== null ? String(eventIdFromBody).trim() : '';
    const bodyEventIdNormalized = bodyEventIdCandidate || null;

    if (tokenEventId && bodyEventIdNormalized && tokenEventId !== bodyEventIdNormalized) {
      console.warn('[PURCHASE-CAPI] corrigindo event_id para o do token', {
        request_id: requestId,
        token,
        event_id_body: bodyEventIdNormalized,
        event_id_token: tokenEventId
      });
    }

    let finalEventId = tokenEventId || null;

    if (!tokenEventId && bodyEventIdNormalized) {
      finalEventId = bodyEventIdNormalized;
      await pool.query(
        'UPDATE tokens SET event_id_purchase = $1 WHERE token = $2',
        [finalEventId, token]
      );
      console.log('[PURCHASE-TOKEN] 🆔 event_id_purchase preenchido via body', {
        request_id: requestId,
        token,
        transaction_id: tokenData.transaction_id,
        event_id_purchase: finalEventId
      });
    }

    if (!finalEventId && tokenData.transaction_id) {
      finalEventId = generatePurchaseEventId(tokenData.transaction_id);
      await pool.query(
        'UPDATE tokens SET event_id_purchase = $1 WHERE token = $2',
        [finalEventId, token]
      );
      console.log('[PURCHASE-TOKEN] 🆔 event_id_purchase preenchido via transaction', {
        request_id: requestId,
        token,
        transaction_id: tokenData.transaction_id,
        event_id_purchase: finalEventId
      });
    }

    if (!finalEventId) {
      await pool.query(
        'UPDATE tokens SET capi_processing = FALSE WHERE token = $1',
        [token]
      );
      console.error('[PURCHASE-CAPI] ❌ event_id não disponível', { request_id: requestId, token });
      return res.status(400).json({ success: false, error: 'event_id não disponível' });
    }

    // 🎯 PRIORIZAR DADOS DO BROWSER: Se custom_data foi enviado do browser, usar esses dados
    const hasBrowserData = customDataFromBrowser && Object.keys(customDataFromBrowser).length > 0;
    
    const utms = hasBrowserData && customDataFromBrowser.utm_source 
      ? {
          utm_source: customDataFromBrowser.utm_source || null,
          utm_medium: customDataFromBrowser.utm_medium || null,
          utm_campaign: customDataFromBrowser.utm_campaign || null,
          utm_term: customDataFromBrowser.utm_term || null,
          utm_content: customDataFromBrowser.utm_content || null
        }
      : extractUtmsFromSource(tokenData);
    
    // priceCents já declarado na validação (linha ~2033)
    const value = hasBrowserData && typeof customDataFromBrowser.value === 'number' 
      ? customDataFromBrowser.value 
      : (priceCents !== null ? centsToValue(priceCents) : null);
    
    const currency = hasBrowserData && customDataFromBrowser.currency 
      ? customDataFromBrowser.currency 
      : (tokenData.currency || 'BRL');

    const normalizedEventSourceUrlFromBody = normalizeUrlForEventSource(eventSourceUrlFromBody);
    if (eventSourceUrlFromBody && !normalizedEventSourceUrlFromBody) {
      console.warn('[PURCHASE-CAPI] ⚠️ event_source_url inválido, usando fallback', {
        request_id: requestId,
        token,
        provided: eventSourceUrlFromBody
      });
    } else if (eventSourceUrlFromBody && normalizedEventSourceUrlFromBody !== eventSourceUrlFromBody) {
      console.log('[PURCHASE-CAPI] 🔧 event_source_url normalizado', {
        request_id: requestId,
        token,
        original: eventSourceUrlFromBody,
        normalized: normalizedEventSourceUrlFromBody
      });
    }

    let eventSourceUrl = normalizedEventSourceUrlFromBody;
    if (!eventSourceUrl) {
      const obrigadoUrlData = buildObrigadoEventSourceUrl({
        token,
        valor: value,
        utms
      });
      eventSourceUrl = normalizeUrlForEventSource(obrigadoUrlData.finalUrl) || obrigadoUrlData.finalUrl;
    }

    // Log ANTES da captura do request (valores do banco)
    const ipBeforeCapture = tokenData.client_ip_address || 'null';
    const uaBeforeCapture = tokenData.client_user_agent || 'null';
    
    console.log(
      `[PURCHASE-CAPI] resolved event_id_purchase=${finalEventId || 'null'} transaction_id=${
        tokenData.transaction_id || 'null'
      } value=${value ?? 'null'} currency=${currency} utms=${JSON.stringify(utms)} fbp=${
        tokenData.fbp || 'null'
      } fbc=${tokenData.fbc || 'null'} ip_banco=${ipBeforeCapture} ua_banco=${uaBeforeCapture} event_source_url=${eventSourceUrl}`
    );

    let fbclid = resolvedFbclid || extractFbclidFromFbc(tokenData.fbc);

    const cpfDigits = cpfForValidation;
    const phoneNormalizedDigits = normalizePhoneDigits(tokenData.phone || '');
    const phoneNormalizedE164 = normalizePhoneToE164(tokenData.phone || '');
    const { firstName, lastName } = splitFullName(tokenData.payer_name || '');

    // 🎯 PRIORIZAR dados normalizados do browser (se enviados em plaintext)
    // Se não, re-normalizar no backend (defesa em profundidade)
    const normalizedUserData = normalizedUserDataFromBrowser && Object.keys(normalizedUserDataFromBrowser).length > 0
      ? {
          email: normalizedUserDataFromBrowser.email || normalizeEmailField(tokenData.email || ''),
          phone: normalizedUserDataFromBrowser.phone || phoneNormalizedDigits,
          first_name: normalizedUserDataFromBrowser.first_name || normalizeNameField(firstName || ''),
          last_name: normalizedUserDataFromBrowser.last_name || normalizeNameField(lastName || ''),
          // external_id: normalizedUserDataFromBrowser.external_id || normalizeExternalIdField(cpfDigits || '')
          external_id:
            normalizedUserDataFromBrowser.external_id ||
            (telegramIdString ? normalizeExternalIdField(telegramIdString) : null)
        }
      : {
          email: normalizeEmailField(tokenData.email || ''),
          phone: phoneNormalizedDigits,
          first_name: normalizeNameField(firstName || ''),
          last_name: normalizeNameField(lastName || ''),
          // external_id: normalizeExternalIdField(cpfDigits || '')
          external_id: telegramIdString ? normalizeExternalIdField(telegramIdString) : null
        };

    const normalizationSnapshot = {
      em: normalizedUserData.email ? 'ok' : 'skip',
      ph: normalizedUserData.phone ? 'ok' : 'skip',
      fn: normalizedUserData.first_name ? 'ok' : 'skip',
      ln: normalizedUserData.last_name ? 'ok' : 'skip',
      external_id: normalizedUserData.external_id ? 'ok' : 'skip'
    };
    console.log('[CAPI-AM] normalized', normalizationSnapshot);

    // Hashear apenas no backend antes do envio à Meta
    const advancedMatchingHashed = buildAdvancedMatching(normalizedUserData);
    
    // Validar que todos os hashes têm 64 caracteres
    const hashValidation = Object.entries(advancedMatchingHashed).map(([key, value]) => {
      return { field: key, len: value ? value.length : 0, ok: value && value.length === 64 };
    });
    const allHashesValid = hashValidation.every(v => v.ok);
    console.log('[CAPI-AM] hashed_len=64 for all fields | ok=' + allHashesValid, hashValidation);

    const userDataRaw = {
      email: tokenData.email,
      phone: phoneNormalizedE164,
      cpf: cpfDigits,
      first_name: firstName,
      last_name: lastName,
      fbp: tokenData.fbp,
      fbc: tokenData.fbc,
      client_ip_address: tokenData.client_ip_address,
      client_user_agent: tokenData.client_user_agent
    };

    console.log('[PURCHASE-CAPI] 👤 user_data (raw)', {
      request_id: requestId,
      token,
      user_data: {
        ...userDataRaw,
        normalized: normalizedUserData,
        hashed: advancedMatchingHashed
      }
    });

    // 🎯 PRIORIZAR DADOS DO BROWSER: contents, content_ids, etc
    let contents, contentIds, contentType, contentName;
    
    if (hasBrowserData && customDataFromBrowser.contents && Array.isArray(customDataFromBrowser.contents)) {
      // Usar contents do browser
      contents = customDataFromBrowser.contents;
      contentIds = customDataFromBrowser.content_ids || contents.map(item => item.id).filter(Boolean);
      contentType = customDataFromBrowser.content_type || 'product';
      contentName = customDataFromBrowser.content_name || (contents.find(item => item?.title)?.title) || null;
    } else {
      // Reconstruir do banco de dados (fallback)
      const contentId = (tokenData.transaction_id ? `txn_${tokenData.transaction_id}` : null)
        || (tokenData.nome_oferta ? tokenData.nome_oferta.replace(/\s+/g, '_').toLowerCase() : null);
      contentName = tokenData.nome_oferta || 'Oferta Desconhecida';
      contents = contentId
        ? [{
            id: contentId,
            quantity: 1,
            item_price: value,
            title: contentName
          }]
        : [];
      contentIds = contentId ? [contentId] : [];
      contentType = contents.length ? 'product' : null;
    }

    // 🎯 PRIORIZAR fbclid DO BROWSER
    let fbclidToUse = hasBrowserData && customDataFromBrowser.fbclid 
      ? customDataFromBrowser.fbclid 
      : fbclid;

    const customDataRaw = {
      transaction_id: tokenData.transaction_id,
      value,
      currency,
      utm_source: utms.utm_source || null,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_term: utms.utm_term || null,
      utm_content: utms.utm_content || null,
      fbclid: fbclidToUse,
      contents,
      content_ids: contentIds,
      content_type: contentType,
      content_name: contentName
    };

    console.log('[PURCHASE-CAPI] 📦 custom_data (raw)', {
      request_id: requestId,
      token,
      custom_data: customDataRaw
    });

    const externalIdHash = advancedMatchingHashed.external_id || null;

    // 🎯 PAYLOAD UNIFICADO: Usar dados do browser quando disponíveis
    const finalNormalizedUserData = normalizedUserDataFromBrowser || normalizedUserData;
    const finalAdvancedMatching = advancedMatchingFromBrowser || advancedMatchingHashed;

    if (telegramIdString) {
      console.log(
        `[PURCHASE-CAPI] external_id(from=telegram_id)=${telegramIdString} event_id=${finalEventId} tx=${tokenData.transaction_id || 'null'}`
      );
    } else {
      console.warn('[AM-WARN] telegram_id ausente — external_id não enviado.');
    }

    console.log('[PURCHASE-CAPI] 🎯 Fonte de dados', {
      request_id: requestId,
      using_browser_custom_data: hasBrowserData,
      using_browser_normalized_user_data: !!normalizedUserDataFromBrowser,
      using_browser_advanced_matching: !!advancedMatchingFromBrowser
    });

    // 🎯 LOG DE PARIDADE: Mostrar todos os parâmetros que serão enviados ao CAPI
    console.log('[PURCHASE-CAPI] 📊 Parâmetros completos para CAPI', {
      request_id: requestId,
      event_id: finalEventId,
      transaction_id: tokenData.transaction_id,
      value,
      currency,
      utm_source: utms.utm_source,
      utm_medium: utms.utm_medium,
      utm_campaign: utms.utm_campaign,
      utm_term: utms.utm_term,
      utm_content: utms.utm_content,
      contents_count: contents?.length || 0,
      content_ids_count: contentIds?.length || 0,
      content_type: contentType,
      content_name: contentName,
      fbclid: fbclidToUse,
      has_fbp: !!tokenData.fbp,
      has_fbc: !!tokenData.fbc
    });

    // Verificar tamanho dos hashes antes de enviar
    const advancedMatchingHashLengths = {};
    if (finalAdvancedMatching) {
      for (const [key, value] of Object.entries(finalAdvancedMatching)) {
        advancedMatchingHashLengths[key] = typeof value === 'string' ? value.length : 'not_string';
      }
    }
    console.log('[PURCHASE-CAPI] 🔍 Verificação de hashes antes de enviar:', advancedMatchingHashLengths);

    // 🔥 CAPTURAR IP E UA DA REQUISIÇÃO HTTP (usando função que filtra IPs privados)
    const requestIp = extractClientIp(req);
    const requestUserAgent = req.headers['user-agent'] || null;
    
    console.log('[PURCHASE-CAPI] 🌐 Dados capturados da requisição HTTP:', {
      request_id: requestId,
      ip: requestIp,
      user_agent: requestUserAgent ? `${requestUserAgent.substring(0, 50)}...` : null,
      headers_count: Object.keys(req.headers).length
    });

    // Log dos valores finais que serão usados
    const finalIp = requestIp || tokenData.client_ip_address;
    const finalUa = requestUserAgent || tokenData.client_user_agent;
    
    console.log('[PURCHASE-CAPI] 🎯 Valores finais IP/UA:', {
      request_id: requestId,
      ip_source: requestIp ? 'http_request' : (tokenData.client_ip_address ? 'banco' : 'none'),
      ua_source: requestUserAgent ? 'http_request' : (tokenData.client_user_agent ? 'banco' : 'none'),
      has_final_ip: !!finalIp,
      has_final_ua: !!finalUa
    });

    const purchaseData = {
      event_id: finalEventId,
      transaction_id: tokenData.transaction_id,
      payer_name: tokenData.payer_name,
      payer_cpf: cpfDigits,
      price_cents: priceCents,
      currency,
      email: tokenData.email,
      phone: phoneNormalizedDigits,
      first_name: firstName,
      last_name: lastName,
      fbp: tokenData.fbp,
      fbc: tokenData.fbc,
      fbclid: fbclidToUse,
      // 🔥 PRIORIZAR IP/UA DA REQUISIÇÃO HTTP ATUAL (browser) sobre os do banco
      client_ip_address: requestIp || tokenData.client_ip_address,
      client_user_agent: requestUserAgent || tokenData.client_user_agent,
      utm_source: utms.utm_source,
      utm_medium: utms.utm_medium,
      utm_campaign: utms.utm_campaign,
      utm_term: utms.utm_term,
      utm_content: utms.utm_content,
      event_source_url: eventSourceUrl,
      contents,
      content_ids: contentIds,
      content_type: contentType,
      content_name: contentName,
      normalized_user_data: finalNormalizedUserData,
      advanced_matching: finalAdvancedMatching,
      external_id_hash: externalIdHash,
      // 🔥 CAMPOS PARA FALLBACK DE IP/UA
      telegram_id: telegramIdString,
      payload_id: (resolvedTracking && resolvedTracking.payload_id) || tokenData.payload_id || token,
      origin: 'website' // Página de obrigado = origem website (browser)
    };

    try {
      await savePurchaseContext({
        pool,
        sqliteDb: typeof sqlite?.get === 'function' ? sqlite.get() : null,
        event: {
          event_id: finalEventId,
          transaction_id: tokenData.transaction_id,
          price_cents: priceCents,
          utms,
          fbp: tokenData.fbp,
          fbc: tokenData.fbc,
          client_ip_address: tokenData.client_ip_address,
          client_user_agent: tokenData.client_user_agent,
          event_source_url: eventSourceUrl,
          advanced_matching: advancedMatchingHashed,
          contents,
          content_ids: customDataRaw.content_ids,
          content_type: customDataRaw.content_type,
          content_name: customDataRaw.content_name
        }
      });
    } catch (persistError) {
      console.error(`[DB] erro ao persistir contexto de purchase err=${persistError.stack || persistError.message}`);
    }

    console.log('[PURCHASE-CAPI] ready', {
      request_id: requestId,
      event_id: finalEventId,
      transaction_id: tokenData.transaction_id,
      value,
      currency,
      utms,
      fbp: tokenData.fbp,
      fbc: tokenData.fbc,
      client_ip: finalIp,
      client_user_agent: finalUa ? `${finalUa.substring(0, 50)}...` : null,
      event_source_url: eventSourceUrl,
      ip_source: requestIp ? 'http_request' : 'banco',
      ua_source: requestUserAgent ? 'http_request' : 'banco'
    });

    if (finalEventId) {
      console.log(`[DEDUP] usando event_id=${finalEventId}`);
    }

    console.log(
      `[DEBUG] price_cents(type)=${typeof priceCents} value(type)=${typeof value} price_cents=${priceCents} value=${value}`
    );

    const result = await sendPurchaseEvent(purchaseData);

    if (result.success) {
      console.log('[PURCHASE-CAPI] sent', {
        request_id: requestId,
        event_id: finalEventId,
        transaction_id: tokenData.transaction_id,
        status: result.status,
        attempt: result.attempt,
        body: result.response
      });

      const dedupeCreatedAt = new Date();
      const dedupeExpiresAt = new Date(dedupeCreatedAt.getTime() + 24 * 60 * 60 * 1000);
      const dedupeRecord = {
        event_id: finalEventId,
        transaction_id: tokenData.transaction_id ? String(tokenData.transaction_id) : null,
        event_name: 'Purchase',
        source: 'capi',
        value: typeof value === 'number' ? value : null,
        currency: currency || null,
        fbp: tokenData.fbp || null,
        fbc: tokenData.fbc || null,
        ip_address: tokenData.client_ip_address || null,
        user_agent: tokenData.client_user_agent || null,
        created_at: dedupeCreatedAt,
        expires_at: dedupeExpiresAt
      };

      const dedupeLog = {
        event_name: dedupeRecord.event_name,
        event_id: dedupeRecord.event_id,
        source: dedupeRecord.source,
        transaction_id: dedupeRecord.transaction_id,
        value: dedupeRecord.value,
        currency: dedupeRecord.currency,
        fbp: dedupeRecord.fbp,
        fbc: dedupeRecord.fbc,
        ip_address: dedupeRecord.ip_address,
        user_agent: dedupeRecord.user_agent,
        created_at: dedupeRecord.created_at.toISOString(),
        expires_at: dedupeRecord.expires_at.toISOString()
      };

      console.log('[PURCHASE-DEDUPE] upsert', dedupeLog);

      try {
        await markPurchaseAsSent(dedupeRecord);
      } catch (dedupeError) {
        console.error(`[PURCHASE-DEDUPE] error err=${dedupeError.stack || dedupeError.message}`);

        await pool.query(
          'UPDATE tokens SET capi_processing = FALSE WHERE token = $1',
          [token]
        );

        return res.status(500).json({
          success: false,
          error: 'Erro ao registrar dedupe',
          event_id: finalEventId,
          transaction_id: tokenData.transaction_id
        });
      }

      await pool.query(
        `UPDATE tokens
         SET capi_sent = TRUE,
             capi_processing = FALSE,
             first_event_sent_at = COALESCE(first_event_sent_at, NOW())
         WHERE token = $1`,
        [token]
      );

      const pixelSentFlag = tokenData.pixel_sent === null || tokenData.pixel_sent === undefined
        ? 'null'
        : tokenData.pixel_sent;
      const tokenLogMessage = `[PURCHASE-TOKEN] update capi_sent=true pixel_sent=${pixelSentFlag} token=${token} event_id_purchase=${finalEventId} transaction_id=${tokenData.transaction_id || 'null'}`;
      console.log(tokenLogMessage);

      return res.json({
        success: true,
        event_id: finalEventId,
        transaction_id: tokenData.transaction_id,
        message: 'Purchase enviado com sucesso'
      });
    }

    await pool.query(
      'UPDATE tokens SET capi_processing = FALSE WHERE token = $1',
      [token]
    );

    console.error('[PURCHASE-CAPI] ❌ Erro ao enviar Purchase', {
      request_id: requestId,
      event_id: finalEventId,
      transaction_id: tokenData.transaction_id,
      error: result.error,
      status: result.status,
      response: result.response
    });

    return res.status(500).json({
      success: false,
      error: result.error,
      event_id: finalEventId,
      transaction_id: tokenData.transaction_id
    });
  } catch (error) {
    console.error('[PURCHASE-CAPI] ❌ Erro interno', { request_id: requestId, error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API para buscar dados do comprador (apenas para bot especial)
app.get('/api/dados-comprador', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token não informado' });
    }

    const resultado = await pool.query(
      'SELECT bot_id, fn_hash, ln_hash, external_id_hash FROM tokens WHERE token = $1 AND status != $2',
      [token, 'expirado']
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const row = resultado.rows[0];
    
    // Apenas para bot especial
    if (row.bot_id !== 'bot_especial') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Buscar dados temporários do comprador para exibição
    try {
      // Buscar dados temporários armazenados no PostgreSQL
      const webhookData = await pool.query(
        'SELECT payer_name_temp, payer_cpf_temp, end_to_end_id_temp, ip_criacao, fn_hash, external_id_hash FROM tokens WHERE token = $1 AND bot_id = $2',
        [token, 'bot_especial']
      );
      
      if (webhookData.rows.length > 0) {
        const tokenData = webhookData.rows[0];
        
        // Retornar dados reais do comprador se disponíveis
        const nomeExibir = tokenData.payer_name_temp || (tokenData.fn_hash ? 'Comprador Verificado ✓' : 'N/A');
        const cpfExibir = tokenData.payer_cpf_temp ? mascarCPF(tokenData.payer_cpf_temp) : (tokenData.external_id_hash ? '***.***.***-**' : 'N/A');
        const endToEndIdExibir = tokenData.end_to_end_id_temp || 'N/A';
        const ipExibir = tokenData.ip_criacao || 'N/A';
        
        res.json({
          success: true,
          nome: nomeExibir,
          cpf: cpfExibir,
          end_to_end_id: endToEndIdExibir,
          ip: ipExibir,
          verificado: !!(tokenData.fn_hash && tokenData.external_id_hash)
        });
      } else {
        res.json({
          success: true,
          nome: row.fn_hash ? 'Comprador Verificado ✓' : 'N/A',
          cpf: row.external_id_hash ? '***.***.***-**' : 'N/A',
          end_to_end_id: 'N/A',
          ip: 'N/A',
          verificado: !!(row.fn_hash && row.external_id_hash)
        });
      }
    } catch (dbError) {
      console.error('Erro ao buscar dados do webhook:', dbError);
      res.json({
        success: true,
        nome: row.fn_hash ? 'Comprador Verificado ✓' : 'N/A',
        cpf: row.external_id_hash ? '***.***.***-**' : 'N/A',
        end_to_end_id: 'N/A',
        ip: 'N/A',
        verificado: !!(row.fn_hash && row.external_id_hash)
      });
    }

  } catch (error) {
    console.error('Erro ao buscar dados do comprador:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Função auxiliar para formatar CPF completo
function mascarCPF(cpf) {
  if (!cpf) return '***.***.***-**';
  
  // Remove formatação existente
  const cpfNumeros = cpf.replace(/\D/g, '');
  
  if (cpfNumeros.length !== 11) {
    return '***.***.***-**';
  }
  
  // Formatar CPF completo: XXX.XXX.XXX-XX
  return `${cpfNumeros.slice(0,3)}.${cpfNumeros.slice(3,6)}.${cpfNumeros.slice(6,9)}-${cpfNumeros.slice(9,11)}`;
}

// Retorna a URL final de redirecionamento conforme grupo
app.get('/api/url-final', (req, res) => {
  const grupo = String(req.query.grupo || '').toUpperCase();
  let url = null;

  if (grupo === 'G1') {
    url = URL_ENVIO_1;
  } else if (grupo === 'G2') {
    url = URL_ENVIO_2;
  } else if (grupo === 'G3') {
    url = URL_ENVIO_3;
  } else if (grupo === 'G4') {
    url = URL_ENVIO_4;
  } else if (grupo === 'G5') {
    url = URL_ENVIO_5;
  } else if (grupo === 'G6') {
    url = URL_ENVIO_6;
  } else if (grupo === 'G7') {
    url = URL_ENVIO_7;
  } else if (grupo === 'G8') {
    url = URL_ENVIO_8;
  } else if (grupo === 'G9') {
    url = URL_ENVIO_9;
  } else if (grupo === 'G10') {
    url = URL_ENVIO_10;
  }

  if (!url) {
    return res.status(400).json({ sucesso: false, erro: 'Grupo inválido' });
  }

  res.json({ sucesso: true, url });
});

app.post('/api/gerar-payload', protegerContraFallbacks, async (req, res) => {
  try {
    const {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      fbp,
      fbc,
      ip: bodyIp,
      user_agent: bodyUa,
      kwai_click_id
    } = req.body || {};

    const headerUa = req.get('user-agent') || null;
    const headerIp = extractClientIp(req);

    const normalize = (val) => {
      if (typeof val === 'string') {
        const cleaned = val.toLowerCase().trim();
        return cleaned || null;
      }
      if (val === null || val === undefined) {
        return null;
      }
      const coerced = String(val).trim().toLowerCase();
      return coerced || null;
    };

    const normalizePreservingCase = (val) => {
      if (typeof val === 'string') {
        const cleaned = val.trim();
        return cleaned || null;
      }
      if (val === null || val === undefined) {
        return null;
      }
      const coerced = String(val).trim();
      return coerced || null;
    };

    const payloadId = crypto.randomBytes(4).toString('hex');

    const values = {
      utm_source: normalize(utm_source),
      utm_medium: normalize(utm_medium),
      utm_campaign: normalize(utm_campaign),
      utm_term: normalize(utm_term),
      utm_content: normalize(utm_content),
      fbp: normalizePreservingCase(fbp),
      fbc: normalizePreservingCase(fbc),
      ip: normalize(bodyIp || headerIp),
      user_agent: normalizePreservingCase(bodyUa || headerUa),
      kwai_click_id: kwai_click_id || null
    };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO payloads (payload_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            payloadId,
            values.utm_source,
            values.utm_medium,
            values.utm_campaign,
            values.utm_term,
            values.utm_content,
            values.fbp,
            values.fbc,
            values.ip,
            values.user_agent,
            values.kwai_click_id
          ]
        );
        console.log(`[payload] Novo payload salvo: ${payloadId}`);
      } catch (e) {
        if (e.code === '23505') {
          console.warn('Payload_id duplicado. Tente novamente.');
        } else {
          console.error('Erro ao inserir payloads:', e.message);
        }
      }
    }

    res.json({ payload_id: payloadId });
  } catch (err) {
    console.error('Erro ao gerar payload_id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Mantido para retrocompatibilidade
app.post('/api/payload', protegerContraFallbacks, async (req, res) => {
  try {
    const payloadId = crypto.randomBytes(4).toString('hex');
    const { fbp = null, fbc = null } = req.body || {};
    const userAgent = req.get('user-agent') || null;
    const ip = extractClientIp(req);

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO payload_tracking (payload_id, fbp, fbc, ip, user_agent)
           VALUES ($1, $2, $3, $4, $5)`,
          [payloadId, fbp, fbc, ip, userAgent]
        );
        console.log(`[payload] Novo payload salvo: ${payloadId}`);
      } catch (e) {
        if (e.code === '23505') {
          console.warn('Payload_id duplicado. Tente novamente.');
        } else {
          console.error('Erro ao inserir payload_tracking:', e.message);
        }
      }
    }

    res.json({ payload_id: payloadId });
  } catch (err) {
    console.error('Erro ao gerar payload_id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [TELEGRAM-ENTRY] Endpoint para persistir dados de entrada via página /telegram
app.post('/api/payload/telegram-entry', async (req, res) => {
  try {
    const {
      payload_id,
      fbc = null,
      fbp = null, 
      fbclid = null,
      user_agent = null,
      event_source_url = null,
      referrer = null
    } = req.body || {};

    // Validar payload_id obrigatório
    if (!payload_id || typeof payload_id !== 'string' || !payload_id.trim()) {
      console.warn('[PAYLOAD] telegram-entry: payload_id obrigatório não fornecido');
      return res.status(400).json({ ok: false, error: 'payload_id_required' });
    }

    const sanitizedPayloadId = payload_id.trim();
    const ip = extractClientIp(req);

    // Log de entrada
    console.log('[PAYLOAD] telegram-entry payload_id=', sanitizedPayloadId, 
                'fbc=', fbc ? `${fbc.substring(0, 20)}...` : 'vazio',
                'fbp=', fbp ? `${fbp.substring(0, 20)}...` : 'vazio',
                'ip=', ip || 'vazio');

    if (!pool) {
      console.error('[PAYLOAD] telegram-entry: pool PostgreSQL não disponível');
      return res.status(503).json({ ok: false, error: 'database_unavailable' });
    }

    // Feature flag
    const enableCapture = process.env.ENABLE_TELEGRAM_REDIRECT_CAPTURE !== 'false';
    if (!enableCapture) {
      console.warn('[PAYLOAD] telegram-entry: ENABLE_TELEGRAM_REDIRECT_CAPTURE=false, persistência desabilitada');
      return res.json({ ok: true, skipped: true, reason: 'feature_disabled' });
    }

    try {
      // Verificar se o payload_id já existe na tabela payloads
      const checkResult = await pool.query(
        'SELECT payload_id, telegram_entry_at FROM payloads WHERE payload_id = $1',
        [sanitizedPayloadId]
      );

      if (checkResult.rows.length === 0) {
        // Criar novo registro se não existir
        await pool.query(
          `INSERT INTO payloads (
            payload_id, 
            telegram_entry_at, 
            telegram_entry_fbc, 
            telegram_entry_fbp, 
            telegram_entry_fbclid,
            telegram_entry_user_agent, 
            telegram_entry_event_source_url, 
            telegram_entry_referrer, 
            telegram_entry_ip
          ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)`,
          [sanitizedPayloadId, fbc, fbp, fbclid, user_agent, event_source_url, referrer, ip]
        );
        console.log('[PAYLOAD] telegram-entry: novo registro criado para payload_id=', sanitizedPayloadId);
      } else {
        // Atualizar somente se campos estiverem vazios (priorizar dados da presell)
        // [CODEX] Comentário: merge inteligente - só atualiza se melhor que o existente
        await pool.query(
          `UPDATE payloads 
           SET telegram_entry_at = COALESCE(telegram_entry_at, NOW()),
               telegram_entry_fbc = COALESCE(telegram_entry_fbc, $2),
               telegram_entry_fbp = COALESCE(telegram_entry_fbp, $3),
               telegram_entry_fbclid = COALESCE(telegram_entry_fbclid, $4),
               telegram_entry_user_agent = COALESCE(telegram_entry_user_agent, $5),
               telegram_entry_event_source_url = COALESCE(telegram_entry_event_source_url, $6),
               telegram_entry_referrer = COALESCE(telegram_entry_referrer, $7),
               telegram_entry_ip = COALESCE(telegram_entry_ip, $8)
           WHERE payload_id = $1`,
          [sanitizedPayloadId, fbc, fbp, fbclid, user_agent, event_source_url, referrer, ip]
        );
        console.log('[PAYLOAD] telegram-entry: registro atualizado para payload_id=', sanitizedPayloadId);
      }

      res.json({ ok: true });
    } catch (dbError) {
      console.error('[PAYLOAD] telegram-entry: erro ao persistir no banco', {
        error: dbError.message,
        payload_id: sanitizedPayloadId
      });
      return res.status(500).json({ ok: false, error: 'database_error' });
    }
  } catch (err) {
    console.error('[PAYLOAD] telegram-entry: erro inesperado', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.get('/api/tracking/by-token/:token', async (req, res) => {
  const rawToken = req.params?.token;
  const sanitizedToken = normalizeTrackingValue(rawToken);

  if (!sanitizedToken) {
    return res.status(400).json({ ok: false, error: 'token_required' });
  }

  if (!pool) {
    console.error('[TRACKING-BY-TOKEN] ❌ Pool PostgreSQL indisponível');
    return res.status(503).json({ ok: false, error: 'database_unavailable' });
  }

  try {
    const tokenResult = await pool.query(
      'SELECT telegram_id FROM tokens WHERE token = $1 LIMIT 1',
      [sanitizedToken]
    );

    if (tokenResult.rows.length === 0) {
      console.warn('[TRACKING-BY-TOKEN] ⚠️ Token não encontrado', { token: sanitizedToken });
      return res.status(404).json({ ok: false, error: 'token_not_found' });
    }

    const telegramIdRaw = tokenResult.rows[0].telegram_id;
    const telegramId = telegramIdRaw !== null && telegramIdRaw !== undefined
      ? normalizeTrackingValue(String(telegramIdRaw))
      : null;

    const resolved = await resolveFbcFbp(
      { token: sanitizedToken, telegram_id: telegramId },
      { logPrefix: null }
    );

    console.log(
      `[TRACKING-BY-TOKEN] token=${sanitizedToken} telegram_id=${telegramId || 'vazio'} ` +
        `fbc_source=${resolved.fbc_source} fbp_source=${resolved.fbp_source} ` +
        `fbc=${resolved.fbc || 'vazio'} fbp=${resolved.fbp || 'vazio'}`
    );

    return res.json({
      ok: true,
      token: sanitizedToken,
      telegram_id: telegramId,
      fbc: resolved.fbc || null,
      fbp: resolved.fbp || null,
      fbclid: resolved.fbclid || null
    });
  } catch (error) {
    console.error('[TRACKING-BY-TOKEN] ❌ Erro inesperado', {
      token: sanitizedToken,
      error: error.message
    });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// 🔥 NOVO: Endpoint para debug do rastreamento invisível
app.get('/api/session-tracking-stats', async (req, res) => {
  try {
    const { getInstance: getSessionTracking } = require('./services/sessionTracking');
    const sessionTracking = getSessionTracking();
    const stats = sessionTracking.getStats();
    
    res.json({
      success: true,
      message: 'Estatísticas do rastreamento de sessão invisível',
      stats: stats,
      description: {
        main_cache_entries: 'Usuários ativos no cache principal',
        fallback_cache_entries: 'Usuários no cache secundário',
        total_users_tracked: 'Total de usuários únicos rastreados'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estatísticas',
      message: error.message
    });
  }
});

// 🔥 NOVO: Endpoint para buscar dados específicos de um usuário (só para debug)
app.get('/api/session-tracking/:telegram_id', async (req, res) => {
  try {
    const { telegram_id } = req.params;
    
    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'telegram_id obrigatório'
      });
    }

    const { getInstance: getSessionTracking } = require('./services/sessionTracking');
    const sessionTracking = getSessionTracking();
    const data = sessionTracking.getTrackingData(telegram_id);
    
    if (!data) {
      return res.json({
        success: false,
        message: 'Nenhum dado encontrado para este telegram_id',
        telegram_id: telegram_id
      });
    }

    // Não expor dados sensíveis completos em produção
    const sanitizedData = {
      telegram_id: data.telegram_id,
      has_fbp: !!data.fbp,
      has_fbc: !!data.fbc,
      has_ip: !!data.ip,
      has_user_agent: !!data.user_agent,
      utm_source: data.utm_source,
      utm_medium: data.utm_medium,
      utm_campaign: data.utm_campaign,
      created_at: data.created_at,
      last_updated: data.last_updated,
      age_minutes: Math.round((Date.now() - data.created_at) / 60000)
    };

    res.json({
      success: true,
      message: 'Dados de rastreamento encontrados',
      data: sanitizedData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar dados de rastreamento',
      message: error.message
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'welcome' quando usuário acessa boasvindas.html
app.post('/api/track-welcome', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'welcome!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Welcome event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento welcome:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track welcome event.' 
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'cta_clicker' quando usuário clica no botão
app.post('/api/track-cta-click', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'cta_clicker!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'CTA click event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento cta_clicker:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track CTA click event.' 
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento '/start' quando usuário inicia conversa com o bot
app.post('/api/track-bot-start', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'bot_start!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Bot start event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento bot start:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track bot start event.' 
    });
  }
});

// ====================================
// 🎯 SISTEMA COMPLETO DE RASTREAMENTO
// ====================================

// 📊 ROTA: Registrar UTMs capturadas
app.post('/utm', async (req, res) => {
  try {
    const utmData = req.body;
    console.log('[UTM] Dados recebidos:', utmData);
    
    // Aqui você pode salvar os UTMs no banco de dados se necessário
    // Por enquanto, apenas logamos
    
    res.status(200).json({ 
      success: true, 
      message: 'UTMs registrados com sucesso',
      data: utmData
    });
  } catch (error) {
    console.error('[UTM] Erro ao registrar UTMs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// 🚀 ROTA: Facebook CAPI (Conversions API)
app.post('/capi', async (req, res) => {
  try {
    const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
    const FB_PIXEL_TOKEN = process.env.FB_PIXEL_TOKEN;
    
    if (!FB_PIXEL_ID || !FB_PIXEL_TOKEN) {
      console.error('[CAPI] Configurações do Facebook não encontradas');
      return res.status(500).json({ 
        success: false, 
        message: 'Configurações do Facebook não encontradas' 
      });
    }

    const {
      event_name,
      event_time,
      event_source_url,
      value,
      currency = 'BRL',
      event_id,
      user_data,
      fbp,
      fbc,
      client_ip_address,
      client_user_agent
    } = req.body;

    const normalizedUserData = user_data || {
      fbp,
      fbc,
      ip_address: client_ip_address,
      user_agent: client_user_agent
    };

    // Construir payload para Facebook CAPI
    const eventData = {
      event_name,
      event_time,
      event_source_url: event_source_url || process.env.FRONTEND_URL,
      action_source: 'website',
      event_id,
      user_data: {
        client_ip_address: normalizedUserData.ip_address || req.ip,
        client_user_agent: normalizedUserData.user_agent || req.get('User-Agent'),
        fbc: normalizedUserData.fbc,
        fbp: normalizedUserData.fbp
      }
    };

    // Adicionar dados de compra se houver valor
    if (value && value > 0) {
      eventData.custom_data = {
        value: parseFloat(value),
        currency: currency
      };
    }

    // Enviar para Facebook CAPI
    const capiUrl = `https://graph.facebook.com/v18.0/${FB_PIXEL_ID}/events`;
    const capiPayload = {
      data: [eventData]
    };

    console.log('[CAPI] Enviando evento:', event_name, capiPayload);

    const response = await fetch(capiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FB_PIXEL_TOKEN}`
      },
      body: JSON.stringify(capiPayload)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('[CAPI] Evento enviado com sucesso:', result);
      res.status(200).json({ 
        success: true, 
        message: 'Evento enviado para Facebook CAPI',
        data: result
      });
    } else {
      console.error('[CAPI] Erro na resposta do Facebook:', result);
      res.status(400).json({ 
        success: false, 
        message: 'Erro ao enviar evento para Facebook',
        error: result
      });
    }

  } catch (error) {
    console.error('[CAPI] Erro interno:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// 💼 ROTA: UTMify Conversions
app.post('/utimify', async (req, res) => {
  try {
    const UTIMIFY_AD_ACCOUNT_ID = process.env.UTIMIFY_AD_ACCOUNT_ID;
    const UTIMIFY_API_TOKEN = process.env.UTIMIFY_API_TOKEN;
    
    if (!UTIMIFY_AD_ACCOUNT_ID || !UTIMIFY_API_TOKEN) {
      console.log('[UTIMIFY] Configurações não encontradas - pulando envio', {
        req_id: req.requestId || null
      });
      return res.status(200).json({
        success: true,
        message: 'UTMify não configurado - conversão não enviada'
      });
    }

    const { value, currency = 'BRL', utm_data } = req.body;
    
    if (!value || value <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valor da conversão é obrigatório' 
      });
    }

    const conversionData = {
      payer_name: 'Cliente Privacy',
      telegram_id: 'privacy_' + Date.now(),
      transactionValueCents: Math.round(value * 100),
      trackingData: utm_data || {},
      orderId: `privacy_${Date.now()}`,
      nomeOferta: 'Privacy Checkout',
      requestId: req.requestId || null
    };

    const result = await utmifyService.enviarConversaoParaUtmify(conversionData);

    console.log('[UTIMIFY] Conversão enviada com sucesso', {
      req_id: req.requestId || null,
      sent: Boolean(result?.sent),
      attempt: result?.attempt || null
    });
    
    res.status(200).json({ 
      success: true, 
      message: 'Conversão enviada para UTMify',
      data: result
    });

  } catch (error) {
    console.error('[UTIMIFY] Erro ao enviar conversão', {
      req_id: req.requestId || null,
      error: error.message
    });
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'pix_generated' quando usuário gera uma cobrança PIX
app.post('/api/track-pix-generated', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'pix_generated!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'PIX generated event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento PIX generated:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track PIX generated event.' 
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'purchase' quando usuário realiza uma compra
app.post('/api/track-purchase', async (req, res) => {
  try {
    // Extrair offerName do corpo da requisição
    const { offerName } = req.body;

    // Validar se offerName foi fornecido
    if (!offerName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Offer name is required.' 
      });
    }

    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'purchase!A1';
    const values = [[new Date().toISOString().split('T')[0], 1, offerName]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Purchase event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento purchase:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track purchase event.' 
    });
  }
});

// 🚫 TEMPORARIAMENTE DESABILITADO - CENTRALIZANDO NO WEBHOOK PUSHINPAY
// 🔥 NOVA ROTA: Endpoint para eventos Purchase via CAPI (Browser → Server)
app.post('/api/facebook-purchase', async (req, res) => {
  try {
    console.log('🚫 [FACEBOOK-PURCHASE] ENDPOINT TEMPORARIAMENTE DESABILITADO');
    console.log('📋 Motivo: Centralizando envio de Purchase apenas no webhook PushinPay');
    console.log('🔄 Solução: Todos os eventos Purchase serão enviados via webhook para evitar duplicação');
    
    return res.status(200).json({
      success: false,
      error: 'Endpoint temporariamente desabilitado',
      message: 'Purchase events are now centralized in PushinPay webhook to prevent duplication',
      reason: 'Centralizing all Purchase events in webhook to avoid duplicates'
    });

    // CÓDIGO ORIGINAL COMENTADO TEMPORARIAMENTE
    /*
    const {
      event_name,
      event_time,
      event_id,
      event_source_url,
      value,
      currency,
      transaction_id,
      source = 'browser',
      user_data = {},
      custom_data = {}
    } = req.body;

    // Validar parâmetros obrigatórios
    if (!event_name || event_name !== 'Purchase') {
      return res.status(400).json({
        success: false,
        error: 'event_name deve ser "Purchase"'
      });
    }

    if (!event_id) {
      return res.status(400).json({
        success: false,
        error: 'event_id é obrigatório'
      });
    }

    if (!value || value <= 0) {
      return res.status(400).json({
        success: false,
        error: 'value deve ser maior que 0'
      });
    }

    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        error: 'transaction_id é obrigatório'
      });
    }

    console.log(`[FACEBOOK-PURCHASE] Recebido evento Purchase via CAPI:`, {
      event_id,
      transaction_id,
      value,
      currency,
      source,
      user_data_keys: Object.keys(user_data)
    });

    // Preparar dados para envio via sendFacebookEvent
    const eventData = {
      event_name: 'Purchase',
      event_time: event_time || Math.floor(Date.now() / 1000),
      event_id: event_id,
      event_source_url: event_source_url || 'https://privacy.com.br/checkout/',
      value: value,
      currency: currency || 'BRL',
      fbp: user_data.fbp,
      fbc: user_data.fbc,
      client_ip_address: user_data.client_ip_address || req.ip,
      client_user_agent: user_data.client_user_agent || req.get('User-Agent'),
      custom_data: {
        ...custom_data,
        transaction_id: transaction_id
      },
      source: 'capi',
      telegram_id: null // Não aplicável para checkout web
    };

    // Adicionar external_id se fornecido
    if (user_data.external_id) {
      eventData.user_data_hash = {
        external_id: user_data.external_id
      };
    }

    eventData.__httpRequest = {
      headers: req.headers,
      body: req.body,
      query: req.query
    };

    // Enviar evento via sendFacebookEvent
    const result = await sendFacebookEvent(eventData);

    if (result.success) {
      console.log(`[FACEBOOK-PURCHASE] ✅ Evento Purchase enviado com sucesso via CAPI:`, {
        event_id,
        transaction_id,
        value,
        currency
      });

      return res.status(200).json({
        success: true,
        message: 'Purchase event sent successfully',
        event_id,
        transaction_id
      });
    } else {
      console.error(`[FACEBOOK-PURCHASE] ❌ Falha ao enviar evento Purchase via CAPI:`, result.error);

      return res.status(500).json({
        success: false,
        error: result.error || 'Falha ao enviar evento Purchase',
        event_id,
        transaction_id
      });
    }
    */

  } catch (error) {
    console.error('[FACEBOOK-PURCHASE] Erro no endpoint /api/facebook-purchase:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// 🎯 NOVA ROTA: Armazenar click ID do Kwai
app.post('/api/kwai-click-id', async (req, res) => {
  try {
    const { telegram_id, click_id } = req.body;

    if (!telegram_id || !click_id) {
      return res.status(400).json({
        success: false,
        message: 'telegram_id e click_id são obrigatórios'
      });
    }

    const kwaiAPI = getKwaiEventAPI();
    const stored = kwaiAPI.storeKwaiClickId(telegram_id, click_id);

    if (stored) {
      return res.status(200).json({
        success: true,
        message: 'Click ID do Kwai armazenado com sucesso'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Erro ao armazenar click ID do Kwai'
      });
    }

  } catch (error) {
    console.error('Erro ao armazenar click ID do Kwai:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// 🧪 ROTAS DE TESTE PARA KWAI EVENT API
app.post('/api/kwai-test/content-view', async (req, res) => {
  try {
    const kwaiAPI = getKwaiEventAPI();
    const result = await kwaiAPI.testContentViewEvent(req.body);
    
    res.json({
      success: true,
      message: 'Teste EVENT_CONTENT_VIEW executado',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kwai-test/add-to-cart', async (req, res) => {
  try {
    const kwaiAPI = getKwaiEventAPI();
    const result = await kwaiAPI.testAddToCartEvent(req.body);
    
    res.json({
      success: true,
      message: 'Teste EVENT_ADD_TO_CART executado',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kwai-test/purchase', async (req, res) => {
  try {
    const kwaiAPI = getKwaiEventAPI();
    const result = await kwaiAPI.testPurchaseEvent(req.body);
    
    res.json({
      success: true,
      message: 'Teste EVENT_PURCHASE executado',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/kwai-test/all', async (req, res) => {
  try {
    const kwaiAPI = getKwaiEventAPI();
    const result = await kwaiAPI.testAllEvents();
    
    res.json({
      success: true,
      message: 'Teste completo de todos os eventos executado',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 NOVA ROTA: API para envio de eventos Kwai
app.post('/api/kwai-event', async (req, res) => {
  try {
    const { eventName, clickid, properties, telegramId } = req.body;

    // Validações básicas
    if (!eventName) {
      return res.status(400).json({
        success: false,
        error: 'eventName é obrigatório'
      });
    }

    // Se não tem clickid nem telegramId, tentar extrair de headers/cookies
    let finalClickid = clickid;
    let finalTelegramId = telegramId;

    if (!finalClickid && !finalTelegramId) {
      // Tentar obter dados de tracking da sessão atual
      const userAgent = req.headers['user-agent'];
      const sessionData = req.session || {};
      
      console.log('🎯 [KWAI-API] Tentando detectar clickid/telegramId automaticamente');
    }

    const kwaiAPI = getKwaiEventAPI();
    
    // Verificar se o serviço está configurado
    if (!kwaiAPI.isConfigured()) {
      console.warn('⚠️ [KWAI-API] Serviço não configurado');
      return res.status(200).json({
        success: false,
        error: 'Serviço Kwai não configurado (KWAI_ACCESS_TOKEN ou KWAI_PIXEL_ID ausentes)',
        configured: false
      });
    }

    console.log(`🎯 [KWAI-API] Recebendo evento: ${eventName}`, {
      hasClickid: !!finalClickid,
      hasTelegramId: !!finalTelegramId,
      properties: properties || {}
    });

    // Enviar evento
    const result = await kwaiAPI.sendKwaiEvent(
      eventName, 
      finalClickid, 
      properties || {}, 
      finalTelegramId
    );

    // Retornar resultado
    if (result.success) {
      console.log(`✅ [KWAI-API] Evento ${eventName} processado com sucesso`);
      return res.status(200).json({
        success: true,
        message: `Evento ${eventName} enviado com sucesso`,
        kwaiResponse: result.response,
        clickid: result.clickid ? result.clickid.substring(0, 20) + '...' : null
      });
    } else {
      console.error(`❌ [KWAI-API] Erro ao processar evento ${eventName}:`, result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
        eventName: result.eventName,
        clickid: result.clickid ? result.clickid.substring(0, 20) + '...' : null
      });
    }

  } catch (error) {
    console.error('❌ [KWAI-API] Erro interno:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// 🎯 NOVA ROTA: Configurações do Kwai para o frontend
app.get('/api/kwai-config', (req, res) => {
  try {
    const kwaiAPI = getKwaiEventAPI();
    const config = kwaiAPI.getConfig();
    
    res.status(200).json({
      success: true,
      config: config,
      endpoints: {
        sendEvent: '/api/kwai-event',
        storeClickId: '/api/kwai-click-id'
      }
    });
  } catch (error) {
    console.error('Erro ao obter configurações do Kwai:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 🔥 NOVA ROTA: Webhook para processar notificações de pagamento
app.post('/webhook', async (req, res) => {
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

    const payment = req.body;
    const { status } = payment || {};
    const idBruto = payment.id || payment.token || payment.transaction_id || null;
    const normalizedId = idBruto ? idBruto.toLowerCase().trim() : null;

    console.log('🔔 Webhook recebido');
    console.log('Payload:', JSON.stringify(payment, null, 2));
    console.log('Headers:', req.headers);
    console.log('ID normalizado:', normalizedId);
    console.log('Status:', status);

    // Verificar se o pagamento foi aprovado
    if (normalizedId && ['paid', 'approved', 'pago'].includes(status)) {
      console.log('✅ Pagamento aprovado detectado');
      
      // Buscar informações da transação no banco de dados PostgreSQL
      if (!pool) {
        console.error('❌ Pool de conexão PostgreSQL não disponível');
        return res.sendStatus(500);
      }
      
      const transaction_info = await pool.query('SELECT * FROM tokens WHERE id_transacao = $1', [normalizedId]);
      
      if (transaction_info.rows.length > 0) {
        const transaction = transaction_info.rows[0];
        console.log('📊 Dados da transação encontrados:', transaction);
        
        // 🔥 NOVO: Chamar API de tracking para registrar a compra na planilha
        try {
          const axios = require('axios');
          await axios.post('http://localhost:3000/api/track-purchase', {
            offerName: transaction.nome_oferta || 'Oferta Desconhecida'
          });
          console.log('✅ Evento de purchase registrado na planilha com sucesso');
        } catch (error) {
          console.error('Falha ao registrar o evento de purchase na planilha:', error.message);
          // A falha no registro da planilha não deve impedir o restante do processamento
        }

        // 🔥 DISPARAR EVENTO PURCHASE DO FACEBOOK PIXEL
        try {
          const { sendFacebookEvent } = require('./services/facebook');
          
          const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
          const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
          
          await sendFacebookEvent({
            event_name: 'Purchase',
            value: purchaseValue,
            currency: 'BRL',
            event_id: `purchase_${normalizedId}_${Date.now()}`,
            event_source_url: `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/checkout/`,
            custom_data: {
              content_name: planName,
              content_category: 'Privacy Checkout',
              transaction_id: normalizedId
            },
            // Tentar recuperar dados de tracking se disponíveis
            fbp: transaction.fbp,
            fbc: transaction.fbc,
            client_ip_address: transaction.ip,
            client_user_agent: transaction.user_agent,
            source: 'webhook',
            token: transaction.token,
            __httpRequest: {
              headers: req.headers,
              body: req.body,
              query: req.query
            }
          });
          
          console.log(`✅ Evento Purchase enviado via Pixel/CAPI - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
        } catch (error) {
          console.error('❌ Erro ao enviar evento Purchase:', error.message);
        }

        // 🎯 NOVO: Enviar evento Purchase via Kwai Event API
        try {
          const kwaiAPI = getKwaiEventAPI();
          
          if (kwaiAPI.isConfigured()) {
            const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
            const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
            
            const kwaiResult = await kwaiAPI.sendPurchaseEvent(
              transaction.telegram_id || transaction.token,
              {
                content_id: transaction.nome_oferta || 'plano_privacy',
                content_name: planName,
                value: purchaseValue,
                currency: 'BRL'
              },
              transaction.kwai_click_id // Click ID do Kwai se disponível
            );
            
            if (kwaiResult.success) {
              console.log(`✅ Evento Purchase enviado via Kwai Event API - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
            } else {
              console.error('❌ Erro ao enviar evento Purchase via Kwai:', kwaiResult.error);
            }
          } else {
            console.log('ℹ️ Kwai Event API não configurado, pulando envio');
          }
        } catch (error) {
          console.error('❌ Erro ao enviar evento Purchase via Kwai Event API:', error.message);
        }
        
        // Continuar com o processamento normal do webhook...
        // (aqui você pode adicionar a lógica existente do webhook)
        
      } else {
        console.log('❌ Transação não encontrada no banco de dados');
      }
    } else {
      console.log('ℹ️ Pagamento não aprovado ou ID inválido');
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err.message);
    return res.sendStatus(500);
  }
});

// 🔥 WEBHOOK UNIFICADO: Processar notificações de pagamento (bot + site)
app.post('/webhook/pushinpay', async (req, res) => {
  const correlationId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Proteção contra payloads vazios
    if (!req.body || typeof req.body !== 'object') {
      console.log(`[${correlationId}] ❌ Payload inválido`);
      return res.status(400).send('Payload inválido');
    }

    // 🎯 VALIDAÇÃO PUSHINPAY: Header customizado é OPCIONAL
    // A PushinPay permite configurar um header customizado no painel deles (OPCIONAL)
    // Se configurado, valida; se não configurado, aceita o webhook normalmente
    if (process.env.PUSHINPAY_WEBHOOK_TOKEN) {
      const pushinpayToken = req.headers['x-pushinpay-token'];
      if (pushinpayToken !== process.env.PUSHINPAY_WEBHOOK_TOKEN) {
        console.log(`[${correlationId}] ❌ Token PushinPay inválido`);
        console.log(`[${correlationId}] Token recebido: ${pushinpayToken}`);
        console.log(`[${correlationId}] Token esperado: ${process.env.PUSHINPAY_WEBHOOK_TOKEN}`);
        return res.sendStatus(403);
      }
      console.log(`[${correlationId}] ✅ Token PushinPay validado com sucesso`);
    } else {
      console.log(`[${correlationId}] ℹ️ Header customizado não configurado - webhook aceito normalmente`);
    }

    const payment = req.body;
    const { status } = payment || {};
    const idBruto = payment.id || payment.token || payment.transaction_id || null;
    const normalizedId = idBruto ? idBruto.toLowerCase().trim() : null;

    console.log(`[${correlationId}] 🔔 Webhook PushinPay recebido`);
    console.log(`[${correlationId}] Payload:`, JSON.stringify(payment, null, 2));
    console.log(`[${correlationId}] Headers:`, req.headers);
    console.log(`[${correlationId}] ID normalizado:`, normalizedId);
    console.log(`[${correlationId}] Status:`, status);

    // Verificar se o pagamento foi aprovado
    if (normalizedId && ['paid', 'approved', 'pago'].includes(status)) {
      console.log(`[${correlationId}] ✅ Pagamento aprovado, processando...`);
      
      // Buscar transação no banco de dados
      let transaction = null;
      
      // Tentar SQLite primeiro
      const db = sqlite.get();
      if (db) {
        transaction = db.prepare('SELECT * FROM tokens WHERE LOWER(id_transacao) = ?').get(normalizedId);
        console.log(`[${correlationId}] 🔍 Busca no SQLite:`, transaction ? 'Encontrada' : 'Não encontrada');
      }
      
      // Se não encontrou no SQLite, tentar PostgreSQL
      if (!transaction && pool) {
        try {
          const result = await pool.query('SELECT * FROM tokens WHERE LOWER(id_transacao) = LOWER($1)', [normalizedId]);
          if (result.rows.length > 0) {
            transaction = result.rows[0];
            console.log(`[${correlationId}] 🔍 Busca no PostgreSQL: Encontrada`);
          }
        } catch (pgError) {
          console.error(`[${correlationId}] ❌ Erro ao buscar no PostgreSQL:`, pgError.message);
        }
      }
      
      if (transaction) {
        console.log(`[${correlationId}] ✅ Transação encontrada no banco de dados:`, {
          id: transaction.id_transacao,
          valor: transaction.valor,
          plano: transaction.nome_oferta,
          source: transaction.bot_id
        });

        const previousStatus = transaction.status || transaction.status_at || transaction.status_original || null;
        const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
        console.log('[WEBHOOK] purchase:status_transition', {
          transaction_id: normalizedId,
          from: previousStatus || 'unknown',
          to: normalizedStatus || 'unknown'
        });
        
        // Extrair dados do pagamento do webhook
        const paidAt = new Date().toISOString();
        const endToEndId = payment.end_to_end_id || payment.pix_end_to_end_id || null;
        const payerName = payment.payer_name || payment.pix_payer_name || null;
        // 🎯 CPF CANÔNICO: Ler de payer_national_registration e persistir em payer_cpf
        const payerNationalRegistration = payment.payer_national_registration || payment.pix_payer_national_registration || null;
        const payerCpfCanonical = payerNationalRegistration; // CPF canônico
        
        // Extrair valor (PushinPay já retorna em centavos)
        const valueCents = payment.value || payment.amount || null;
        const priceCents = valueCents ? parseInt(valueCents, 10) : null;
        
          console.log(`[${correlationId}] 📋 Dados do pagamento extraídos:`, {
          paidAt,
          endToEndId,
          payerName,
          payer_cpf: payerCpfCanonical,
          value_raw: valueCents,
          price_cents: priceCents
        });
        
        // Atualizar status da transação com dados completos
        if (db) {
          // Verificar se as colunas existem antes de tentar atualizar
          const cols = db.prepare('PRAGMA table_info(tokens)').all();
          const hasIsPaid = cols.some(c => c.name === 'is_paid');
          const hasPaidAt = cols.some(c => c.name === 'paid_at');
          const hasEndToEndId = cols.some(c => c.name === 'end_to_end_id');
          const hasPayerName = cols.some(c => c.name === 'payer_name');
          const hasPayerNationalRegistration = cols.some(c => c.name === 'payer_national_registration');
          const hasKwaiClickId = cols.some(c => c.name === 'kwai_click_id');
          const hasPriceCents = cols.some(c => c.name === 'price_cents');
          const hasPayerCpf = cols.some(c => c.name === 'payer_cpf');
          
          if (!hasIsPaid || !hasPaidAt || !hasEndToEndId || !hasPayerName || !hasPayerNationalRegistration || !hasKwaiClickId || !hasPriceCents || !hasPayerCpf) {
            console.log(`[${correlationId}] 🔄 Adicionando colunas necessárias...`);
            
            if (!hasIsPaid) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN is_paid INTEGER DEFAULT 0').run(); } catch(e) {}
            }
            if (!hasPaidAt) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN paid_at TEXT').run(); } catch(e) {}
            }
            if (!hasEndToEndId) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN end_to_end_id TEXT').run(); } catch(e) {}
            }
            if (!hasPayerName) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN payer_name TEXT').run(); } catch(e) {}
            }
            if (!hasPayerNationalRegistration) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN payer_national_registration TEXT').run(); } catch(e) {}
            }
            if (!hasPayerCpf) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN payer_cpf TEXT').run(); } catch(e) {}
            }
            if (!hasPriceCents) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN price_cents INTEGER').run(); } catch(e) {}
            }
            if (!hasKwaiClickId) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN kwai_click_id TEXT').run(); } catch(e) {}
            }
            if (!cols.some(c => c.name === 'usado')) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN usado INTEGER DEFAULT 0').run(); } catch(e) {}
            }
            // Adicionar colunas para sistema de tokens WhatsApp
            if (!cols.some(c => c.name === 'tipo')) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN tipo VARCHAR(50) DEFAULT \'principal\'').run(); } catch(e) {}
            }
            if (!cols.some(c => c.name === 'descricao')) {
              try { db.prepare('ALTER TABLE tokens ADD COLUMN descricao TEXT').run(); } catch(e) {}
            }
          }
          
          // Atualizar com todas as colunas disponíveis (payer_cpf é canônico)
          db.prepare(`
            UPDATE tokens SET
              status = ?,
              usado = ?,
              is_paid = ?,
              paid_at = ?,
              end_to_end_id = ?,
              payer_name = ?,
              payer_national_registration = ?,
              payer_cpf = ?,
              price_cents = ?
            WHERE id_transacao = ?
          `).run('valido', 0, 1, paidAt, endToEndId, payerName, payerCpfCanonical, payerCpfCanonical, priceCents, normalizedId);
          console.log(`[${correlationId}] ✅ Status da transação atualizado (SQLite) tx=${normalizedId} price_cents=${priceCents}`);
        }
        
        if (pool) {
          try {
            // Gerar event_id_purchase se não existir
            const eventIdPurchase = generatePurchaseEventId(normalizedId);
            
            await pool.query(`
              UPDATE tokens SET
                status = $1,
                usado = $2,
                is_paid = $3,
                paid_at = $4,
                end_to_end_id = $5,
                payer_name = $6,
                payer_national_registration = $7,
                payer_cpf = $8,
                price_cents = $9,
                capi_ready = TRUE,
                event_id_purchase = COALESCE(event_id_purchase, $11)
              WHERE id_transacao = $10
            `, ['valido', 0, 1, paidAt, endToEndId, payerName, payerCpfCanonical, payerCpfCanonical, priceCents, normalizedId, eventIdPurchase]);
            
            console.log(`[PUSHINPAY] tx=${normalizedId} price_cents=${priceCents} payer_name=${payerName} payer_cpf=${payerCpfCanonical} linked_token=${transaction.token} event_id=${eventIdPurchase}`);
            console.log(`[${correlationId}] ✅ Status da transação atualizado (PostgreSQL) tx=${normalizedId} price_cents=${priceCents} capi_ready=true`);
          } catch (pgError) {
            console.error(`[${correlationId}] ❌ Erro ao atualizar no PostgreSQL:`, pgError.message);
          }
        }

        // 🎯 NOVO: Enviar link de acesso via Telegram após confirmação PushinPay
        const botId = transaction.bot_id;
        const telegramId = transaction.telegram_id;
        const tokenAcesso = transaction.token;
        const utmSource = transaction.utm_source;
        const utmMedium = transaction.utm_medium;
        const utmCampaign = transaction.utm_campaign;
        const utmTerm = transaction.utm_term;
        const utmContent = transaction.utm_content;

        if (botId && telegramId) {
          try {
            const botInstance = getBotService(botId);
            if (botInstance && botInstance.bot) {
              // 🎯 CORREÇÃO: Usar price_cents do webhook (fonte canônica), não transaction.valor
              const valorReais = priceCents && priceCents > 0 
                ? Number((priceCents / 100).toFixed(2))
                : null;

              let grupo = 'G1';
              if (botId === 'bot2') grupo = 'G2';
              else if (botId === 'bot_especial') grupo = 'G3';
              else if (botId === 'bot4') grupo = 'G4';
              else if (botId === 'bot5') grupo = 'G5';
              else if (botId === 'bot6') grupo = 'G6';
              else if (botId === 'bot7') grupo = 'G7';

              const utmParams = [];
              if (utmSource) utmParams.push(`utm_source=${encodeURIComponent(utmSource)}`);
              if (utmMedium) utmParams.push(`utm_medium=${encodeURIComponent(utmMedium)}`);
              if (utmCampaign) utmParams.push(`utm_campaign=${encodeURIComponent(utmCampaign)}`);
              if (utmTerm) utmParams.push(`utm_term=${encodeURIComponent(utmTerm)}`);
              if (utmContent) utmParams.push(`utm_content=${encodeURIComponent(utmContent)}`);
              const utmString = utmParams.length ? '&' + utmParams.join('&') : '';

              // 🎯 CORREÇÃO: Omitir parâmetro 'valor' se não disponível (não enviar valor=0)
              let linkAcesso;
              if (valorReais !== null) {
                linkAcesso = `${process.env.FRONTEND_URL || 'https://ohvips.xyz'}/obrigado_purchase_flow.html?token=${encodeURIComponent(tokenAcesso)}&valor=${valorReais}&${grupo}${utmString}`;
                console.log(`[BOT-LINK] token=${tokenAcesso} price_cents=${priceCents} valor=${valorReais} url=${linkAcesso}`);
              } else {
                linkAcesso = `${process.env.FRONTEND_URL || 'https://ohvips.xyz'}/obrigado_purchase_flow.html?token=${encodeURIComponent(tokenAcesso)}&${grupo}${utmString}`;
                console.log(`[BOT-LINK] omitindo parâmetro "valor" por ausência de price_cents. token=${tokenAcesso} url=${linkAcesso}`);
              }

              await botInstance.bot.sendMessage(
                telegramId,
                `🎉 Pagamento aprovado!\n\n🔗 Acesse: ${linkAcesso}\n\n⚠️ Link expira em 5 minutos.`,
                { parse_mode: 'HTML' }
              );

              console.log(`[${correlationId}] ✅ Link enviado para Telegram ID: ${telegramId} via bot: ${botId}`);
            } else {
              console.error(`[${correlationId}] ❌ Bot não encontrado ou não inicializado: ${botId}`);
            }
          } catch (error) {
            console.error(`[${correlationId}] ❌ Erro ao enviar link via Telegram:`, error.message);
          }
        } else {
          console.warn(`[${correlationId}] ⚠️ Dados insuficientes para notificar Telegram - bot_id: ${botId}, telegram_id: ${telegramId}`);
        }

        // 🎯 Enviar evento Purchase via Meta CAPI
        const paidStatuses = new Set(['paid', 'approved', 'pago', 'confirmed', 'completed']);

        if (!normalizedId) {
          console.warn('[WEBHOOK] purchase:missing_transaction_id', { status: normalizedStatus });
        } else if (!paidStatuses.has(normalizedStatus)) {
          console.log('[WEBHOOK] purchase:status_skip', {
            transaction_id: normalizedId,
            status: normalizedStatus || 'unknown'
          });
        } else {
          const valueCents = resolveValueInCents(
            payment.value_cents,
            payment.amount_cents,
            payment.value,
            payment.amount,
            transaction.valor
          );
          const currency = (payment.currency || transaction.currency || 'BRL').toString().toUpperCase();
          const paidEventTime = parseWebhookTimestamp(
            payment.paid_at ||
              payment.paidAt ||
              payment.approved_at ||
              payment.approvedAt ||
              payment.confirmed_at ||
              payment.confirmedAt ||
              payment.completed_at ||
              payment.completedAt ||
              payment.status_at ||
              payment.statusAt ||
              payment.updated_at ||
              payment.updatedAt ||
              payment.timestamp
          );

          const utmCandidates = {
            utm_source: transaction.utm_source || payment.utm_source || payment.utmSource || null,
            utm_medium: transaction.utm_medium || payment.utm_medium || payment.utmMedium || null,
            utm_campaign: transaction.utm_campaign || payment.utm_campaign || payment.utmCampaign || null,
            utm_content: transaction.utm_content || payment.utm_content || payment.utmContent || null,
            utm_term: transaction.utm_term || payment.utm_term || payment.utmTerm || null
          };

          const purchaseUtms = {};
          Object.keys(utmCandidates).forEach(key => {
            const value = utmCandidates[key];
            if (value) {
              purchaseUtms[key] = value;
            }
          });

          const productList = Array.isArray(payment.items)
            ? payment.items
            : Array.isArray(payment.products)
              ? payment.products
              : [];

          const clientIp = normalizeClientIp(
            transaction.ip_criacao ||
              transaction.client_ip ||
              transaction.ip ||
              payment.client_ip ||
              payment.clientIp ||
              null
          );

          const clientUa =
            transaction.user_agent_criacao ||
            transaction.user_agent ||
            payment.client_user_agent ||
            payment.clientUserAgent ||
            payment.user_agent ||
            null;

          const contentName =
            transaction.nome_oferta ||
            payment.metadata?.plano_nome ||
            payment.plan_name ||
            payment.planName ||
            payment.title ||
            payment.description ||
            null;

          const purchasePayload = {
            __source: 'webhook_purchase',
            transaction_id: normalizedId,
            value_cents: valueCents,
            currency,
            products: productList,
            utms: Object.keys(purchaseUtms).length ? purchaseUtms : undefined,
            fbp: transaction.fbp || payment.fbp || null,
            fbc: transaction.fbc || payment.fbc || null,
            client_ip: clientIp,
            client_ua: clientUa,
            event_time: paidEventTime,
            external_id_hash: transaction.external_id_hash || transaction.external_id || null,
            content_name: contentName
          };

          const alreadySent = await isTransactionAlreadySent(normalizedId);

          if (alreadySent) {
            console.log('[WEBHOOK] purchase:already_sent', { transaction_id: normalizedId });
          } else {
            console.log('[WEBHOOK] purchase:ready_to_send', {
              transaction_id: normalizedId,
              value_cents: purchasePayload.value_cents ?? null
            });

            try {
              const capiResult = await sendPurchaseCapi(purchasePayload);

              if (capiResult?.success) {
                console.log('[WEBHOOK] purchase:capi_sent', {
                  transaction_id: normalizedId,
                  events_received: capiResult.eventsReceived ?? null,
                  fbtrace_id: capiResult.fbtraceId || null
                });
              } else {
                console.error('[WEBHOOK] purchase:capi_error', {
                  transaction_id: normalizedId,
                  error: capiResult?.error || 'unknown_error'
                });
              }

              if (capiResult?.success && (capiResult.eventsReceived ?? 0) >= 1) {
                const dedupExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
                await markPurchaseAsSent(normalizedId, dedupExpiresAt, {
                  eventId: capiResult.eventId,
                  value: capiResult.normalizedValue,
                  currency,
                  source: 'webhook',
                  fbp: purchasePayload.fbp || null,
                  fbc: purchasePayload.fbc || null,
                  external_id: purchasePayload.external_id_hash || null,
                  client_ip: purchasePayload.client_ip || null,
                  client_ua: purchasePayload.client_ua || null
                });
                console.log('[WEBHOOK] purchase:dedupe_recorded', {
                  transaction_id: normalizedId,
                  event_id: capiResult.eventId,
                  expires_at: dedupExpiresAt.toISOString()
                });
              }
            } catch (error) {
              console.error('[WEBHOOK] purchase:capi_exception', {
                transaction_id: normalizedId,
                message: error?.message || 'unknown_error'
              });
            }
          }
        }

        // 🎯 NOVO: Enviar evento Purchase via Kwai Event API
        try {
          const kwaiAPI = getKwaiEventAPI();
          
          if (kwaiAPI.isConfigured()) {
            const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
            const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
            
            // Tentar recuperar click_id do SessionTracking se não estiver na transação
            let kwaiClickId = transaction.kwai_click_id;
            console.log(`[${correlationId}] 🔍 Click ID do banco de dados:`, kwaiClickId ? kwaiClickId.substring(0, 20) + '...' : 'não encontrado');
            
            if (!kwaiClickId && transaction.telegram_id) {
              try {
                kwaiClickId = kwaiAPI.getKwaiClickId(transaction.telegram_id);
                console.log(`[${correlationId}] 🔍 Click ID recuperado do SessionTracking:`, kwaiClickId ? kwaiClickId.substring(0, 20) + '...' : 'não encontrado');
              } catch (error) {
                console.log(`[${correlationId}] ⚠️ Erro ao recuperar click_id do SessionTracking:`, error.message);
              }
            }
            
            console.log(`[${correlationId}] 🎯 Click ID final para Purchase:`, kwaiClickId ? kwaiClickId.substring(0, 20) + '...' : 'não encontrado');
            
            const kwaiResult = await kwaiAPI.sendPurchaseEvent(
              transaction.telegram_id || transaction.token,
              {
                content_id: transaction.nome_oferta || 'plano_privacy',
                content_name: planName,
                value: purchaseValue,
                currency: 'BRL'
              },
              kwaiClickId // Click ID do Kwai recuperado
            );
            
            if (kwaiResult.success) {
              console.log(`[${correlationId}] ✅ Evento Purchase enviado via Kwai Event API - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
            } else {
              console.error(`[${correlationId}] ❌ Erro ao enviar evento Purchase via Kwai:`, kwaiResult.error);
            }
          } else {
            console.log(`[${correlationId}] ℹ️ Kwai Event API não configurado, pulando envio`);
          }
        } catch (error) {
          console.error(`[${correlationId}] ❌ Erro ao enviar evento Purchase via Kwai Event API:`, error.message);
        }
        
        // 🎯 NOVO: Redirecionamento para checkout web (se for transação do site)
        if (transaction.bot_id === 'checkout_web') {
          console.log(`[${correlationId}] 🔄 Transação do checkout web detectada - preparando redirecionamento`);
          
          // Aqui você pode implementar lógica adicional para notificar o frontend
          // Por exemplo, via WebSocket ou polling
          // Por enquanto, vamos apenas logar que o pagamento foi confirmado
          console.log(`[${correlationId}] ✅ Pagamento do checkout web confirmado - ID: ${normalizedId}`);
        }
        
      } else {
        console.log(`[${correlationId}] ❌ Transação não encontrada no banco de dados`);
      }
    } else {
      console.log(`[${correlationId}] ℹ️ Pagamento não aprovado ou ID inválido`);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error(`[${correlationId}] ❌ Erro no webhook:`, err.message);
    return res.sendStatus(500);
  }
});

// 🔥 ENDPOINT: Verificar status do pagamento (para polling do frontend)
app.get('/api/payment-status/:transactionId', async (req, res) => {
  const correlationId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Headers para evitar cache
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  // CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  
  try {
    const { transactionId } = req.params;
    
    console.log(`[${correlationId}] 🔍 Verificando status do pagamento: ${transactionId}`);
    
    let transaction = null;
    
    // Tentar SQLite primeiro
    const db = sqlite.get();
    if (db) {
      transaction = db.prepare('SELECT * FROM tokens WHERE LOWER(id_transacao) = ?').get(transactionId.toLowerCase());
      console.log(`[${correlationId}] 🔍 Busca no SQLite:`, transaction ? 'Encontrada' : 'Não encontrada');
    }
    
    // Se não encontrou no SQLite, tentar PostgreSQL
    if (!transaction && pool) {
      try {
        const result = await pool.query('SELECT * FROM tokens WHERE LOWER(id_transacao) = LOWER($1)', [transactionId]);
        if (result.rows.length > 0) {
          transaction = result.rows[0];
          console.log(`[${correlationId}] 🔍 Busca no PostgreSQL: Encontrada`);
        }
      } catch (pgError) {
        console.error(`[${correlationId}] ❌ Erro ao buscar no PostgreSQL:`, pgError.message);
      }
    }
    
    if (!transaction) {
      console.log(`[${correlationId}] ❌ Transação não encontrada no banco local`);
      
      // Tentar consultar diretamente nas APIs dos gateways
      let apiStatus = null;
      let gatewayUsed = null;
      
      // Função para identificar o gateway baseado no transactionId
      const identifyGateway = (id) => {
        // PushinPay: UUIDs longos (36 caracteres) ou que começam com pushinpay_
        if (id.startsWith('pushinpay_') || (id.length === 36 && id.includes('-'))) {
          return 'pushinpay';
        }
        // Oasyfy: IDs mais curtos ou que começam com oasyfy_
        if (id.startsWith('oasyfy_') || id.length < 30) {
          return 'oasyfy';
        }
        // Se não conseguir identificar, tentar ambos
        return 'unknown';
      };
      
      const detectedGateway = identifyGateway(transactionId);
      console.log(`[${correlationId}] 🔍 Gateway detectado: ${detectedGateway} para ID: ${transactionId}`);
      
      // Tentar PushinPay primeiro se detectado ou desconhecido
      if (detectedGateway === 'pushinpay' || detectedGateway === 'unknown') {
        try {
          console.log(`[${correlationId}] 🔍 Tentando consultar na API PushInPay...`);
          
          const PushinPayService = require('./services/pushinpay');
          const pushinpayService = new PushinPayService();
          
          if (pushinpayService.isConfigured()) {
            apiStatus = await pushinpayService.getTransactionStatus(transactionId);
            gatewayUsed = 'pushinpay';
            
            if (apiStatus.success) {
              console.log(`[${correlationId}] ✅ Transação encontrada na API PushInPay:`, apiStatus.status);
            } else {
              console.log(`[${correlationId}] ❌ Transação não encontrada na API PushInPay:`, apiStatus.error);
            }
          }
        } catch (apiError) {
          console.error(`[${correlationId}] ❌ Erro ao consultar API PushInPay:`, apiError.message);
        }
      }
      
      // Se não encontrou no PushinPay, tentar Oasyfy
      if (!apiStatus || !apiStatus.success) {
        try {
          console.log(`[${correlationId}] 🔍 Tentando consultar na API Oasyfy...`);
          
          const OasyfyService = require('./services/oasyfy');
          const oasyfyService = new OasyfyService();
          
          if (oasyfyService.isConfigured()) {
            apiStatus = await oasyfyService.getTransactionStatus(transactionId);
            gatewayUsed = 'oasyfy';
            
            if (apiStatus.success) {
              console.log(`[${correlationId}] ✅ Transação encontrada na API Oasyfy:`, apiStatus.status);
            } else {
              console.log(`[${correlationId}] ❌ Transação não encontrada na API Oasyfy:`, apiStatus.error);
            }
          }
        } catch (apiError) {
          console.error(`[${correlationId}] ❌ Erro ao consultar API Oasyfy:`, apiError.message);
        }
      }
      
      // Se encontrou em algum gateway, retornar os dados
      if (apiStatus && apiStatus.success) {
        return res.json({
          success: true,
          is_paid: apiStatus.status === 'paid' || apiStatus.status === 'payed',
          transactionId: apiStatus.transaction_id,
          status: apiStatus.status,
          valor: apiStatus.amount,
          created_at: apiStatus.created_at,
          paid_at: apiStatus.paid_at,
          end_to_end_id: apiStatus.end_to_end_id,
          payer_name: apiStatus.payer_name,
          payer_national_registration: apiStatus.payer_national_registration,
          source: `${gatewayUsed}_api`,
          gateway: gatewayUsed
        });
      }
      
      return res.status(200).json({
        success: false,
        error: 'Transação não encontrada',
        transactionId: transactionId,
        source: 'api_search'
      });
    }
    
    // Verificar se a transação não é muito antiga (mais de 5 minutos)
    const transactionTime = new Date(transaction.criado_em || transaction.event_time);
    const now = new Date();
    const timeDiffMinutes = (now - transactionTime) / (1000 * 60);
    
    if (timeDiffMinutes > 5) {
      console.log(`[${correlationId}] ⏰ Transação muito antiga (${timeDiffMinutes.toFixed(1)} min), parando busca`);
      return res.json({
        success: false,
        error: 'Transação expirada',
        transactionId: transaction.id_transacao,
        expired: true,
        age_minutes: timeDiffMinutes
      });
    }
    
    // Verificar se está pago usando múltiplos campos
    const isPaid = transaction.is_paid === true || 
                   transaction.status === 'pago' || 
                   transaction.status === 'valido' ||  // CORREÇÃO: Incluir status 'valido' como pago
                   transaction.usado === true;
    
    console.log(`[${correlationId}] 📊 Status da transação:`, {
      id: transaction.id_transacao,
      status: transaction.status,
      usado: transaction.usado,
      is_paid: transaction.is_paid,
      isPaid: isPaid,
      paid_at: transaction.paid_at,
      age_minutes: timeDiffMinutes.toFixed(1)
    });
    
    return res.json({
      success: true,
      is_paid: isPaid,
      transactionId: transaction.id_transacao,
      status: transaction.status,
      valor: transaction.valor,
      plano: transaction.nome_oferta,
      created_at: transaction.criado_em,
      paid_at: transaction.paid_at,
      end_to_end_id: transaction.end_to_end_id,
      payer_name: transaction.payer_name,
      payer_national_registration: transaction.payer_national_registration
    });
    
  } catch (error) {
    console.error(`[${correlationId}] ❌ Erro ao verificar status:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 🔥 ENDPOINT: Página do telegram (acesso VIP)
app.get('/telegram', (req, res) => {
  try {
    // [TELEGRAM-ENTRY] Log de acesso à página
    const startParam = req.query.start || null;
    const fbclidParam = req.query.fbclid || null;
    console.log('[STATIC] route=/telegram', 
                'file=MODELO1/WEB/telegram/index.html',
                'start=', startParam || 'vazio',
                'fbclid=', fbclidParam || 'vazio');

    const telegramPath = path.join(__dirname, 'MODELO1', 'WEB', 'telegram', 'index.html');

    if (!fs.existsSync(telegramPath)) {
      return res.status(404).send('Página não encontrada');
    }

    fs.readFile(telegramPath, 'utf8', (error, content) => {
      if (error) {
        console.error('Erro ao ler página do telegram:', error);
        return res.status(500).send('Erro interno do servidor');
      }

      const rawUsername = process.env.BOT1_USERNAME ? process.env.BOT1_USERNAME.trim() : '';
      const sanitizedUsername = rawUsername.replace(/^@+/, '').trim();
      if (!sanitizedUsername) {
        console.warn('[telegram-redirect] BOT1_USERNAME ausente no .env');
        return res.status(500).send('BOT1_USERNAME não configurado');
      }

      const botLink = `https://t.me/${sanitizedUsername}`;
      const placeholder = '__BOT1_TELEGRAM_LINK__';
      const sanitizedBotLink = botLink
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const renderedContent = content.split(placeholder).join(sanitizedBotLink);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderedContent);
    });
  } catch (error) {
    console.error('Erro ao servir página do telegram:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// 🔥 ENDPOINT: Página de loader (pré-carregamento)
app.get('/loader', (req, res) => {
  try {
    const loaderPath = path.join(__dirname, 'checkout', 'funil_completo', 'loader.html');
    
    // Verificar se o arquivo existe
    if (fs.existsSync(loaderPath)) {
      res.sendFile(loaderPath);
    } else {
      res.status(404).send('Página não encontrada');
    }
  } catch (error) {
    console.error('Erro ao servir loader:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// 🔥 ENDPOINT: Página de loader (formato .html)
app.get('/loader.html', (req, res) => {
  try {
    const loaderPath = path.join(__dirname, 'checkout', 'funil_completo', 'loader.html');
    
    // Verificar se o arquivo existe
    if (fs.existsSync(loaderPath)) {
      res.sendFile(loaderPath);
    } else {
      res.status(404).send('Página não encontrada');
    }
  } catch (error) {
    console.error('Erro ao servir loader:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// 🔥 ENDPOINT: Página de chamada premiada
app.get('/chamada-premiada', (req, res) => {
  try {
    const chamadaPath = path.join(__dirname, 'checkout', 'funil_completo', 'chamada_premiada.html');
    
    // Verificar se o arquivo existe
    if (fs.existsSync(chamadaPath)) {
      res.sendFile(chamadaPath);
    } else {
      res.status(404).send('Página não encontrada');
    }
  } catch (error) {
    console.error('Erro ao servir chamada premiada:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// 🔥 ENDPOINT: Página de chamada premiada (formato .html)
app.get('/chamada_premiada.html', (req, res) => {
  try {
    const chamadaPath = path.join(__dirname, 'checkout', 'funil_completo', 'chamada_premiada.html');
    
    // Verificar se o arquivo existe
    if (fs.existsSync(chamadaPath)) {
      res.sendFile(chamadaPath);
    } else {
      res.status(404).send('Página não encontrada');
    }
  } catch (error) {
    console.error('Erro ao servir chamada premiada:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// 🔥 ENDPOINT: Página de obrigado para checkout web
app.get('/checkout/obrigado', (req, res) => {
  try {
    const checkoutPath = path.join(__dirname, 'checkout', 'obrigado.html');
    
    // Verificar se o arquivo existe, senão usar o index.html como fallback
    if (fs.existsSync(checkoutPath)) {
      res.sendFile(checkoutPath);
    } else {
      // Criar página de obrigado dinâmica
      const obrigadoHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pagamento Confirmado - Obrigado!</title>
    <style>
        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 90%;
        }
        .success-icon {
            font-size: 80px;
            color: #4CAF50;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
            font-weight: 600;
        }
        p {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .btn {
            background: linear-gradient(45deg, #f68d3d, #f69347);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.3s ease;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Pagamento Confirmado!</h1>
        <p>Obrigado pela sua compra! Seu pagamento foi processado com sucesso e você receberá o acesso em breve.</p>
        <a href="/privacy" class="btn">Voltar ao Início</a>
    </div>
</body>
</html>
      `;
      res.send(obrigadoHtml);
    }
  } catch (error) {
    console.error('Erro ao servir página de obrigado:', error);
    res.status(500).send('Erro interno do servidor');
  }
});


// Variáveis de controle
let bot, webhookPushinPay, enviarDownsells;
let downsellInterval;
let postgres = null;
pool = null;
let databaseConnected = false;
let webModuleLoaded = false;

function iniciarCronFallback() {
  cron.schedule('*/5 * * * *', async () => {
    if (!pool) return;
    try {
      // ✅ ATUALIZADO: Buscar tokens elegíveis para fallback - incluindo tokens com capi_ready = TRUE
      const res = await pool.query(`
        SELECT token, valor, utm_source, utm_medium, utm_campaign, utm_term, utm_content, 
               fbp, fbc, ip_criacao, user_agent_criacao, criado_em, event_time,
               fn_hash, ln_hash, external_id_hash, pixel_sent, capi_sent, cron_sent, event_attempts,
               capi_ready, capi_processing
        FROM tokens 
        WHERE status = 'valido' 
          AND (usado IS NULL OR usado = FALSE) 
          AND criado_em < NOW() - INTERVAL '5 minutes'
          AND (
            (pixel_sent = FALSE OR pixel_sent IS NULL)
            OR (capi_ready = TRUE AND capi_sent = FALSE AND capi_processing = FALSE)
          )
          AND (cron_sent = FALSE OR cron_sent IS NULL)
          AND (event_attempts < 3 OR event_attempts IS NULL)
      `);

      if (process.env.NODE_ENV !== 'production' && res.rows.length > 0) {
        console.log(`Cron Fallback: ${res.rows.length} tokens elegíveis para fallback`);
      }

      // ✅ PRIORIZAR tokens com capi_ready = TRUE (vindos do TelegramBotService)
      const tokensCapiReady = res.rows.filter(row => row.capi_ready === true);
      const tokensRegulares = res.rows.filter(row => row.capi_ready !== true);
      
              if (process.env.NODE_ENV !== 'production' && (tokensCapiReady.length > 0 || tokensRegulares.length > 0)) {
          console.log(`📍 ${tokensCapiReady.length} tokens com CAPI ready, ${tokensRegulares.length} tokens regulares`);
        }

      // Processar tokens com capi_ready primeiro
      const allTokens = [...tokensCapiReady, ...tokensRegulares];

      for (const row of allTokens) {
        // Verificar se o token tem dados mínimos necessários
        if (!row.valor || (!row.fbp && !row.fbc && !row.ip_criacao)) {
          // Pular token sem dados suficientes (log removido para manter logs limpos)
          continue;
        }

        const tipoProcessamento = row.capi_ready ? 'CAPI READY' : 'FALLBACK';
                    console.log(`${tipoProcessamento} CRON: enviando evento para token ${row.token} (tentativa ${(row.event_attempts || 0) + 1}/3)`);

        // Preparar user_data_hash se disponível
        let userDataHash = null;
        if (row.fn_hash || row.ln_hash || row.external_id_hash) {
          userDataHash = {
            fn: row.fn_hash,
            ln: row.ln_hash,
            external_id: row.external_id_hash
          };
        }

        const eventName = 'Purchase';
        const eventId = generateEventId(
          eventName,
          row.token,
          row.event_time || Math.floor(new Date(row.criado_em).getTime() / 1000)
        );
        
        // 🔥 CORREÇÃO: Processar UTMs no formato nome|id para cron job
        const utmSource = processUTM(row.utm_source);
        const utmMedium = processUTM(row.utm_medium);
        const utmCampaign = processUTM(row.utm_campaign);
        const utmContent = processUTM(row.utm_content);
        const utmTerm = processUTM(row.utm_term);
        
        // 🔥 NOVO: Extrair fbclid do _fbc se disponível
        let fbclid = null;
        if (row.fbc) {
          const fbcMatch = row.fbc.match(/^fb\.1\.\d+\.(.+)$/);
          if (fbcMatch) {
            fbclid = fbcMatch[1];
            console.log(`✅ fbclid extraído do _fbc (cron): ${fbclid}`);
          }
        }
        
        const capiResult = await sendFacebookEvent({
          event_name: eventName,
          event_time: row.event_time || Math.floor(new Date(row.criado_em).getTime() / 1000),
          event_id: eventId,
          value: parseFloat(row.valor),
          currency: 'BRL',
          fbp: row.fbp,
          fbc: row.fbc,
          client_ip_address: row.ip_criacao,
          client_user_agent: row.user_agent_criacao,
          telegram_id: row.telegram_id,
          user_data_hash: userDataHash,
          source: 'cron',
          token: row.token,
          pool: pool,
          custom_data: {
            // 🔥 CORREÇÃO: Enviar nomes e IDs separados
            utm_source: utmSource.name,
            utm_source_id: utmSource.id,
            utm_medium: utmMedium.name,
            utm_medium_id: utmMedium.id,
            utm_campaign: utmCampaign.name,
            utm_campaign_id: utmCampaign.id,
            utm_content: utmContent.name,
            utm_content_id: utmContent.id,
            utm_term: utmTerm.name,
            utm_term_id: utmTerm.id,
            fbclid: fbclid // 🔥 NOVO: Incluir fbclid
          }
        });

        if (capiResult.success) {
                      console.log(`${tipoProcessamento} CRON: Purchase enviado com sucesso para token ${row.token}`);
          // Resetar flag capi_ready após envio bem-sucedido
          if (row.capi_ready) {
            await pool.query('UPDATE tokens SET capi_ready = FALSE WHERE token = $1', [row.token]);
          }
        } else if (!capiResult.duplicate) {
                      console.error(`${tipoProcessamento} CRON: Erro ao enviar Purchase para token ${row.token}:`, capiResult.error);
        }

        // Marcar token como expirado apenas se tentou 3 vezes ou teve sucesso
        if (capiResult.success || (row.event_attempts || 0) >= 2) {
          await pool.query(
            "UPDATE tokens SET status = 'expirado', usado = TRUE WHERE token = $1",
            [row.token]
          );
                      console.log(`Token ${row.token} marcado como expirado`);
        }
      }
    } catch (err) {
      console.error('Erro no cron de fallback:', err.message);
    }
  });
      console.log('Cron de fallback melhorado iniciado (verifica a cada 5 minutos, envia após 5 minutos de inatividade)');
}

// Iniciador do loop de downsells
function iniciarDownsellLoop() {
  if (!enviarDownsells) {
    console.warn('Função enviarDownsells não disponível');
    return;
  }
  // Execução imediata ao iniciar
  enviarDownsells().catch(err => console.error('Erro no envio inicial de downsells:', err));
  downsellInterval = setInterval(async () => {
    try {
      await enviarDownsells();
    } catch (err) {
      console.error('Erro no loop de downsells:', err);
    }
  }, 20 * 60 * 1000);
      console.log('Loop de downsells ativo a cada 20 minutos');
}

function iniciarLimpezaTokens() {
  cron.schedule('*/20 * * * *', async () => {
    console.log('Limpando tokens expirados ou cancelados...');

    try {
      const db = sqlite.get();
      if (db) {
        const stmt = db.prepare(`
          DELETE FROM access_links
          WHERE (status IS NULL OR status = 'canceled')
            AND (enviado_pixel IS NULL OR enviado_pixel = 0)
            AND (acesso_usado IS NULL OR acesso_usado = 0)
        `);
        const info = stmt.run();
        console.log(`SQLite: ${info.changes} tokens removidos`);
      }
    } catch (err) {
      console.error('❌ Erro SQLite:', err.message);
    }

    if (pool) {
      try {
        const result = await pool.query(`
          DELETE FROM access_links
          WHERE (status IS NULL OR status = 'canceled')
            AND (enviado_pixel IS NULL OR enviado_pixel = false)
            AND (acesso_usado IS NULL OR acesso_usado = false)
        `);
        console.log(`PostgreSQL: ${result.rowCount} tokens removidos`);
      } catch (err) {
        console.error('❌ Erro PostgreSQL:', err.message);
      }
    }
  });
  console.log('Cron de limpeza de tokens iniciado a cada 20 minutos');
}

function iniciarLimpezaPayloadTracking() {
  cron.schedule('0 * * * *', async () => {
    console.log('Limpando registros antigos de payload_tracking...');

    try {
      const db = sqlite.get();
      if (db) {
        const stmt = db.prepare(`
          DELETE FROM payload_tracking
          WHERE datetime(created_at) <= datetime('now', '-2 hours')
        `);
        const info = stmt.run();
        console.log(`SQLite: ${info.changes} payloads removidos`);
      }
    } catch (err) {
      console.error('❌ Erro SQLite:', err.message);
    }

    if (pool) {
      try {
        const result = await pool.query(`
          DELETE FROM payload_tracking
          WHERE created_at < NOW() - INTERVAL '2 hours'
        `);
        console.log(`PostgreSQL: ${result.rowCount} payloads removidos`);
      } catch (err) {
        console.error('❌ Erro PostgreSQL:', err.message);
      }
    }
  });
  console.log('Cron de limpeza de payload_tracking iniciado a cada hora');
}

// Carregar módulos
function carregarBot() {
  try {
    const instancia1 = bot1.iniciar();
    const instancia2 = bot2.iniciar();
    const instanciaEspecial = botEspecial.iniciar();
    const instancia4 = bot4.iniciar();
    const instancia5 = bot5.iniciar();
    const instancia6 = bot6.iniciar();
    const instancia7 = bot7.iniciar();

    bots.set('bot1', instancia1);
    bots.set('bot2', instancia2);
    bots.set('bot_especial', instanciaEspecial);
    bots.set('bot4', instancia4);
    bots.set('bot5', instancia5);
    bots.set('bot6', instancia6);
    bots.set('bot7', instancia7);

    bot = instancia1;
    webhookPushinPay = instancia1.webhookPushinPay ? instancia1.webhookPushinPay.bind(instancia1) : null;
    enviarDownsells = instancia1.enviarDownsells ? instancia1.enviarDownsells.bind(instancia1) : null;

    console.log('Bots carregados com sucesso');
    return true;
  } catch (error) {
    console.error('Erro ao carregar bot:', error.message);
    return false;
  }
}

function carregarPostgres() {
  try {
    const postgresPath = path.join(__dirname, 'database/postgres.js');

    if (fs.existsSync(postgresPath)) {
      postgres = require('./database/postgres');
      console.log('Módulo postgres carregado');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erro ao carregar postgres:', error.message);
    return false;
  }
}

async function inicializarBanco() {
  if (!postgres) return false;

  try {
    console.log('Inicializando banco de dados...');
    pool = await postgres.initializeDatabase();

    if (pool) {
      databaseConnected = true;
      funnelMetrics.initialize(pool);
      console.log('Banco de dados inicializado');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erro ao inicializar banco:', error.message);
    return false;
  }
}

async function carregarSistemaTokens() {
  try {
    const tokensPath = path.join(__dirname, 'MODELO1/WEB/tokens.js');
    
    if (!fs.existsSync(tokensPath)) {
      console.log('Sistema de tokens não encontrado');
      return false;
    }

    if (!pool) {
      console.error('Pool de conexões não disponível');
      return false;
    }

    // Limpar cache do módulo
    delete require.cache[require.resolve('./MODELO1/WEB/tokens')];
    
    const tokensModule = require('./MODELO1/WEB/tokens');
    
    if (typeof tokensModule === 'function') {
      const tokenSystem = tokensModule(app, pool);
      
      if (tokenSystem) {
        webModuleLoaded = true;
        console.log('Sistema de tokens carregado');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Erro ao carregar sistema de tokens:', error.message);
    return false;
  }
}



// API para gerar cobrança
app.post('/api/gerar-cobranca', async (req, res) => {
  try {
    const botId = req.body.bot_id;
    const botInstance = bots.get(botId);

    if (!botInstance || !botInstance.gerarCobranca) {
      return res
        .status(404)
        .json({ error: 'Bot não encontrado ou função gerarCobranca ausente' });
    }

    await botInstance.gerarCobranca(req, res);
  } catch (error) {
    console.error('Erro na API de cobrança:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para gerar QR code PIX para obrigado_especial
app.post('/api/gerar-qr-pix', async (req, res) => {
  try {
    const axios = require('axios');
    const valor = 100; // Valor fixo de R$ 100
    const valorCentavos = valor * 100; // Converter para centavos

    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({ 
        error: 'Token PushinPay não configurado' 
      });
    }

    const baseUrlCandidate = process.env.FRONTEND_URL || process.env.BASE_URL || null;
    const normalizedBaseUrl = typeof baseUrlCandidate === 'string'
      ? baseUrlCandidate.replace(/\/+$/, '')
      : null;
    const webhookUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/webhook/unified` : null;

    const pushPayload = {
      value: valorCentavos,
      split_rules: [],
      metadata: {
        source: 'obrigado_especial',
        valor_reais: valor
      }
    };

    if (webhookUrl) {
      pushPayload.webhook_url = webhookUrl;
      pushPayload.metadata.webhook_url = webhookUrl;
    } else {
      console.warn('[DEBUG] Nenhuma FRONTEND_URL/BASE_URL configurada para definir webhook_url.');
    }

    console.log('[DEBUG] Gerando QR code PIX para obrigado_especial:', pushPayload);

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

    if (!qr_code_base64 || !qr_code) {
      throw new Error('QR code não retornado pela PushinPay');
    }

    console.log('[DEBUG] QR code PIX gerado com sucesso:', apiId);

    // 🎯 NOVO: Enviar evento InitiateCheckout via Kwai Event API
    try {
      const kwaiAPI = getKwaiEventAPI();
      
      if (kwaiAPI.isConfigured()) {
        const kwaiResult = await kwaiAPI.sendInitiateCheckoutEvent(
          req.body.telegram_id || req.body.token || 'obrigado_especial', // ID do usuário se disponível
          {
            content_id: 'obrigado_especial',
            content_name: 'Oferta Especial',
            value: valor,
            currency: 'BRL'
          },
          req.body.kwai_click_id // Click ID do Kwai se disponível
        );
        
        if (kwaiResult.success) {
          console.log(`✅ Evento InitiateCheckout enviado via Kwai Event API - Oferta Especial - Valor: R$ ${valor}`);
        } else {
          console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai:', kwaiResult.error);
        }
      } else {
        console.log('ℹ️ Kwai Event API não configurado, pulando envio de InitiateCheckout');
      }
    } catch (error) {
      console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai Event API:', error.message);
    }

    return res.json({
      success: true,
      qr_code_base64,
      qr_code,
      pix_copia_cola: qr_code,
      transacao_id: apiId,
      valor: valor
    });

  } catch (error) {
    console.error('Erro ao gerar QR code PIX:', error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Limite de requisições atingido. Tente novamente em alguns minutos.' 
      });
    }

    return res.status(500).json({ 
      error: 'Erro interno ao gerar QR code PIX',
      details: error.message 
    });
  }
});

// API para gerar QR code PIX para checkout web com ofertas específicas
app.post('/api/gerar-pix-checkout', async (req, res) => {
  try {
    const axios = require('axios');
    const { offer_code, valor } = req.body || {};

    if (!offer_code) {
      return res.status(400).json({
        error: 'Código da oferta é obrigatório'
      });
    }

    // Ofertas disponíveis (mesmas do bot)
    const offers = {
      'plano_1_mes': { nome: '1 mês', valor: 19.90 },
      'plano_3_meses': { nome: '3 meses (30% OFF)', valor: 41.90 },
      'plano_6_meses': { nome: '6 meses (50% OFF)', valor: 59.90 },
      'back1_videos': { nome: 'Vídeos Personalizados - ÚLTIMA CHANCE', valor: 9.90 },
      'back2_videos': { nome: 'Vídeos Personalizados - SUPER DESCONTO', valor: 9.90 },
      'back3_videos': { nome: 'Vídeos Personalizados - PREÇO FINAL', valor: 4.90 },
      'upsell1_videos': { nome: 'Vídeos Personalizados', valor: 17.00 },
      'upsell2_chat': { nome: 'Chat Exclusivo', valor: 67.90 },
      'upsell3_whatsapp': { nome: 'WhatsApp Exclusivo', valor: 47.90 },
      'assinatura_premiada': { nome: 'Vídeo Personalizado', valor: 17.00 },
      'chamada_premiada': { nome: 'Acesso Exclusivo 1h', valor: 9.90 }
    };

    const offerDefinition = offers[offer_code];
    const finalValue = typeof valor === 'number' ? valor : offerDefinition?.valor;

    if (!offerDefinition && typeof valor !== 'number') {
      return res.status(400).json({
        error: 'Oferta não encontrada'
      });
    }

    if (!finalValue) {
      return res.status(400).json({
        error: 'Valor da oferta é obrigatório'
      });
    }

    const valueInCents = Math.round(finalValue * 100);

    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({
        error: 'Token PushinPay não configurado'
      });
    }

    const pushPayload = {
      value: valueInCents,
      split_rules: [],
      webhook_url: `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/webhook/unified`,
      metadata: {
        source: 'checkout_web',
        offer_code: offer_code,
        offer_name: offerDefinition ? offerDefinition.nome : offer_code,
        valor_reais: finalValue
      }
    };

    console.log('[DEBUG] Gerando QR code PIX para checkout web:', pushPayload);

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

    if (!qr_code_base64 || !qr_code) {
      throw new Error('QR code não retornado pela PushinPay');
    }

    console.log('[DEBUG] QR code PIX gerado com sucesso para checkout:', apiId);

    // 🎯 NOVO: Salvar transação no banco de dados para webhook processar
    const correlationId = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Capturar dados de tracking da requisição (fora do try-catch para estar disponível em todo escopo)
    const trackingData = {
      utm_source: req.body.utm_source || req.query.utm_source || null,
      utm_medium: req.body.utm_medium || req.query.utm_medium || null,
      utm_campaign: req.body.utm_campaign || req.query.utm_campaign || null,
      utm_term: req.body.utm_term || req.query.utm_term || null,
      utm_content: req.body.utm_content || req.query.utm_content || null,
      fbp: req.body.fbp || req.query.fbp || null,
      fbc: req.body.fbc || req.query.fbc || null,
      ip_criacao: req.ip || req.connection.remoteAddress || null,
      user_agent_criacao: req.get('User-Agent') || null,
      kwai_click_id: req.body.kwai_click_id ||
                     req.query.kwai_click_id ||
                     req.body.click_id ||
                     req.query.click_id ||
                     (req.cookies ? req.cookies.kwai_click_id : null) ||
                     null
    };
    
    try {
      console.log(`[${correlationId}] 💾 Salvando transação no banco de dados...`);

      // Salvar no banco de dados
      const db = sqlite.get();
      if (db) {
        // 🔧 Verificar e criar coluna kwai_click_id se não existir
        const cols = db.prepare('PRAGMA table_info(tokens)').all();
        const hasKwaiClickId = cols.some(c => c.name === 'kwai_click_id');
        
        if (!hasKwaiClickId) {
          console.log(`[${correlationId}] 🔄 Criando coluna kwai_click_id...`);
          try {
            db.prepare('ALTER TABLE tokens ADD COLUMN kwai_click_id TEXT').run();
            console.log(`[${correlationId}] ✅ Coluna kwai_click_id criada com sucesso`);
          } catch (error) {
            console.error(`[${correlationId}] ❌ Erro ao criar coluna kwai_click_id:`, error.message);
          }
        }
        const insertQuery = `
          INSERT INTO tokens (
            id_transacao, token, telegram_id, valor, status, tipo, usado, bot_id,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            fbp, fbc, ip_criacao, user_agent_criacao, nome_oferta,
            event_time, external_id_hash, kwai_click_id, first_name, last_name, phone
          ) VALUES (?, ?, ?, ?, ?, 'principal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const externalId = `checkout_web_${apiId}`;
        const identifier = `web_${apiId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const crypto = require('crypto');
        const externalIdHash = crypto.createHash('sha256').update(externalId).digest('hex');
        
        // Garantir que todos os valores sejam strings válidas para SQLite
        const safeString = (val) => val !== null && val !== undefined ? String(val) : null;
        
        console.log(`[${correlationId}] 🔍 Dados para inserção:`, {
          apiId,
          valorFinal: finalValue,
          trackingData,
          offer: offerDefinition ? offerDefinition.nome : offer_code,
          eventTime: new Date().toISOString(),
          externalIdHash,
          kwaiClickId: trackingData.kwai_click_id ? trackingData.kwai_click_id.substring(0, 20) + '...' : 'não fornecido'
        });

        db.prepare(insertQuery).run(
          apiId, // id_transacao
          apiId, // token (usando o mesmo ID)
          'checkout_web', // telegram_id (identificador para checkout web)
          finalValue, // valor
          'pendente', // status
          0, // usado
          'checkout_web', // bot_id
          safeString(trackingData.utm_source),
          safeString(trackingData.utm_medium),
          safeString(trackingData.utm_campaign),
          safeString(trackingData.utm_term),
          safeString(trackingData.utm_content),
          safeString(trackingData.fbp),
          safeString(trackingData.fbc),
          safeString(trackingData.ip_criacao),
          safeString(trackingData.user_agent_criacao),
          safeString(offerDefinition ? offerDefinition.nome : offer_code), // nome_oferta
          Math.floor(Date.now() / 1000), // event_time como INTEGER (timestamp Unix)
          externalIdHash, // external_id_hash
          safeString(trackingData.kwai_click_id), // kwai_click_id
          null, // first_name (não disponível neste endpoint)
          null, // last_name (não disponível neste endpoint)
          null  // phone (não disponível neste endpoint)
        );
        
        console.log(`[${correlationId}] ✅ Transação salva no banco de dados - ID: ${apiId}`);
      } else {
        console.log(`[${correlationId}] ⚠️ Banco de dados não disponível, transação não salva`);
      }
    } catch (dbError) {
      console.error(`[${correlationId}] ❌ Erro ao salvar transação no banco:`, dbError.message);
    }

    // 🎯 NOVO: Enviar evento InitiateCheckout via Kwai Event API
    try {
      const kwaiAPI = getKwaiEventAPI();
      
      if (kwaiAPI.isConfigured()) {
        const offerName = offerDefinition ? offerDefinition.nome : offer_code;

        console.log(`[${correlationId}] 🎯 Enviando InitiateCheckout com click_id:`,
          trackingData.kwai_click_id ? trackingData.kwai_click_id.substring(0, 20) + '...' : 'não fornecido');

        const kwaiResult = await kwaiAPI.sendInitiateCheckoutEvent(
          req.body.telegram_id || req.body.token || 'checkout_web', // ID do usuário se disponível
          {
            content_id: offer_code,
            content_name: offerName,
            value: finalValue,
            currency: 'BRL'
          },
          trackingData.kwai_click_id // Click ID do Kwai capturado
        );

        if (kwaiResult.success) {
          console.log(`✅ Evento InitiateCheckout enviado via Kwai Event API - Oferta: ${offerName} - Valor: R$ ${finalValue}`);
        } else {
          console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai:', kwaiResult.error);
        }
      } else {
        console.log('ℹ️ Kwai Event API não configurado, pulando envio de InitiateCheckout');
      }
    } catch (error) {
      console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai Event API:', error.message);
    }

    return res.json({
      success: true,
      qr_code_base64,
      qr_code,
      pix_copia_cola: qr_code,
      transacao_id: apiId,
      offer: offerDefinition ? { nome: offerDefinition.nome, valor: finalValue } : { nome: offer_code, valor: finalValue },
      valor: finalValue
    });

  } catch (error) {
    console.error('Erro ao gerar QR code PIX para checkout:', error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Limite de requisições atingido. Tente novamente em alguns minutos.' 
      });
    }

    return res.status(500).json({ 
      error: 'Erro interno ao gerar QR code PIX',
      details: error.message 
    });
  }
});

// ===== APIS UNIFICADAS DE PIX =====

// API para obter status dos gateways
app.get('/api/gateways/status', async (req, res) => {
  try {
    if (!unifiedPixService) {
      return res.status(503).json({ error: 'Serviço de PIX não inicializado' });
    }

    const stats = await unifiedPixService.getGatewayStats();
    res.json(stats);
  } catch (error) {
    console.error('Erro ao obter status dos gateways:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// API para alterar gateway ativo
app.post('/api/gateways/set-active', async (req, res) => {
  try {
    if (!unifiedPixService) {
      return res.status(503).json({ error: 'Serviço de PIX não inicializado' });
    }

    const { gateway } = req.body;
    
    if (!gateway) {
      return res.status(400).json({ error: 'Gateway é obrigatório' });
    }

    const success = unifiedPixService.setActiveGateway(gateway);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Gateway alterado para ${gateway}`,
        active_gateway: gateway 
      });
    } else {
      res.status(400).json({ error: 'Falha ao alterar gateway' });
    }
  } catch (error) {
    console.error('Erro ao alterar gateway:', error);
    res.status(500).json({ error: error.message });
  }
});

// API para testar conectividade dos gateways
app.get('/api/gateways/test', async (req, res) => {
  try {
    if (!unifiedPixService) {
      return res.status(503).json({ error: 'Serviço de PIX não inicializado' });
    }

    const results = await unifiedPixService.testGateways();
    res.json(results);
  } catch (error) {
    console.error('Erro ao testar gateways:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// API para debug das configurações
app.get('/api/gateways/debug', (req, res) => {
  try {
    const debug = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DEFAULT_PIX_GATEWAY: process.env.DEFAULT_PIX_GATEWAY,
        PUSHINPAY_TOKEN: process.env.PUSHINPAY_TOKEN ? '✅ Configurado' : '❌ Não configurado',
        OASYFY_PUBLIC_KEY: process.env.OASYFY_PUBLIC_KEY ? '✅ Configurado' : '❌ Não configurado',
        OASYFY_SECRET_KEY: process.env.OASYFY_SECRET_KEY ? '✅ Configurado' : '❌ Não configurado',
        FRONTEND_URL: process.env.FRONTEND_URL || 'não definido'
      },
      service_status: unifiedPixService ? {
        active_gateway: unifiedPixService.getActiveGateway(),
        available_gateways: unifiedPixService.getAvailableGateways(),
        pushinpay_configured: unifiedPixService.gatewaySelector.pushinpay.isConfigured(),
        oasyfy_configured: unifiedPixService.gatewaySelector.oasyfy.isConfigured()
      } : 'Serviço não inicializado'
    };
    
    res.json(debug);
  } catch (error) {
    console.error('Erro no debug:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// API unificada para gerar PIX (substitui as APIs antigas)
app.post('/api/pix/create', async (req, res) => {
  try {
    console.log('🚀 [API PIX] Recebida requisição para criar PIX');
    console.log('📊 [API PIX] Body da requisição:', JSON.stringify(req.body, null, 2));
    
    if (!unifiedPixService) {
      console.error('❌ [API PIX] Serviço de PIX não inicializado');
      return res.status(503).json({ error: 'Serviço de PIX não inicializado' });
    }

    const { 
      type, // 'bot', 'web', 'special'
      gateway, // opcional - força um gateway específico
      ...paymentData 
    } = req.body;

    console.log(`🎯 [API PIX] Tipo: ${type}, Gateway: ${gateway || 'padrão'}`);

    let result;

    switch (type) {
      case 'bot':
        const {
          telegram_id,
          plano,
          valor,
          tracking_data,
          bot_id,
          callback_url,
          callbackUrl: camelCallbackUrl
        } = paymentData;

        const amountUnit = paymentData.amount_unit || paymentData.amountUnit || null;
        const amountInCentsFlag = [
          paymentData.isAmountInCents,
          paymentData.amountInCents,
          paymentData.amount_is_in_cents
        ].find(value => typeof value === 'boolean');
        console.log('🤖 [API PIX] Processando PIX para BOT:', {
          telegram_id,
          plano,
          valor,
          bot_id,
          tracking_data_keys: Object.keys(tracking_data || {}),
          callback_url: camelCallbackUrl || callback_url || null
        });
        result = await unifiedPixService.createBotPixPayment(
          telegram_id,
          plano,
          valor,
          tracking_data,
          bot_id,
          {
            callbackUrl: camelCallbackUrl || callback_url,
            amountUnit,
            amount_unit: amountUnit,
            isAmountInCents: amountInCentsFlag
          }
        );
        console.log('🤖 [API PIX] Resultado do PIX para BOT:', {
          success: result.success,
          transaction_id: result.transaction_id,
          gateway: result.gateway,
          error: result.error
        });
        break;
        
      case 'web':
        const { offer_code: webOfferCode, valor: webValor, client_data, tracking_data: webTracking } = paymentData;
        const webAmountUnit = paymentData.amount_unit || paymentData.amountUnit || null;
        const webAmountInCentsFlag = [
          paymentData.isAmountInCents,
          paymentData.amountInCents,
          paymentData.amount_is_in_cents
        ].find(value => typeof value === 'boolean');
        console.log('🌐 [API PIX] Processando PIX para WEB:', {
          offer_code: webOfferCode,
          valor: webValor,
          client_data,
          tracking_data_keys: Object.keys(webTracking || {})
        });
        result = await unifiedPixService.createWebPixPayment(
          webOfferCode,
          webValor,
          client_data,
          webTracking,
          {
            amountUnit: webAmountUnit,
            amount_unit: webAmountUnit,
            isAmountInCents: webAmountInCentsFlag
          }
        );
        console.log('🌐 [API PIX] Resultado do PIX para WEB:', {
          success: result.success,
          transaction_id: result.transaction_id,
          gateway: result.gateway,
          error: result.error
        });
        break;
        
      case 'special':
        const { valor: specialValor = 100, metadata } = paymentData;
        const specialAmountUnit = paymentData.amount_unit || paymentData.amountUnit || null;
        const specialAmountFlag = [
          paymentData.isAmountInCents,
          paymentData.amountInCents,
          paymentData.amount_is_in_cents
        ].find(value => typeof value === 'boolean');
        result = await unifiedPixService.createSpecialPixPayment(specialValor, metadata, {
          amountUnit: specialAmountUnit,
          amount_unit: specialAmountUnit,
          isAmountInCents: specialAmountFlag
        });
        break;
        
      default:
        // Criar PIX genérico
        result = await unifiedPixService.createPixPayment(paymentData, { gateway });
    }

    console.log('✅ [API PIX] PIX criado com sucesso:', {
      transaction_id: result.transaction_id,
      gateway: result.gateway,
      status: result.status
    });

    // 🔥 CORREÇÃO: Salvar transactionId no banco de dados para Oasyfy
    if (result.success && result.transaction_id && result.gateway === 'oasyfy') {
      try {
        console.log(`💾 [API PIX] Salvando transactionId ${result.transaction_id} no banco (Oasyfy)`);
        
        const correlationId = `oasyfy_save_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Capturar dados de tracking da requisição
        const trackingData = {
          utm_source: req.body.utm_source || req.body.tracking_data?.utm_source,
          utm_medium: req.body.utm_medium || req.body.tracking_data?.utm_medium,
          utm_campaign: req.body.utm_campaign || req.body.tracking_data?.utm_campaign,
          utm_term: req.body.utm_term || req.body.tracking_data?.utm_term,
          utm_content: req.body.utm_content || req.body.tracking_data?.utm_content,
          fbp: req.body.fbp || req.body.tracking_data?.fbp,
          fbc: req.body.fbc || req.body.tracking_data?.fbc,
          kwai_click_id: req.body.kwai_click_id || req.body.tracking_data?.kwai_click_id
        };

        // Salvar no SQLite
        const db = sqlite.get();
        if (db) {
          // Verificar e criar colunas necessárias
          const cols = db.prepare('PRAGMA table_info(tokens)').all();
          const hasKwaiClickId = cols.some(c => c.name === 'kwai_click_id');
          
          if (!hasKwaiClickId) {
            try {
              db.prepare('ALTER TABLE tokens ADD COLUMN kwai_click_id TEXT').run();
              console.log(`[${correlationId}] ✅ Coluna kwai_click_id criada`);
            } catch (error) {
              console.error(`[${correlationId}] ❌ Erro ao criar coluna kwai_click_id:`, error.message);
            }
          }

          const insertQuery = `
            INSERT INTO tokens (
              id_transacao, token, telegram_id, valor, status, tipo, usado, bot_id,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              fbp, fbc, ip_criacao, user_agent_criacao, nome_oferta,
              event_time, external_id_hash, kwai_click_id, first_name, last_name, phone
            ) VALUES (?, ?, ?, ?, ?, 'principal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const externalId = `oasyfy_${result.transaction_id}`;
          const identifier = result.identifier || `oasyfy_${result.transaction_id}_${Date.now()}`;
          const crypto = require('crypto');
          const externalIdHash = crypto.createHash('sha256').update(externalId).digest('hex');
          
          const safeString = (val) => val !== null && val !== undefined ? String(val) : null;
          
          db.prepare(insertQuery).run(
            result.transaction_id.toLowerCase(), // id_transacao
            result.transaction_id, // token (mesmo valor para compatibilidade)
            req.body.telegram_id || req.body.client_data?.telegram_id || null, // telegram_id
            result.amount || req.body.valor || 0, // valor
            'pendente', // status
            0, // usado
            req.body.bot_id || 'oasyfy_web', // bot_id
            safeString(trackingData.utm_source), // utm_source
            safeString(trackingData.utm_medium), // utm_medium
            safeString(trackingData.utm_campaign), // utm_campaign
            safeString(trackingData.utm_term), // utm_term
            safeString(trackingData.utm_content), // utm_content
            safeString(trackingData.fbp), // fbp
            safeString(trackingData.fbc), // fbc
            req.ip || req.connection.remoteAddress, // ip_criacao
            req.get('User-Agent') || null, // user_agent_criacao
            req.body.plano_nome || req.body.client_data?.plano_nome || 'Oasyfy PIX', // nome_oferta
            Math.floor(Date.now() / 1000), // event_time como INTEGER (timestamp Unix)
            externalIdHash, // external_id_hash
            safeString(trackingData.kwai_click_id), // kwai_click_id
            // Processar nome e telefone se disponíveis
            req.body.client_data?.nome ? splitFullName(req.body.client_data.nome).firstName : null, // first_name
            req.body.client_data?.nome ? splitFullName(req.body.client_data.nome).lastName : null, // last_name
            req.body.client_data?.telefone ? normalizePhoneToE164(req.body.client_data.telefone) : null // phone
          );
          
          console.log(`[${correlationId}] ✅ TransactionId salvo no SQLite: ${result.transaction_id}`);
        }

        // Salvar no PostgreSQL
        if (pool) {
          try {
            await pool.query(`
              INSERT INTO tokens (
                id_transacao, token, telegram_id, valor, status, tipo, usado, bot_id,
                utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                fbp, fbc, ip_criacao, user_agent_criacao, nome_oferta,
                event_time, external_id_hash, kwai_click_id, first_name, last_name, phone
              ) VALUES ($1, $2, $3, $4, $5, 'principal', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
              ON CONFLICT (id_transacao) DO UPDATE SET
                token = EXCLUDED.token,
                status = EXCLUDED.status,
                tipo = EXCLUDED.tipo,
                usado = EXCLUDED.usado,
                external_id_hash = EXCLUDED.external_id_hash,
                kwai_click_id = EXCLUDED.kwai_click_id,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                phone = EXCLUDED.phone
            `, [
              result.transaction_id.toLowerCase(), // id_transacao
              result.transaction_id, // token
              String(req.body.telegram_id || req.body.client_data?.telegram_id || null), // telegram_id como TEXT
              result.amount || req.body.valor || 0, // valor
              'pendente', // status
              false, // usado
              req.body.bot_id || 'oasyfy_web', // bot_id
              trackingData.utm_source, // utm_source
              trackingData.utm_medium, // utm_medium
              trackingData.utm_campaign, // utm_campaign
              trackingData.utm_term, // utm_term
              trackingData.utm_content, // utm_content
              trackingData.fbp, // fbp
              trackingData.fbc, // fbc
              req.ip || req.connection.remoteAddress, // ip_criacao
              req.get('User-Agent') || null, // user_agent_criacao
              req.body.plano_nome || req.body.client_data?.plano_nome || 'Oasyfy PIX', // nome_oferta
              Math.floor(Date.now() / 1000), // event_time como INTEGER (timestamp Unix)
              crypto.createHash('sha256').update(`oasyfy_${result.transaction_id}`).digest('hex'), // external_id_hash
              trackingData.kwai_click_id, // kwai_click_id
              // Processar nome e telefone se disponíveis
              req.body.client_data?.nome ? splitFullName(req.body.client_data.nome).firstName : null, // first_name
              req.body.client_data?.nome ? splitFullName(req.body.client_data.nome).lastName : null, // last_name
              req.body.client_data?.telefone ? normalizePhoneToE164(req.body.client_data.telefone) : null // phone
            ]);
            
            console.log(`[${correlationId}] ✅ TransactionId salvo no PostgreSQL: ${result.transaction_id}`);
          } catch (pgError) {
            console.error(`[${correlationId}] ❌ Erro ao salvar no PostgreSQL:`, pgError.message);
          }
        }
        
        console.log(`✅ [API PIX] TransactionId ${result.transaction_id} salvo com sucesso no banco de dados`);
      } catch (saveError) {
        console.error('❌ [API PIX] Erro ao salvar transactionId no banco:', saveError.message);
        // Não falhar a requisição se houver erro ao salvar
      }
    }
    
    console.log('📤 [API PIX] Enviando resposta para cliente:', JSON.stringify(result, null, 2));
    console.log('📤 [API PIX] Campos específicos da resposta:', {
      success: result.success,
      transaction_id: result.transaction_id,
      qr_code_base64: result.qr_code_base64 ? 'presente' : 'ausente',
      pix_copia_cola: result.pix_copia_cola ? 'presente' : 'ausente',
      gateway: result.gateway,
      status: result.status
    });
    res.json(result);
  } catch (error) {
    console.error('❌ [API PIX] Erro ao criar PIX unificado:', error);
    console.error('❌ [API PIX] Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Erro interno ao criar PIX',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Webhook específico do Oasyfy (formato da API)
app.post('/api/v1/gateway/webhook/:acquirer/:hashToken/route', async (req, res) => {
  try {
    if (!unifiedPixService) {
      return res.status(503).json({ error: 'Serviço de PIX não inicializado' });
    }

    const correlationId = `oasyfy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { acquirer, hashToken } = req.params;
    
    console.log(`[${correlationId}] 📥 Webhook Oasyfy recebido`);
    console.log(`[${correlationId}] Acquirer: ${acquirer}, Token: ${hashToken}`);
    console.log(`[${correlationId}] Headers:`, req.headers);
    console.log(`[${correlationId}] Payload:`, JSON.stringify(req.body, null, 2));

    // Validar webhook antes do processamento
    const OasyfyService = require('./services/oasyfy');
    const oasyfyService = new OasyfyService();
    
    if (!oasyfyService.validateWebhook(req.body, hashToken)) {
      console.error(`[${correlationId}] ❌ Webhook Oasyfy inválido - rejeitando`);
      return res.status(400).json({ 
        error: 'Webhook inválido',
        correlationId 
      });
    }

    console.log(`[${correlationId}] ✅ Webhook Oasyfy validado com sucesso`);

    // Processar webhook
    const result = await unifiedPixService.processWebhook(req.body, req.headers);
    
    console.log(`[${correlationId}] ✅ Webhook Oasyfy processado:`, {
      event: result.event,
      transaction_id: result.transaction_id,
      gateway: result.gateway
    });

    // Processar pagamento confirmado
    if (result.event === 'TRANSACTION_PAID' && result.status === 'completed') {
      console.log(`[${correlationId}] 💰 Pagamento confirmado via Oasyfy`);
      
      try {
        // Atualizar status no banco de dados
        const transactionId = result.transaction_id;
        const clientIdentifier = result.client_identifier;
        
        console.log(`[${correlationId}] 🔄 Atualizando status no banco para transação: ${transactionId}`);
        
        // Buscar transação no banco (tabela tokens)
        let db = sqlite.get();
        console.log(`[${correlationId}] 🔍 Debug SQLite:`, {
          db_exists: !!db,
          db_type: typeof db,
          sqlite_module: typeof sqlite
        });
        
        if (!db) {
          console.error(`[${correlationId}] ❌ SQLite não inicializado - tentando reinicializar...`);
          
          // Tentar reinicializar SQLite
          const newDb = sqlite.initialize('./pagamentos.db');
          if (!newDb) {
            console.error(`[${correlationId}] ❌ Falha ao reinicializar SQLite`);
            return;
          }
          console.log(`[${correlationId}] ✅ SQLite reinicializado com sucesso`);
          db = newDb; // Usar a nova instância
        }
        
        // 🎯 CORREÇÃO PRIORITÁRIA #3: Melhorar mapeamento e busca de transações
        console.log(`[${correlationId}] 🔍 Buscando transação:`, {
          transactionId: transactionId,
          clientIdentifier: clientIdentifier,
          identifier: result.identifier
        });
        
        const transaction = db.prepare(`
          SELECT * FROM tokens 
          WHERE LOWER(id_transacao) = LOWER(?) 
          OR LOWER(external_id_hash) = LOWER(?)
          OR LOWER(identifier) = LOWER(?)
        `).get(transactionId, clientIdentifier, result.identifier);
        
        console.log(`[${correlationId}] 🔍 Transação encontrada:`, {
          found: !!transaction,
          bot_id: transaction?.bot_id,
          telegram_id: transaction?.telegram_id,
          status: transaction?.status
        });
        
        if (transaction) {
          // 🔥 CORREÇÃO: Atualizar status para 'valido' (não 'pago') para que obrigado_purchase_flow.html aceite
          // Também extrair price_cents do resultado Oasyfy
          const oasyfyPriceCents = result.amount || null;
          
          const updateResult = db.prepare(
            'UPDATE tokens SET status = ?, is_paid = 1, paid_at = ?, usado = 0, end_to_end_id = ?, payer_name = ?, payer_national_registration = ?, price_cents = ? WHERE id_transacao = ?'
          ).run(
            'valido', // 🔥 CORREÇÃO: 'valido' em vez de 'pago'
            new Date().toISOString(), 
            result.end_to_end_id || null,
            result.payer_name || null,
            result.payer_national_registration || null,
            oasyfyPriceCents,
            transaction.id_transacao
          );
          
          console.log(`[${correlationId}] ✅ Status atualizado para pago: ${transaction.id_transacao}`);
          
          // 🎯 CORREÇÃO PRIORITÁRIA #1: Notificar bot Telegram após pagamento confirmado
          if (transaction.bot_id && transaction.telegram_id) {
            try {
              const botInstance = getBotService(transaction.bot_id);
              if (botInstance && botInstance.bot) {
                // 🔥 CORREÇÃO: Usar token da transação (não gerar novo)
                const token = transaction.token;
                const valorReais = (transaction.valor / 100).toFixed(2);
                
                // Determinar grupo baseado no bot_id
                let grupo = 'G1'; // Padrão
                if (transaction.bot_id === 'bot2') grupo = 'G2';
                else if (transaction.bot_id === 'bot_especial') grupo = 'G3';
                else if (transaction.bot_id === 'bot4') grupo = 'G4';
                else if (transaction.bot_id === 'bot5') grupo = 'G5';
                else if (transaction.bot_id === 'bot6') grupo = 'G6';
                else if (transaction.bot_id === 'bot7') grupo = 'G7';
                
                // 🔥 CORREÇÃO: Construir UTMs da mesma forma que PushinPay
                const utmParams = [];
                if (transaction.utm_source) utmParams.push(`utm_source=${encodeURIComponent(transaction.utm_source)}`);
                if (transaction.utm_medium) utmParams.push(`utm_medium=${encodeURIComponent(transaction.utm_medium)}`);
                if (transaction.utm_campaign) utmParams.push(`utm_campaign=${encodeURIComponent(transaction.utm_campaign)}`);
                if (transaction.utm_term) utmParams.push(`utm_term=${encodeURIComponent(transaction.utm_term)}`);
                if (transaction.utm_content) utmParams.push(`utm_content=${encodeURIComponent(transaction.utm_content)}`);
                const utmString = utmParams.length ? '&' + utmParams.join('&') : '';
                
                // 🔥 CORREÇÃO: Link no mesmo formato que PushinPay
                const linkAcesso = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/obrigado_purchase_flow.html?token=${encodeURIComponent(token)}&valor=${valorReais}&${grupo}${utmString}`;
                
                // Enviar link via Telegram
                await botInstance.bot.sendMessage(
                  transaction.telegram_id,
                  `🎉 Pagamento aprovado!\n\n🔗 Acesse: ${linkAcesso}\n\n⚠️ Link expira em 5 minutos.`,
                  { parse_mode: 'HTML' }
                );
                
                console.log(`[${correlationId}] ✅ Link enviado para Telegram ID: ${transaction.telegram_id} via bot: ${transaction.bot_id}`);
              } else {
                console.error(`[${correlationId}] ❌ Bot não encontrado ou não inicializado: ${transaction.bot_id}`);
              }
            } catch (error) {
              console.error(`[${correlationId}] ❌ Erro ao enviar link via Telegram:`, error.message);
            }
          } else {
            console.warn(`[${correlationId}] ⚠️ Dados insuficientes para notificar Telegram - bot_id: ${transaction.bot_id}, telegram_id: ${transaction.telegram_id}`);
          }
          
          // Processar tracking se disponível
          if (result.trackProps) {
            console.log(`[${correlationId}] 📊 Processando tracking Oasyfy:`, result.trackProps);
            
            // Enviar eventos de tracking
            try {
              // Facebook Pixel
              if (process.env.FB_PIXEL_ID && result.trackProps.fbc) {
                const facebookEvent = {
                  event_name: 'Purchase',
                  event_id: generateEventId(),
                  event_time: Math.floor(Date.now() / 1000),
                  user_data: {
                    em: result.client?.email ? crypto.createHash('sha256').update(result.client.email).digest('hex') : undefined,
                    ph: result.client?.phone ? crypto.createHash('sha256').update(result.client.phone.replace(/\D/g, '')).digest('hex') : undefined,
                    fn: result.client?.name ? crypto.createHash('sha256').update(result.client.name).digest('hex') : undefined
                  },
                  custom_data: {
                    value: result.amount,
                    currency: 'BRL',
                    content_type: 'product',
                    content_ids: [result.products?.[0]?.product?.externalId || 'plano_1_mes']
                  },
                  event_source_url: result.trackProps.source_url || 'https://ohvips.xyz',
                  action_source: 'website'
                };
                
                await sendFacebookEvent(facebookEvent);
                console.log(`[${correlationId}] ✅ Evento Facebook enviado`);
              }
              
              // Kwai Event API
              if (process.env.KWAI_PIXEL_ID && result.trackProps.kwai_click_id) {
                const kwaiEvent = {
                  event: 'Purchase',
                  timestamp: Math.floor(Date.now() / 1000),
                  properties: {
                    value: result.amount,
                    currency: 'BRL',
                    product_id: result.products?.[0]?.product?.externalId || 'plano_1_mes',
                    click_id: result.trackProps.kwai_click_id
                  }
                };
                
                const kwaiAPI = getKwaiEventAPI();
                await kwaiAPI.sendEvent(kwaiEvent);
                console.log(`[${correlationId}] ✅ Evento Kwai enviado`);
              }
              
              // UTMify
              if (process.env.UTMIFY_API_TOKEN && result.trackProps.utm_source) {
                const utmifyData = {
                  utm_source: result.trackProps.utm_source,
                  utm_medium: result.trackProps.utm_medium,
                  utm_campaign: result.trackProps.utm_campaign,
                  utm_content: result.trackProps.utm_content,
                  utm_term: result.trackProps.utm_term,
                  value: result.amount,
                  currency: 'BRL',
                  transaction_id: transactionId
                };
                
                // Enviar para UTMify (implementar se necessário)
                console.log(`[${correlationId}] 📊 Dados UTMify:`, utmifyData);
              }
              
            } catch (trackingError) {
              console.error(`[${correlationId}] ❌ Erro no tracking:`, trackingError.message);
            }
          }
          
        } else {
          console.log(`[${correlationId}] ⚠️ Transação não encontrada no banco: ${transactionId}`);
        }
        
      } catch (dbError) {
        console.error(`[${correlationId}] ❌ Erro ao atualizar banco de dados:`, dbError.message);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook Oasyfy:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Webhook unificado para todos os gateways
app.post('/webhook/unified', async (req, res) => {
  const startTime = Date.now();
  const correlationId = `unified_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`[${correlationId}] 📥 WEBHOOK UNIFICADO RECEBIDO`);
    console.log(`[${correlationId}] 🕒 Timestamp: ${new Date().toISOString()}`);
    console.log(`[${correlationId}] 🌐 IP: ${req.ip || req.connection.remoteAddress}`);
    console.log(`[${correlationId}] 📋 Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[${correlationId}] 📦 Payload:`, JSON.stringify(req.body, null, 2));
    console.log(`[${correlationId}] 📊 Payload size: ${JSON.stringify(req.body).length} bytes`);
    
    if (!unifiedPixService) {
      console.error(`[${correlationId}] ❌ Serviço de PIX não inicializado`);
      return res.status(503).json({ 
        error: 'Serviço de PIX não inicializado',
        correlation_id: correlationId
      });
    }

    // Processar webhook
    const result = await unifiedPixService.processWebhook(req.body, req.headers);
    
    console.log(`[${correlationId}] ✅ Webhook processado:`, {
      event: result.event,
      transaction_id: result.transaction_id,
      gateway: result.gateway
    });

    // Aqui você pode adicionar lógica específica baseada no gateway e evento
    if (result.event === 'TRANSACTION_PAID' && result.status === 'completed') {
      console.log(`[${correlationId}] 💰 Pagamento confirmado via ${result.gateway}`);
      
      // Integrar com sistema de tracking existente
      if (result.gateway === 'pushinpay') {
        // Processar como webhook PushinPay existente
        // (manter compatibilidade com código existente)
      } else if (result.gateway === 'oasyfy') {
        // Processar webhook Oasyfy
        console.log(`[${correlationId}] 🎯 Processando evento Oasyfy:`, result);
        
        try {
          // Atualizar status no banco de dados
          const transactionId = result.transaction_id;
          const clientIdentifier = result.client_identifier;
          
          console.log(`[${correlationId}] 🔄 Atualizando status no banco para transação: ${transactionId}`);
          
          // Buscar transação no banco (tabela tokens)
          let db = sqlite.get();
          if (!db) {
            console.error(`[${correlationId}] ❌ SQLite não inicializado - tentando reinicializar...`);
            
            // Tentar reinicializar SQLite
            const newDb = sqlite.initialize('./pagamentos.db');
            if (!newDb) {
              console.error(`[${correlationId}] ❌ Falha ao reinicializar SQLite`);
              return;
            }
            console.log(`[${correlationId}] ✅ SQLite reinicializado com sucesso`);
            db = newDb; // Usar a nova instância
          }
          
          // 🎯 CORREÇÃO PRIORITÁRIA #3: Melhorar mapeamento e busca de transações
          console.log(`[${correlationId}] 🔍 Buscando transação:`, {
            transactionId: transactionId,
            clientIdentifier: clientIdentifier,
            identifier: result.identifier
          });
          
          const transaction = db.prepare(`
            SELECT * FROM tokens 
            WHERE LOWER(id_transacao) = LOWER(?) 
            OR LOWER(external_id_hash) = LOWER(?)
            OR LOWER(identifier) = LOWER(?)
          `).get(transactionId, clientIdentifier, result.identifier);
          
          console.log(`[${correlationId}] 🔍 Transação encontrada:`, {
            found: !!transaction,
            bot_id: transaction?.bot_id,
            telegram_id: transaction?.telegram_id,
            status: transaction?.status
          });
          
          if (transaction) {
            // 🔥 CORREÇÃO: Atualizar status para 'valido' (não 'pago') para que obrigado_purchase_flow.html aceite
            const updateResult = db.prepare(
              'UPDATE tokens SET status = ?, is_paid = 1, paid_at = ?, usado = 0, end_to_end_id = ?, payer_name = ?, payer_national_registration = ? WHERE id_transacao = ?'
            ).run(
              'valido', // 🔥 CORREÇÃO: 'valido' em vez de 'pago'
              new Date().toISOString(), 
              result.end_to_end_id || null,
              result.payer_name || null,
              result.payer_national_registration || null,
              transaction.id_transacao
            );
            
            console.log(`[${correlationId}] ✅ Status atualizado para pago: ${transaction.id_transacao}`);
            
            // 🎯 CORREÇÃO PRIORITÁRIA #1: Notificar bot Telegram após pagamento confirmado
            if (transaction.bot_id && transaction.telegram_id) {
              try {
                const botInstance = getBotService(transaction.bot_id);
                if (botInstance && botInstance.bot) {
                  // 🔥 CORREÇÃO: Usar token da transação (não gerar novo)
                  const token = transaction.token;
                  // 🎯 CORREÇÃO: Usar price_cents do webhook (fonte canônica), não transaction.valor
                  const priceCents = toIntOrNull(oasyfyPriceCents);
                  const valorReais = priceCents && priceCents > 0
                    ? centsToValue(priceCents)
                    : null;
                  
                  // Determinar grupo baseado no bot_id
                  let grupo = 'G1'; // Padrão
                  if (transaction.bot_id === 'bot2') grupo = 'G2';
                  else if (transaction.bot_id === 'bot_especial') grupo = 'G3';
                  else if (transaction.bot_id === 'bot4') grupo = 'G4';
                  else if (transaction.bot_id === 'bot5') grupo = 'G5';
                  else if (transaction.bot_id === 'bot6') grupo = 'G6';
                  else if (transaction.bot_id === 'bot7') grupo = 'G7';
                  
                  // 🔥 CORREÇÃO: Construir UTMs da mesma forma que PushinPay
                  const utmParams = [];
                  if (transaction.utm_source) utmParams.push(`utm_source=${encodeURIComponent(transaction.utm_source)}`);
                  if (transaction.utm_medium) utmParams.push(`utm_medium=${encodeURIComponent(transaction.utm_medium)}`);
                  if (transaction.utm_campaign) utmParams.push(`utm_campaign=${encodeURIComponent(transaction.utm_campaign)}`);
                  if (transaction.utm_term) utmParams.push(`utm_term=${encodeURIComponent(transaction.utm_term)}`);
                  if (transaction.utm_content) utmParams.push(`utm_content=${encodeURIComponent(transaction.utm_content)}`);
                  const utmString = utmParams.length ? '&' + utmParams.join('&') : '';
                  
                  // 🎯 CORREÇÃO: Omitir parâmetro 'valor' se não disponível (não enviar valor=0)
                  let linkAcesso;
                  if (valorReais !== null) {
                    linkAcesso = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/obrigado_purchase_flow.html?token=${encodeURIComponent(token)}&valor=${valorReais}&${grupo}${utmString}`;
                    console.log(`[BOT-LINK] token=${token} price_cents=${priceCents} valor=${valorReais} url=${linkAcesso}`);
                  } else {
                    linkAcesso = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/obrigado_purchase_flow.html?token=${encodeURIComponent(token)}&${grupo}${utmString}`;
                    console.log(`[BOT-LINK] omitindo parâmetro "valor" por ausência de price_cents. token=${token} url=${linkAcesso}`);
                  }
                  
                  // Enviar link via Telegram
                  await botInstance.bot.sendMessage(
                    transaction.telegram_id,
                    `🎉 Pagamento aprovado!\n\n🔗 Acesse: ${linkAcesso}\n\n⚠️ Link expira em 5 minutos.`,
                    { parse_mode: 'HTML' }
                  );
                  
                  console.log(`[${correlationId}] ✅ Link enviado para Telegram ID: ${transaction.telegram_id} via bot: ${transaction.bot_id}`);
                } else {
                  console.error(`[${correlationId}] ❌ Bot não encontrado ou não inicializado: ${transaction.bot_id}`);
                }
              } catch (error) {
                console.error(`[${correlationId}] ❌ Erro ao enviar link via Telegram:`, error.message);
              }
            } else {
              console.warn(`[${correlationId}] ⚠️ Dados insuficientes para notificar Telegram - bot_id: ${transaction.bot_id}, telegram_id: ${transaction.telegram_id}`);
            }
            
            // Processar tracking se disponível
            if (result.trackProps) {
              console.log(`[${correlationId}] 📊 Processando tracking Oasyfy:`, result.trackProps);
              
              // Enviar eventos de tracking
              try {
                // Facebook Pixel
                if (process.env.FB_PIXEL_ID && result.trackProps.fbc) {
                  const facebookEvent = {
                    event_name: 'Purchase',
                    event_id: generateEventId(),
                    event_time: Math.floor(Date.now() / 1000),
                    user_data: {
                      em: result.client?.email ? crypto.createHash('sha256').update(result.client.email).digest('hex') : undefined,
                      ph: result.client?.phone ? crypto.createHash('sha256').update(result.client.phone.replace(/\D/g, '')).digest('hex') : undefined,
                      fn: result.client?.name ? crypto.createHash('sha256').update(result.client.name).digest('hex') : undefined
                    },
                    custom_data: {
                      value: result.amount,
                      currency: 'BRL',
                      content_type: 'product',
                      content_ids: [result.products?.[0]?.product?.externalId || 'plano_1_mes']
                    },
                    event_source_url: result.trackProps.source_url || 'https://ohvips.xyz',
                    action_source: 'website'
                  };
                  
                  await sendFacebookEvent(facebookEvent);
                  console.log(`[${correlationId}] ✅ Evento Facebook enviado`);
                }
                
                // Kwai Event API
                if (process.env.KWAI_PIXEL_ID && result.trackProps.kwai_click_id) {
                  const kwaiEvent = {
                    event: 'Purchase',
                    timestamp: Math.floor(Date.now() / 1000),
                    properties: {
                      value: result.amount,
                      currency: 'BRL',
                      product_id: result.products?.[0]?.product?.externalId || 'plano_1_mes',
                      click_id: result.trackProps.kwai_click_id
                    }
                  };
                  
                  const kwaiAPI = getKwaiEventAPI();
                  await kwaiAPI.sendEvent(kwaiEvent);
                  console.log(`[${correlationId}] ✅ Evento Kwai enviado`);
                }
                
                // UTMify
                if (process.env.UTMIFY_API_TOKEN && result.trackProps.utm_source) {
                  const utmifyData = {
                    utm_source: result.trackProps.utm_source,
                    utm_medium: result.trackProps.utm_medium,
                    utm_campaign: result.trackProps.utm_campaign,
                    utm_content: result.trackProps.utm_content,
                    utm_term: result.trackProps.utm_term,
                    value: result.amount,
                    currency: 'BRL',
                    transaction_id: transactionId
                  };
                  
                  // Enviar para UTMify (implementar se necessário)
                  console.log(`[${correlationId}] 📊 Dados UTMify:`, utmifyData);
                }
                
              } catch (trackingError) {
                console.error(`[${correlationId}] ❌ Erro no tracking:`, trackingError.message);
              }
            }
            
          } else {
            console.log(`[${correlationId}] ⚠️ Transação não encontrada no banco: ${transactionId}`);
          }
          
        } catch (dbError) {
          console.error(`[${correlationId}] ❌ Erro ao atualizar banco de dados:`, dbError.message);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook unificado:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

function maskTokenForLog(token) {
  if (typeof token !== 'string') {
    return '';
  }

  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 1)}***${trimmed.slice(-1)}`;
  }

  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

// Endpoint para configurações do frontend
app.get('/api/config', (req, res) => {
  try {
    const requestInfo = {
      ip: req.ip,
      userAgent: req.get('user-agent') || '(desconhecido)',
      timestamp: new Date().toISOString()
    };
    console.log('[api/config] Requisição recebida.', requestInfo);

    const whatsappPixelToken = whatsappTrackingEnv.pixelToken || '';
    const whatsappConfig = {
      pixelId: whatsappTrackingEnv.pixelId || '',
      pixelToken: whatsappPixelToken,
      accessToken: whatsappPixelToken,
      baseUrl: whatsappTrackingEnv.baseUrl || ''
    };

    console.log('[api/config] Configuração do WhatsApp resolvida.', {
      pixelId: whatsappConfig.pixelId || '(ausente)',
      pixelToken: whatsappPixelToken ? maskTokenForLog(whatsappPixelToken) : '(ausente)',
      baseUrl: whatsappConfig.baseUrl || '(não definido)'
    });

    const config = {
      FB_PIXEL_ID: process.env.FB_PIXEL_ID || '',
      KWAI_PIXEL_ID: process.env.KWAI_PIXEL_ID || '',
      KWAI_ACCESS_TOKEN: process.env.KWAI_ACCESS_TOKEN ? '***' : '',
      KWAI_TEST_MODE: process.env.KWAI_TEST_MODE === 'true',
      PUSHINPAY_TOKEN: process.env.PUSHINPAY_TOKEN ? '***' : '',
      FRONTEND_URL: process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000',
      UTMIFY_API_TOKEN: process.env.UTMIFY_API_TOKEN ? '***' : '',
      // Informações dos gateways PIX
      PIX_GATEWAYS: {
        DEFAULT_GATEWAY: process.env.DEFAULT_PIX_GATEWAY || 'pushinpay',
        PUSHINPAY_CONFIGURED: !!process.env.PUSHINPAY_TOKEN,
        OASYFY_CONFIGURED: !!(process.env.OASYFY_PUBLIC_KEY && process.env.OASYFY_SECRET_KEY),
        OASYFY_PUBLIC_KEY: process.env.OASYFY_PUBLIC_KEY ? '***' : '',
        OASYFY_SECRET_KEY: process.env.OASYFY_SECRET_KEY ? '***' : ''
      },
      whatsapp: whatsappConfig
    };

    const responseLog = {
      ...config,
      whatsapp: {
        ...config.whatsapp,
        pixelToken: whatsappPixelToken ? maskTokenForLog(whatsappPixelToken) : '(ausente)',
        accessToken: whatsappPixelToken ? maskTokenForLog(whatsappPixelToken) : '(ausente)'
      }
    };

    console.log('[api/config] Payload preparado para resposta (mascarado).', responseLog);

    res.json(config);
    console.log('[api/config] Resposta enviada com sucesso.');
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Servir assets estáticos do checkout
app.use('/checkout', express.static(path.join(__dirname, 'checkout'), {
  maxAge: '1d',
  etag: false
}));

// Servir arquivos da pasta whatsapp
app.use('/whatsapp', express.static(path.join(__dirname, 'whatsapp'), {
  maxAge: '1d',
  etag: false,
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      console.log('📁 [STATIC] Servindo arquivo JS:', path);
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

function sanitizeStringOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

function normalizeTrackingParameters(rawTracking) {
  const tracking = rawTracking && typeof rawTracking === 'object' && !Array.isArray(rawTracking)
    ? rawTracking
    : {};

  return {
    src: sanitizeStringOrNull(tracking.src),
    sck: sanitizeStringOrNull(tracking.sck),
    utm_source: sanitizeStringOrNull(tracking.utm_source),
    utm_medium: sanitizeStringOrNull(tracking.utm_medium),
    utm_campaign: sanitizeStringOrNull(tracking.utm_campaign),
    utm_content: sanitizeStringOrNull(tracking.utm_content),
    utm_term: sanitizeStringOrNull(tracking.utm_term)
  };
}

function normalizePaymentMethod(rawPaymentMethod) {
  if (typeof rawPaymentMethod === 'string') {
    const normalized = rawPaymentMethod.trim().toLowerCase();
    const allowed = ['credit_card', 'boleto', 'pix', 'paypal', 'free_price', 'unknown'];

    if (allowed.includes(normalized)) {
      return normalized;
    }
  }

  return 'unknown';
}

function normalizeStatus(rawStatus) {
  if (typeof rawStatus !== 'string') {
    return 'paid';
  }

  const normalized = rawStatus.trim().toLowerCase();
  const statusMap = {
    waiting_payment: 'waiting_payment',
    pending: 'waiting_payment',
    paid: 'paid',
    approved: 'paid',
    completed: 'paid',
    refused: 'refused',
    declined: 'refused',
    refunded: 'refunded',
    chargeback: 'chargedback',
    chargedback: 'chargedback'
  };

  return statusMap[normalized] || 'paid';
}

function sanitizeTrackingValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

const trackingFieldToColumnMap = {
  fbp: 'fbp',
  fbc: 'fbc',
  userAgent: 'user_agent_criacao',
  ip: 'ip_criacao',
  city: 'city'
};

let cachedTokensIdentifierColumn = null;
let cachedTokensColumnSet = null;

async function resolveTokensIdentifierColumn(pool) {
  if (cachedTokensIdentifierColumn) {
    return cachedTokensIdentifierColumn;
  }

  if (!pool) {
    return 'token';
  }

  try {
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tokens'
        AND column_name IN ('token', 'id_transacao')
    `);

    const availableColumns = result.rows.map(row => row.column_name);
    cachedTokensColumnSet = new Set(availableColumns);

    if (availableColumns.includes('token')) {
      cachedTokensIdentifierColumn = 'token';
    } else if (availableColumns.includes('id_transacao')) {
      cachedTokensIdentifierColumn = 'id_transacao';
    } else {
      cachedTokensIdentifierColumn = 'token';
      console.warn('[TRACKING-BACKEND] Nenhuma coluna token ou id_transacao encontrada na tabela tokens; assumindo token.');
    }
  } catch (error) {
    cachedTokensIdentifierColumn = 'token';
    cachedTokensColumnSet = null;
    console.warn('[TRACKING-BACKEND] Erro ao identificar coluna de token na tabela tokens:', error.message);
  }

  return cachedTokensIdentifierColumn;
}

function buildTokenIdentifierWhereClause(identifierColumn) {
  const conditions = new Set();

  if (identifierColumn && (!cachedTokensColumnSet || cachedTokensColumnSet.has(identifierColumn))) {
    conditions.add(`${identifierColumn} = $1`);
  }

  if (cachedTokensColumnSet?.has('token')) {
    conditions.add('token = $1');
  }

  // Remover condição problemática com coluna 'id' que pode ser INTEGER
  // A coluna 'id' não deve ser usada para busca por token/texto
  // if (cachedTokensColumnSet?.has('id')) {
  //   conditions.add('id = $1');
  // }

  conditions.add('id_transacao = $1');

  return Array.from(conditions).join(' OR ');
}

app.post('/api/whatsapp/salvar-tracking', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : null;
    const rawToken = typeof body?.token === 'string' ? body.token.trim() : '';
    const trackingData = body?.trackingData;

    if (!rawToken || !trackingData || typeof trackingData !== 'object' || Array.isArray(trackingData)) {
      return res.status(400).json({ success: false, error: 'Dados de tracking inválidos' });
    }

    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Erro de conexão com banco de dados' });
    }

    const hasField = key => Object.prototype.hasOwnProperty.call(trackingData, key);

    const normalizedTracking = {
      fbp: sanitizeTrackingValue(trackingData.fbp),
      fbc: sanitizeTrackingValue(trackingData.fbc),
      userAgent: sanitizeTrackingValue(trackingData.userAgent),
      ip: sanitizeTrackingValue(trackingData.ip),
      city: sanitizeTrackingValue(trackingData.city)
    };

    // Log de debug para fbp e fbc
    console.log(`[TRACKING-BACKEND] Token ${rawToken.substring(0, 8)}... recebido com fbp=${normalizedTracking.fbp}, fbc=${normalizedTracking.fbc}`);

    const hasAnyField = Object.keys(trackingFieldToColumnMap).some(hasField);
    if (!hasAnyField) {
      return res.status(400).json({ success: false, error: 'Nenhum dado de tracking fornecido' });
    }

    const identifierColumn = await resolveTokensIdentifierColumn(pool);
    const identifierWhereClause = buildTokenIdentifierWhereClause(identifierColumn);

    const updateResult = await pool.query(
      `UPDATE tokens
         SET
           fbp = CASE WHEN $2 THEN $3 ELSE fbp END,
           fbc = CASE WHEN $4 THEN $5 ELSE fbc END,
           user_agent_criacao = CASE WHEN $6 THEN $7 ELSE user_agent_criacao END,
           ip_criacao = CASE WHEN $8 THEN $9 ELSE ip_criacao END,
           city = CASE WHEN $10 THEN $11 ELSE city END
       WHERE ${identifierWhereClause}`,
      [
        rawToken,
        hasField('fbp'),
        normalizedTracking.fbp,
        hasField('fbc'),
        normalizedTracking.fbc,
        hasField('userAgent'),
        normalizedTracking.userAgent,
        hasField('ip'),
        normalizedTracking.ip,
        hasField('city'),
        normalizedTracking.city
      ]
    );

    console.log(
      `[TRACKING-BACKEND] Linhas afetadas ao salvar tracking para token ${rawToken}: ${updateResult.rowCount}`
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const trackingLogPayload = {};
    for (const [key, column] of Object.entries(trackingFieldToColumnMap)) {
      if (hasField(key)) {
        trackingLogPayload[column] = normalizedTracking[key];
      }
    }

    console.log(`[TRACKING-BACKEND] Salvo para token ${rawToken}: ${JSON.stringify(trackingLogPayload)}.`);

    return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar tracking WhatsApp:', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

app.post('/api/whatsapp/utmify', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : null;

  const rawOrderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const products = Array.isArray(body?.products) ? body.products : [];
  const trackingParameters = body?.trackingParameters;
  const hasTrackingParameters =
    trackingParameters && typeof trackingParameters === 'object' && !Array.isArray(trackingParameters);

  if (!body || !rawOrderId || products.length === 0 || !hasTrackingParameters) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  const apiToken = process.env.WHATSAPP_UTMIFY_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: 'WHATSAPP_UTMIFY_API_TOKEN ausente' });
  }

  const timestamp = new Date().toISOString();
  const normalizedTrackingParameters = normalizeTrackingParameters(trackingParameters);

  const utmifyPayload = {
    ...body,
    orderId: rawOrderId,
    paymentMethod: normalizePaymentMethod(body?.paymentMethod),
    status: normalizeStatus(body?.status),
    trackingParameters: normalizedTrackingParameters,
    createdAt: timestamp,
    approvedDate: timestamp
  };

  try {
    const response = await axios.post(
      'https://api.utmify.com.br/api-credentials/orders',
      utmifyPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': apiToken
        }
      }
    );

    console.log('[WhatsApp UTMify] Conversão recebida e enviada');

    return res.json({
      success: true,
      utmifyResponse: response.data
    });
  } catch (error) {
    if (error.response) {
      console.error(
        '[WhatsApp UTMify] Erro ao enviar conversão:',
        error.response.status,
        error.response.data
      );
      return res.status(502).json({ error: 'Falha ao enviar para UTMify' });
    }

    if (error.request || error.code) {
      console.error('[WhatsApp UTMify] Falha de rede ao enviar conversão:', error.message || error.code);
      return res.status(503).json({ error: 'Serviço UTMify indisponível' });
    }

    console.error('[WhatsApp UTMify] Erro inesperado ao enviar conversão:', error.message);
    return res.status(502).json({ error: 'Falha ao enviar para UTMify' });
  }
});

function pickFirstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
      continue;
    }
    return value;
  }
  return null;
}

app.post('/debug/utmify/order', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
  const rawTelegramId = body.telegram_id !== undefined && body.telegram_id !== null
    ? String(body.telegram_id).trim()
    : '';

  if (!rawToken && !rawTelegramId) {
    return res.status(400).json({ ok: false, sent: false, error: 'token_or_telegram_id_required' });
  }

  if (!pool) {
    return res.status(503).json({ ok: false, sent: false, error: 'database_unavailable' });
  }

  try {
    let tokenRow = null;
    let resolvedTelegramId = rawTelegramId || null;
    let orderId = rawToken || null;

    if (rawToken) {
      const tokenResult = await pool.query('SELECT * FROM tokens WHERE token = $1 LIMIT 1', [rawToken]);
      tokenRow = tokenResult.rows[0] || null;
    }

    if (!tokenRow && resolvedTelegramId) {
      const latestTokenResult = await pool.query(
        `SELECT * FROM tokens WHERE telegram_id = $1 ORDER BY criado_em DESC NULLS LAST LIMIT 1`,
        [resolvedTelegramId]
      );
      tokenRow = latestTokenResult.rows[0] || null;
    }

    if (!tokenRow && rawToken) {
      const fallbackResult = await pool.query(
        `SELECT * FROM tokens WHERE id_transacao = $1 LIMIT 1`,
        [rawToken]
      );
      tokenRow = fallbackResult.rows[0] || null;
    }

    if (!tokenRow && !resolvedTelegramId) {
      return res.status(404).json({ ok: false, sent: false, error: 'order_not_found' });
    }

    if (tokenRow) {
      if (!orderId && tokenRow.token) {
        orderId = tokenRow.token;
      }
      if (!resolvedTelegramId && tokenRow.telegram_id) {
        resolvedTelegramId = String(tokenRow.telegram_id);
      }
    }

    let telegramUserRow = null;
    if (resolvedTelegramId) {
      const telegramResult = await pool.query(
        'SELECT * FROM telegram_users WHERE telegram_id = $1 LIMIT 1',
        [resolvedTelegramId]
      );
      telegramUserRow = telegramResult.rows[0] || null;
    }

    if (!orderId) {
      orderId = tokenRow?.id_transacao || null;
    }

    if (!orderId) {
      return res.status(404).json({ ok: false, sent: false, error: 'order_id_unavailable' });
    }

    const rawValue = tokenRow?.valor;
    if (rawValue === undefined || rawValue === null) {
      return res.status(404).json({ ok: false, sent: false, error: 'value_unavailable' });
    }

    const normalizedValue = formatForCAPI(rawValue);

    const utm = {
      utm_source: pickFirstValue(tokenRow?.utm_source, telegramUserRow?.utm_source),
      utm_medium: pickFirstValue(tokenRow?.utm_medium, telegramUserRow?.utm_medium),
      utm_campaign: pickFirstValue(tokenRow?.utm_campaign, telegramUserRow?.utm_campaign),
      utm_content: pickFirstValue(tokenRow?.utm_content, telegramUserRow?.utm_content),
      utm_term: pickFirstValue(tokenRow?.utm_term, telegramUserRow?.utm_term)
    };

    const ids = {
      external_id_hash: pickFirstValue(tokenRow?.external_id_hash, telegramUserRow?.external_id_hash),
      fbp: pickFirstValue(tokenRow?.fbp, telegramUserRow?.fbp),
      fbc: pickFirstValue(tokenRow?.fbc, telegramUserRow?.fbc),
      zip_hash: pickFirstValue(tokenRow?.zip_hash, telegramUserRow?.zip_hash)
    };

    const client = {
      ip: pickFirstValue(tokenRow?.ip_criacao, telegramUserRow?.ip_capturado),
      user_agent: pickFirstValue(tokenRow?.user_agent_criacao, telegramUserRow?.ua_capturado)
    };

    console.log('[UTMify Debug] Reenviando conversão', {
      req_id: req.requestId || null,
      order_hash: orderId ? crypto.createHash('sha256').update(String(orderId)).digest('hex').slice(0, 10) : null,
      telegram_hash: resolvedTelegramId
        ? crypto.createHash('sha256').update(String(resolvedTelegramId)).digest('hex').slice(0, 10)
        : null
    });

    const utmifyResult = await utmifyService.postOrder({
      order_id: orderId,
      value: normalizedValue,
      currency: 'BRL',
      utm,
      ids,
      client,
      requestId: req.requestId || null
    });

    if (utmifyResult?.sent) {
      return res.json({ ok: true, sent: true, attempt: utmifyResult.attempt || 1 });
    }

    if (utmifyResult?.skipped) {
      return res.json({
        ok: true,
        sent: false,
        attempt: utmifyResult.attempt || 0,
        skipped: true,
        reason: utmifyResult.reason
      });
    }

    return res.status(502).json({
      ok: false,
      sent: false,
      attempt: utmifyResult?.attempt || 0,
      error: utmifyResult?.error || 'utmify_error'
    });
  } catch (error) {
    console.error('[UTMify Debug] Erro ao reenviar conversão:', error.message);
    return res.status(500).json({ ok: false, sent: false, error: 'internal_error' });
  }
});

// Marcar token WhatsApp como usado (chamado após redirecionamento)
app.post('/api/whatsapp/marcar-usado', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';

    if (!rawToken) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token não informado'
      });
    }
    
    // Obter pool de conexões
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro de conexão com banco de dados' 
      });
    }
    
    // Marcar token como usado
    await pool.query(
      'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1',
      [rawToken]
    );

    console.log(`Token WhatsApp marcado como usado: ${rawToken.substring(0, 8)}...`);

    // 🔥 CORREÇÃO: Buscar dados atualizados do token antes de enviar CAPI
    const tokenAtualizado = await pool.query(
      `SELECT token, valor, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              fbp, fbc, ip_criacao, user_agent_criacao, event_time, criado_em,
              fn_hash, ln_hash, external_id_hash, pixel_sent, capi_sent, cron_sent, telegram_id,
              capi_ready, capi_processing, city
       FROM tokens WHERE token = $1`,
      [rawToken]
    );

    if (tokenAtualizado.rows.length > 0) {
      const dadosToken = tokenAtualizado.rows[0];
      
      // 🔥 DEBUG DETALHADO: Mostrar dados brutos do banco
      console.log(`🔍 [WHATSAPP-CAPI] Dados BRUTOS do banco:`, {
        fbp: dadosToken.fbp,
        fbc: dadosToken.fbc,
        ip_criacao: dadosToken.ip_criacao,
        user_agent_criacao: dadosToken.user_agent_criacao,
        city: dadosToken.city
      });
      
      console.log(`🔍 [WHATSAPP-CAPI] Dados do token para CAPI:`, {
        fbp: dadosToken.fbp ? dadosToken.fbp.substring(0, 20) + '...' : 'null',
        fbc: dadosToken.fbc ? dadosToken.fbc.substring(0, 20) + '...' : 'null',
        ip: dadosToken.ip_criacao || 'null',
        userAgent: dadosToken.user_agent_criacao ? dadosToken.user_agent_criacao.substring(0, 50) + '...' : 'null'
      });
      
      // 🔥 CORREÇÃO: CAPI será enviado pelo frontend com UTMs completas
      console.log(`ℹ️ [WHATSAPP-CAPI] CAPI será enviado pelo frontend (whatsapp-tracking.js) com dados completos`);
      // await processarCapiWhatsApp({ pool, token: rawToken, dadosToken });
    } else {
      console.warn(`⚠️ [WHATSAPP-CAPI] Token ${rawToken} não encontrado para CAPI`);
      // await processarCapiWhatsApp({ pool, token: rawToken });
    }

    res.json({
      sucesso: true,
      mensagem: 'Token marcado como usado com sucesso!'
    });
    
  } catch (error) {
    console.error('Erro ao marcar token WhatsApp como usado:', error);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno do servidor' 
    });
  }
});

// ====== ENDPOINTS PARA TOKENS DO WHATSAPP ======

// Endpoint de emergência para corrigir colunas do WhatsApp
app.post('/api/whatsapp/fix-columns', async (req, res) => {
  try {
    console.log('🚨 Executando correção de emergência das colunas do WhatsApp...');
    
    // Obter pool de conexões
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro de conexão com banco de dados' 
      });
    }
    
    // Executar verificação das colunas
    await verificarColunasWhatsApp(pool);
    
    res.json({
      sucesso: true,
      mensagem: 'Colunas do WhatsApp corrigidas com sucesso!'
    });
    
  } catch (error) {
    console.error('❌ Erro na correção de emergência:', error);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro ao corrigir colunas: ' + error.message 
    });
  }
});

// Gerar token para WhatsApp
app.post('/api/whatsapp/gerar-token', async (req, res) => {
  try {
    const { valor, nome, telefone } = req.body;

    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Valor inválido'
      });
    }

    const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
    const telefoneLimpo = typeof telefone === 'string' ? telefone.trim() : '';

    if (!nomeLimpo) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Nome é obrigatório'
      });
    }

    if (!telefoneLimpo) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Telefone é obrigatório'
      });
    }

    // Processar nome e telefone
    const { firstName, lastName } = splitFullName(nomeLimpo);
    const normalizedPhone = normalizePhoneToE164(telefoneLimpo);

    const token = crypto.randomBytes(32).toString('hex');
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Obter pool de conexões
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro de conexão com banco de dados' 
      });
    }

    try {
      // Inserir token na tabela tokens (mesma tabela do sistema principal)
      await pool.query(
        'INSERT INTO tokens (token, valor, descricao, nome, telefone, tipo, status, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [token, valorNumerico, nomeLimpo, nomeLimpo, telefoneLimpo, 'whatsapp', 'valido', firstName, lastName, normalizedPhone]
      );
    } catch (insertError) {
      // Se der erro de coluna não encontrada, tentar corrigir e tentar novamente
      if (
        insertError.code === '42703' &&
        ['tipo', 'descricao', 'nome', 'telefone', 'first_name', 'last_name', 'phone'].some(coluna => insertError.message.includes(coluna))
      ) {
        console.log('🔧 Tentando corrigir colunas automaticamente...');
        await verificarColunasWhatsApp(pool);

        // Tentar inserir novamente
        await pool.query(
          'INSERT INTO tokens (token, valor, descricao, nome, telefone, tipo, status, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [token, valorNumerico, nomeLimpo, nomeLimpo, telefoneLimpo, 'whatsapp', 'valido', firstName, lastName, normalizedPhone]
        );
      } else {
        throw insertError;
      }
    }

    console.log(`Token WhatsApp gerado: ${token.substring(0, 8)}... | Nome: ${nomeLimpo} | Telefone: ${telefoneLimpo}`);

    res.json({
      sucesso: true,
      token: token,
      url: `${baseUrl}/whatsapp/obrigado.html?token=${encodeURIComponent(token)}&valor=${valorNumerico}`,
      valor: valorNumerico,
      nome: nomeLimpo,
      telefone: telefoneLimpo
    });
    
  } catch (error) {
    console.error('Erro ao gerar token WhatsApp:', error);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno do servidor' 
    });
  }
});

// Verificar token do WhatsApp
app.post('/api/whatsapp/verificar-token', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';

    // Log detalhado do que está chegando
    console.log('🔍 [BACKEND] Body completo recebido:', JSON.stringify(body, null, 2));
    console.log('🔍 [BACKEND] FBP recebido no body:', body.fbp);
    console.log('🔍 [BACKEND] FBC recebido no body:', body.fbc);

    if (!rawToken) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token não informado'
      });
    }

    // Obter pool de conexões
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro de conexão com banco de dados'
      });
    }

    // Buscar token na tabela - incluir first_name, last_name, phone
    const identifierColumn = await resolveTokensIdentifierColumn(pool);
    const identifierWhereClause = buildTokenIdentifierWhereClause(identifierColumn);
    const resultado = await pool.query(
      `SELECT valor, usado, status, tipo, fbp, fbc, ip_criacao, user_agent_criacao, city, 
              first_name, last_name, phone
         FROM tokens
        WHERE ${identifierWhereClause}`,
      [rawToken]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: 'Token não encontrado'
      });
    }

    const tokenData = resultado.rows[0];

    const localTrackingFallback = {
      fbp: sanitizeTrackingValue(body.fbp),
      fbc: sanitizeTrackingValue(body.fbc),
      userAgent: sanitizeTrackingValue(body.user_agent ?? body.userAgent),
      ip: sanitizeTrackingValue(body.ip),
      city: sanitizeTrackingValue(body.city)
    };

    // Log de debug para fbp e fbc
    console.log(`[TRACKING-BACKEND] Token ${rawToken.substring(0, 8)}... verificado com fbp=${localTrackingFallback.fbp}, fbc=${localTrackingFallback.fbc}`);

    const dbTracking = {
      fbp: sanitizeTrackingValue(tokenData.fbp),
      fbc: sanitizeTrackingValue(tokenData.fbc),
      userAgent: sanitizeTrackingValue(tokenData.user_agent_criacao),
      ip: sanitizeTrackingValue(tokenData.ip_criacao),
      city: sanitizeTrackingValue(tokenData.city)
    };

    const resolvedTracking = {
      fbp: dbTracking.fbp ?? localTrackingFallback.fbp,
      fbc: dbTracking.fbc ?? localTrackingFallback.fbc,
      ip_criacao: dbTracking.ip ?? localTrackingFallback.ip,
      user_agent_criacao: dbTracking.userAgent ?? localTrackingFallback.userAgent,
      city: dbTracking.city ?? localTrackingFallback.city
    };

    // Verificar se é um token do WhatsApp
    if (tokenData.tipo !== 'whatsapp') {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token inválido para WhatsApp'
      });
    }

    if (tokenData.status !== 'valido') {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token inválido'
      });
    }

    if (tokenData.usado) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Token já foi usado'
      });
    }

    // 🔥 CORREÇÃO: Salvar dados de tracking no banco se vieram do frontend
    if (localTrackingFallback.fbp || localTrackingFallback.fbc || localTrackingFallback.ip || localTrackingFallback.userAgent) {
      try {
        const updateQuery = `
          UPDATE tokens 
          SET 
            fbp = COALESCE($2, fbp),
            fbc = COALESCE($3, fbc), 
            ip_criacao = COALESCE($4, ip_criacao),
            user_agent_criacao = COALESCE($5, user_agent_criacao),
            city = COALESCE($6, city)
          WHERE ${identifierWhereClause}
        `;
        
        await pool.query(updateQuery, [
          rawToken,
          localTrackingFallback.fbp,
          localTrackingFallback.fbc,
          localTrackingFallback.ip,
          localTrackingFallback.userAgent,
          localTrackingFallback.city
        ]);
        
        console.log(`✅ [TRACKING-BACKEND] Dados atualizados no banco para token ${rawToken.substring(0, 8)}...`);
      } catch (error) {
        console.error('❌ [TRACKING-BACKEND] Erro ao atualizar dados no banco:', error);
      }
    }

    // 🔥 SIMPLIFICADO: UTMs serão enviadas via localStorage pelo frontend

    // NÃO marcar token como usado aqui - será marcado após redirecionamento
    console.log(`Token WhatsApp validado: ${rawToken.substring(0, 8)}...`);
    console.log(`[TRACKING-BACKEND] Recuperado para token ${rawToken}: ${JSON.stringify(resolvedTracking)}.`);

    // 🔥 NOVA IMPLEMENTAÇÃO: Enviar evento Purchase via CAPI no backend com deduplicação
    try {
      console.log('🚀 [WHATSAPP-CAPI-BACKEND] Iniciando envio do evento Purchase via CAPI...');
      
      const purchaseValue = parseFloat(tokenData.valor);
      const eventSourceUrl = body.event_source_url || 'https://ohvips.xyz/whatsapp/obrigado.html';
      
      // Criar user_data hasheado
      const crypto = require('crypto');
      const user_data = {
        client_ip_address: resolvedTracking.ip_criacao,
        client_user_agent: resolvedTracking.user_agent_criacao,
        fbp: resolvedTracking.fbp,
        fbc: resolvedTracking.fbc,
        external_id: crypto.createHash('sha256').update(rawToken).digest('hex') // Hash SHA-256 do token
      };

      // Hashear first_name se existir
      if (tokenData.first_name) {
        user_data.fn = crypto.createHash('sha256').update(tokenData.first_name.toLowerCase()).digest('hex');
      }

      // Hashear last_name se existir
      if (tokenData.last_name) {
        user_data.ln = crypto.createHash('sha256').update(tokenData.last_name.toLowerCase()).digest('hex');
      }

      // Hashear phone se existir
      if (tokenData.phone) {
        // Normalizar telefone (remover caracteres não numéricos, manter +55 se BR)
        let normalizedPhone = tokenData.phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('55') && normalizedPhone.length === 13) {
          normalizedPhone = '+' + normalizedPhone;
        } else if (normalizedPhone.length === 11) {
          normalizedPhone = '+55' + normalizedPhone;
        }
        user_data.ph = crypto.createHash('sha256').update(normalizedPhone).digest('hex');
      }

      // Usar generateSyncedTimestamp para sincronização perfeita
      const { generateSyncedTimestamp } = require('./services/facebook');
      const eventTime = generateSyncedTimestamp(body.client_timestamp) || Math.floor(Date.now() / 1000);

      // Montar payload do evento Purchase
      const capiPayload = {
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: rawToken, // Usar o token como event_id para deduplicação
        event_source_url: eventSourceUrl,
        value: purchaseValue,
        currency: 'BRL',
        contents: [{
          id: 'whatsapp-premium',
          quantity: 1,
          item_price: purchaseValue
        }],
        user_data,
        client_timestamp: body.client_timestamp,
        source: 'capi',
        origin: 'whatsapp',
        token: rawToken,
        pool: pool,
        __httpRequest: {
          headers: req.headers,
          body: req.body,
          query: req.query
        }
      };

      console.log('🔧 [WHATSAPP-CAPI-BACKEND] Payload montado:', {
        event_name: capiPayload.event_name,
        event_id: capiPayload.event_id ? capiPayload.event_id.substring(0, 8) + '...' : null,
        event_time: capiPayload.event_time,
        value: capiPayload.value,
        currency: capiPayload.currency,
        event_source_url: capiPayload.event_source_url,
        has_fbp: !!user_data.fbp,
        has_fbc: !!user_data.fbc,
        has_external_id: !!user_data.external_id,
        has_fn: !!user_data.fn,
        has_ln: !!user_data.ln,
        has_ph: !!user_data.ph,
        has_ip: !!user_data.client_ip_address,
        has_user_agent: !!user_data.client_user_agent
      });

      console.log('🚀 [WHATSAPP-CAPI-BACKEND] Preparando para envio via CAPI...');

      // Enviar via função existente sendFacebookEvent
      const capiResult = await sendFacebookEvent(capiPayload);
      
      if (capiResult && capiResult.success) {
        console.log('✅ [WHATSAPP-CAPI-BACKEND] Evento Purchase enviado com sucesso via CAPI');
      } else {
        console.error('❌ [WHATSAPP-CAPI-BACKEND] Falha ao enviar evento Purchase via CAPI:', capiResult);
      }
    } catch (capiError) {
      console.error('❌ [WHATSAPP-CAPI-BACKEND] Erro inesperado ao enviar CAPI:', capiError);
      // Não interromper o fluxo principal por erro no CAPI
    }

    res.json({
      sucesso: true,
      valor: parseFloat(tokenData.valor),
      first_name: tokenData.first_name || null,
      last_name: tokenData.last_name || null,
      phone: tokenData.phone || null,
      status: 'valido',
      mensagem: 'Acesso liberado com sucesso!',
      tracking: resolvedTracking,
      fbp: resolvedTracking.fbp,
      fbc: resolvedTracking.fbc,
      ip_criacao: resolvedTracking.ip_criacao,
      user_agent_criacao: resolvedTracking.user_agent_criacao,
      city: resolvedTracking.city
    });
  } catch (error) {
    console.error('Erro ao verificar token WhatsApp:', error);
    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno do servidor'
    });
  }
});

// Listar tokens do WhatsApp
app.get('/api/whatsapp/tokens', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '50'));
    const offset = (page - 1) * limit;
    
    // Obter pool de conexões
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro de conexão com banco de dados' 
      });
    }
    
    const tokensResult = await pool.query(
      `SELECT token, usado, status, valor, nome, telefone, descricao, data_criacao, data_uso
       FROM tokens
       WHERE tipo = 'whatsapp'
       ORDER BY data_criacao DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM tokens WHERE tipo = \'whatsapp\''
    );
    const total = parseInt(countResult.rows[0].total);
    
    const tokens = tokensResult.rows.map(row => ({
      token: row.token,
      valor: row.valor !== null ? parseFloat(row.valor) : null,
      nome: row.nome || '',
      telefone: row.telefone || '',
      status: row.status || (row.usado ? 'usado' : 'pendente'),
      usado: row.usado,
      descricao: row.descricao,
      data_criacao: row.data_criacao,
      data_uso: row.data_uso
    }));

    res.json({
      sucesso: true,
      tokens,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Erro ao buscar tokens WhatsApp:', error);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno do servidor' 
    });
  }
});

// Estatísticas dos tokens WhatsApp
app.get('/api/whatsapp/estatisticas', async (req, res) => {
  try {
    // Obter pool de conexões
    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro de conexão com banco de dados' 
      });
    }
    
    let stats;
    try {
      stats = await pool.query(`
        SELECT
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN usado = TRUE THEN 1 END) as tokens_usados,
          SUM(CASE WHEN usado = TRUE THEN valor ELSE 0 END) as valor_total,
          COUNT(CASE WHEN DATE(data_criacao) = CURRENT_DATE THEN 1 END) as tokens_hoje
        FROM tokens
        WHERE tipo = 'whatsapp'
      `);
    } catch (queryError) {
      // Se der erro de coluna não encontrada, tentar corrigir e tentar novamente
      if (queryError.code === '42703' && queryError.message.includes('tipo')) {
        console.log('🔧 Tentando corrigir colunas automaticamente...');
        await verificarColunasWhatsApp(pool);

        // Tentar query novamente
        stats = await pool.query(`
          SELECT
            COUNT(*) as total_tokens,
            COUNT(CASE WHEN usado = TRUE THEN 1 END) as tokens_usados,
            SUM(CASE WHEN usado = TRUE THEN valor ELSE 0 END) as valor_total,
            COUNT(CASE WHEN DATE(data_criacao) = CURRENT_DATE THEN 1 END) as tokens_hoje
          FROM tokens
          WHERE tipo = 'whatsapp'
        `);
      } else {
        throw queryError;
      }
    }

    let latestTokenResult;
    try {
      latestTokenResult = await pool.query(`
        SELECT
          token,
          valor,
          nome,
          telefone,
          status,
          usado,
          data_criacao,
          data_uso
        FROM tokens
        WHERE tipo = 'whatsapp'
        ORDER BY data_criacao DESC
        LIMIT 1
      `);
    } catch (latestError) {
      if (latestError.code === '42703') {
        console.log('🔧 Tentando corrigir colunas para consulta do último token...');
        await verificarColunasWhatsApp(pool);
        latestTokenResult = await pool.query(`
          SELECT
            token,
            valor,
            nome,
            telefone,
            status,
            usado,
            data_criacao,
            data_uso
          FROM tokens
          WHERE tipo = 'whatsapp'
          ORDER BY data_criacao DESC
          LIMIT 1
        `);
      } else {
        throw latestError;
      }
    }

    const ultimoTokenRow = latestTokenResult.rows[0] || null;
    const ultimoToken = ultimoTokenRow
      ? {
          token: ultimoTokenRow.token,
          valor: ultimoTokenRow.valor !== null ? parseFloat(ultimoTokenRow.valor) : null,
          nome: ultimoTokenRow.nome || '',
          telefone: ultimoTokenRow.telefone || '',
          status: ultimoTokenRow.status || (ultimoTokenRow.usado ? 'usado' : 'pendente'),
          usado: ultimoTokenRow.usado,
          data_criacao: ultimoTokenRow.data_criacao,
          data_uso: ultimoTokenRow.data_uso
        }
      : null;

    const estatisticas = {
      total_tokens: parseInt(stats.rows[0].total_tokens),
      tokens_usados: parseInt(stats.rows[0].tokens_usados),
      valor_total: parseFloat(stats.rows[0].valor_total) || 0,
      tokens_hoje: parseInt(stats.rows[0].tokens_hoje)
    };

    res.json({ sucesso: true, estatisticas, ultimo_token: ultimoToken });
    
  } catch (error) {
    console.error('Erro ao buscar estatísticas WhatsApp:', error);
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno do servidor' 
    });
  }
});

app.delete('/api/whatsapp/limpar-tokens', async (req, res) => {
  try {
    if (ADMIN_SECRET) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (!token || token !== ADMIN_SECRET) {
        return res.status(403).json({ sucesso: false, erro: 'Não autorizado' });
      }
    }

    const pool = postgres ? postgres.getPool() : null;
    if (!pool) {
      return res.status(500).json({
        sucesso: false,
        erro: 'Erro de conexão com banco de dados'
      });
    }

    await pool.query("DELETE FROM tokens WHERE tipo = 'whatsapp'");

    res.json({ sucesso: true, mensagem: 'Tokens de WhatsApp apagados com sucesso' });
  } catch (err) {
    console.error('Erro ao apagar tokens de WhatsApp:', err);
    res.status(500).json({ sucesso: false, erro: 'Erro ao apagar tokens de WhatsApp' });
  }
});

// Função para inicializar colunas necessárias na tabela zap_controle
function initializeZapControleColumns() {
  try {
    const db = sqlite.get() || sqlite.initialize('./pagamentos.db');
    if (!db) {
      console.log('[AVISO] SQLite não disponível, usando fallback JSON');
      return;
    }

    // Adiciona ativo_zap1 se não existir
    try {
      db.exec("ALTER TABLE zap_controle ADD COLUMN ativo_zap1 BOOLEAN DEFAULT 1");
      console.log('[INFO] Coluna ativo_zap1 adicionada à tabela zap_controle');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('[INFO] Coluna ativo_zap1 já existe');
      } else {
        console.error('[ERRO] Erro ao adicionar coluna ativo_zap1:', err.message);
      }
    }

    // Adiciona ativo_zap2 se não existir
    try {
      db.exec("ALTER TABLE zap_controle ADD COLUMN ativo_zap2 BOOLEAN DEFAULT 1");
      console.log('[INFO] Coluna ativo_zap2 adicionada à tabela zap_controle');
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('[INFO] Coluna ativo_zap2 já existe');
      } else {
        console.error('[ERRO] Erro ao adicionar coluna ativo_zap2:', err.message);
      }
    }

    // Atualiza registros existentes para ter os valores padrão
    try {
      db.exec("UPDATE zap_controle SET ativo_zap1 = 1, ativo_zap2 = 1 WHERE ativo_zap1 IS NULL OR ativo_zap2 IS NULL");
      console.log('[INFO] Registros existentes atualizados com valores padrão');
    } catch (err) {
      console.error('[ERRO] Erro ao atualizar registros existentes:', err.message);
    }

  } catch (error) {
    console.error('[ERRO] Erro ao inicializar colunas zap_controle:', error.message);
  }
}

// Função auxiliar para ler e escrever zapControle usando SQLite
function normalizeBoolean(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  return Boolean(value);
}

function readZapControle() {
  const createDefaultData = () => ({
    ultimo_zap_usado: "zap1",
    leads_zap1: 0,
    leads_zap2: 0,
    zap1_numero: "5511999999999",
    zap2_numero: "5511888888888",
    ativo_zap1: true,
    ativo_zap2: true,
    historico: []
  });

  const fallbackRead = () => {
    const zapControlePath = path.join(__dirname, 'whatsapp', 'zapControle.json');
    if (fs.existsSync(zapControlePath)) {
      const data = fs.readFileSync(zapControlePath, 'utf8');
      const parsed = JSON.parse(data);
      return {
        ...createDefaultData(),
        ...parsed,
        ativo_zap1: normalizeBoolean(parsed.ativo_zap1, true),
        ativo_zap2: normalizeBoolean(parsed.ativo_zap2, true)
      };
    }
    return createDefaultData();
  };

  try {
    const db = sqlite.get() || sqlite.initialize('./pagamentos.db');
    if (!db) {
      return fallbackRead();
    }

    const stmt = db.prepare('SELECT * FROM zap_controle WHERE id = 1');
    const row = stmt.get();

    if (row) {
      return {
        ultimo_zap_usado: row.ultimo_zap_usado === "zap2" ? "zap2" : "zap1",
        leads_zap1: Number(row.leads_zap1) || 0,
        leads_zap2: Number(row.leads_zap2) || 0,
        zap1_numero: row.zap1_numero,
        zap2_numero: row.zap2_numero,
        ativo_zap1: normalizeBoolean(row.ativo_zap1, true),
        ativo_zap2: normalizeBoolean(row.ativo_zap2, true),
        historico: row.historico ? JSON.parse(row.historico) : []
      };
    } else {
      // Cria registro inicial
      const defaultData = createDefaultData();
      writeZapControle(defaultData);
      return defaultData;
    }
  } catch (error) {
    console.error('Erro ao ler zapControle:', error);
    // Fallback para JSON se SQLite falhar
    return fallbackRead();
  }
}

function writeZapControle(zapControle) {
  const fallbackWrite = () => {
    const zapControlePath = path.join(__dirname, 'whatsapp', 'zapControle.json');
    fs.writeFileSync(zapControlePath, JSON.stringify(sanitizedControle, null, 2));
  };

  const sanitizedControle = {
    ...zapControle,
    ultimo_zap_usado: zapControle.ultimo_zap_usado === "zap2" ? "zap2" : "zap1",
    leads_zap1: Number(zapControle.leads_zap1) || 0,
    leads_zap2: Number(zapControle.leads_zap2) || 0,
    ativo_zap1: normalizeBoolean(zapControle.ativo_zap1, true),
    ativo_zap2: normalizeBoolean(zapControle.ativo_zap2, true),
    historico: Array.isArray(zapControle.historico) ? zapControle.historico : []
  };

  const ativoZap1Value = sanitizedControle.ativo_zap1 ? 1 : 0;
  const ativoZap2Value = sanitizedControle.ativo_zap2 ? 1 : 0;

  try {
    const db = sqlite.get() || sqlite.initialize('./pagamentos.db');
    if (!db) {
      return fallbackWrite();
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO zap_controle
      (id, ultimo_zap_usado, leads_zap1, leads_zap2, zap1_numero, zap2_numero, ativo_zap1, ativo_zap2, historico)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      sanitizedControle.ultimo_zap_usado,
      sanitizedControle.leads_zap1,
      sanitizedControle.leads_zap2,
      sanitizedControle.zap1_numero,
      sanitizedControle.zap2_numero,
      ativoZap1Value,
      ativoZap2Value,
      JSON.stringify(sanitizedControle.historico)
    );
    fallbackWrite();
  } catch (error) {
    console.error('Erro ao escrever zapControle:', error);
    
    // Se o erro for por coluna não encontrada, tenta inicializar as colunas e tentar novamente
    if (error.message.includes('no column named ativo_zap1') || error.message.includes('no column named ativo_zap2')) {
      console.log('[INFO] Colunas ativo_zap1/ativo_zap2 não encontradas, inicializando...');
      initializeZapControleColumns();
      
      // Tenta novamente após inicializar as colunas
      try {
        const db = sqlite.get();
        if (db) {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO zap_controle
            (id, ultimo_zap_usado, leads_zap1, leads_zap2, zap1_numero, zap2_numero, ativo_zap1, ativo_zap2, historico)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(
            sanitizedControle.ultimo_zap_usado,
            sanitizedControle.leads_zap1,
            sanitizedControle.leads_zap2,
            sanitizedControle.zap1_numero,
            sanitizedControle.zap2_numero,
            ativoZap1Value,
            ativoZap2Value,
            JSON.stringify(sanitizedControle.historico)
          );
          fallbackWrite();
          console.log('[INFO] ZapControle salvo com sucesso após inicializar colunas');
          return;
        }
      } catch (retryError) {
        console.error('Erro ao tentar novamente após inicializar colunas:', retryError);
      }
    }
    
    // Fallback para JSON se SQLite falhar
    fallbackWrite();
  }
}

// Rota /whatsapp para redirecionamento com alternância automática
app.get('/whatsapp', (req, res) => {
  try {
    console.log('🔍 [SERVER] Rota /whatsapp chamada');

    // 🔥 SIMPLIFICADO: UTMs serão capturadas pelo localStorage no frontend

    // Lê o arquivo de controle
    const zapControle = readZapControle();
    const zapState = {
      ...zapControle,
      ultimo_zap_usado: zapControle.ultimo_zap_usado === 'zap2' ? 'zap2' : 'zap1',
      leads_zap1: Number(zapControle.leads_zap1) || 0,
      leads_zap2: Number(zapControle.leads_zap2) || 0,
      ativo_zap1: normalizeBoolean(zapControle.ativo_zap1, true),
      ativo_zap2: normalizeBoolean(zapControle.ativo_zap2, true),
      historico: Array.isArray(zapControle.historico) ? zapControle.historico : []
    };

    console.log('🧮 [WHATSAPP] Estado atual do zap_controle:', {
      ativo_zap1: zapState.ativo_zap1,
      ativo_zap2: zapState.ativo_zap2,
      ultimo_zap_usado: zapState.ultimo_zap_usado,
      leads_zap1: zapState.leads_zap1,
      leads_zap2: zapState.leads_zap2
    });

    // Verifica quais zaps estão ativos
    const zap1Ativo = zapState.ativo_zap1 !== false;
    const zap2Ativo = zapState.ativo_zap2 !== false;

    let zapAtual = null;
    let numeroZap = null;

    // Lógica de redirecionamento baseada no status dos zaps
    if (zap1Ativo && zap2Ativo) {
      // Ambos ativos: round-robin normal
      zapAtual = zapState.ultimo_zap_usado === 'zap1' ? 'zap2' : 'zap1';
      numeroZap = zapState[`${zapAtual}_numero`];
    } else if (zap1Ativo && !zap2Ativo) {
      // Apenas zap1 ativo: sempre manda para ele
      zapAtual = "zap1";
      numeroZap = zapState.zap1_numero;
    } else if (!zap1Ativo && zap2Ativo) {
      // Apenas zap2 ativo: sempre manda para ele
      zapAtual = "zap2";
      numeroZap = zapState.zap2_numero;
    } else {
      // Nenhum ativo: redireciona para index principal
      const message = 'Nenhum número ativo disponível';
      console.warn('⚠️ [WHATSAPP]', message);
      return res.status(503).send(message);
    }

    // Atualiza os contadores apenas se um zap foi selecionado
    if (zapAtual && numeroZap) {
      const previousLeadsZap1 = zapState.leads_zap1;
      const previousLeadsZap2 = zapState.leads_zap2;

      zapState.ultimo_zap_usado = zapAtual;
      zapState[`leads_${zapAtual}`] = (zapState[`leads_${zapAtual}`] || 0) + 1;

      console.log('✅ [WHATSAPP] Zap selecionado:', {
        zapSelecionado: zapAtual,
        numero: numeroZap,
        ultimo_zap_usado_anterior: zapControle.ultimo_zap_usado,
        ultimo_zap_usado_novo: zapState.ultimo_zap_usado
      });

      console.log('📊 [WHATSAPP] Contadores atualizados:', {
        leads_zap1_antes: previousLeadsZap1,
        leads_zap2_antes: previousLeadsZap2,
        leads_zap1_depois: zapState.leads_zap1,
        leads_zap2_depois: zapState.leads_zap2
      });

      // Salva as alterações no arquivo
      writeZapControle(zapState);

      console.log('💾 [WHATSAPP] Estado persistido com sucesso.');

      // Cria o link do WhatsApp com mensagem pré-definida
      const mensagem = "Olá Hadrielle, Quero saber mais sobre seus conteúdo.";
      const mensagemCodificada = encodeURIComponent(mensagem);
      const zapLink = `https://wa.me/${numeroZap}?text=${mensagemCodificada}`;
      console.log('🔗 [SERVER] zapLink criado:', zapLink);
      
      // Lê o arquivo HTML
      const htmlPath = path.join(__dirname, 'whatsapp', 'redirect.html');
      let htmlContent = fs.readFileSync(htmlPath, 'utf8');
      
      // Injeta o link do WhatsApp no HTML
      htmlContent = htmlContent.replace('</head>', `
      <script>
          window.zapLink = '${zapLink}';
          console.log('🔗 [INJECTED] window.zapLink definido:', window.zapLink);
      </script>
      </head>`);

      console.log('📤 [SERVER] Enviando HTML com zapLink injetado');
      res.send(htmlContent);
    } else {
      const message = 'Não foi possível determinar um número de WhatsApp válido';
      console.warn('⚠️ [WHATSAPP]', message, { zapAtual, numeroZap });
      res.status(500).send(message);
    }

  } catch (error) {
    console.error('Erro na rota /whatsapp:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota /admin para o dashboard WhatsApp
app.get('/admin', (req, res) => {
  try {
    const dashboardPath = path.join(__dirname, 'whatsapp', 'dashboard.html');
    res.sendFile(dashboardPath);
  } catch (error) {
    console.error('Erro ao servir dashboard:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota /api/status para retornar dados do zapControle.json
app.get('/api/status', (req, res) => {
  try {
    const zapControle = readZapControle();
    res.json(zapControle);
  } catch (error) {
    console.error('Erro ao ler zapControle.json:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota /api/atualizar-zaps para salvar novos números
app.post('/api/atualizar-zaps', (req, res) => {
  try {
    const { zap1_numero, zap2_numero } = req.body;
    
    // Valida os dados recebidos
    if (!zap1_numero || !zap2_numero) {
      return res.status(400).json({ error: 'Números do Zap1 e Zap2 são obrigatórios' });
    }
    
    if (zap1_numero.length < 10 || zap2_numero.length < 10) {
      return res.status(400).json({ error: 'Os números devem ter pelo menos 10 dígitos' });
    }
    
    // Lê o arquivo atual
    const zapControle = readZapControle();
    
    // Salva os números antigos no histórico se forem diferentes
    const historico = zapControle.historico || [];
    
    // Verifica se o número do Zap1 mudou
    if (zapControle.zap1_numero !== zap1_numero && zapControle.zap1_numero) {
      historico.push({
        numero: zapControle.zap1_numero,
        leads: zapControle.leads_zap1 || 0,
        tipo: "zap1"
      });
      // Reseta o contador de leads do Zap1
      zapControle.leads_zap1 = 0;
    }
    
    // Verifica se o número do Zap2 mudou
    if (zapControle.zap2_numero !== zap2_numero && zapControle.zap2_numero) {
      historico.push({
        numero: zapControle.zap2_numero,
        leads: zapControle.leads_zap2 || 0,
        tipo: "zap2"
      });
      // Reseta o contador de leads do Zap2
      zapControle.leads_zap2 = 0;
    }
    
    // Atualiza os números e o histórico
    zapControle.zap1_numero = zap1_numero;
    zapControle.zap2_numero = zap2_numero;
    zapControle.historico = historico;
    
    // Salva o arquivo
    writeZapControle(zapControle);
    
    res.json({ 
      success: true, 
      message: 'Números atualizados com sucesso',
      data: zapControle 
    });
    
  } catch (error) {
    console.error('Erro ao atualizar zapControle.json:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota /api/toggle-zap para alternar o estado de um zap
app.post('/api/toggle-zap', (req, res) => {
  try {
    const { zap } = req.body;
    
    // Valida os dados recebidos
    if (!zap || !['zap1', 'zap2'].includes(zap)) {
      return res.status(400).json({ error: 'Zap deve ser "zap1" ou "zap2"' });
    }
    
    // Lê o arquivo atual
    const zapControle = readZapControle();
    
    // Determina a ação antes de alterar o valor
    const wasActive = zapControle[`ativo_${zap}`];
    const action = wasActive ? 'desativado' : 'ativado';
    
    // Alterna o estado do zap especificado
    if (zap === 'zap1') {
      zapControle.ativo_zap1 = !zapControle.ativo_zap1;
    } else if (zap === 'zap2') {
      zapControle.ativo_zap2 = !zapControle.ativo_zap2;
    }
    
    // Salva o arquivo
    writeZapControle(zapControle);
    
    const message = `${zap.toUpperCase()} ${action} com sucesso`;
    
    res.json({ 
      success: true, 
      message: message,
      data: zapControle 
    });
    
  } catch (error) {
    console.error('Erro ao alternar zap:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota /privacy para renderizar o checkout web
app.get('/privacy', (req, res) => {
  try {
    const checkoutPath = path.join(__dirname, 'checkout', 'index.html');
    res.sendFile(checkoutPath);
  } catch (error) {
    console.error('Erro ao servir checkout:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rotas principais
// Rota raiz simplificada para health checks
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// Rota de informações completa (mantida para compatibilidade)
app.get('/info', (req, res) => {
  const indexPath = path.join(__dirname, 'MODELO1/WEB/index.html');

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message: 'SiteHot Bot API',
      status: 'running',
      bot_status: bot ? 'Inicializado' : 'Não inicializado',
      database_connected: databaseConnected,
      web_module_loaded: webModuleLoaded,
      webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`, `${BASE_URL}/bot_especial/webhook`, `${BASE_URL}/bot4/webhook`, `${BASE_URL}/bot5/webhook`, `${BASE_URL}/bot6/webhook`]
    });
  }
});

app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'MODELO1/WEB/admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    const publicAdminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(publicAdminPath)) {
      res.sendFile(publicAdminPath);
    } else {
      res.status(404).json({ error: 'Painel administrativo não encontrado' });
    }
  }
});

app.get('/admin.html', (req, res) => {
  const adminPath = path.join(__dirname, 'MODELO1/WEB/admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    const publicAdminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(publicAdminPath)) {
      res.sendFile(publicAdminPath);
    } else {
      res.status(404).json({ error: 'Painel administrativo não encontrado' });
    }
  }
});

// Rotas de saúde
app.get('/health-basic', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/health/full', async (req, res) => {
  const status = {
    ok: false,
    db: false,
    counters: false,
    capiReady: Boolean(process.env.FB_PIXEL_ID && (process.env.FB_PIXEL_TOKEN || process.env.FB_ACCESS_TOKEN)),
    utmifyReady: utmifyService.isConfigured(),
    geoReady: Boolean(process.env.GEO_API_KEY || process.env.GEO_PROVIDER || process.env.GEO_PROVIDER_URL)
  };

  const dbPool = postgres ? postgres.getPool() : null;

  if (dbPool) {
    try {
      await dbPool.query('SELECT 1');
      status.db = true;
    } catch (error) {
      status.db = false;
    }

    try {
      const columnCheck = await dbPool.query(
        `SELECT COUNT(*) AS count
           FROM information_schema.columns
          WHERE table_name = 'tracking_data'
            AND column_name IN ('external_id_hash', 'zip_hash')`
      );
      const count = Number(columnCheck.rows?.[0]?.count || 0);

      const tableCheck = await dbPool.query(
        `SELECT
            to_regclass('public.funnel_events') AS events,
            to_regclass('public.funnel_counters') AS counters`
      );

      status.counters =
        count >= 2 && Boolean(tableCheck.rows?.[0]?.events) && Boolean(tableCheck.rows?.[0]?.counters);
    } catch (error) {
      status.counters = false;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    let capiDryRunOk = true;
    let utmifyDryRunOk = true;

    try {
      facebookService.buildInitiateCheckoutEvent({
        telegramId: '0',
        externalIdHash: '0'.repeat(64),
        utms: {},
        client_ip_address: '127.0.0.1',
        client_user_agent: 'health-check'
      });
    } catch (error) {
      capiDryRunOk = false;
    }

    try {
      utmifyService.buildOrderPayload({
        order_id: 'health-check',
        value: 1,
        currency: 'BRL',
        utm: { utm_source: 'health' },
        ids: {},
        client: {}
      });
    } catch (error) {
      utmifyDryRunOk = false;
    }

    status.capiReady = status.capiReady && capiDryRunOk;
    status.utmifyReady = status.utmifyReady && utmifyDryRunOk;
  }

  status.ok = status.db && status.counters && status.capiReady && status.utmifyReady && status.geoReady;

  return res.json(status);
});

// Rota de teste
app.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`, `${BASE_URL}/bot_especial/webhook`, `${BASE_URL}/bot4/webhook`, `${BASE_URL}/bot5/webhook`, `${BASE_URL}/bot6/webhook`],
    bot_status: bot ? 'Inicializado' : 'Não inicializado',
    database_status: databaseConnected ? 'Conectado' : 'Desconectado',
    web_module_status: webModuleLoaded ? 'Carregado' : 'Não carregado'
  });
});

// Debug
app.get('/debug/status', (req, res) => {
  const poolStats = pool && postgres ? postgres.getPoolStats(pool) : null;
  
  res.json({
    server: {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
              env: process.env.NODE_ENV || 'production'
    },
    database: {
      connected: databaseConnected,
      pool_available: !!pool,
      pool_stats: poolStats
    },
    modules: {
      bot: !!bot,
      postgres: !!postgres,
      web: webModuleLoaded
    }
  });
});

// Endpoint para listar eventos de rastreamento
app.get('/api/eventos', async (req, res) => {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(8).toString('hex');
  
          console.log(`[${requestId}] Iniciando busca de eventos - ${timestamp}`);
  
  try {
    // Autenticação básica por token
    const authToken = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Token simples para acesso ao painel (pode ser melhorado)
    const PANEL_ACCESS_TOKEN = process.env.PANEL_ACCESS_TOKEN || 'admin123';
    
    if (!authToken || authToken !== PANEL_ACCESS_TOKEN) {
      console.warn(`🔒 [${requestId}] Tentativa de acesso negada - token inválido`);
      return res.status(403).json({ erro: 'Token de acesso inválido' });
    }

    const { evento, inicio, fim, utm_campaign, limit = 100, offset = 0 } = req.query;
            console.log(`[${requestId}] Filtros aplicados:`, { evento, inicio, fim, utm_campaign, limit, offset });
    
    // Verificar se o pool está disponível
    if (!pool) {
              console.error(`[${requestId}] Pool de conexão não disponível - retornando dados simulados`);
      
      // Estrutura de fallback corrigida
      const fallbackData = [
        {
          data_evento: new Date().toISOString(),
          tipo_evento: 'Purchase',
          valor: null,
          token: null,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          telegram_id: null,
          status_envio: 'indisponível'
        }
      ];
      
      console.warn(`⚠️ [${requestId}] Retornando dados simulados devido à falta de conexão com banco`);
      return res.status(200).json(fallbackData);
    }
    
    // Query principal para eventos Purchase
    let query = `
      SELECT 
        COALESCE(t.criado_em, NOW()) as data_evento,
        'Purchase' as tipo_evento,
        t.valor,
        t.token,
        COALESCE(t.utm_source, td.utm_source, p.utm_source) as utm_source,
        COALESCE(t.utm_medium, td.utm_medium, p.utm_medium) as utm_medium,
        COALESCE(t.utm_campaign, td.utm_campaign, p.utm_campaign) as utm_campaign,
        -- ✅ CORREÇÃO: Cast seguro com tratamento de NULL e valores float
        CASE 
          WHEN t.telegram_id IS NULL THEN NULL
          WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
            SPLIT_PART(t.telegram_id::text, '.', 1)
          ELSE t.telegram_id::text
        END as telegram_id,
        CASE 
          WHEN t.pixel_sent = true OR t.capi_sent = true OR t.cron_sent = true THEN 'enviado'
          ELSE 'pendente'
        END as status_envio,
        'tokens' as source_table
      FROM tokens t
      -- ✅ CORREÇÃO: JOIN mais seguro - converte telegram_id para comparação
      LEFT JOIN tracking_data td ON (
        CASE 
          WHEN t.telegram_id IS NULL THEN FALSE
          WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
            SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = td.telegram_id
          ELSE FALSE
        END
      )
      LEFT JOIN payload_tracking pt ON (
        CASE 
          WHEN t.telegram_id IS NULL THEN FALSE
          WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
            SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = pt.telegram_id
          ELSE FALSE
        END
      )
      LEFT JOIN payloads p ON t.token = p.payload_id
      WHERE (t.pixel_sent = true OR t.capi_sent = true OR t.cron_sent = true)
      
      UNION ALL
      
      SELECT 
        COALESCE(td.created_at, NOW()) as data_evento,
        'InitiateCheckout' as tipo_evento,
        NULL as valor,
        NULL as token,
        td.utm_source,
        td.utm_medium,
        td.utm_campaign,
        -- ✅ Conversão segura para TEXT preservando NULL
        CASE 
          WHEN td.telegram_id IS NULL THEN NULL
          ELSE td.telegram_id::text
        END as telegram_id,
        'enviado' as status_envio,
        'tracking_data' as source_table
      FROM tracking_data td
      WHERE td.created_at IS NOT NULL
      
      UNION ALL
      
      SELECT 
        COALESCE(p.created_at, NOW()) as data_evento,
        'AddToCart' as tipo_evento,
        NULL as valor,
        p.payload_id as token,
        p.utm_source,
        p.utm_medium,
        p.utm_campaign,
        NULL as telegram_id,
        'enviado' as status_envio,
        'payloads' as source_table
      FROM payloads p
      WHERE p.created_at IS NOT NULL
    `;
    
    // Envolver a query UNION em uma subquery para aplicar filtros
    query = `
      SELECT * FROM (${query}) as eventos
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Filtro por tipo de evento
    if (evento) {
      query += ` AND tipo_evento = $${paramIndex}`;
      params.push(evento);
      paramIndex++;
    }
    
    // Filtro por data inicial
    if (inicio) {
      query += ` AND data_evento >= $${paramIndex}`;
      params.push(inicio + ' 00:00:00');
      paramIndex++;
    }
    
    // Filtro por data final
    if (fim) {
      query += ` AND data_evento <= $${paramIndex}`;
      params.push(fim + ' 23:59:59');
      paramIndex++;
    }
    
    // Filtro por campanha
    if (utm_campaign) {
      query += ` AND utm_campaign = $${paramIndex}`;
      params.push(utm_campaign);
      paramIndex++;
    }
    
    // Ordenação e paginação
    query += ` ORDER BY data_evento DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
            console.log(`[${requestId}] Executando query principal com ${params.length} parâmetros`);
    const result = await pool.query(query, params);
          console.log(`[${requestId}] Query executada com sucesso - ${result.rows.length} eventos encontrados`);
    
    // Query para estatísticas gerais  
    const statsQuery = `
      WITH eventos_combinados AS (
        SELECT 
          'Purchase' as evento,
          t.valor,
          COALESCE(t.utm_source, td.utm_source, p.utm_source) as utm_source
        FROM tokens t
        -- ✅ CORREÇÃO: JOIN mais seguro
        LEFT JOIN tracking_data td ON (
          CASE 
            WHEN t.telegram_id IS NULL THEN FALSE
            WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
              SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = td.telegram_id
            ELSE FALSE
          END
        )
        LEFT JOIN payload_tracking pt ON (
          CASE 
            WHEN t.telegram_id IS NULL THEN FALSE
            WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
              SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = pt.telegram_id
            ELSE FALSE
          END
        )
        LEFT JOIN payloads p ON t.token = p.payload_id
        WHERE (t.pixel_sent = true OR t.capi_sent = true OR t.cron_sent = true)
        
        UNION ALL
        
        SELECT 
          'InitiateCheckout' as evento,
          NULL as valor,
          td.utm_source
        FROM tracking_data td
        WHERE td.created_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
          'AddToCart' as evento,
          NULL as valor,
          p.utm_source
        FROM payloads p
        WHERE p.created_at IS NOT NULL
      )
      SELECT 
        COUNT(*) as total_eventos,
        COUNT(CASE WHEN evento = 'Purchase' THEN 1 END) as total_purchases,
        COUNT(CASE WHEN evento = 'AddToCart' THEN 1 END) as total_addtocart,
        COUNT(CASE WHEN evento = 'InitiateCheckout' THEN 1 END) as total_initiatecheckout,
        COALESCE(SUM(CASE WHEN evento = 'Purchase' THEN valor ELSE 0 END), 0) as faturamento_total,
        COUNT(DISTINCT utm_source) FILTER (WHERE utm_source IS NOT NULL) as fontes_unicas
      FROM eventos_combinados
    `;
    
            console.log(`[${requestId}] Executando query de estatísticas`);
    const statsResult = await pool.query(statsQuery);
          console.log(`[${requestId}] Estatísticas calculadas com sucesso`);
    
    // Retornar dados com estrutura melhorada
    const responseData = {
      eventos: result.rows,
      estatisticas: statsResult.rows[0] || {
        total_eventos: 0,
        total_purchases: 0,
        total_addtocart: 0,
        total_initiatecheckout: 0,
        faturamento_total: 0,
        fontes_unicas: 0
      },
      metadata: {
        request_id: requestId,
        timestamp,
        total_found: result.rows.length,
        filters_applied: { evento, inicio, fim, utm_campaign },
        database_status: 'connected'
      }
    };
    
            console.log(`[${requestId}] Resposta preparada com sucesso - enviando ${result.rows.length} eventos`);
    res.status(200).json(responseData);
    
  } catch (error) {
            console.error(`[${requestId}] Erro detalhado ao buscar eventos:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      timestamp
    });
    
    // Estrutura de fallback em caso de erro
    const fallbackData = [
      {
        data_evento: new Date().toISOString(),
        tipo_evento: 'Purchase',
        valor: null,
        token: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        telegram_id: null,
        status_envio: 'indisponível'
      }
    ];
    
    const fallbackResponse = {
      eventos: fallbackData,
      estatisticas: {
        total_eventos: 0,
        total_purchases: 0,
        total_addtocart: 0,
        total_initiatecheckout: 0,
        faturamento_total: 0,
        fontes_unicas: 0
      },
      metadata: {
        request_id: requestId,
        timestamp,
        total_found: 1,
        database_status: 'error',
        error_occurred: true,
        error_message: 'Falha na conexão com banco de dados - dados simulados'
      }
    };
    
            console.warn(`[${requestId}] Retornando dados simulados devido ao erro no banco de dados`);
    
    // Retornar status 200 com dados simulados para evitar quebra no painel
    res.status(200).json(fallbackResponse);
  }
});

// Middleware para rotas não encontradas
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      erro: 'Rota de API não encontrada',
      rota_solicitada: `${req.method} ${req.path}`
    });
  }
  
  res.status(404).json({
    erro: 'Rota não encontrada',
    rota: `${req.method} ${req.path}`
  });
});

// Middleware para erros
app.use((error, req, res, next) => {
      console.error('Erro não tratado:', error.message);
  res.status(500).json({
    error: 'Erro interno do servidor',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
  });
});

// 🚀 SISTEMA DE PRÉ-AQUECIMENTO PERIÓDICO CENTRALIZADO
function iniciarPreAquecimentoPeriodico() {
  // console.log('🔥 Sistema de pré-aquecimento CENTRALIZADO iniciado (a cada 30 minutos)');
  console.log('   ⚠️  Sistema individual desabilitado para evitar conflitos');
  
  // 🚀 EXECUÇÃO INSTANTÂNEA: Começar aquecimento imediatamente (10 segundos após boot)
  setTimeout(() => {
    // console.log('🔥 INICIANDO AQUECIMENTO INSTANTÂNEO...');
    executarPreAquecimento();
  }, 10 * 1000); // 10 segundos apenas para bots estarem prontos
  
  // Cron job principal a cada 30 minutos - AQUECIMENTO
  cron.schedule('*/30 * * * *', () => {
    executarPreAquecimento();
  });
  
  // Cron job para logs de métricas a cada 30 minutos (offset de 15min)
  cron.schedule('15,45 * * * *', () => {
    logMetricasTodasInstancias();
  });
  
  // Cron job para validação de pools a cada 2 horas
  cron.schedule('0 */2 * * *', () => {
    validarPoolsTodasInstancias();
  });
}

async function executarPreAquecimento() {
  const startTime = Date.now();
  const timestamp = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  // console.log('🔥 PRÉ-AQUECIMENTO: Iniciando aquecimento periódico das mídias...');
  
  let totalAquecidas = 0;
  let totalErros = 0;
  
  try {
    // Lista de bots para aquecer (usando o Map bots)
    const botsParaAquecer = [
      { id: 'bot1', instance: bots.get('bot1'), nome: 'Bot1' },
      { id: 'bot2', instance: bots.get('bot2'), nome: 'Bot2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), nome: 'Bot Especial' },
      { id: 'bot4', instance: bots.get('bot4'), nome: 'Bot4' },
      { id: 'bot5', instance: bots.get('bot5'), nome: 'Bot5' },
      { id: 'bot6', instance: bots.get('bot6'), nome: 'Bot6' }
    ];
    
    // Aquecer cada bot individualmente com delay de 1 minuto entre eles para evitar erro 429
    for (let i = 0; i < botsParaAquecer.length; i++) {
      const botInfo = botsParaAquecer[i];
      
      if (botInfo.instance && botInfo.instance.gerenciadorMidia) {
        // console.log(`🔥 PRÉ-AQUECIMENTO: Processando ${botInfo.nome}...`);
        
        const botStartTime = Date.now();
        const resultado = await aquecerMidiasBot(botInfo.instance, botInfo.id);
        const botTempoTotal = Date.now() - botStartTime;
        
        if (resultado.aquecidas > 0) {
          console.log(`✅ ${botInfo.nome}: ${resultado.aquecidas} mídias aquecidas em ${botTempoTotal}ms`);
          totalAquecidas += resultado.aquecidas;
        }
        
        if (resultado.erros > 0) {
          console.log(`⚠️ ${botInfo.nome}: ${resultado.erros} erros durante aquecimento`);
          totalErros += resultado.erros;
        }
        
        console.log(`📋 ${botInfo.nome}: ${resultado.detalhes}`);
        
        // Configurar pré-aquecimento se não estiver configurado
        if (botInfo.instance && typeof botInfo.instance.configurarPreWarming === 'function') {
          try {
            botInfo.instance.configurarPreWarming();
          } catch (configError) {
            // console.log(`⚠️ ${botInfo.nome}: Erro na configuração PRE-WARMING:`, configError.message);
          }
        }
        
        // 🚀 DELAY ANTI-429: Aguardar 1 minuto antes do próximo bot (exceto o último)
        if (i < botsParaAquecer.length - 1) {
          const delayMinutos = 1;
          const proximoBot = botsParaAquecer[i + 1].nome;
          // console.log(`⏳ PRÉ-AQUECIMENTO: Aguardando ${delayMinutos} minuto antes de processar ${proximoBot}...`);
          await new Promise(resolve => setTimeout(resolve, delayMinutos * 60 * 1000));
        }
        
      } else {
        console.log(`⚠️ ${botInfo.nome}: não disponível para aquecimento`);
      }
    }
    
    const tempoTotal = Date.now() - startTime;
    const tempoMinutos = Math.round(tempoTotal / 1000 / 60);
    // console.log(`🔥 PRÉ-AQUECIMENTO CONCLUÍDO: ${totalAquecidas} mídias aquecidas, ${totalErros} erros em ${tempoTotal}ms (~${tempoMinutos} min)`);
    
  } catch (error) {
    console.error('❌ PRÉ-AQUECIMENTO: Erro durante execução:', error.message);
    
    // Enviar log de erro para todos os canais
    const errorMessage = `❌ **ERRO NO PRÉ-AQUECIMENTO GERAL**\n📅 ${timestamp}\n\n🚨 **Erro**: ${error.message}\n\n⚠️ Sistema tentará novamente em 30 minutos`;
    await enviarLogParaChatTeste(errorMessage, 'erro');
  }
}

async function aquecerMidiasBot(botInstance, botId) {
  let aquecidas = 0;
  let erros = 0;
  let detalhes = '';
  
  try {
    if (!botInstance.gerenciadorMidia || !botInstance.gerenciadorMidia.botInstance) {
      // console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} não está pronto para aquecimento`);
      return { aquecidas: 0, erros: 1, detalhes: 'Bot não pronto' };
    }
    
    // console.log(`🔥 PRÉ-AQUECIMENTO: Aquecendo mídias do ${botId}...`);
    
    // 🚀 DESCOBRIR DINAMICAMENTE as mídias deste bot específico
    const midiasEncontradas = descobrirMidiasDinamicamente(botInstance, botId);
    
    if (midiasEncontradas.length === 0) {
      // console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - Nenhuma mídia encontrada`);
      return { aquecidas: 0, erros: 0, detalhes: 'Nenhuma mídia encontrada' };
    }
    
    const processadas = [];
    
    // Aquecer as primeiras 5 mídias mais importantes (inicial + ds1-ds3)
    const midiasImportantes = midiasEncontradas.slice(0, 5);
    
    for (const midia of midiasImportantes) {
      try {
        const resultado = await aquecerMidiaEspecifica(botInstance.gerenciadorMidia, midia, botId);
        
        if (resultado.sucesso && !resultado.jaAquecida) {
          aquecidas++;
          processadas.push(`✅ ${botId}:${midia.key}(${midia.tipoMidia})`);
        } else if (resultado.jaAquecida) {
          processadas.push(`💾 ${botId}:${midia.key}(${midia.tipoMidia})`);
        } else {
          processadas.push(`❌ ${botId}:${midia.key}(${resultado.erro || 'erro'})`);
          erros++;
        }
        
        // 🚀 DELAY ANTI-429: Delay maior entre mídias individuais
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
        
      } catch (error) {
        // console.error(`❌ PRÉ-AQUECIMENTO: Erro real ao aquecer ${midia.key} do ${botId}:`, error.message);
        processadas.push(`❌ ${botId}:${midia.key}(ERRO:${error.message.substring(0, 20)})`);
        erros++;
      }
    }
    
    detalhes = processadas.join(', ');
    
  } catch (error) {
    // console.error(`❌ PRÉ-AQUECIMENTO: Erro geral no ${botId}:`, error.message);
    erros++;
    detalhes = `Erro geral: ${error.message}`;
  }
  
  return { aquecidas, erros, detalhes };
}

function descobrirMidiasDinamicamente(botInstance, botId) {
  // console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Iniciando scanner dinâmico de mídias...`);
  
  try {
    const baseDir = botInstance.gerenciadorMidia.baseDir;
    const config = botInstance.config || {};
    
    // Mídias prioritárias para pré-aquecimento
    const midiasImportantes = [];
    
    // Verificar mídia inicial
    if (config.midias && config.midias.inicial) {
      Object.entries(config.midias.inicial).forEach(([tipo, caminho]) => {
        if (caminho && typeof caminho === 'string') {
          const caminhoCompleto = path.resolve(baseDir, caminho);
          if (fs.existsSync(caminhoCompleto)) {
            // Normalizar tipo de mídia (video2 -> video, etc.)
            let tipoNormalizado = tipo;
            if (tipo.startsWith('video')) {
              tipoNormalizado = 'video';
            } else if (tipo === 'imagem') {
              tipoNormalizado = 'imagem';
            }
            
            midiasImportantes.push({
              key: `inicial_${tipo}`,
              tipoMidia: tipoNormalizado,
              caminho,
              caminhoCompleto,
              origem: 'config'
            });
          }
        }
      });
    }
    
    // Verificar downsells importantes (ds1, ds2, ds3)
    if (config.midias && config.midias.downsells) {
      ['ds1', 'ds2', 'ds3'].forEach(dsId => {
        const downsell = config.midias.downsells[dsId];
        if (downsell) {
          Object.entries(downsell).forEach(([tipo, caminho]) => {
            if (caminho && typeof caminho === 'string') {
              const caminhoCompleto = path.resolve(baseDir, caminho);
              if (fs.existsSync(caminhoCompleto)) {
                // Normalizar tipo de mídia (video2 -> video, etc.)
                let tipoNormalizado = tipo;
                if (tipo.startsWith('video')) {
                  tipoNormalizado = 'video';
                } else if (tipo === 'imagem') {
                  tipoNormalizado = 'imagem';
                }
                
                midiasImportantes.push({
                  key: `${dsId}_${tipo}`,
                  tipoMidia: tipoNormalizado,
                  caminho,
                  caminhoCompleto,
                  origem: 'config'
                });
              }
            }
          });
        }
      });
    }
    
    // console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Scanner encontrou ${midiasImportantes.length} mídias importantes`);
    
    return midiasImportantes;
    
  } catch (error) {
    // console.error(`❌ PRÉ-AQUECIMENTO: Erro no scanner dinâmico do ${botId}:`, error.message);
    return [];
  }
}

async function aquecerMidiaEspecifica(gerenciador, midiaInfo, botId) {
  const { key, tipoMidia, caminho, caminhoCompleto } = midiaInfo;
  
  try {
    // Verificar se já existe pool ativo e com file_ids suficientes
    const poolAtual = gerenciador.fileIdPool.get(caminho);
    if (poolAtual && poolAtual.length >= 2) {
      // console.log(`💾 PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) já aquecida (${poolAtual.length} file_ids)`);
      return { sucesso: true, jaAquecida: true };
    }
    
    // Verificar se arquivo existe fisicamente
    if (!fs.existsSync(caminhoCompleto)) {
      // console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) arquivo não encontrado: ${caminhoCompleto}`);
      return { sucesso: false, erro: 'arquivo_nao_encontrado' };
    }
    
    // Aquecer a mídia
    // console.log(`🔥 PRÉ-AQUECIMENTO: ${botId} - Aquecendo ${key}(${tipoMidia})...`);
    // console.log(`📁 PRÉ-AQUECIMENTO: ${botId} - Arquivo: ${caminhoCompleto}`);
    // console.log(`🎯 PRÉ-AQUECIMENTO: ${botId} - Chat teste: ${gerenciador.testChatId}`);
    
    try {
      await gerenciador.criarPoolFileIds(caminho, tipoMidia);
      
      const novoPool = gerenciador.fileIdPool.get(caminho);
      if (novoPool && novoPool.length > 0) {
        // console.log(`✅ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) aquecida (${novoPool.length} file_ids)`);
        return { sucesso: true, jaAquecida: false, fileIds: novoPool.length };
      } else {
        // console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) falhou ao criar pool (pool vazio após criação)`);
        // console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Debug: botInstance=${!!gerenciador.botInstance}, testChatId=${gerenciador.testChatId}`);
        return { sucesso: false, erro: 'falha_criar_pool' };
      }
    } catch (criarPoolError) {
      // console.error(`❌ PRÉ-AQUECIMENTO: ${botId} - Erro específico ao criar pool para ${key}:`, criarPoolError.message);
      return { sucesso: false, erro: `pool_error: ${criarPoolError.message}` };
    }
    
  } catch (uploadError) {
    // console.error(`❌ PRÉ-AQUECIMENTO: ${botId} - Erro ao aquecer ${key}(${tipoMidia}):`, uploadError.message);
    return { sucesso: false, erro: uploadError.message };
  }
}

async function enviarLogParaChatTeste(message, tipo = 'info') {
  try {
    const botsParaLog = [
      { id: 'bot1', instance: bots.get('bot1'), chatVar: 'TEST_CHAT_ID_BOT1' },
      { id: 'bot2', instance: bots.get('bot2'), chatVar: 'TEST_CHAT_ID_BOT2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), chatVar: 'TEST_CHAT_ID_BOT_ESPECIAL' },
      { id: 'bot4', instance: bots.get('bot4'), chatVar: 'TEST_CHAT_ID_BOT4' },
      { id: 'bot5', instance: bots.get('bot5'), chatVar: 'TEST_CHAT_ID_BOT5' },
      { id: 'bot6', instance: bots.get('bot6'), chatVar: 'TEST_CHAT_ID_BOT6' }
    ];
    
    for (const botInfo of botsParaLog) {
      if (botInfo.instance && botInfo.instance.bot) {
        const testChatId = process.env[botInfo.chatVar] || process.env.TEST_CHAT_ID;
        if (testChatId) {
          try {
            await botInfo.instance.bot.sendMessage(testChatId, message, { parse_mode: 'Markdown' });
          } catch (sendError) {
            console.log(`⚠️ Erro ao enviar log para ${botInfo.id}:`, sendError.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro geral ao enviar logs:', error.message);
  }
}

async function logMetricasTodasInstancias() {
  console.log('📊 MÉTRICAS CENTRALIZADAS: Coletando dados de performance...');
  
  const timestamp = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  try {
    const botsParaMetricas = [
      { id: 'bot1', instance: bots.get('bot1'), nome: 'Bot1' },
      { id: 'bot2', instance: bots.get('bot2'), nome: 'Bot2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), nome: 'Bot Especial' },
      { id: 'bot4', instance: bots.get('bot4'), nome: 'Bot4' },
      { id: 'bot5', instance: bots.get('bot5'), nome: 'Bot5' },
      { id: 'bot6', instance: bots.get('bot6'), nome: 'Bot6' }
    ];
    
    let metricas = `📊 **MÉTRICAS DE PERFORMANCE**\n📅 ${timestamp}\n\n`;
    
    for (const botInfo of botsParaMetricas) {
      if (botInfo.instance && botInfo.instance.gerenciadorMidia) {
        try {
          const relatorio = botInfo.instance.gerenciadorMidia.obterRelatorioPerformance();
          metricas += `🤖 **${botInfo.nome}**\n`;
          metricas += `├ Pool ativo: ${relatorio.preWarmingAtivo ? '✅' : '❌'}\n`;
          metricas += `├ Pools: ${relatorio.poolsAtivos}\n`;
          metricas += `├ Cache: ${relatorio.taxaCache}\n`;
          metricas += `├ Tempo médio: ${relatorio.tempoMedioMs}ms\n`;
          metricas += `└ Eficiência: ${relatorio.eficiencia}\n\n`;
        } catch (error) {
          metricas += `🤖 **${botInfo.nome}**: ❌ Erro ao coletar métricas\n\n`;
        }
      } else {
        metricas += `🤖 **${botInfo.nome}**: ⚠️ Não disponível\n\n`;
      }
    }
    
    await enviarLogParaChatTeste(metricas, 'metricas');
    
  } catch (error) {
    console.error('❌ Erro ao coletar métricas:', error.message);
  }
}

async function validarPoolsTodasInstancias() {
  console.log('🔍 VALIDAÇÃO CENTRALIZADA: Verificando pools de file_ids...');
  
  try {
    const botsParaValidacao = [
      { id: 'bot1', instance: bots.get('bot1'), nome: 'Bot1' },
      { id: 'bot2', instance: bots.get('bot2'), nome: 'Bot2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), nome: 'Bot Especial' },
      { id: 'bot4', instance: bots.get('bot4'), nome: 'Bot4' },
      { id: 'bot5', instance: bots.get('bot5'), nome: 'Bot5' },
      { id: 'bot6', instance: bots.get('bot6'), nome: 'Bot6' }
    ];
    
    for (const botInfo of botsParaValidacao) {
      if (botInfo.instance && botInfo.instance.gerenciadorMidia && typeof botInfo.instance.gerenciadorMidia.validarELimparFileIds === 'function') {
        try {
          console.log(`🔍 Validando pools do ${botInfo.nome}...`);
          await botInfo.instance.gerenciadorMidia.validarELimparFileIds();
        } catch (error) {
          console.error(`❌ Erro na validação do ${botInfo.nome}:`, error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral na validação de pools:', error.message);
  }
}

  // Inicializar módulos
  async function inicializarModulos() {
        console.log('Inicializando módulos...');
    
    // Carregar bot
    carregarBot();
    
    // Carregar postgres
    const postgresCarregado = carregarPostgres();
    
    // Inicializar banco
    if (postgresCarregado) {
      await inicializarBanco();
    }
    
    // Carregar sistema de tokens
    await carregarSistemaTokens();

    // Iniciar loop de downsells
    iniciarDownsellLoop();
    iniciarCronFallback();
    iniciarLimpezaTokens();
    iniciarLimpezaPayloadTracking();
    
    // 🚀 Iniciar sistema de pré-aquecimento periódico
    iniciarPreAquecimentoPeriodico();
    
    // Enviar log inicial para o chat de teste
    setTimeout(async () => {
      const timestamp = new Date().toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      const logInicial = `🚀 **SISTEMA INICIADO**\n📅 ${timestamp}\n\n✅ Sistema de pré-aquecimento ativo\n🔄 Aquecimento: a cada 30 minutos\n📊 Métricas: a cada 30 minutos\n🔍 Validação: a cada 2 horas\n\n⚡ Primeiro aquecimento em 10 SEGUNDOS`;
      
      // Enviar log inicial para todos os canais
      await enviarLogParaChatTeste(logInicial, 'sucesso');
    }, 5000); // Aguardar 5 segundos para bots estarem prontos
    
        console.log('Status final dos módulos:');
        console.log(`Bot: ${bot ? 'OK' : 'ERRO'}`);
          console.log(`Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
        console.log(`Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
  }



// Endpoint para dados dos gráficos do dashboard
app.get('/api/dashboard-data', async (req, res) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(8).toString('hex');
  
  console.log(`📊 [${requestId}] Dashboard data request received - ${timestamp}:`, {
    query: req.query,
    headers: req.headers.authorization ? 'Bearer token present' : 'No authorization header'
  });

  try {
    // 1. VERIFICAÇÃO DO TOKEN DE ACESSO
    const authToken = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    const PANEL_ACCESS_TOKEN = process.env.PANEL_ACCESS_TOKEN || 'admin123';
    
    console.log(`🔐 [${requestId}] Verificação de autenticação:`, {
      tokenReceived: authToken ? `${authToken.substring(0, 3)}***` : 'NENHUM',
      tokenExpected: `${PANEL_ACCESS_TOKEN.substring(0, 3)}***`,
      tokenMatch: authToken === PANEL_ACCESS_TOKEN,
      envVarExists: !!process.env.PANEL_ACCESS_TOKEN
    });

    if (!authToken || authToken !== PANEL_ACCESS_TOKEN) {
      console.warn(`🚫 [${requestId}] Token de acesso inválido`);
      return res.status(401).json({ 
        error: 'Token de acesso inválido',
        message: 'Acesso negado ao painel'
      });
    }

    // 2. VERIFICAÇÃO DA CONEXÃO COM O BANCO
    if (!pool) {
      console.error(`❌ [${requestId}] Pool de conexão não disponível - tentando reconectar...`);
      
      // Tentar reconectar ao banco
      try {
        if (postgres) {
          pool = await postgres.initializeDatabase();
          if (pool) {
            funnelMetrics.initialize(pool);
          }
          console.log(`🔄 [${requestId}] Reconnection attempt successful`);
        }
      } catch (reconnectError) {
        console.error(`❌ [${requestId}] Falha na reconexão:`, {
          message: reconnectError.message,
          stack: reconnectError.stack
        });
      }
      
      if (!pool) {
        console.error(`❌ [${requestId}] Pool de conexão ainda não disponível - retornando fallback`);
        const executionTime = Date.now() - startTime;
        
        const fallbackResponse = {
          faturamentoDiario: [{ 
            data: new Date().toISOString().split('T')[0], 
            faturamento: 0, 
            vendas: 0, 
            addtocart: 0, 
            initiatecheckout: 0 
          }],
          utmSource: [{ 
            utm_source: 'Direto', 
            vendas: 0, 
            addtocart: 0, 
            initiatecheckout: 0, 
            total_eventos: 0 
          }],
          campanhas: [{ 
            campanha: 'Sem Campanha', 
            vendas: 0, 
            addtocart: 0, 
            initiatecheckout: 0, 
            faturamento: 0, 
            total_eventos: 0 
          }],
          metadata: {
            request_id: requestId,
            executionTime,
            timestamp,
            database_status: 'disconnected',
            errorOccurred: true,
            error_message: 'Pool de conexão não disponível'
          }
        };
        
        console.warn(`[${requestId}] Retornando dados simulados devido à falta de conexão com banco`);
        return res.status(200).json(fallbackResponse);
      }
    }

    // 3. TESTE DE CONEXÃO BÁSICO
    try {
      await pool.query('SELECT 1 as test');
      console.log(`✅ [${requestId}] Conexão com banco confirmada`);
    } catch (connectionError) {
      console.error(`❌ [${requestId}] Erro de conexão com banco:`, {
        message: connectionError.message,
        code: connectionError.code,
        detail: connectionError.detail,
        stack: connectionError.stack
      });
      
      const executionTime = Date.now() - startTime;
      const fallbackResponse = {
        faturamentoDiario: [{ 
          data: new Date().toISOString().split('T')[0], 
          faturamento: 0, 
          vendas: 0, 
          addtocart: 0, 
          initiatecheckout: 0 
        }],
        utmSource: [{ 
          utm_source: 'Direto', 
          vendas: 0, 
          addtocart: 0, 
          initiatecheckout: 0, 
          total_eventos: 0 
        }],
        campanhas: [{ 
          campanha: 'Sem Campanha', 
          vendas: 0, 
          addtocart: 0, 
          initiatecheckout: 0, 
          faturamento: 0, 
          total_eventos: 0 
        }],
        metadata: {
          request_id: requestId,
          executionTime,
          timestamp,
          database_status: 'connection_error',
          errorOccurred: true,
          error_message: 'Falha no teste de conexão com banco de dados'
        }
      };
      
      console.warn(`⚠️ [${requestId}] Retornando dados simulados devido ao erro de conexão`);
      return res.status(200).json(fallbackResponse);
    }

    // 4. PROCESSAMENTO DOS PARÂMETROS DE DATA
    const { inicio, fim } = req.query;
    let dateFilter = '';
    const params = [];
    
    console.log(`📅 [${requestId}] Parâmetros de data recebidos:`, { inicio, fim });
    
    if (inicio && fim) {
      // Validar formato de data
      const inicioDate = new Date(inicio);
      const fimDate = new Date(fim);
      
      if (isNaN(inicioDate.getTime()) || isNaN(fimDate.getTime())) {
        console.warn(`⚠️ [${requestId}] Datas inválidas fornecidas, usando últimos 30 dias`);
        dateFilter = 'AND t.criado_em >= NOW() - INTERVAL \'30 days\'';
      } else {
        dateFilter = 'AND t.criado_em BETWEEN $1 AND $2';
        params.push(inicio + ' 00:00:00', fim + ' 23:59:59');
        console.log(`📅 [${requestId}] Filtro de data aplicado:`, { inicio: params[0], fim: params[1] });
      }
    } else {
      // Últimos 30 dias por padrão
      dateFilter = 'AND t.criado_em >= NOW() - INTERVAL \'30 days\'';
      console.log(`📅 [${requestId}] Usando filtro padrão: últimos 30 dias`);
    }
    
    // 5. QUERIES SIMPLIFICADAS PARA MELHOR PERFORMANCE
    console.log(`🔍 [${requestId}] Iniciando execução das queries...`);
    
    // Query simplificada para faturamento diário
    const faturamentoDiarioQuery = `
      SELECT 
        DATE(criado_em) as data,
        COUNT(*) as vendas,
        SUM(CASE WHEN valor IS NOT NULL THEN valor::numeric ELSE 0 END) as faturamento
      FROM tokens 
      WHERE (pixel_sent = true OR capi_sent = true OR cron_sent = true)
        AND criado_em IS NOT NULL
        ${dateFilter}
      GROUP BY DATE(criado_em)
      ORDER BY data ASC
    `;
    
    // Query simplificada para UTM sources
    const utmSourceQuery = `
      SELECT 
        COALESCE(utm_source, 'Direto') as utm_source,
        COUNT(*) as total_eventos
      FROM tokens 
      WHERE (pixel_sent = true OR capi_sent = true OR cron_sent = true)
        AND criado_em IS NOT NULL
        ${dateFilter}
      GROUP BY utm_source
      ORDER BY total_eventos DESC
      LIMIT 10
    `;
    
    // Query simplificada para campanhas
    const campanhasQuery = `
      SELECT 
        COALESCE(utm_campaign, 'Sem Campanha') as campanha,
        COUNT(*) as total_eventos,
        SUM(CASE WHEN valor IS NOT NULL THEN valor::numeric ELSE 0 END) as faturamento
      FROM tokens 
      WHERE (pixel_sent = true OR capi_sent = true OR cron_sent = true)
        AND criado_em IS NOT NULL
        ${dateFilter}
      GROUP BY utm_campaign
      ORDER BY total_eventos DESC
      LIMIT 10
    `;
    
    // 6. EXECUÇÃO DAS QUERIES COM TRATAMENTO INDIVIDUAL DE ERROS
    let faturamentoDiario, utmSource, campanhas;
    
    try {
      console.log(`📊 [${requestId}] Executando query de faturamento diário...`);
      faturamentoDiario = await pool.query(faturamentoDiarioQuery, params);
      console.log(`✅ [${requestId}] Faturamento diário: ${faturamentoDiario.rows.length} registros`);
    } catch (error) {
      console.error(`❌ [${requestId}] Erro na query de faturamento diário:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: faturamentoDiarioQuery.substring(0, 200) + '...'
      });
      faturamentoDiario = { rows: [] };
    }
    
    try {
      console.log(`📊 [${requestId}] Executando query de UTM sources...`);
      utmSource = await pool.query(utmSourceQuery, params);
      console.log(`✅ [${requestId}] UTM Sources: ${utmSource.rows.length} registros`);
    } catch (error) {
      console.error(`❌ [${requestId}] Erro na query de UTM sources:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: utmSourceQuery.substring(0, 200) + '...'
      });
      utmSource = { rows: [] };
    }
    
    try {
      console.log(`📊 [${requestId}] Executando query de campanhas...`);
      campanhas = await pool.query(campanhasQuery, params);
      console.log(`✅ [${requestId}] Campanhas: ${campanhas.rows.length} registros`);
    } catch (error) {
      console.error(`❌ [${requestId}] Erro na query de campanhas:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: campanhasQuery.substring(0, 200) + '...'
      });
      campanhas = { rows: [] };
    }

    // 7. MONTAGEM DA RESPOSTA COM DADOS DE FALLBACK
    const today = new Date().toISOString().split('T')[0];
    
    const response = {
      faturamentoDiario: faturamentoDiario.rows.length > 0 ? faturamentoDiario.rows.map(row => ({
        data: row.data,
        faturamento: parseFloat(row.faturamento) || 0,
        vendas: parseInt(row.vendas) || 0,
        addtocart: 0, // Simplificado por enquanto
        initiatecheckout: 0 // Simplificado por enquanto
      })) : [
        {
          data: today,
          faturamento: 0,
          vendas: 0,
          addtocart: 0,
          initiatecheckout: 0
        }
      ],
      utmSource: utmSource.rows.length > 0 ? utmSource.rows.map(row => ({
        utm_source: row.utm_source || 'Direto',
        vendas: parseInt(row.total_eventos) || 0,
        addtocart: 0, // Simplificado por enquanto
        initiatecheckout: 0, // Simplificado por enquanto
        total_eventos: parseInt(row.total_eventos) || 0
      })) : [
        {
          utm_source: 'Direto',
          vendas: 0,
          addtocart: 0,
          initiatecheckout: 0,
          total_eventos: 0
        }
      ],
      campanhas: campanhas.rows.length > 0 ? campanhas.rows.map(row => ({
        campanha: row.campanha || 'Sem Campanha',
        vendas: parseInt(row.total_eventos) || 0,
        addtocart: 0, // Simplificado por enquanto
        initiatecheckout: 0, // Simplificado por enquanto
        faturamento: parseFloat(row.faturamento) || 0,
        total_eventos: parseInt(row.total_eventos) || 0
      })) : [
        {
          campanha: 'Sem Campanha',
          vendas: 0,
          addtocart: 0,
          initiatecheckout: 0,
          faturamento: 0,
          total_eventos: 0
        }
      ],
      metadata: {
        request_id: requestId,
        executionTime: Date.now() - startTime,
        timestamp,
        database_status: 'connected',
        dataRange: params.length > 0 ? { inicio: params[0], fim: params[1] } : 'últimos 30 dias',
        recordCounts: {
          faturamentoDiario: faturamentoDiario.rows.length,
          utmSource: utmSource.rows.length,
          campanhas: campanhas.rows.length
        }
      }
    };

    console.log(`✅ [${requestId}] Dashboard data response ready:`, {
      executionTime: `${Date.now() - startTime}ms`,
      faturamentoDiario: response.faturamentoDiario.length,
      utmSource: response.utmSource.length,
      campanhas: response.campanhas.length
    });
    
    res.json(response);

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] ERRO CRÍTICO no endpoint dashboard-data:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      executionTime: `${executionTime}ms`,
      query: req.query,
      timestamp
    });
    
    // Retornar dados de fallback com status 200 para evitar erro no frontend
    const fallbackResponse = {
      faturamentoDiario: [{ 
        data: new Date().toISOString().split('T')[0], 
        faturamento: 0, 
        vendas: 0, 
        addtocart: 0, 
        initiatecheckout: 0 
      }],
      utmSource: [{ 
        utm_source: 'Direto', 
        vendas: 0, 
        addtocart: 0, 
        initiatecheckout: 0, 
        total_eventos: 0 
      }],
      campanhas: [{ 
        campanha: 'Sem Campanha', 
        vendas: 0, 
        addtocart: 0, 
        initiatecheckout: 0, 
        faturamento: 0, 
        total_eventos: 0 
      }],
      metadata: {
        request_id: requestId,
        executionTime,
        timestamp,
        database_status: 'critical_error',
        errorOccurred: true,
        error_message: 'Erro crítico no processamento - dados simulados'
      }
    };
    
    console.warn(`⚠️ [${requestId}] Retornando dados simulados devido ao erro crítico`);
    res.status(200).json(fallbackResponse);
  }
});

const server = app.listen(PORT, '0.0.0.0', async () => {
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`URL: ${BASE_URL}`);
      console.log(`Webhook bot1: ${BASE_URL}/bot1/webhook`);
      console.log(`Webhook bot2: ${BASE_URL}/bot2/webhook`);
      console.log(`Webhook bot especial: ${BASE_URL}/bot_especial/webhook`);
      
      // Inicializa colunas necessárias para zap_controle
      console.log('Inicializando colunas zap_controle...');
      initializeZapControleColumns();
      console.log(`Webhook bot4: ${BASE_URL}/bot4/webhook`);
      console.log(`Webhook bot5: ${BASE_URL}/bot5/webhook`);
      console.log(`Webhook bot6: ${BASE_URL}/bot6/webhook`);
      console.log(`Webhook bot7: ${BASE_URL}/bot7/webhook`);
  
     // Inicializar módulos automaticamente
   console.log('🚀 Iniciando sistema com pré-aquecimento automático...');
   await inicializarModulos();
  
      console.log('Servidor pronto!');
  console.log('Valor do plano 1 semana atualizado para R$ 9,90 com sucesso.');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM recebido - ignorando encerramento automático');
});

process.on('SIGINT', async () => {
  console.log('📴 Recebido SIGINT, encerrando servidor...');

  if (pool && postgres) {
    await pool.end().catch(console.error);
  }

  server.close(() => {
    console.log('Servidor fechado');
  });
});

    console.log('Servidor configurado e pronto');

// 🔥 NOVA FUNÇÃO: Processar UTMs no formato nome|id
function processUTM(utmValue) {
  if (!utmValue) return { name: null, id: null };
  
  try {
    const decoded = decodeURIComponent(utmValue);
    const parts = decoded.split('|');
    
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const id = parts[1].trim();
      
      // Validar se o ID é numérico
      if (name && id && /^\d+$/.test(id)) {
        console.log(`✅ UTM processado: "${utmValue}" → nome: "${name}", id: "${id}"`);
        return { name, id };
      }
    }
    
    // Se não tem formato nome|id, retorna apenas o nome
    console.log(`ℹ️ UTM sem formato nome|id: "${utmValue}"`);
    return { name: decoded, id: null };
    
  } catch (error) {
    console.error(`❌ Erro ao processar UTM "${utmValue}":`, error.message);
    return { name: utmValue, id: null };
  }
}

// Timer sessions storage (in-memory for simplicity, could be moved to database)
const timerSessions = new Map();

// API para criar nova sessão de timer para um token
app.post('/api/criar-sessao-timer', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token não informado' });
    }

    // Verificar se o token é válido
    const resultado = await pool.query(
      'SELECT bot_id FROM tokens WHERE token = $1 AND status != $2',
      [token, 'expirado']
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const row = resultado.rows[0];
    
    // Apenas para bot especial
    if (row.bot_id !== 'bot_especial') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Gerar ID único para esta sessão
    const sessionId = `${token}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar nova sessão de timer (10 minutos = 600 segundos)
    const startTime = Date.now();
    const endTime = startTime + (10 * 60 * 1000); // 10 minutos
    
    timerSessions.set(sessionId, {
      token: token,
      startTime: startTime,
      endTime: endTime,
      duration: 10 * 60, // 10 minutos em segundos
      active: true
    });

    res.json({
      success: true,
      sessionId: sessionId,
      startTime: startTime,
      endTime: endTime,
      duration: 10 * 60
    });

  } catch (error) {
    console.error('Erro ao criar sessão de timer:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// API para obter status de uma sessão de timer
app.get('/api/status-sessao-timer/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'ID da sessão não informado' });
    }

    const session = timerSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    }

    const currentTime = Date.now();
    const timeRemaining = Math.max(0, Math.floor((session.endTime - currentTime) / 1000));
    const expired = timeRemaining === 0;

    res.json({
      success: true,
      sessionId: sessionId,
      token: session.token,
      timeRemaining: timeRemaining,
      expired: expired,
      active: session.active && !expired
    });

  } catch (error) {
    console.error('Erro ao obter status da sessão:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// API para finalizar uma sessão de timer
app.post('/api/finalizar-sessao-timer', (req, res) => {
  try {
    // Suportar tanto JSON quanto FormData (para sendBeacon)
    const sessionId = req.body.sessionId || (req.body instanceof Object ? Object.keys(req.body)[0] : null);
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'ID da sessão não informado' });
    }

    const session = timerSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    }

    // Marcar sessão como inativa
    session.active = false;
    timerSessions.set(sessionId, session);

    res.json({
      success: true,
      message: 'Sessão finalizada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao finalizar sessão:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Limpeza automática de sessões expiradas (executa a cada 5 minutos)
setInterval(() => {
  const currentTime = Date.now();
  for (const [sessionId, session] of timerSessions.entries()) {
    if (currentTime > session.endTime + (5 * 60 * 1000)) { // Remove sessões que expiraram há mais de 5 minutos
      timerSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);
