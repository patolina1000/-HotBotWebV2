const axios = require('axios');
const crypto = require('crypto');

const FACEBOOK_API_VERSION = 'v17.0';
const { FB_PIXEL_ID, FB_PIXEL_TOKEN, FB_TEST_EVENT_CODE, NODE_ENV } = process.env;

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
    console.error('[Meta CAPI] Pixel ID/Token não configurados. Evento não enviado.');
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
    utmData = {}
  } = eventPayload;

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

  if (NODE_ENV !== 'production' && FB_TEST_EVENT_CODE) {
    payload.test_event_code = FB_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;
  const maxAttempts = 3;
  const baseDelay = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      console.log('[Meta CAPI] InitiateCheckout enviado com sucesso', {
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
      console.error('[Meta CAPI] Falha ao enviar InitiateCheckout', {
        event_name: 'InitiateCheckout',
        event_id: eventId,
        status: status || 'network_error',
        attempt,
        telegram_id: telegramId,
        response: responseData || error.message
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

module.exports = {
  hashSha256,
  normalizeZipHash,
  sendInitiateCheckoutEvent
};
