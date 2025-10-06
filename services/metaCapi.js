const axios = require('axios');
const crypto = require('crypto');
const { uniqueEventId } = require('../helpers/eventId');

const FACEBOOK_API_VERSION = 'v17.0';
const { FB_PIXEL_ID, FB_PIXEL_TOKEN, FB_TEST_EVENT_CODE } = process.env;
const TEST_EVENT_CODE_ENV = typeof FB_TEST_EVENT_CODE === 'string' ? FB_TEST_EVENT_CODE.trim() || null : null;

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
  const resolved = override || TEST_EVENT_CODE_ENV || null;
  return {
    resolved,
    source: override ? 'override' : resolved ? 'env' : null
  };
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

function buildUserData({ externalIdHash, fbp, fbc, zipHash, clientIpAddress, clientUserAgent }) {
  const userData = {};
  if (externalIdHash) {
    userData.external_id = [externalIdHash];
  }
  if (fbp) {
    userData.fbp = fbp;
  }
  if (fbc) {
    userData.fbc = fbc;
  }
  if (zipHash) {
    userData.zip = [zipHash];
  }
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
    externalIdHash = null,
    fbp = null,
    fbc = null,
    zipHash = null,
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

  const userData = buildUserData({ externalIdHash, fbp, fbc, zipHash, clientIpAddress, clientUserAgent });
  const customData = buildCustomData(utmData);

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
    eventId = null,
    externalIdHash = null,
    fbp = null,
    fbc = null,
    zipHash = null,
    clientIpAddress = null,
    clientUserAgent = null,
    utmData = {},
    requestId = null,
    test_event_code: incomingTestEventCode = null
  } = eventPayload;

  const providedFields = [];
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
    fbp,
    fbc,
    zipHash,
    clientIpAddress,
    clientUserAgent
  });
  const customData = buildCustomData(utmData);

  const resolvedEventId = eventId || uniqueEventId();

  const eventPayloadData = {
    event_name: 'Lead',
    event_time: typeof eventTime === 'number' && Number.isFinite(eventTime)
      ? eventTime
      : Math.floor(Date.now() / 1000),
    action_source: 'system_generated',
    event_id: resolvedEventId,
    user_data: userData,
    custom_data: customData
  };

  if (eventSourceUrl) {
    eventPayloadData.event_source_url = eventSourceUrl;
  }
  if (clientIpAddress) {
    eventPayloadData.client_ip_address = clientIpAddress;
  }
  if (clientUserAgent) {
    eventPayloadData.client_user_agent = clientUserAgent;
  }

  const payload = {
    data: [eventPayloadData],
    access_token: FB_PIXEL_TOKEN
  };

  const urlBase = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;
  const url = resolvedTestEventCode
    ? `${urlBase}?test_event_code=${encodeURIComponent(resolvedTestEventCode)}`
    : urlBase;

  logWithContext('log', '[Meta CAPI] Lead preparado para envio', {
    request_id: requestId,
    event_id: resolvedEventId,
    telegram_id: telegramId,
    provided_fields: providedFields,
    test_event_code: resolvedTestEventCode,
    url
  });

  const maxAttempts = 3;
  const baseDelay = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      logWithContext('log', '[Meta CAPI] Lead enviado com sucesso', {
        request_id: requestId,
        event_name: 'Lead',
        event_id: resolvedEventId,
        status: response.status,
        attempt,
        telegram_id: telegramId,
        test_event_code: resolvedTestEventCode
      });
      return {
        success: true,
        response: response.data,
        status: response.status,
        attempt,
        test_event_code: resolvedTestEventCode,
        hasMinUserData,
        event_id: resolvedEventId
      };
    } catch (error) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      logWithContext('error', '[Meta CAPI] Falha ao enviar Lead', {
        request_id: requestId,
        event_name: 'Lead',
        event_id: resolvedEventId,
        status: status || 'network_error',
        attempt,
        telegram_id: telegramId,
        has_response: Boolean(responseData),
        test_event_code: resolvedTestEventCode,
        error: error.message
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
          event_id: resolvedEventId
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
    event_id: resolvedEventId
  };
}

module.exports = {
  hashSha256,
  normalizeZipHash,
  sendInitiateCheckoutEvent,
  sendLeadEvent
};
