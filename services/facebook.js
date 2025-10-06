const crypto = require('crypto');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { uniqueEventId } = require('../helpers/eventId');
const { getInstance: getSessionTracking } = require('./sessionTracking');
const { validatePurchaseValue } = require('./purchaseValidation');
const {
  buildUserData: buildCapiUserData,
  buildCustomData: buildCapiCustomData,
  buildCapiPayload,
  sendToMetaCapi
} = require('../capi/metaCapi');
const { validatePurchaseInput } = require('../validators/purchase');
const funnelMetrics = require('./funnelMetrics');
const { getWhatsAppTrackingEnv } = require('../config/env');
const {
  initialize: initPurchaseDedup,
  generateRobustEventId, // 🔥 NOVA FUNÇÃO IMPORTADA
  isPurchaseAlreadySent,
  isEventAlreadySent, // 🔥 NOVA FUNÇÃO IMPORTADA
  isTransactionAlreadySent,
  markPurchaseAsSent,
  markEventAsSent // 🔥 NOVA FUNÇÃO IMPORTADA
} = require('./purchaseDedup');
const {
  isGenericPixelValue,
  validateFbpFormat,
  validateFbcFormat
} = require('./trackingValidation');

const PIXEL_ID = process.env.FB_PIXEL_ID;
const ACCESS_TOKEN = process.env.FB_PIXEL_TOKEN;
const { code: TEST_EVENT_CODE_ENV, source: TEST_EVENT_CODE_SOURCE } = (() => {
  const candidates = [
    { value: process.env.TEST_EVENT_CODE, source: 'env:test_event_code' },
    { value: process.env.FB_TEST_EVENT_CODE, source: 'env:fb_test_event_code' }
  ];

  for (const candidate of candidates) {
    if (typeof candidate.value !== 'string') {
      continue;
    }

    const trimmed = candidate.value.trim();
    if (trimmed) {
      return { code: trimmed, source: candidate.source };
    }
  }

  return { code: null, source: null };
})();

const whatsappTrackingEnv = getWhatsAppTrackingEnv();

// Router para expor configurações do Facebook Pixel
const router = express.Router();
router.get('/api/config', (req, res) => {
  const pixelToken = whatsappTrackingEnv.pixelToken || '';
  const whatsappConfig = {
    pixelId: whatsappTrackingEnv.pixelId || '',
    pixelToken,
    accessToken: pixelToken,
    baseUrl: whatsappTrackingEnv.baseUrl || ''
  };

  res.json({
    FB_PIXEL_ID: process.env.FB_PIXEL_ID || '',
    FORCE_FB_TEST_MODE: process.env.FORCE_FB_TEST_MODE === 'true' || false,
    // 🔥 CORREÇÃO: Expor variáveis específicas do WhatsApp
    WHATSAPP_FB_PIXEL_ID: process.env.WHATSAPP_FB_PIXEL_ID || '',
    WHATSAPP_FB_PIXEL_TOKEN: process.env.WHATSAPP_FB_PIXEL_TOKEN || '',
    whatsapp: whatsappConfig
  });
  console.debug('[FB CONFIG] Endpoint /api/config carregado');
});

const dedupCache = new Map();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_EVENT_SOURCE_URL = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/obrigado.html`;

function maskIdentifier(value) {
  if (!value && value !== 0) {
    return null;
  }

  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 10);
}

function sanitizeLogContext(context = {}) {
  const sanitized = {};
  Object.entries(context).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (value === undefined) {
      return;
    }
    if (lowerKey.includes('token') || lowerKey.includes('id')) {
      sanitized[key] = value ? maskIdentifier(value) : null;
      return;
    }
    if (lowerKey.includes('ip')) {
      sanitized[key] = Boolean(value);
      return;
    }
    if (lowerKey.includes('user_agent')) {
      sanitized[key] = Boolean(value);
      return;
    }
    if (lowerKey.includes('utm')) {
      sanitized[key] = Boolean(value);
      return;
    }
    sanitized[key] = value;
  });
  return sanitized;
}

function logWithContext(level, message, context = {}) {
  if (typeof console[level] !== 'function') {
    level = 'log';
  }
  console[level](message, sanitizeLogContext(context));
}

function hasValidPixelValue(value, validator) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  if (isGenericPixelValue(value)) {
    return false;
  }

  return validator(value);
}

// 🔥 NOVA FUNÇÃO: Sincronização de timestamp para deduplicação perfeita
function generateSyncedTimestamp(clientTimestamp = null, fallbackTimestamp = null) {
  const hasClientTimestamp = typeof clientTimestamp === 'number' && !Number.isNaN(clientTimestamp);

  // Se um timestamp do cliente foi fornecido (do navegador), usar ele
  if (hasClientTimestamp) {
    // Validar se o timestamp é razoável (não muito antigo nem futuro)
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - clientTimestamp);

    // Se a diferença for menor que 5 minutos, usar o timestamp do cliente
    if (diff < 300) { // 5 minutos = 300 segundos
      console.log(`🕐 Usando timestamp sincronizado do cliente: ${clientTimestamp} (diff: ${diff}s)`);
      return clientTimestamp;
    }

    console.warn(`⚠️ Timestamp do cliente muito divergente (${diff}s), usando fallback disponível`);
  }

  if (typeof fallbackTimestamp === 'number' && !Number.isNaN(fallbackTimestamp)) {
    return fallbackTimestamp;
  }

  return null;
}

// 🔥 NOVA FUNÇÃO: Gerar chave de deduplicação mais robusta
function getEnhancedDedupKey({event_name, event_time, event_id, fbp, fbc, client_timestamp = null, value = null}) {
  // Para eventos Purchase, usar uma janela de tempo mais ampla para deduplicação
  let normalizedTime = event_time;
  
  if (event_name === 'Purchase') {
    // Normalizar timestamp para janelas de 30 segundos para Purchase
    // Isso permite deduplicação mesmo com pequenas diferenças de timing
    normalizedTime = Math.floor(event_time / 30) * 30;
    console.log(`🔄 Timestamp normalizado para deduplicação: ${event_time} → ${normalizedTime}`);
  }
  
  // 🔥 CORREÇÃO CRÍTICA: Incluir valor na chave de deduplicação para eventos Purchase
  // Isso evita que eventos com o mesmo eventID mas valores diferentes sejam tratados como duplicatas
  if (event_name === 'Purchase' && value !== null && value !== undefined) {
    // Normalizar valor para evitar problemas de precisão decimal
    const normalizedValue = Math.round(Number(value) * 100) / 100;
    return [event_name, event_id || '', normalizedTime, normalizedValue, fbp || '', fbc || ''].join('|');
  }
  
  return [event_name, event_id || '', normalizedTime, fbp || '', fbc || ''].join('|');
}

function getDedupKey({event_name, event_time, event_id, fbp, fbc}) {
  return [event_name, event_id || '', event_time, fbp || '', fbc || ''].join('|');
}

function generateEventId(eventName, userId = '', timestamp = Date.now()) {
  if (eventName === 'Purchase' && userId) return userId;
  const input = `${eventName}_${userId}_${timestamp}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 16);
}

function isDuplicate(key) {
  const now = Date.now();
  const ts = dedupCache.get(key);
  if (ts && now - ts < DEDUP_TTL_MS) {
    return true;
  }
  dedupCache.set(key, now);
  // cleanup
  for (const [k, t] of dedupCache) {
    if (now - t > DEDUP_TTL_MS) dedupCache.delete(k);
  }
  return false;
}

function generateHashedUserData(payer_name, payer_national_registration) {
  if (!payer_name || !payer_national_registration) {
    return null;
  }

  try {
    // Limpar e processar nome
    const nomeNormalizado = payer_name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .trim()
      .replace(/\s+/g, ' '); // Remove espaços extras

    const partesNome = nomeNormalizado.split(' ');
    const primeiroNome = partesNome[0] || '';
    const restanteNome = partesNome.slice(1).join(' ') || '';

    // Limpar CPF (manter apenas números)
    const cpfLimpo = payer_national_registration.replace(/\D/g, '');

    // Gerar hashes SHA-256
    const fnHash = crypto.createHash('sha256').update(primeiroNome.toLowerCase()).digest('hex');
    const lnHash = crypto.createHash('sha256').update(restanteNome.toLowerCase()).digest('hex');
    const externalIdHash = crypto.createHash('sha256').update(cpfLimpo).digest('hex');

    return {
      fn: fnHash,
      ln: lnHash,
      external_id: externalIdHash,
      fn_hash: fnHash,
      ln_hash: lnHash,
      external_id_hash: externalIdHash
    };
  } catch (error) {
    console.error('Erro ao gerar hashes de dados pessoais:', error);
    return null;
  }
}

function generateExternalId(telegram_id, fbp, ip) {
  const base = `${telegram_id || ''}|${fbp || ''}|${ip || ''}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

function sanitizeUtmValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.length > 256 ? normalized.slice(0, 256) : normalized;
}

async function sendFacebookEvent(eventName, payload) {
  // Extrair dados do payload mantendo compatibilidade
  const event = typeof eventName === 'object' ? eventName : { event_name: eventName, ...payload };

  const {
    event_name,
    event_time = Math.floor(Date.now() / 1000),
    event_id,
    event_source_url,
    value,
    currency = 'BRL',
    fbp,
    fbc,
    client_ip_address,
    client_ip,
    client_user_agent,
    ip,
    userAgent,
    custom_data = {},
    user_data = {}, // 🔥 NOVO: user_data já pronto do endpoint /api/whatsapp/verificar-token

    user_data_hash = null, // Novos dados pessoais hasheados
    source = 'unknown', // Origem do evento: 'pixel', 'capi', 'cron'
    token = null, // Token para atualizar flags no banco
    pool = null, // Pool de conexão do banco
    telegram_id = null, // 🔥 NOVO: ID do Telegram para buscar cookies automaticamente
    client_timestamp = null, // 🔥 NOVO: Timestamp do cliente para sincronização
    requestId: incomingRequestId = null,
    test_event_code: incomingTestEventCode = null,
    transaction_id = null
  } = event;

  const requestId = event.requestId || incomingRequestId || payload?.requestId || null;

  const overrideTestEventCode =
    typeof incomingTestEventCode === 'string' ? incomingTestEventCode.trim() || null : null;
  const resolvedTestEventCode = overrideTestEventCode || TEST_EVENT_CODE_ENV || null;
  if (resolvedTestEventCode) {
    console.info('[CAPI] test_event_code aplicado', {
      source: overrideTestEventCode ? 'override' : TEST_EVENT_CODE_SOURCE || 'env'
    });
  }

  const transactionIdForDedupe = transaction_id
    ? String(transaction_id).trim().toLowerCase()
    : null;

  const isWhatsAppCapiEvent = source === 'capi' && event.origin === 'whatsapp';
  const pixelId = isWhatsAppCapiEvent
    ? process.env.WHATSAPP_FB_PIXEL_ID
    : PIXEL_ID;
  const accessToken = isWhatsAppCapiEvent
    ? process.env.WHATSAPP_FB_PIXEL_TOKEN
    : ACCESS_TOKEN;

  if (!accessToken) {
    const tokenEnvName = isWhatsAppCapiEvent ? 'WHATSAPP_FB_PIXEL_TOKEN' : 'FB_PIXEL_TOKEN';
    console.warn(`${tokenEnvName} não definido. Evento não será enviado.`);
    return { success: false, error: `${tokenEnvName} not set` };
  }

  if (!pixelId) {
    const pixelEnvName = isWhatsAppCapiEvent ? 'WHATSAPP_FB_PIXEL_ID' : 'FB_PIXEL_ID';
    console.warn(`${pixelEnvName} não definido. Evento não será enviado.`);
    return { success: false, error: `${pixelEnvName} not set` };
  }

  const disableDedupe = event_name === 'Lead';

  // 🔥 NOVO SISTEMA DE DEDUPLICAÇÃO ROBUSTO
  let finalEventId = event_id || null;
  if (disableDedupe) {
    if (!finalEventId) {
      finalEventId = uuidv4();
      logWithContext('warn', '[Meta CAPI] event_id ausente para Lead; gerando UUID interno', {
        request_id: requestId
      });
    }
  } else if (!finalEventId) {
    if (event_name === 'Purchase') {
      finalEventId = uuidv4();
      console.log(`🔥 Purchase event_id gerado (UUID): ${finalEventId}`);
    } else if (event_name === 'InitiateCheckout' && token) {
      // 🔥 NOVO: Para AddToCart e InitiateCheckout, usar sistema robusto com janela de tempo
      finalEventId = generateRobustEventId(token, event_name, 5); // janela de 5 minutos
      console.log(`🔥 ${event_name} event_id gerado via sistema robusto: ${finalEventId}`);
    } else {
      finalEventId = generateEventId(event_name, telegram_id || token || '', event_time);
      console.log(`⚠️ event_id não fornecido. Gerado automaticamente: ${finalEventId}`);
    }
  }

  // 🔥 NOVO: Buscar cookies do SessionTracking se telegram_id fornecido e fbp/fbc não estão definidos
  let finalFbp = fbp;
  let finalFbc = fbc;
  let finalIpAddress = client_ip_address || client_ip || ip;
  let finalUserAgent = client_user_agent || userAgent;

  let hasValidFbp = hasValidPixelValue(finalFbp, validateFbpFormat);
  let hasValidFbc = hasValidPixelValue(finalFbc, validateFbcFormat);

  if (telegram_id && (!hasValidFbp || !hasValidFbc)) {
    try {
      const sessionTracking = getSessionTracking();
      const sessionData = sessionTracking.getTrackingData(telegram_id);

      if (sessionData) {
        // Usar dados do SessionTracking apenas se não foram fornecidos
        if (!hasValidFbp && hasValidPixelValue(sessionData.fbp, validateFbpFormat)) {
          finalFbp = sessionData.fbp;
          hasValidFbp = true;
          logWithContext('log', '🔥 FBP recuperado do SessionTracking', {
            request_id: requestId,
            telegram_id
          });
        }
        if (!hasValidFbc && hasValidPixelValue(sessionData.fbc, validateFbcFormat)) {
          finalFbc = sessionData.fbc;
          hasValidFbc = true;
          logWithContext('log', '🔥 FBC recuperado do SessionTracking', {
            request_id: requestId,
            telegram_id
          });
        }
        if (!finalIpAddress && sessionData.ip) {
          finalIpAddress = sessionData.ip;
        }
        if (!finalUserAgent && sessionData.user_agent) {
          finalUserAgent = sessionData.user_agent;
        }
      }
    } catch (error) {
      console.warn('Erro ao buscar dados do SessionTracking:', error.message);
    }
  }

  if (!hasValidFbp) {
    finalFbp = null;
  }
  if (!hasValidFbc) {
    finalFbc = null;
  }

  // 🔥 SINCRONIZAÇÃO DE TIMESTAMP: Usar timestamp do cliente quando disponível
  let finalEventTime = event_time;
  let timestampSource = 'event_time (fornecido)';

  if (typeof client_timestamp === 'number' && !Number.isNaN(client_timestamp)) {
    const syncedTimestamp = generateSyncedTimestamp(client_timestamp, event_time);

    if (typeof syncedTimestamp === 'number' && !Number.isNaN(syncedTimestamp)) {
      finalEventTime = syncedTimestamp;

      if (syncedTimestamp === client_timestamp) {
        timestampSource = 'cliente (sincronizado)';
      } else if (syncedTimestamp === event_time) {
        timestampSource = 'event_time (fallback por divergência)';
      } else {
        timestampSource = 'fallback (erro)';
      }
      
      console.log(`🕐 [WHATSAPP-SYNC] Timestamp sincronizado: ${client_timestamp} → ${finalEventTime} (${timestampSource})`);
    } else {
      timestampSource = 'event_time (fallback por erro)';
      console.log(`⚠️ [WHATSAPP-SYNC] Falha na sincronização, usando fallback: ${finalEventTime}`);
    }
  } else {
    console.log(`ℹ️ [WHATSAPP-SYNC] client_timestamp não fornecido, usando event_time: ${finalEventTime}`);
  }

  // 🔥 NOVO SISTEMA DE DEDUPLICAÇÃO UNIFICADO PARA TODOS OS EVENTOS
  logWithContext('log', '🔍 DEDUPLICAÇÃO ROBUSTA', {
    request_id: requestId,
    source,
    event_name,
    event_id: finalEventId,
    transaction_id: transactionIdForDedupe || token,
    event_time: finalEventTime,
    dedupe: disableDedupe ? 'off' : 'on'
  });

  // Verificar se evento já foi enviado usando sistema robusto
  if (!disableDedupe) {
    if (transactionIdForDedupe) {
      const alreadySentByTransaction = await isTransactionAlreadySent(transactionIdForDedupe, event_name);
      if (alreadySentByTransaction) {
        logWithContext('warn', '🔄 Evento ignorado por dedupe (transaction_id)', {
          request_id: requestId,
          event_name,
          transaction_id: transactionIdForDedupe
        });
        return { success: false, duplicate: true, duplicateReason: 'transaction_id' };
      }
    }

    const alreadySent = await isEventAlreadySent(finalEventId, source, event_name);
    if (alreadySent) {
      logWithContext('warn', '🔄 Evento ignorado por dedupe (event_id)', {
        request_id: requestId,
        event_name,
        source,
        event_id: finalEventId
      });
      return { success: false, duplicate: true, duplicateReason: 'event_id' };
    }
  }

  logWithContext('log', '🕐 Timestamp final usado', {
    request_id: requestId,
    event_name,
    source: timestampSource,
    event_time: finalEventTime
  });

  const ipValid = finalIpAddress && finalIpAddress !== '::1' && finalIpAddress !== '127.0.0.1';
  const finalIp = ipValid ? finalIpAddress : undefined;

  logWithContext('log', '📤 Evento preparado para envio', {
    request_id: requestId,
    event_name,
    value,
    source,
    ip: finalIp
  });
  
  // 🔥 Log de rastreamento invisível
  if (telegram_id && (hasValidFbp || hasValidFbc)) {
    logWithContext('log', '🔥 Rastreamento invisível ativo', {
      request_id: requestId,
      telegram_id,
      has_fbp: hasValidFbp,
      has_fbc: hasValidFbc
    });
  }

  // Log de auditoria de segurança
  logSecurityAudit(`send_${event_name.toLowerCase()}`, token, user_data_hash, source);

  // 🔥 PLANO DE DEDUPLICAÇÃO: Usar apenas user_data passado, sem fallbacks
  let finalUserData = { ...user_data }; // Usar user_data já pronto do endpoint

  // Se user_data não foi passado ou está vazio, montar apenas com dados básicos disponíveis
  if (!user_data || Object.keys(user_data).length === 0) {
    finalUserData = {};
    
    // Adicionar apenas parâmetros básicos se disponíveis (sem fallbacks)
    if (hasValidFbp) finalUserData.fbp = finalFbp;
    if (hasValidFbc) finalUserData.fbc = finalFbc;
    if (finalIp) finalUserData.client_ip_address = finalIp;
    if (finalUserAgent) finalUserData.client_user_agent = finalUserAgent;

    // Para eventos Purchase, adicionar external_id apenas se necessário
    if (event_name === 'Purchase' && (telegram_id || finalFbp)) {
      const extId = generateExternalId(telegram_id, finalFbp, finalIpAddress);
      finalUserData.external_id = extId;
      console.log('🔐 external_id gerado para Purchase (fallback)');
    }

  } else {
    console.log('✅ Usando user_data já pronto do endpoint (sem fallbacks)');
  }

  // 🔥 MELHORIA: Enriquecer com user_data_hash apenas se disponível (sem fallbacks)
  if (user_data_hash) {
    // Validar segurança dos dados hasheados antes de usar
    const validation = validateHashedDataSecurity(user_data_hash);
    if (!validation.valid) {
      console.error(`❌ Dados hasheados com problemas de segurança: ${validation.warnings.join(', ')}`);
    }

    // Mapear campos hasheados para o objeto user_data final apenas se não existirem
    if (user_data_hash.em && !finalUserData.em) finalUserData.em = [user_data_hash.em];
    if (user_data_hash.ph && !finalUserData.ph) finalUserData.ph = [user_data_hash.ph];
    if (user_data_hash.fn && !finalUserData.fn) finalUserData.fn = [user_data_hash.fn];
    if (user_data_hash.ln && !finalUserData.ln) finalUserData.ln = [user_data_hash.ln];
    
    console.log('👤 Dados de usuário (PII) hasheados adicionados para enriquecer o evento.');
  }

  // 🔥 LOGS DE DEBUG PARA DEDUPLICAÇÃO
  logWithContext('log', '[CAPI-DEDUPE] Evento preparado', {
    request_id: requestId,
    event_name,
    event_id: finalEventId,
    user_data_fields: finalUserData ? Object.keys(finalUserData) : []
  });

  logWithContext('log', '🔧 user_data final montado', {
    request_id: requestId,
    field_count: finalUserData ? Object.keys(finalUserData).length : 0
  });

  // 🔥 NOVA VALIDAÇÃO: Usar purchaseValidation para eventos Purchase
  let finalValue = value;
  if (event_name === 'Purchase') {
    const validation = validatePurchaseValue(value);
    if (validation.valid) {
      finalValue = validation.formattedValue;
      console.log(`✅ Valor Purchase validado e formatado: ${value} → ${finalValue}`);
    } else {
      logWithContext('warn', '[Meta CAPI] Purchase bloqueado - valor inválido', {
        request_id: requestId,
        event_id: finalEventId,
        reason: validation.error || 'invalid_purchase_value'
      });
      return { success: false, error: validation.error || 'invalid_purchase_value', blocked: true };
    }
  }

  const normalizedCurrency =
    typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : currency || null;

  const sanitizedCustomData = { ...(custom_data || {}) };
  delete sanitizedCustomData.value;
  delete sanitizedCustomData.currency;
  delete sanitizedCustomData.transaction_id;

  const finalEventSourceUrl = event_source_url || DEFAULT_EVENT_SOURCE_URL;
  const dedupExternalId = Array.isArray(finalUserData?.external_id)
    ? finalUserData.external_id[0]
    : finalUserData?.external_id || null;

  let purchaseDetails = null;
  if (event_name === 'Purchase') {
    const fallbackTransactionId =
      transactionIdForDedupe ||
      sanitizedCustomData.transaction_id ||
      event.transaction_id ||
      (token ? String(token).trim() : null) ||
      null;

    const providedContents = Array.isArray(custom_data?.contents) && custom_data.contents.length
      ? custom_data.contents
      : Array.isArray(event.contents) && event.contents.length
        ? event.contents
        : [];

    const providedContentIds = Array.isArray(custom_data?.content_ids) && custom_data.content_ids.length
      ? custom_data.content_ids
      : Array.isArray(event.content_ids) && event.content_ids.length
        ? event.content_ids
        : [];

    const fallbackId =
      (providedContentIds.length ? providedContentIds[0] : null) ||
      fallbackTransactionId ||
      (token ? String(token).trim() : null) ||
      finalEventId;

    const fallbackContents = fallbackId
      ? [{ id: fallbackId, quantity: 1, item_price: finalValue }]
      : [];

    const purchaseValidation = validatePurchaseInput({
      value: finalValue,
      currency: normalizedCurrency || 'BRL',
      contents: providedContents.length ? providedContents : fallbackContents,
      content_ids: providedContentIds.length ? providedContentIds : fallbackId ? [fallbackId] : [],
      content_type: sanitizedCustomData.content_type
    });

    if (!purchaseValidation.ok) {
      logWithContext('warn', '[Meta CAPI] Purchase bloqueado - validação falhou', {
        request_id: requestId,
        event_id: finalEventId,
        reason: purchaseValidation.reason
      });
      return {
        success: false,
        error: purchaseValidation.reason || 'purchase_validation_failed',
        blocked: true
      };
    }

    purchaseDetails = {
      ...purchaseValidation,
      transaction_id: fallbackTransactionId || null
    };

    finalValue = purchaseDetails.value;
  }

  const finalActionSource =
    event.action_source === 'system_generated'
      ? 'system_generated'
      : typeof event.action_source === 'string' && event.action_source.trim()
        ? event.action_source.trim()
        : 'website';
  const userDataForPayload = buildCapiUserData(finalUserData);
  const customDataForPayload = buildCapiCustomData({
    event_name,
    custom_data: sanitizedCustomData,
    purchase: purchaseDetails
      ? {
          value: purchaseDetails.value,
          currency: purchaseDetails.currency,
          transaction_id: purchaseDetails.transaction_id,
          contents: purchaseDetails.contents,
          content_ids: purchaseDetails.content_ids,
          content_type: purchaseDetails.content_type
        }
      : null
  });

  const builderEvent = {
    event_name,
    event_time: finalEventTime,
    event_id: finalEventId,
    action_source: finalActionSource,
    event_source_url: finalEventSourceUrl,
    user_data: userDataForPayload,
    custom_data: customDataForPayload,
    data_processing_options: event.data_processing_options,
    data_processing_options_country: event.data_processing_options_country,
    data_processing_options_state: event.data_processing_options_state,
    test_event_code: resolvedTestEventCode
  };

  const requestPayload = buildCapiPayload(builderEvent);

  logWithContext('log', '[Meta CAPI] Evento pronto para envio', {
    request_id: requestId,
    event_name: builderEvent.event_name,
    event_id: finalEventId,
    action_source: builderEvent.action_source,
    transaction_id: purchaseDetails?.transaction_id || null,
    value: purchaseDetails?.value || (event_name === 'Purchase' ? finalValue : undefined),
    currency: purchaseDetails?.currency || (event_name === 'Purchase' ? normalizedCurrency || null : undefined),
    has_fbp: Boolean(finalFbp),
    has_fbc: Boolean(finalFbc),
    has_client_ip: Boolean(finalIpAddress),
    has_client_ua: Boolean(finalUserAgent),
    test_event_code: resolvedTestEventCode || null
  });

  // 🔥 LOGS DE DEBUG EXCLUSIVOS PARA CAPI DO WHATSAPP
  // Verificar se é um evento do CAPI do WhatsApp (source === 'capi' e event_name === 'Purchase')
  if (isWhatsAppCapiEvent) {
    logWithContext('log', '[CAPI-DEBUG] WhatsApp evento preparado', {
      request_id: requestId,
      event_name,
      pixel_id: pixelId,
      event_id: finalEventId
    });
  }

  // 🔥 MELHORIA 3: Implementar Logs de Comparação Detalhados para Auditoria
  logWithContext('log', '📊 Auditoria do evento preparada', {
    request_id: requestId,
    event_name,
    event_id: finalEventId,
    source,
    value: event_name === 'Purchase' ? finalValue : value,
    has_user_data: Boolean(userDataForPayload && Object.keys(userDataForPayload).length),
    has_custom_data: Boolean(customDataForPayload && Object.keys(customDataForPayload).length)
  });

  try {
    const sendResult = await sendToMetaCapi(requestPayload, {
      pixelId,
      token: accessToken,
      testEventCode: resolvedTestEventCode,
      context: {
        request_id: requestId,
        source
      }
    });

    if (!sendResult.success) {
      if (token && pool) {
        await incrementEventAttempts(pool, token);
      }
      return { success: false, error: sendResult.error || 'capi_error', details: sendResult.details || null };
    }

    const response = sendResult.response || {};
    const fbtraceId = response.fbtrace_id || null;
    const responseRequestId = response.request_id || null;
    logWithContext('log', '✅ Evento enviado com sucesso', {
      request_id: requestId,
      event_name,
      event_id: finalEventId,
      source,
      transaction_id: purchaseDetails?.transaction_id || null,
      status: 200,
      has_response: Boolean(response),
      fbtrace_id: fbtraceId,
      response_request_id: responseRequestId
    });

    if (!disableDedupe) {
      const dedupValueForDatabase = event_name === 'Purchase'
        ? purchaseDetails?.value ?? finalValue ?? null
        : finalValue ?? null;

      try {
        await markEventAsSent({
          event_id: finalEventId,
          transaction_id: purchaseDetails?.transaction_id || transactionIdForDedupe || token || 'unknown',
          event_name: event_name,
          value: dedupValueForDatabase,
          currency: event_name === 'Purchase'
            ? purchaseDetails?.currency || normalizedCurrency || null
            : currency || null,
          source: source,
          fbp: finalFbp,
          fbc: finalFbc,
          external_id: dedupExternalId,
          ip_address: finalIp,
          user_agent: finalUserAgent
        });
        logWithContext('log', '🔥 Evento registrado no sistema de deduplicação', {
          request_id: requestId,
          event_name,
          source,
          event_id: finalEventId
        });
      } catch (error) {
        console.error(`❌ Erro ao registrar ${event_name} no sistema de deduplicação:`, error);
        // Não falhar o envio por causa do registro de deduplicação
      }
    }

    // Atualizar flags no banco se token e pool fornecidos
    if (token && pool && event_name === 'Purchase') {
      await updateEventFlags(pool, token, source);
    }

    return { success: true, response };
  } catch (err) {
    const fbtraceId = err.response?.data?.fbtrace_id || err.response?.headers?.['x-fb-trace-id'] || null;
    const responseRequestId = err.response?.data?.request_id || null;
    console.error(`❌ Erro ao enviar evento ${event_name} via ${source?.toUpperCase?.() || 'CAPI'}:`, err.response?.data || err.message, {
      event_id: finalEventId,
      fbtrace_id: fbtraceId,
      response_request_id: responseRequestId,
      request_id: requestId,
      transaction_id: purchaseDetails?.transaction_id || transactionIdForDedupe || null
    });

    if (token && pool) {
      await incrementEventAttempts(pool, token);
    }

    return { success: false, error: err.response?.data || err.message };
  }
}

// Função para atualizar flags de controle de eventos
async function updateEventFlags(pool, token, source) {
  if (!pool || !token) return;
  
  try {
    // WHITELIST DE COLUNAS VÁLIDAS PARA PREVENIR SQL INJECTION
    const validFlagColumns = {
      'pixel': 'pixel_sent',
      'capi': 'capi_sent',
      'cron': 'cron_sent',
      'webhook': 'capi_sent'
    };

    // Validar se a fonte é permitida
    if (!validFlagColumns[source]) {
      console.error(`❌ Fonte inválida para atualização de flag: ${source}`);
      return;
    }

    const flagColumn = validFlagColumns[source];
    const now = new Date().toISOString();
    
    // Query segura usando prepared statements sem interpolação
    const query = `
      UPDATE tokens 
      SET ${flagColumn} = TRUE,
          first_event_sent_at = COALESCE(first_event_sent_at, $2),
          event_attempts = event_attempts + 1
      WHERE token = $1
    `;
    
    await pool.query(query, [token, now]);
    
    logWithContext('log', '🏷️ Flag atualizada', {
      flag: flagColumn,
      source,
      token
    });
  } catch (error) {
    console.error('Erro ao atualizar flags de evento:', error);
  }
}

// Função para incrementar contador de tentativas
async function incrementEventAttempts(pool, token) {
  if (!pool || !token) return;
  
  try {
    await pool.query(`
      UPDATE tokens 
      SET event_attempts = event_attempts + 1
      WHERE token = $1
    `, [token]);
  } catch (error) {
    console.error('Erro ao incrementar tentativas de evento:', error);
  }
}

// Função para verificar se evento já foi enviado
async function checkIfEventSent(pool, token) {
  if (!pool || !token) return false;
  
  try {
    const result = await pool.query(`
      SELECT pixel_sent, capi_sent, cron_sent, first_event_sent_at, event_attempts
      FROM tokens 
      WHERE token = $1
    `, [token]);
    
    if (result.rows.length === 0) return false;
    
    const row = result.rows[0];
    return {
      pixel_sent: row.pixel_sent,
      capi_sent: row.capi_sent,
      cron_sent: row.cron_sent,
      any_sent: row.pixel_sent || row.capi_sent || row.cron_sent,
      first_event_sent_at: row.first_event_sent_at,
      event_attempts: row.event_attempts || 0
    };
  } catch (error) {
    console.error('Erro ao verificar status de evento:', error);
    return false;
  }
}

// Função para validar segurança dos dados hasheados
function validateHashedDataSecurity(user_data_hash) {
  if (!user_data_hash) return { valid: true, warnings: [] };
  
  const warnings = [];
  const hashPattern = /^[a-f0-9]{64}$/i; // SHA-256 hex pattern
  
  // Verificar se os hashes estão no formato correto
  if (user_data_hash.fn && !hashPattern.test(user_data_hash.fn)) {
    warnings.push('Hash fn não está no formato SHA-256 válido');
  }
  
  if (user_data_hash.ln && !hashPattern.test(user_data_hash.ln)) {
    warnings.push('Hash ln não está no formato SHA-256 válido');
  }
  
  if (user_data_hash.external_id && !hashPattern.test(user_data_hash.external_id)) {
    warnings.push('Hash external_id não está no formato SHA-256 válido');
  }
  
  // Verificar se algum hash parece conter dados em plain text
  const suspiciousPatterns = [
    /\s/, // espaços
    /@/, // email
    /\d{11}/, // CPF/CNPJ patterns
    /[A-Z][a-z]+/ // Nomes próprios
  ];
  
  [user_data_hash.fn, user_data_hash.ln, user_data_hash.external_id].forEach((hash, index) => {
    if (hash) {
      const fieldNames = ['fn', 'ln', 'external_id'];
      suspiciousPatterns.forEach(pattern => {
        if (pattern.test(hash)) {
          warnings.push(`Hash ${fieldNames[index]} pode conter dados não hasheados`);
        }
      });
    }
  });
  
  return {
    valid: warnings.length === 0,
    warnings: warnings
  };
}

// Função para log de auditoria de segurança
function logSecurityAudit(action, token, user_data_hash = null, source = 'unknown') {
  const timestamp = new Date().toISOString();
  const auditLog = {
    timestamp,
    action,
    token: token ? token.substring(0, 8) + '***' : null, // Mascarar token
    source,
    has_hashed_data: !!user_data_hash,
    data_fields: user_data_hash ? Object.keys(user_data_hash).filter(k => user_data_hash[k]) : []
  };
  
  // Log de auditoria (em produção, enviar para sistema de logging seguro)
  logWithContext('log', '🔒 AUDIT', { ...auditLog });

  if (user_data_hash) {
    const validation = validateHashedDataSecurity(user_data_hash);
    if (!validation.valid) {
      logWithContext('warn', '⚠️ SECURITY WARNING', {
        token: auditLog.token,
        warnings: validation.warnings
      });
    }
  }
}

function buildInitiateCheckoutEvent(options = {}) {
  const {
    telegramId,
    eventTime = Math.floor(Date.now() / 1000),
    eventId = null,
    eventSourceUrl = null,
    externalIdHash,
    zipHash = null,
    fbp = null,
    fbc = null,
    client_ip_address = null,
    client_user_agent = null,
    utms = {},
    actionSource = 'system_generated',
    contentType = 'product',
    test_event_code = null
  } = options;

  if (!telegramId) {
    throw new Error('telegramId is required to build InitiateCheckout event');
  }

  if (!externalIdHash) {
    throw new Error('externalIdHash is required to build InitiateCheckout event');
  }

  const userData = {
    external_id: externalIdHash
  };

  if (zipHash) {
    userData.zip = zipHash;
  }

  if (fbp) {
    userData.fbp = fbp;
  }

  if (fbc) {
    userData.fbc = fbc;
  }

  if (client_ip_address) {
    userData.client_ip_address = client_ip_address;
  }

  if (client_user_agent) {
    userData.client_user_agent = client_user_agent;
  }

  const customData = {
    content_type: contentType
  };

  const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  utmFields.forEach(field => {
    if (utms && typeof utms === 'object' && utms[field]) {
      customData[field] = utms[field];
    }
  });

  const eventPayload = {
    event_name: 'InitiateCheckout',
    event_time: eventTime,
    telegram_id: telegramId,
    user_data: userData,
    custom_data: customData,
    action_source: actionSource,
    source: 'capi'
  };

  if (eventId) {
    eventPayload.event_id = eventId;
  }

  if (eventSourceUrl) {
    eventPayload.event_source_url = eventSourceUrl;
  }

  if (client_ip_address) {
    eventPayload.client_ip_address = client_ip_address;
  }

  if (client_user_agent) {
    eventPayload.client_user_agent = client_user_agent;
  }

  if (test_event_code) {
    eventPayload.test_event_code = test_event_code;
  }

  return eventPayload;
}

async function sendLeadCapi(options = {}) {
  const {
    telegramId = null,
    eventTime = null,
    eventId: incomingEventId = null,
    externalIdHash = null,
    fbp = null,
    fbc = null,
    client_ip_address = null,
    client_user_agent = null,
    utms = {},
    eventSourceUrl = null,
    test_event_code = null
  } = options;

  const leadEventId = uuidv4();

  if (incomingEventId && incomingEventId !== leadEventId) {
    logWithContext('warn', '[LeadCAPI] event_id fornecido será ignorado em favor de UUID v4 interno', {
      provided_event_id: incomingEventId,
      resolved_event_id: leadEventId
    });
  }

  const normalizedEventTime =
    typeof eventTime === 'number' && !Number.isNaN(eventTime)
      ? eventTime
      : Math.floor(Date.now() / 1000);

  const userData = {};
  const available = [];

  if (externalIdHash) {
    userData.external_id = externalIdHash;
    available.push('external_id');
  }
  if (fbp) {
    userData.fbp = fbp;
    available.push('fbp');
  }
  if (fbc) {
    userData.fbc = fbc;
    available.push('fbc');
  }
  if (client_ip_address) {
    userData.client_ip_address = client_ip_address;
    available.push('client_ip_address');
  }
  if (client_user_agent) {
    userData.client_user_agent = client_user_agent;
    available.push('client_user_agent');
  }

  if (available.length < 2) {
    return { skipped: true, reason: 'missing_user_data', availableFields: available };
  }

  const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const sanitizedUtms = {};
  utmFields.forEach(field => {
    const sanitized = sanitizeUtmValue(utms[field]);
    if (sanitized) {
      sanitizedUtms[field] = sanitized;
    }
  });

  const finalEventId = leadEventId;
  const hasUtms = Object.keys(sanitizedUtms).length > 0;

  const payload = {
    event_name: 'Lead',
    event_time: normalizedEventTime,
    event_id: finalEventId,
    telegram_id: telegramId,
    action_source: 'system_generated',
    user_data: userData,
    custom_data: sanitizedUtms,
    source: 'capi',
    fbp,
    fbc,
    client_ip_address,
    client_user_agent
  };

  if (eventSourceUrl) {
    payload.event_source_url = eventSourceUrl;
  }

  if (test_event_code) {
    payload.test_event_code = test_event_code;
  }

  logWithContext('log', '[LeadCAPI] Evento preparado para envio', {
    event_name: payload.event_name,
    event_id: finalEventId,
    action_source: payload.action_source,
    telegram_id: telegramId,
    has_fbp: Boolean(fbp),
    has_fbc: Boolean(fbc),
    has_client_ip: Boolean(client_ip_address),
    has_client_ua: Boolean(client_user_agent)
  });

  try {
    const result = await sendFacebookEvent(payload);

    if (result?.duplicate) {
      try {
        await funnelMetrics.recordEvent('lead_fail', {
          telegramId,
          meta: { source: 'capi', utm: hasUtms, reason: 'duplicate' }
        });
      } catch (metricsError) {
        console.warn('[LeadCAPI] Falha ao registrar métricas após duplicidade', {
          error: metricsError.message
        });
      }
      return { duplicate: true, eventId: finalEventId };
    }

    if (result?.success) {
      try {
        await funnelMetrics.recordEvent('lead_sent', {
          telegramId,
          meta: { source: 'capi', utm: hasUtms }
        });
      } catch (metricsError) {
        console.warn('[LeadCAPI] Falha ao registrar métricas de sucesso', {
          error: metricsError.message
        });
      }
      return { success: true, eventId: finalEventId };
    }

    const reason = result?.error ? String(result.error).slice(0, 60) : null;
    try {
      await funnelMetrics.recordEvent('lead_fail', {
        telegramId,
        meta: reason ? { source: 'capi', utm: hasUtms, reason } : { source: 'capi', utm: hasUtms }
      });
    } catch (metricsError) {
      console.warn('[LeadCAPI] Falha ao registrar métricas de falha', {
        error: metricsError.message
      });
    }

    return { success: false, error: result?.error, eventId: finalEventId };
  } catch (error) {
    const reason = error?.message ? error.message.slice(0, 60) : 'unknown';
    try {
      await funnelMetrics.recordEvent('lead_fail', {
        telegramId,
        meta: { source: 'capi', utm: hasUtms, reason }
      });
    } catch (metricsError) {
      console.warn('[LeadCAPI] Falha ao registrar métricas após exceção', {
        error: metricsError.message
      });
    }
    throw error;
  }
}

async function sendInitiateCheckoutCapi(options = {}) {
  const eventPayload = buildInitiateCheckoutEvent(options);
  const hasUtms = Boolean(options?.utms && Object.keys(options.utms).length);

  try {
    const result = await sendFacebookEvent(eventPayload);

    if (result?.success) {
      funnelMetrics.recordEvent('ic_sent', {
        telegramId: options.telegramId,
        meta: { source: 'capi', utm: hasUtms }
      });
    } else if (!result?.duplicate) {
      const reason = result?.error ? String(result.error).slice(0, 60) : null;
      funnelMetrics.recordEvent('ic_fail', {
        telegramId: options.telegramId,
        meta: reason ? { source: 'capi', utm: hasUtms, reason } : { source: 'capi', utm: hasUtms }
      });
    }

    return result;
  } catch (error) {
    const reason = error?.message ? error.message.slice(0, 60) : 'unknown';
    funnelMetrics.recordEvent('ic_fail', {
      telegramId: options.telegramId,
      meta: { source: 'capi', utm: hasUtms, reason }
    });
    throw error;
  }
}

async function sendPurchaseCapi(options = {}) {
  const {
    telegramId = null,
    eventTime = null,
    eventId = null,
    value,
    currency = 'BRL',
    externalIdHash = null,
    zipHash = null,
    fbp = null,
    fbc = null,
    client_ip_address = null,
    client_user_agent = null,
    utms = {},
    eventSourceUrl = null,
    token = null,
    transactionId = null,
    userDataHash = null,
    source = 'capi',
    test_event_code = null,
    contents = null,
    content_ids: optionContentIds = null,
    content_type: optionContentType = null
  } = options;

  const validation = validatePurchaseValue(value);
  if (!validation.valid) {
    return { success: false, error: validation.error || 'invalid_purchase_value' };
  }

  const normalizedValue = validation.formattedValue;
  const normalizedEventTime =
    typeof eventTime === 'number' && !Number.isNaN(eventTime)
      ? eventTime
      : Math.floor(Date.now() / 1000);

  let finalEventId = eventId || uuidv4();

  const normalizedTransactionId = transactionId
    ? String(transactionId).trim().toLowerCase()
    : null;

  const userData = {};

  if (externalIdHash) {
    userData.external_id = externalIdHash;
  }

  if (zipHash) {
    userData.zip = zipHash;
  }

  if (fbp) {
    userData.fbp = fbp;
  }

  if (fbc) {
    userData.fbc = fbc;
  }

  if (client_ip_address) {
    userData.client_ip_address = client_ip_address;
  }

  if (client_user_agent) {
    userData.client_user_agent = client_user_agent;
  }

  const customData = {
    value: normalizedValue,
    currency
  };

  const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  utmFields.forEach(field => {
    if (utms && typeof utms === 'object' && utms[field]) {
      customData[field] = utms[field];
    }
  });

  if (Array.isArray(contents) && contents.length) {
    customData.contents = contents;
  }

  if (Array.isArray(optionContentIds) && optionContentIds.length) {
    customData.content_ids = optionContentIds;
  }

  if (optionContentType) {
    customData.content_type = optionContentType;
  }

  if (normalizedTransactionId) {
    customData.transaction_id = normalizedTransactionId;
  }

  const eventPayload = {
    event_name: 'Purchase',
    event_time: normalizedEventTime,
    event_id: finalEventId,
    telegram_id: telegramId,
    action_source: 'website',
    user_data: userData,
    custom_data: customData,
    source,
    token,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent,
    user_data_hash: userDataHash || null
  };

  if (test_event_code) {
    eventPayload.test_event_code = test_event_code;
  }

  if (eventSourceUrl) {
    eventPayload.event_source_url = eventSourceUrl;
  }

  const hasUtms = Boolean(utms && typeof utms === 'object' && Object.keys(utms).length);
  const metaBase = { source: 'capi', utm: hasUtms };
  const safeToken = token || null;

  let result;
  try {
    result = await sendFacebookEvent(eventPayload);
  } catch (error) {
    const reason = error?.message ? error.message.slice(0, 60) : 'unknown';
    funnelMetrics.recordEvent('purchase_fail', {
      telegramId,
      token: safeToken,
      meta: { ...metaBase, reason }
    });
    throw error;
  }

  if (result?.duplicate) {
    funnelMetrics.recordEvent('purchase_dup', {
      telegramId,
      token: safeToken,
      meta: metaBase
    });
    return { duplicate: true, eventId: finalEventId, normalizedValue };
  }

  if (result?.success) {
    funnelMetrics.recordEvent('purchase_sent', {
      telegramId,
      token: safeToken,
      meta: metaBase
    });
    return { success: true, eventId: finalEventId, normalizedValue };
  }

  const reason = result?.error ? String(result.error).slice(0, 60) : null;
  funnelMetrics.recordEvent('purchase_fail', {
    telegramId,
    token: safeToken,
    meta: reason ? { ...metaBase, reason } : metaBase
  });

  return { success: false, eventId: finalEventId, normalizedValue, error: result?.error };
}

module.exports = {
  sendFacebookEvent,
  generateEventId,
  generateHashedUserData,
  generateExternalId,
  updateEventFlags,
  checkIfEventSent,
  incrementEventAttempts,
  validateHashedDataSecurity,
  logSecurityAudit,
  generateSyncedTimestamp, // 🔥 NOVA FUNÇÃO EXPORTADA
  getEnhancedDedupKey, // 🔥 NOVA FUNÇÃO EXPORTADA
  generateRobustEventId, // 🔥 NOVA FUNÇÃO EXPORTADA
  buildInitiateCheckoutEvent,
  sendLeadCapi,
  sendInitiateCheckoutCapi,
  sendPurchaseCapi,
  router
};
