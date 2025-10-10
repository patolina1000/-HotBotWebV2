const axios = require('axios');
const crypto = require('crypto');

const GRAPH_VERSION = 'v19.0';
const FORBIDDEN_ROOT = new Set(['transaction_id', 'currency', 'value']);
const ENABLE_TEST_EVENTS = process.env.ENABLE_TEST_EVENTS === 'true';
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

function clampEventTime(inputUnix) {
  const nowSec = Math.floor(Date.now() / 1000);
  const sevenDaysSec = 7 * 24 * 60 * 60;
  const minAllowed = nowSec - sevenDaysSec;
  const maxAllowed = nowSec;

  let src = (typeof inputUnix === 'number' && Number.isFinite(inputUnix))
    ? Math.floor(inputUnix)
    : null;
  let reason = 'ok';

  if (src == null) {
    src = nowSec;
    reason = 'missing_or_invalid -> set_now';
  } else if (src > maxAllowed) {
    src = maxAllowed;
    reason = 'future -> clamped_to_now';
  } else if (src < minAllowed) {
    src = minAllowed;
    reason = 'older_than_7d -> clamped_to_7d_ago';
  }

  return { unix: src, iso: new Date(src * 1000).toISOString(), reason };
}

function normalize(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function normalizeTestEventCode(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const stringified = String(value).trim();
  return stringified ? stringified : null;
}

function resolveTestEventCode(req, queryObj) {
  const override =
    req?.headers?.['x-test-event-code'] ||
    req?.body?.test_event_code ||
    (typeof req?.query?.test_event_code !== 'undefined' ? req.query.test_event_code : queryObj?.test_event_code);

  const envCode =
    process.env.TEST_EVENT_CODE ||
    process.env.FB_TEST_EVENT_CODE ||
    null;

  return { override: override || null, envCode };
}

function buildPayload(event = {}) {
  const eventCopy = event && typeof event === 'object' ? { ...event } : {};
  const body = { data: [eventCopy] };
  let nestedTestEventCode = null;

  if ('test_event_code' in eventCopy) {
    nestedTestEventCode = eventCopy.test_event_code;
    delete eventCopy.test_event_code;
    console.warn('[Meta CAPI] WARN: test_event_code encontrado dentro do evento; movendo para o corpo raiz.');
  }

  return { body, nestedTestEventCode: normalizeTestEventCode(nestedTestEventCode) };
}

function logRequest(url, body, meta = {}) {
  const summary = {
    pixel_id: meta.pixel_id,
    endpoint: url,
    event_name: meta.event_name,
    event_id: meta.event_id,
    action_source: meta.action_source,
    has_test_event_code: !!body.test_event_code
  };

  const extraKeys = [
    'event_time_unix',
    'event_time_iso',
    'event_time_in',
    'event_time_final_unix',
    'event_time_final_iso',
    'event_time_adjust_reason',
    'user_data_fields',
    'custom_data_fields'
  ];
  extraKeys.forEach(key => {
    if (meta[key] !== undefined) {
      summary[key] = meta[key];
    }
  });

  console.info('[Meta CAPI] sending', summary);
  try {
    const pretty = JSON.stringify(body, null, 2);
    console.info('[Meta CAPI] request:body\n' + pretty);
  } catch (e) {
    console.warn('[Meta CAPI] request:body stringify failed', { err: e?.message });
  }
}

async function postToMeta({ pixelId, token, body }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`;
  try {
    const resp = await axios.post(url, body, {
      timeout: 1500,
      params: { access_token: token }
    });
    console.info('[Meta CAPI] response:summary', {
      status: resp.status,
      fbtrace_id: resp.data?.fbtrace_id ?? null,
      events_received: resp.data?.events_received ?? null,
      matched: resp.data?.matched ?? null
    });
    try {
      console.info('[Meta CAPI] response:body\n' + JSON.stringify(resp.data, null, 2));
    } catch (stringifyError) {
      console.warn('[Meta CAPI] response:body stringify failed', { err: stringifyError?.message });
    }
    return resp;
  } catch (err) {
    const data = err.response?.data;
    console.error('[Meta CAPI] error:summary', {
      status: err.response?.status ?? null,
      message: err.message,
      fbtrace_id: data?.fbtrace_id ?? null
    });
    try {
      if (data) {
        console.error('[Meta CAPI] error:body\n' + JSON.stringify(data, null, 2));
      }
    } catch (stringifyError) {
      console.warn('[Meta CAPI] error:body stringify failed', { err: stringifyError?.message });
    }
    throw err;
  }
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

  // 🔥 Adicionar campos de geolocalização (city, state, zip, country)
  // NOTA: Estes campos devem vir já normalizados de processGeoData()
  // Aqui apenas hasheamos os valores normalizados
  const geoFieldsToHash = [];
  
  if (raw.ct || raw.city) {
    const cityValue = raw.ct || raw.city;
    const normalizedCity = normalizeString(cityValue);
    if (normalizedCity) {
      const hashedCity = looksLikeSha256(cityValue) 
        ? cityValue.toLowerCase() 
        : hashSha256(normalizedCity.toLowerCase());
      if (hashedCity) {
        userData.ct = [hashedCity];
        geoFieldsToHash.push(`ct: ${hashedCity.substring(0, 8)}...`);
      }
    }
  }

  if (raw.st || raw.state) {
    const stateValue = raw.st || raw.state;
    const normalizedState = normalizeString(stateValue);
    if (normalizedState) {
      const hashedState = looksLikeSha256(stateValue)
        ? stateValue.toLowerCase()
        : hashSha256(normalizedState.toLowerCase());
      if (hashedState) {
        userData.st = [hashedState];
        geoFieldsToHash.push(`st: ${hashedState.substring(0, 8)}...`);
      }
    }
  }

  if (raw.zp || raw.zip_code || raw.postal_code) {
    const zipValue = raw.zp || raw.zip_code || raw.postal_code;
    // ZIP code deve ser apenas dígitos antes de hashear
    const normalizedZip = normalizeString(zipValue);
    if (normalizedZip) {
      const digitsOnly = normalizedZip.replace(/\D+/g, '');
      if (digitsOnly) {
        const hashedZip = looksLikeSha256(zipValue)
          ? zipValue.toLowerCase()
          : hashSha256(digitsOnly);
        if (hashedZip) {
          userData.zp = [hashedZip];
          geoFieldsToHash.push(`zp: ${hashedZip.substring(0, 8)}...`);
        }
      }
    }
  }

  if (raw.country) {
    const countryValue = raw.country;
    const normalizedCountry = normalizeString(countryValue);
    if (normalizedCountry) {
      const hashedCountry = looksLikeSha256(countryValue)
        ? countryValue.toLowerCase()
        : hashSha256(normalizedCountry.toLowerCase());
      if (hashedCountry) {
        userData.country = [hashedCountry];
        geoFieldsToHash.push(`country: ${hashedCountry.substring(0, 8)}...`);
      }
    }
  }

  // 🔍 Log dos campos geo hasheados (se houver)
  if (geoFieldsToHash.length > 0) {
    console.log('[LeadCAPI][HASH] Campos geo hasheados (SHA-256)', {
      hashed_fields: geoFieldsToHash,
      count: geoFieldsToHash.length
    });
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

function normalizeActionSource(actionSource, { eventName } = {}) {
  const trimmed = typeof actionSource === 'string' ? actionSource.trim() : null;

  if (eventName === 'Lead') {
    let candidate = trimmed || resolveLeadActionSource();

    if (!isValidActionSource(candidate)) {
      candidate = resolveLeadActionSource();
    }

    if (candidate === 'system_generated') {
      console.warn('[Meta CAPI] WARN: Lead com action_source=system_generated; substituindo para "chat".');
      candidate = 'chat';
    }

    if (!isValidActionSource(candidate)) {
      candidate = 'chat';
    }

    return candidate;
  }

  if (trimmed === 'system_generated') {
    return 'system_generated';
  }
  if (trimmed) {
    return trimmed;
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
  const actionSource = normalizeActionSource(event.action_source, { eventName });
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

  const payloadLevelTestEventCode = normalizeTestEventCode(preparedPayload.test_event_code);
  if (preparedPayload && typeof preparedPayload === 'object' && 'test_event_code' in preparedPayload) {
    delete preparedPayload.test_event_code;
  }

  const eventData = preparedPayload.data[0];
  if (!eventData || typeof eventData !== 'object') {
    return { success: false, error: 'invalid_event' };
  }

  const { body, nestedTestEventCode } = buildPayload(eventData);

  const sanitizedBody = sanitize(body);
  if (!sanitizedBody || !Array.isArray(sanitizedBody.data) || !sanitizedBody.data.length) {
    return { success: false, error: 'invalid_payload' };
  }

  const event = sanitizedBody.data[0];
  const summary = buildLogSummary(event);
  const eventTimeUnix = typeof event.event_time === 'number' ? event.event_time : null;
  const eventTimeIso = eventTimeUnix ? new Date(eventTimeUnix * 1000).toISOString() : null;
  const userDataFieldsCount = Object.keys(event.user_data || {}).length;
  const customDataFieldsCount = event.custom_data ? Object.keys(event.custom_data).length : 0;
  const eventTimeContext = context.event_time_meta || {};
  const isLeadEvent = event.event_name === 'Lead';

  const fallbackOverride = normalizeTestEventCode(
    context.bodyTestEventCode ??
      payloadLevelTestEventCode ??
      nestedTestEventCode ??
      testEventCode
  );

  const resolverQuery = { ...(context.query || {}) };
  if (typeof resolverQuery.test_event_code === 'undefined' || resolverQuery.test_event_code === null) {
    resolverQuery.test_event_code = fallbackOverride;
  }

  const requestForResolver = context.req || null;
  const { override, envCode } = resolveTestEventCode(requestForResolver, resolverQuery);
  const normalizedOverride = normalizeTestEventCode(override) || fallbackOverride;

  let finalTestEventCode = null;
  let testEventCodeSource = 'none';

  if (normalizedOverride) {
    finalTestEventCode = String(normalizedOverride);
    testEventCodeSource = 'override';
  } else {
    const normalizedEnvCode = normalizeTestEventCode(envCode);
    if (ENABLE_TEST_EVENTS === true && normalizedEnvCode) {
      finalTestEventCode = String(normalizedEnvCode);
      testEventCodeSource = 'env';
    }
  }

  if (finalTestEventCode) {
    sanitizedBody.test_event_code = finalTestEventCode;
  } else if ('test_event_code' in sanitizedBody) {
    delete sanitizedBody.test_event_code;
  }

  console.info('[Meta CAPI] ready', {
    ...summary,
    test_event_code: sanitizedBody.test_event_code || null,
    request_id: context.request_id || null,
    source: context.source || null
  });

  console.debug('[Meta CAPI] ready', {
    has_test_event_code: Boolean(sanitizedBody.test_event_code),
    test_event_code_source: testEventCodeSource,
    action_source: event.action_source || null,
    event_time: event.event_time || null,
    event_name: event.event_name || null
  });

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`;

  if (isLeadEvent) {
    const hasTestEventCode = Boolean(sanitizedBody.test_event_code);
    console.debug(
      `[CAPI-LEAD] endpoint=${endpoint} has_test_event_code=${hasTestEventCode} action_source=${
        event.action_source || null
      } event_time=${eventTimeUnix ?? null} event_id=${event.event_id || null}`
    );
  }

  // 🔍 Log detalhado dos campos user_data
  const userDataKeys = Object.keys(event.user_data || {});
  const geoFields = userDataKeys.filter(key => ['ct', 'st', 'zp', 'country'].includes(key));
  const ipUaFields = userDataKeys.filter(key => ['client_ip_address', 'client_user_agent'].includes(key));
  const otherFields = userDataKeys.filter(key => !['ct', 'st', 'zp', 'country', 'client_ip_address', 'client_user_agent'].includes(key));

  console.log('[LeadCAPI][REQUEST] Resumo do envio', {
    pixel_id: pixelId,
    event_name: event.event_name || null,
    event_id: event.event_id || null,
    action_source: event.action_source || null,
    has_test_event_code: Boolean(sanitizedBody.test_event_code),
    event_time: eventTimeUnix
  });

  console.log('[LeadCAPI][USERDATA] Campos enviados', {
    total_fields: userDataFieldsCount,
    geo_fields: geoFields,
    geo_count: geoFields.length,
    ip_ua_fields: ipUaFields,
    ip_ua_count: ipUaFields.length,
    other_fields: otherFields,
    other_count: otherFields.length
  });

  logRequest(endpoint, sanitizedBody, {
    pixel_id: pixelId,
    event_name: event.event_name || null,
    event_id: event.event_id || null,
    action_source: event.action_source || null,
    event_time_unix: eventTimeUnix,
    event_time_iso: eventTimeIso,
    event_time_in: eventTimeContext.input ?? null,
    event_time_final_unix: eventTimeContext.final_unix ?? eventTimeUnix,
    event_time_final_iso: eventTimeContext.final_iso ?? eventTimeIso,
    event_time_adjust_reason: eventTimeContext.reason || 'ok',
    user_data_fields: userDataFieldsCount,
    custom_data_fields: customDataFieldsCount
  });

  const attempts = [200, 500, 1000];
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const response = await postToMeta({ pixelId, token, body: sanitizedBody });
      
      // 🔍 Log de resposta para eventos Lead
      if (isLeadEvent) {
        const eventsReceived = response.data?.events_received ?? null;
        const fbtraceId = response.data?.fbtrace_id ?? null;
        console.debug(
          `[CAPI-LEAD][RES] status=${response.status} events_received=${eventsReceived} fbtrace_id=${fbtraceId}`
        );

        // 📊 Audit log final
        console.log('[LeadCAPI][RESPONSE] Sucesso', {
          status: response.status,
          events_received: eventsReceived,
          fbtrace_id: fbtraceId ? fbtraceId.substring(0, 10) + '...' : null
        });

        console.log('[LeadCAPI][AUDIT] Resumo do evento enviado', {
          has_user_data: Boolean(event.user_data),
          user_data_field_count: userDataFieldsCount,
          has_geo_fields: geoFields.length > 0,
          geo_fields_sent: geoFields,
          has_ip_ua: ipUaFields.length > 0,
          ip_ua_fields_sent: ipUaFields,
          test_event_code: sanitizedBody.test_event_code || null,
          action_source: event.action_source || null,
          event_source_url: event.event_source_url || null
        });
      }
      
      return { success: true, response: response.data, resolvedTestEventCode: finalTestEventCode };
    } catch (error) {
      if (isLeadEvent) {
        const status = error.response?.status ?? null;
        const eventsReceived = error.response?.data?.events_received ?? null;
        const fbtraceId = error.response?.data?.fbtrace_id ?? null;
        const errorMsg = error.response?.data?.error?.message ?? error.message;
        
        console.debug(
          `[CAPI-LEAD][RES] status=${status} events_received=${eventsReceived} fbtrace_id=${fbtraceId}`
        );

        // 📊 Audit log de erro
        console.error('[LeadCAPI][RESPONSE] Erro', {
          status,
          error_message: errorMsg ? errorMsg.substring(0, 100) : null,
          fbtrace_id: fbtraceId ? fbtraceId.substring(0, 10) + '...' : null
        });

        console.log('[LeadCAPI][AUDIT] Falha no envio', {
          has_user_data: Boolean(event.user_data),
          user_data_field_count: userDataFieldsCount,
          geo_fields_attempted: geoFields,
          ip_ua_fields_attempted: ipUaFields
        });
      }
      
      const metaError = error.response?.data?.error || null;
      if (!metaError?.is_transient || index === attempts.length - 1) {
        return { success: false, error: error?.message || 'request_failed', details: metaError };
      }
      await delay(attempts[index]);
    }
  }

  return { success: false, error: 'unknown_error' };
}

module.exports = {
  clampEventTime,
  buildUserData,
  buildCustomData,
  sanitize,
  buildCapiPayload,
  sendToMetaCapi
};
