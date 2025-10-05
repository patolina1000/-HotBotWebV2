const axios = require('axios');
const crypto = require('crypto');
const funnelMetrics = require('./funnelMetrics');

const HEX_64_REGEX = /^[a-f0-9]{64}$/i;
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS_MS = [200, 500, 800];
const REQUEST_TIMEOUT_MS = 5000;
const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

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
    if (lowerKey.includes('order') || lowerKey.includes('token') || lowerKey.includes('id')) {
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

function getConfig() {
  const apiUrl = process.env.UTMIFY_API_URL ? process.env.UTMIFY_API_URL.trim() : '';
  const apiToken = process.env.UTMIFY_API_TOKEN ? process.env.UTMIFY_API_TOKEN.trim() : '';
  return {
    apiUrl: apiUrl ? apiUrl.replace(/\/+$/, '') : '',
    apiToken
  };
}

function isConfigured() {
  const { apiUrl, apiToken } = getConfig();
  return Boolean(apiUrl && apiToken);
}

function sanitizeUtmValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.toLowerCase();
  }
  return value;
}

function sanitizeUtm(utm = {}) {
  const sanitized = {};
  UTM_FIELDS.forEach(field => {
    const sanitizedValue = sanitizeUtmValue(utm[field]);
    if (sanitizedValue !== null && sanitizedValue !== undefined) {
      sanitized[field] = sanitizedValue;
    }
  });
  return sanitized;
}

function sanitizeHash(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!HEX_64_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

function sanitizeIds(ids = {}) {
  const sanitized = {};
  if (ids.external_id_hash) {
    const externalIdHash = sanitizeHash(ids.external_id_hash);
    if (externalIdHash) {
      sanitized.external_id_hash = externalIdHash;
    }
  }
  if (ids.fbp) {
    const fbp = typeof ids.fbp === 'string' ? ids.fbp.trim() : ids.fbp;
    if (fbp) {
      sanitized.fbp = fbp;
    }
  }
  if (ids.fbc) {
    const fbc = typeof ids.fbc === 'string' ? ids.fbc.trim() : ids.fbc;
    if (fbc) {
      sanitized.fbc = fbc;
    }
  }
  if (ids.zip_hash) {
    const zipHash = sanitizeHash(ids.zip_hash);
    if (zipHash) {
      sanitized.zip_hash = zipHash;
    }
  }
  return sanitized;
}

function sanitizeClient(client = {}) {
  const sanitized = {};
  if (client.ip) {
    const ip = typeof client.ip === 'string' ? client.ip.trim() : client.ip;
    if (ip) {
      sanitized.ip = ip;
    }
  }
  if (client.user_agent) {
    const userAgent = typeof client.user_agent === 'string' ? client.user_agent.trim() : client.user_agent;
    if (userAgent) {
      sanitized.user_agent = userAgent;
    }
  }
  return sanitized;
}

function normalizeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Number(parsed.toFixed(2));
    }
  }
  return null;
}

function buildOrderPayload({ order_id, value, currency = 'BRL', utm = {}, ids = {}, client = {} }) {
  const orderId = typeof order_id === 'string' ? order_id.trim() : order_id;
  if (!orderId) {
    throw new Error('order_id é obrigatório para enviar conversão à UTMify');
  }

  const normalizedValue = normalizeValue(value);
  const sanitizedUtm = sanitizeUtm(utm);
  const sanitizedIds = sanitizeIds(ids);
  const sanitizedClient = sanitizeClient(client);

  const payload = {
    order_id: orderId,
    currency: currency || 'BRL'
  };

  if (normalizedValue !== null) {
    payload.value = normalizedValue;
  }
  if (Object.keys(sanitizedUtm).length > 0) {
    payload.utm = sanitizedUtm;
  }
  if (Object.keys(sanitizedIds).length > 0) {
    payload.ids = sanitizedIds;
  }
  if (Object.keys(sanitizedClient).length > 0) {
    payload.client = sanitizedClient;
  }

  return payload;
}

async function postOrder(options = {}) {
  const { requestId } = options;
  const { apiUrl, apiToken } = getConfig();
  if (!apiUrl || !apiToken) {
    return { ok: false, sent: false, skipped: true, reason: 'missing_config' };
  }

  let payload;
  try {
    payload = buildOrderPayload(options);
  } catch (error) {
    console.warn('[UTMify] Conversão ignorada:', error.message);
    return { ok: false, sent: false, skipped: true, reason: error.message };
  }

  const endpoint = `${apiUrl}/order/conversion`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.post(endpoint, payload, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${apiToken}`
        }
      });

      logWithContext('log', '[UTMify] Conversão enviada', {
        request_id: requestId,
        order_id: payload.order_id,
        attempt
      });
      funnelMetrics.recordEvent('utmify_sent', {
        token: payload.order_id,
        meta: { source: 'utmify', retry: attempt > 1 }
      });
      return { ok: true, sent: true, attempt, response: response.data };
    } catch (error) {
      const status = error.response?.status || null;
      const message = error.response?.data || error.message;
      logWithContext('warn', '[UTMify] Falha ao enviar conversão', {
        request_id: requestId,
        order_id: payload.order_id,
        attempt,
        status,
        has_message: Boolean(message)
      });

      if (attempt >= MAX_ATTEMPTS) {
        const reason = typeof message === 'string' ? message.slice(0, 80) : 'unexpected_error';
        funnelMetrics.recordEvent('utmify_fail', {
          token: payload.order_id,
          meta: { source: 'utmify', status, reason }
        });
        return { ok: false, sent: false, attempt, status, error: message };
      }

      funnelMetrics.recordEvent('utmify_retry', {
        token: payload.order_id,
        meta: { source: 'utmify', attempt, status }
      });

      const delay = BACKOFF_DELAYS_MS[Math.min(attempt - 1, BACKOFF_DELAYS_MS.length - 1)];
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { ok: false, sent: false, attempt: MAX_ATTEMPTS, error: 'unexpected_state' };
}

async function enviarConversaoParaUtmify(legacyPayload = {}) {
  const {
    orderId = null,
    transactionValueCents = null,
    trackingData = {},
    currency = 'BRL',
    telegram_id = null,
    external_id_hash = null,
    fbp = null,
    fbc = null,
    zip_hash = null,
    requestId = null
  } = legacyPayload;

  const value = Number.isFinite(transactionValueCents)
    ? Number((transactionValueCents / 100).toFixed(2))
    : null;

  const orderIdSource = orderId || telegram_id || null;
  if (!orderIdSource) {
    return { ok: false, sent: false, skipped: true, reason: 'missing_order_id' };
  }

  const utm = {};
  UTM_FIELDS.forEach(field => {
    if (trackingData && Object.prototype.hasOwnProperty.call(trackingData, field)) {
      utm[field] = trackingData[field];
    }
  });

  const ids = {
    external_id_hash: trackingData?.external_id_hash || external_id_hash,
    fbp: trackingData?.fbp || fbp,
    fbc: trackingData?.fbc || fbc,
    zip_hash: trackingData?.zip_hash || zip_hash
  };

  const client = {
    ip: trackingData?.ip || trackingData?.client_ip_address || null,
    user_agent: trackingData?.user_agent || trackingData?.client_user_agent || null
  };

  return postOrder({
    order_id: orderIdSource,
    value,
    currency,
    utm,
    ids,
    client,
    requestId
  });
}

module.exports = {
  isConfigured,
  postOrder,
  enviarConversaoParaUtmify,
  buildOrderPayload
};
