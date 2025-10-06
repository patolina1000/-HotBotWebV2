const axios = require('axios');
const crypto = require('crypto');

const GRAPH_VERSION = 'v19.0';
const FORBIDDEN_ROOT = new Set(['transaction_id', 'currency', 'value']);
const ENABLE_TEST_EVENTS = process.env.ENABLE_TEST_EVENTS === 'true';
const TEST_EVENT_CODE_ENV = (() => {
  if (!ENABLE_TEST_EVENTS) {
    return null;
  }

  const raw = process.env.TEST_EVENT_CODE || process.env.FB_TEST_EVENT_CODE;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed || null;
})();

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

function looksLikeSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeEmail(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return normalized.toLowerCase();
}

function normalizePhone(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  const digits = normalized.replace(/\D+/g, '');
  if (!digits) {
    return null;
  }
  return digits;
}

function sanitize(value, { parentKey = null } = {}) {
  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map(item => sanitize(item))
      .filter(item => item !== undefined && item !== null && !(typeof item === 'object' && Object.keys(item).length === 0));

    if (sanitizedItems.length === 0 && parentKey !== 'data') {
      return undefined;
    }
    return sanitizedItems;
  }

  if (value && typeof value === 'object') {
    const sanitizedObj = {};
    Object.entries(value).forEach(([key, val]) => {
      if (val === undefined || val === null) {
        return;
      }
      const sanitizedVal = sanitize(val, { parentKey: key });
      if (sanitizedVal === undefined || sanitizedVal === null) {
        return;
      }
      if (typeof sanitizedVal === 'string' && !sanitizedVal.trim()) {
        return;
      }
      if (Array.isArray(sanitizedVal) && sanitizedVal.length === 0 && key !== 'data') {
        return;
      }
      if (typeof sanitizedVal === 'object' && !Array.isArray(sanitizedVal) && Object.keys(sanitizedVal).length === 0) {
        return;
      }
      sanitizedObj[key] = sanitizedVal;
    });
    return Object.keys(sanitizedObj).length > 0 ? sanitizedObj : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

function buildUserData(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const userData = {};

  const externalId = raw.external_id || raw.externalId;
  if (externalId) {
    const normalizedExternalId = Array.isArray(externalId) ? externalId : [externalId];
    const hashed = normalizedExternalId
      .map(value => {
        if (looksLikeSha256(value)) {
          return value.toLowerCase();
        }
        const normalized = normalizeString(value);
        return normalized ? hashSha256(normalized.toLowerCase()) : null;
      })
      .filter(Boolean);
    if (hashed.length) {
      userData.external_id = hashed;
    }
  }

  if (raw.fbp) {
    userData.fbp = String(raw.fbp);
  }

  if (raw.fbc) {
    userData.fbc = String(raw.fbc);
  }

  const emails = raw.em || raw.emails || raw.email;
  if (emails) {
    const normalizedEmails = (Array.isArray(emails) ? emails : [emails])
      .map(value => {
        if (looksLikeSha256(value)) {
          return value.toLowerCase();
        }
        const normalized = normalizeEmail(value);
        return normalized ? hashSha256(normalized) : null;
      })
      .filter(Boolean);
    if (normalizedEmails.length) {
      userData.em = normalizedEmails;
    }
  }

  const phones = raw.ph || raw.phones || raw.phone;
  if (phones) {
    const normalizedPhones = (Array.isArray(phones) ? phones : [phones])
      .map(value => {
        if (looksLikeSha256(value)) {
          return value.toLowerCase();
        }
        const normalized = normalizePhone(value);
        return normalized ? hashSha256(normalized) : null;
      })
      .filter(Boolean);
    if (normalizedPhones.length) {
      userData.ph = normalizedPhones;
    }
  }

  if (raw.client_ip_address || raw.clientIpAddress) {
    userData.client_ip_address = raw.client_ip_address || raw.clientIpAddress;
  }

  if (raw.client_user_agent || raw.clientUserAgent) {
    userData.client_user_agent = raw.client_user_agent || raw.clientUserAgent;
  }

  if (raw.zip || raw.zip_hash || raw.zipHash) {
    const zipValue = raw.zip || raw.zip_hash || raw.zipHash;
    const normalizedZip = looksLikeSha256(zipValue)
      ? zipValue.toLowerCase()
      : hashSha256(String(zipValue));
    if (normalizedZip) {
      userData.zip = [normalizedZip];
    }
  }

  if (raw.fn) {
    const firstNames = Array.isArray(raw.fn) ? raw.fn : [raw.fn];
    const hashed = firstNames
      .map(value => {
        if (looksLikeSha256(value)) {
          return value.toLowerCase();
        }
        const normalized = normalizeString(value);
        return normalized ? hashSha256(normalized.toLowerCase()) : null;
      })
      .filter(Boolean);
    if (hashed.length) {
      userData.fn = hashed;
    }
  }

  if (raw.ln) {
    const lastNames = Array.isArray(raw.ln) ? raw.ln : [raw.ln];
    const hashed = lastNames
      .map(value => {
        if (looksLikeSha256(value)) {
          return value.toLowerCase();
        }
        const normalized = normalizeString(value);
        return normalized ? hashSha256(normalized.toLowerCase()) : null;
      })
      .filter(Boolean);
    if (hashed.length) {
      userData.ln = hashed;
    }
  }

  return sanitize(userData) || {};
}

function normalizeContents(contents = [], value = null) {
  if (!Array.isArray(contents)) {
    return [];
  }

  return contents
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id = normalizeString(item.id);
      if (!id) {
        return null;
      }
      const quantityRaw = item.quantity;
      const quantity = Number.isFinite(Number(quantityRaw)) && Number(quantityRaw) > 0
        ? Number(quantityRaw)
        : 1;
      const itemPriceRaw = item.item_price !== undefined ? Number(item.item_price) : Number(value);
      const itemPrice = Number.isFinite(itemPriceRaw) && itemPriceRaw >= 0 ? Number(itemPriceRaw) : null;
      const sanitized = { id, quantity };
      if (itemPrice !== null) {
        sanitized.item_price = Number(itemPrice.toFixed(2));
      }
      if (item.item_category) {
        const category = normalizeString(item.item_category);
        if (category) {
          sanitized.item_category = category;
        }
      }
      return sanitized;
    })
    .filter(Boolean);
}

function buildCustomData(event = {}) {
  const { event_name: eventName, custom_data: incomingCustom = {}, purchase = null } = event || {};
  const customData = { ...incomingCustom };

  if (eventName === 'Purchase') {
    const purchaseData = purchase || {};
    const normalizedValue = Number.isFinite(Number(purchaseData.value)) ? Number(purchaseData.value) : null;
    const currencyRaw = normalizeString(purchaseData.currency || customData.currency);
    const currency = currencyRaw ? currencyRaw.toUpperCase() : null;
    if (normalizedValue !== null) {
      customData.value = Number(normalizedValue.toFixed(2));
    }
    if (currency) {
      customData.currency = currency;
    }
    const transactionId = normalizeString(purchaseData.transaction_id || customData.transaction_id);
    if (transactionId) {
      customData.transaction_id = transactionId;
    }

    const contentsSource = purchaseData.contents || customData.contents || [];
    const normalizedContents = normalizeContents(contentsSource, normalizedValue);
    if (normalizedContents.length) {
      customData.contents = normalizedContents;
    }

    const contentIdsSource = purchaseData.content_ids || customData.content_ids || [];
    const contentIds = Array.isArray(contentIdsSource)
      ? contentIdsSource.map(id => normalizeString(id)).filter(Boolean)
      : [];
    if (contentIds.length) {
      customData.content_ids = contentIds;
    } else if (normalizedContents.length) {
      customData.content_ids = normalizedContents.map(item => item.id);
    }

    const contentType = normalizeString(purchaseData.content_type || customData.content_type);
    if (contentType) {
      customData.content_type = contentType;
    } else if (customData.contents && customData.contents.length > 1) {
      customData.content_type = 'product_group';
    } else if (customData.contents && customData.contents.length === 1) {
      customData.content_type = 'product';
    }
  }

  return sanitize(customData) || {};
}

function resolveEventTime(event = {}) {
  const { client_timestamp: clientTimestamp, event_time: eventTime } = event || {};
  const now = Math.floor(Date.now() / 1000);
  if (typeof clientTimestamp === 'number' && Number.isFinite(clientTimestamp) && clientTimestamp > 0) {
    return Math.floor(clientTimestamp);
  }
  if (typeof eventTime === 'number' && Number.isFinite(eventTime) && eventTime > 0) {
    return Math.floor(eventTime);
  }
  return now;
}

function normalizeActionSource(actionSource) {
  if (actionSource === 'system_generated') {
    return 'system_generated';
  }
  if (typeof actionSource === 'string' && actionSource.trim()) {
    return actionSource.trim();
  }
  return 'website';
}

function stripForbiddenKeys(eventData = {}) {
  const sanitized = { ...eventData };
  FORBIDDEN_ROOT.forEach(key => {
    if (key in sanitized) {
      delete sanitized[key];
    }
  });
  return sanitized;
}

function buildCapiPayload(event = {}) {
  if (!event || typeof event !== 'object') {
    throw new Error('Event payload must be an object');
  }

  const eventName = event.event_name;
  if (!eventName) {
    throw new Error('event_name is required');
  }

  const eventTime = resolveEventTime(event);
  const actionSource = normalizeActionSource(event.action_source);
  const userData = sanitize(event.user_data || {});
  const customData = event.custom_data !== undefined ? sanitize(event.custom_data) : undefined;

  const baseEvent = stripForbiddenKeys({
    event_name: eventName,
    event_time: eventTime,
    action_source: actionSource,
    event_id: event.event_id || undefined,
    event_source_url: event.event_source_url || undefined,
    opt_out: event.opt_out || undefined,
    data_processing_options: event.data_processing_options || undefined,
    data_processing_options_country: event.data_processing_options_country || undefined,
    data_processing_options_state: event.data_processing_options_state || undefined,
    user_data: userData || undefined,
    custom_data: customData || undefined
  });

  const sanitizedEvent = sanitize(baseEvent) || {};

  return {
    data: [sanitizedEvent]
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildLogSummary(event = {}) {
  const userData = event.user_data || {};
  return {
    event_name: event.event_name || null,
    event_id: event.event_id || null,
    action_source: event.action_source || null,
    has_fbp: Boolean(userData.fbp),
    has_fbc: Boolean(userData.fbc),
    has_ip: Boolean(userData.client_ip_address),
    has_ua: Boolean(userData.client_user_agent)
  };
}

async function sendToMetaCapi(payload, { pixelId, token, testEventCode = null, context = {} } = {}) {
  if (!pixelId || !token) {
    console.error('[Meta CAPI] error', {
      event_name: payload?.data?.[0]?.event_name || null,
      event_id: payload?.data?.[0]?.event_id || null,
      reason: 'missing_credentials'
    });
    return { success: false, error: 'missing_credentials' };
  }

  const preparedPayload = sanitize({ ...payload });
  if (!preparedPayload || !Array.isArray(preparedPayload.data) || !preparedPayload.data.length) {
    return { success: false, error: 'invalid_payload' };
  }

  const nestedTestEventCodeDetected = Array.isArray(preparedPayload.data)
    ? preparedPayload.data.some(item => item && typeof item === 'object' && 'test_event_code' in item)
    : false;

  if (nestedTestEventCodeDetected) {
    preparedPayload.data = preparedPayload.data.map(item => {
      if (!item || typeof item !== 'object') {
        return item;
      }
      if (!('test_event_code' in item)) {
        return item;
      }
      const { test_event_code: _ignoredTestCode, ...rest } = item;
      return rest;
    });
    console.warn('[Meta CAPI] WARN: test_event_code encontrado dentro de data[]. Movido para raiz.');
  }

  const eventData = preparedPayload.data[0];

  const normalizedOverrideTestCode = normalizeString(testEventCode);
  const normalizedPayloadTestCode = normalizeString(preparedPayload.test_event_code);
  const resolvedTestEventCode =
    normalizedOverrideTestCode || (ENABLE_TEST_EVENTS ? normalizedPayloadTestCode || TEST_EVENT_CODE_ENV : normalizedOverrideTestCode) || null;

  if (resolvedTestEventCode) {
    preparedPayload.test_event_code = resolvedTestEventCode;
  } else if (preparedPayload.test_event_code) {
    delete preparedPayload.test_event_code;
  }

  const summary = buildLogSummary(eventData);
  const eventTimeUnix = typeof eventData.event_time === 'number' ? eventData.event_time : null;
  const eventTimeIso = eventTimeUnix ? new Date(eventTimeUnix * 1000).toISOString() : null;
  const userDataFieldsCount = Object.keys(eventData.user_data || {}).length;
  const customDataFieldsCount = eventData.custom_data ? Object.keys(eventData.custom_data).length : 0;

  console.info('[Meta CAPI] ready', {
    ...summary,
    test_event_code: preparedPayload.test_event_code || null,
    request_id: context.request_id || null,
    source: context.source || null
  });

  const encodedPixelId = encodeURIComponent(pixelId);
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${encodedPixelId}/events`;
  const url = `${endpoint}?access_token=${encodeURIComponent(token)}`;

  console.info('[Meta CAPI] sending', {
    pixel_id: pixelId,
    endpoint,
    event_name: eventData.event_name || null,
    event_id: eventData.event_id || null,
    action_source: eventData.action_source || null,
    test_event_code: preparedPayload.test_event_code || null,
    event_time_unix: eventTimeUnix,
    event_time_iso: eventTimeIso,
    user_data_fields: userDataFieldsCount,
    custom_data_fields: customDataFieldsCount
  });

  const attempts = [200, 500, 1000];
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const response = await axios.post(url, preparedPayload, { timeout: 10000 });
      console.info('[Meta CAPI] response:summary', {
        status: response.status,
        fbtrace_id: response.data?.fbtrace_id || null,
        events_received: response.data?.events_received ?? null,
        matched: response.data?.matched ?? null,
        event_name: eventData.event_name || null,
        event_id: eventData.event_id || null
      });
      if (preparedPayload.test_event_code) {
        console.info('[Meta CAPI] response:full (test_event_code active)', response.data);
      }
      return { success: true, response: response.data };
    } catch (error) {
      const metaError = error.response?.data?.error || null;
      console.error('[Meta CAPI] error', {
        status: error.response?.status || null,
        message: error.message,
        fbtrace_id: error.response?.data?.fbtrace_id || null
      });
      if (preparedPayload.test_event_code && error.response?.data) {
        console.error('[Meta CAPI] error:full (test_event_code active)', error.response.data);
      }

      if (!metaError?.is_transient || index === attempts.length - 1) {
        return { success: false, error: error.message, details: metaError };
      }

      await delay(attempts[index]);
    }
  }

  return { success: false, error: 'unknown_error' };
}

module.exports = {
  buildUserData,
  buildCustomData,
  sanitize,
  buildCapiPayload,
  sendToMetaCapi
};
