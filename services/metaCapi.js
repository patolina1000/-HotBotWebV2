const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const FACEBOOK_API_VERSION = 'v17.0';
const { FB_PIXEL_ID, FB_PIXEL_TOKEN } = process.env;

const ALLOWED_ACTION_SOURCES = new Set([
  'website',
  'app',
  'chat',
  'phone_call',
  'physical_store',
  'system_generated',
  'other'
]);
const ACTION_SOURCE_LEAD = process.env.ACTION_SOURCE_LEAD || 'chat'; // default = 'chat'
const isValidActionSource = value => typeof value === 'string' && ALLOWED_ACTION_SOURCES.has(value);
const resolveLeadActionSource = () => (isValidActionSource(ACTION_SOURCE_LEAD) ? ACTION_SOURCE_LEAD : 'chat');

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

function maskIdentifier(value) {
  if (!value && value !== 0) {
    return null;
  }
  const hashed = hashSha256(String(value));
  return hashed ? hashed.slice(0, 10) : null;
}

function sanitizeLogContext(context = {}) {
  const sanitized = {};
  Object.entries(context).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (value === undefined) {
      return;
    }
    if (lowerKey.includes('id') || lowerKey.includes('token')) {
      sanitized[key] = value ? maskIdentifier(value) : null;
      return;
    }
    if (lowerKey.includes('ip')) {
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

function resolveTestEventCode(incomingTestEventCode) {
  const override =
    typeof incomingTestEventCode === 'string' ? incomingTestEventCode.trim() || null : null;

  if (override) {
    return {
      resolved: override,
      source: 'override'
    };
  }

  if (TEST_EVENT_CODE_ENV) {
    return {
      resolved: TEST_EVENT_CODE_ENV,
      source: TEST_EVENT_CODE_SOURCE || 'env'
    };
  }

  return { resolved: null, source: null };
}

function hashSha256(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

function normalizeZipHash(zip) {
  if (!zip) {
    return null;
  }

  if (typeof zip === 'string') {
    const cleaned = zip.trim();
    if (!cleaned) {
      return null;
    }
    if (cleaned.toLowerCase().startsWith('postal:')) {
      return hashSha256(cleaned.slice(7));
    }
    return isSha256(cleaned) ? cleaned.toLowerCase() : hashSha256(cleaned);
  }

  if (typeof zip === 'object') {
    const { type, value } = zip;
    if (typeof value !== 'string') {
      return null;
    }
    const cleanedValue = value.trim();
    if (!cleanedValue) {
      return null;
    }
    if (type && String(type).toLowerCase() === 'postal') {
      return hashSha256(cleanedValue);
    }
    return isSha256(cleanedValue) ? cleanedValue.toLowerCase() : hashSha256(cleanedValue);
  }

  return null;
}

function buildUserData({ 
  externalIdHash, 
  emailHash, 
  phoneHash, 
  firstNameHash, 
  lastNameHash,
  fbp, 
  fbc, 
  zipHash, 
  clientIpAddress, 
  clientUserAgent 
}) {
  const userData = {};
  
  // Advanced Matching - campos hasheados
  if (emailHash) {
    userData.em = Array.isArray(emailHash) ? emailHash : [emailHash];
    console.log('[CAPI] user_data.em included');
  }
  if (phoneHash) {
    userData.ph = Array.isArray(phoneHash) ? phoneHash : [phoneHash];
    console.log('[CAPI] user_data.ph included');
  }
  if (firstNameHash) {
    userData.fn = Array.isArray(firstNameHash) ? firstNameHash : [firstNameHash];
    console.log('[CAPI] user_data.fn included');
  }
  if (lastNameHash) {
    userData.ln = Array.isArray(lastNameHash) ? lastNameHash : [lastNameHash];
    console.log('[CAPI] user_data.ln included');
  }
  if (externalIdHash) {
    userData.external_id = Array.isArray(externalIdHash) ? externalIdHash : [externalIdHash];
    console.log('[CAPI] user_data.external_id included');
  }
  
  // Facebook cookies
  if (fbp) {
    userData.fbp = fbp;
  }
  if (fbc) {
    userData.fbc = fbc;
  }
  
  // ZIP code
  if (zipHash) {
    userData.zip = Array.isArray(zipHash) ? zipHash : [zipHash];
  }
  
  // IP e User Agent (NÃO hashear)
  if (clientIpAddress) {
    userData.client_ip_address = clientIpAddress;
  }
  if (clientUserAgent) {
    userData.client_user_agent = clientUserAgent;
  }
  
  return userData;
}

function buildCustomData(utmData = {}) {
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  return allowed.reduce((acc, key) => {
    if (utmData[key]) {
      acc[key] = utmData[key];
    }
    return acc;
  }, {});
}

async function sendInitiateCheckoutEvent(eventPayload) {
  if (!FB_PIXEL_ID || !FB_PIXEL_TOKEN) {
    logWithContext('error', '[Meta CAPI] Pixel ID/Token não configurados. Evento não enviado.', {});
    return { success: false, error: 'pixel_not_configured' };
  }

  const {
    telegramId,
    eventTime,
    eventSourceUrl = null,
    eventId,
    // Advanced Matching - hashes SHA-256
    externalIdHash = null,
    emailHash = null,
    phoneHash = null,
    firstNameHash = null,
    lastNameHash = null,
    // Facebook cookies
    fbp = null,
    fbc = null,
    zipHash = null,
    // IP e UA (não hashear)
    clientIpAddress = null,
    clientUserAgent = null,
    utmData = {},
    requestId = null,
    test_event_code: incomingTestEventCode = null
  } = eventPayload;

  const { resolved: resolvedTestEventCode, source: testEventSource } = resolveTestEventCode(incomingTestEventCode);
  if (resolvedTestEventCode) {
    console.info('[CAPI] test_event_code aplicado', {
      source: testEventSource
    });
  }

  const userData = buildUserData({ 
    externalIdHash, 
    emailHash, 
    phoneHash, 
    firstNameHash, 
    lastNameHash,
    fbp, 
    fbc, 
    zipHash, 
    clientIpAddress, 
    clientUserAgent 
  });
  const customData = buildCustomData(utmData);

  // Log de IP/UA para rastreamento
  const uaTruncated = clientUserAgent ? 
    (clientUserAgent.length > 80 ? `${clientUserAgent.substring(0, 80)}... (${clientUserAgent.length} chars)` : clientUserAgent) 
    : 'vazio';
  console.log(`[CAPI-IPUA] origem=website ip=${clientIpAddress || 'vazio'} ua_present=${!!clientUserAgent}`);
  console.log(`[CAPI-IPUA] user_data aplicado { client_ip_address: "${clientIpAddress || 'vazio'}", client_user_agent_present: ${!!clientUserAgent} }`);

  const data = {
    event_name: 'InitiateCheckout',
    event_time: eventTime,
    action_source: 'website',
    event_id: eventId,
    user_data: userData,
    custom_data: customData
  };

  if (eventSourceUrl) {
    data.event_source_url = eventSourceUrl;
  }
  if (clientIpAddress) {
    data.client_ip_address = clientIpAddress;
  }
  if (clientUserAgent) {
    data.client_user_agent = clientUserAgent;
  }

  const payload = {
    data: [data],
    access_token: FB_PIXEL_TOKEN
  };

  const urlBase = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;
  const url = resolvedTestEventCode
    ? `${urlBase}?test_event_code=${encodeURIComponent(resolvedTestEventCode)}`
    : urlBase;
  const maxAttempts = 3;
  const baseDelay = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      logWithContext('log', '[Meta CAPI] InitiateCheckout enviado com sucesso', {
        request_id: requestId,
        event_name: 'InitiateCheckout',
        event_id: eventId,
        status: response.status,
        attempt,
        telegram_id: telegramId
      });
      return { success: true, response: response.data, status: response.status, attempt };
    } catch (error) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      logWithContext('error', '[Meta CAPI] Falha ao enviar InitiateCheckout', {
        request_id: requestId,
        event_name: 'InitiateCheckout',
        event_id: eventId,
        status: status || 'network_error',
        attempt,
        telegram_id: telegramId,
        has_response: Boolean(responseData),
        error: error.message
      });

      const isRetryable = status && status >= 500 && status < 600;
      if (!isRetryable || attempt === maxAttempts) {
        return { success: false, error: error.message, status, response: responseData };
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: 'Unknown error sending InitiateCheckout' };
}

async function sendLeadEvent(eventPayload = {}) {
  if (!FB_PIXEL_ID || !FB_PIXEL_TOKEN) {
    logWithContext('error', '[Meta CAPI] Pixel ID/Token não configurados. Lead não enviado.', {});
    return { success: false, error: 'pixel_not_configured', hasMinUserData: false };
  }

  const {
    telegramId = null,
    eventTime = Math.floor(Date.now() / 1000),
    eventSourceUrl = null,
    eventId: incomingEventId = null,
    // Advanced Matching - hashes SHA-256
    externalIdHash = null,
    emailHash = null,
    phoneHash = null,
    firstNameHash = null,
    lastNameHash = null,
    // Facebook cookies
    fbp = null,
    fbc = null,
    zipHash = null,
    // IP e UA (não hashear)
    clientIpAddress = null,
    clientUserAgent = null,
    utmData = {},
    requestId = null,
    test_event_code: incomingTestEventCode = null
  } = eventPayload;

  const providedFields = [];
  if (emailHash) {
    providedFields.push('em');
  }
  if (phoneHash) {
    providedFields.push('ph');
  }
  if (firstNameHash) {
    providedFields.push('fn');
  }
  if (lastNameHash) {
    providedFields.push('ln');
  }
  if (externalIdHash) {
    providedFields.push('external_id');
  }
  if (fbp) {
    providedFields.push('fbp');
  }
  if (fbc) {
    providedFields.push('fbc');
  }
  if (clientIpAddress) {
    providedFields.push('client_ip_address');
  }
  if (clientUserAgent) {
    providedFields.push('client_user_agent');
  }

  const { resolved: resolvedTestEventCode, source: testEventSource } = resolveTestEventCode(incomingTestEventCode);
  const hasMinUserData = providedFields.length >= 2;

  if (!hasMinUserData) {
    logWithContext('warn', '[Meta CAPI] Lead não enviado - user_data insuficiente', {
      request_id: requestId,
      telegram_id: telegramId,
      provided_fields: providedFields,
      test_event_code: resolvedTestEventCode
    });
    return {
      success: false,
      skipped: true,
      reason: 'insufficient_user_data',
      provided_fields: providedFields,
      hasMinUserData,
      test_event_code: resolvedTestEventCode
    };
  }

  if (resolvedTestEventCode) {
    console.info('[CAPI] test_event_code aplicado', {
      source: testEventSource
    });
  }

  const userData = buildUserData({
    externalIdHash,
    emailHash,
    phoneHash,
    firstNameHash,
    lastNameHash,
    fbp,
    fbc,
    zipHash,
    clientIpAddress,
    clientUserAgent
  });
  const customData = buildCustomData(utmData);

  // Log de IP/UA para rastreamento
  const uaTruncated = clientUserAgent ? 
    (clientUserAgent.length > 80 ? `${clientUserAgent.substring(0, 80)}... (${clientUserAgent.length} chars)` : clientUserAgent) 
    : 'vazio';
  console.log(`[CAPI-IPUA] origem=chat ip=${clientIpAddress || 'vazio'} ua_present=${!!clientUserAgent}`);
  console.log(`[CAPI-IPUA] user_data aplicado { client_ip_address: "${clientIpAddress || 'vazio'}", client_user_agent_present: ${!!clientUserAgent} }`);
  
  if (clientIpAddress && clientUserAgent) {
    console.log('[CAPI-IPUA] Fallback aplicado (tracking) ip=' + clientIpAddress + ' ua_present=true');
  }

  if (incomingEventId) {
    logWithContext('warn', '[Meta CAPI] event_id fornecido será substituído por UUID interno', {
      request_id: requestId
    });
  }

  const normalizedEventTime = typeof eventTime === 'number' && Number.isFinite(eventTime)
    ? eventTime
    : Math.floor(Date.now() / 1000);

  let leadActionSource = resolveLeadActionSource();
  if (!isValidActionSource(leadActionSource)) {
    leadActionSource = 'chat';
  }
  if (leadActionSource === 'system_generated') {
    console.warn('[Meta CAPI] WARN: Lead com action_source=system_generated; substituindo para "chat".');
    leadActionSource = 'chat';
  }

  const baseEventPayloadData = {
    event_name: 'Lead',
    event_time: normalizedEventTime,
    action_source: leadActionSource,
    user_data: userData,
    custom_data: customData
  };

  if (eventSourceUrl) {
    baseEventPayloadData.event_source_url = eventSourceUrl;
  }
  if (clientIpAddress) {
    baseEventPayloadData.client_ip_address = clientIpAddress;
  }
  if (clientUserAgent) {
    baseEventPayloadData.client_user_agent = clientUserAgent;
  }

  const urlBase = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;
  const url = resolvedTestEventCode
    ? `${urlBase}?test_event_code=${encodeURIComponent(resolvedTestEventCode)}`
    : urlBase;

  const maxAttempts = 3;
  const baseDelay = 300;

  let lastEventId = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptEventId = uuidv4();
    lastEventId = attemptEventId;
    const eventPayloadData = {
      ...baseEventPayloadData,
      event_id: attemptEventId
    };

    const payload = {
      data: [eventPayloadData],
      access_token: FB_PIXEL_TOKEN
    };

    logWithContext('log', '[Meta CAPI] Lead preparado para envio', {
      request_id: requestId,
      event_id: attemptEventId,
      telegram_id: telegramId,
      provided_fields: providedFields,
      test_event_code: resolvedTestEventCode,
      url,
      attempt,
      has_fbp: Boolean(fbp),
      has_fbc: Boolean(fbc),
      has_client_ip: Boolean(clientIpAddress),
      has_client_ua: Boolean(clientUserAgent)
    });

    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      const fbtraceId = response.data?.fbtrace_id || response.headers?.['x-fb-trace-id'] || null;
      const responseRequestId = response.data?.request_id || null;
      logWithContext('log', '[Meta CAPI] Lead enviado com sucesso', {
        request_id: requestId,
        event_name: 'Lead',
        event_id: attemptEventId,
        status: response.status,
        attempt,
        telegram_id: telegramId,
        test_event_code: resolvedTestEventCode,
        fbtrace_id: fbtraceId,
        response_request_id: responseRequestId
      });
      return {
        success: true,
        response: response.data,
        status: response.status,
        attempt,
        test_event_code: resolvedTestEventCode,
        hasMinUserData,
        event_id: attemptEventId
      };
    } catch (error) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      const fbtraceId = responseData?.fbtrace_id || error.response?.headers?.['x-fb-trace-id'] || null;
      const responseRequestId = responseData?.request_id || null;
      logWithContext('error', '[Meta CAPI] Falha ao enviar Lead', {
        request_id: requestId,
        event_name: 'Lead',
        event_id: attemptEventId,
        status: status || 'network_error',
        attempt,
        telegram_id: telegramId,
        has_response: Boolean(responseData),
        test_event_code: resolvedTestEventCode,
        error: error.message,
        fbtrace_id: fbtraceId,
        response_request_id: responseRequestId
      });

      if (responseData) {
        console.error('[Meta CAPI] Lead erro detalhado', {
          status: status || 'network_error',
          body: responseData,
          test_event_code: resolvedTestEventCode
        });
      }

      const isRetryable = status && status >= 500 && status < 600;
      if (!isRetryable || attempt === maxAttempts) {
        return {
          success: false,
          error: error.message,
          status,
          response: responseData,
          attempt,
          test_event_code: resolvedTestEventCode,
          hasMinUserData,
          event_id: attemptEventId
        };
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: 'Unknown error sending Lead',
    hasMinUserData,
    test_event_code: resolvedTestEventCode,
    event_id: lastEventId || uuidv4()
  };
}

module.exports = {
  hashSha256,
  normalizeZipHash,
  sendInitiateCheckoutEvent,
  sendLeadEvent
};
