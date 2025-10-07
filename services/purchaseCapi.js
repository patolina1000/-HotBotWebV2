const axios = require('axios');
const { toIntOrNull, centsToValue } = require('../helpers/price');
const { getMetaTestEventCode } = require('../utils/metaTestEvent');
const {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeExternalId,
  buildAdvancedMatching,
  buildNormalizationSnapshot,
  normalizeUrlForEventSource,
  ensureArray
} = require('../shared/purchaseNormalization');

const FACEBOOK_API_VERSION = 'v19.0';
const { FB_PIXEL_ID, FB_PIXEL_TOKEN } = process.env;

/**
 * Serviço para enviar Purchase via Meta CAPI
 * Combina dados do webhook PushinPay + dados da página de obrigado
 */

/**
 * Envia evento Purchase via Meta CAPI
 * @param {Object} purchaseData - Dados combinados do purchase
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendPurchaseEvent(purchaseData, options = {}) {
  if (!FB_PIXEL_ID || !FB_PIXEL_TOKEN) {
    console.error('[PURCHASE-CAPI] ❌ Pixel ID/Token não configurados');
    return { success: false, error: 'pixel_not_configured' };
  }

  const {
    event_id,
    transaction_id,
    // Dados do webhook PushinPay
    payer_name,
    payer_cpf,
    external_id, // Hash do CPF
    price_cents: priceCentsInput,
    currency = 'BRL',
    // Dados da página de obrigado
    email,
    phone,
    first_name,
    last_name,
    // Dados de tracking
    fbp,
    fbc,
    fbclid,
    client_ip_address,
    client_user_agent,
    event_source_url,
    contents,
    content_ids,
    content_type,
    content_name,
    // UTMs
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    // Timestamp
    event_time = Math.floor(Date.now() / 1000)
  } = purchaseData;

  const { config: providedConfig = null } = options || {};

  const price_cents = toIntOrNull(priceCentsInput);
  const value = centsToValue(price_cents);
  const parsedEventTime = Number(event_time);
  const eventTimeUnix = Number.isFinite(parsedEventTime)
    ? Math.floor(parsedEventTime)
    : Math.floor(Date.now() / 1000);

  // Validações mínimas
  if (!transaction_id) {
    console.error('[PURCHASE-CAPI] ❌ transaction_id é obrigatório');
    return { success: false, error: 'transaction_id_required' };
  }

  const resolvedEventId = transaction_id ? `pur:${transaction_id}` : event_id || null;

  if (!event_id) {
    console.warn('[PURCHASE-CAPI] ⚠️ event_id ausente, usando valor baseado na transação', {
      resolved_event_id: resolvedEventId,
      transaction_id
    });
  }

  if (event_id && resolvedEventId !== event_id) {
    console.warn('[PURCHASE-CAPI] ⚠️ event_id substituído pelo estável baseado na transação', {
      provided_event_id: event_id,
      resolved_event_id: resolvedEventId,
      transaction_id
    });
  }

  if (!resolvedEventId) {
    console.error('[PURCHASE-CAPI] ❌ event_id não pôde ser determinado', {
      provided_event_id: event_id,
      transaction_id
    });
    return { success: false, error: 'event_id_unavailable' };
  }

  // 🎯 VALIDAÇÃO CRÍTICA: Bloquear envio se value ausente ou 0
  if (!price_cents || price_cents === 0) {
    console.error('[PURCHASE-CAPI] ❌ BLOQUEADO: price_cents ausente ou zero', {
      event_id: resolvedEventId,
      transaction_id,
      price_cents
    });
    return { success: false, error: 'value_missing_or_zero', status: 422 };
  }

  console.log('[PURCHASE-CAPI] 📦 Preparando payload Purchase', {
    event_id,
    resolved_event_id: resolvedEventId,
    transaction_id,
    email,
    phone,
    payer_name,
    payer_cpf,
    first_name,
    last_name,
    price_cents,
    value,
    currency,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    fbclid,
    event_source_url,
    contents,
    content_ids,
    content_type
  });

  console.log(
    `[DEBUG] price_cents(type)=${typeof price_cents} value(type)=${typeof value} price_cents=${price_cents} value=${value}`
  );

  // 🎯 CORREÇÃO: Se advanced_matching já vem no payload (do browser), usar direto
  // Se não, gerar a partir dos dados normalizados
  let advancedMatching;
  let normalizedUserData;

  if (purchaseData.advanced_matching && Object.keys(purchaseData.advanced_matching).length > 0) {
    // Usar advanced_matching que já vem com hashes SHA256 corretos do browser
    advancedMatching = purchaseData.advanced_matching;
    
    // Verificar tamanho dos hashes
    const hashLengths = {};
    for (const [key, value] of Object.entries(advancedMatching)) {
      hashLengths[key] = typeof value === 'string' ? value.length : 'not_string';
    }
    console.log('[ADVANCED-MATCH] usando dados pré-hashados do browser, tamanhos:', hashLengths);
    
    // Se os hashes estão muito longos (> 64 chars), algo está errado - regenerar
    const hasInvalidHash = Object.values(advancedMatching).some(v => 
      typeof v === 'string' && v.length > 64
    );
    
    if (hasInvalidHash) {
      console.warn('[ADVANCED-MATCH] ⚠️ Hashes inválidos detectados (> 64 chars), regenerando...');
      advancedMatching = null; // Forçar regeneração
    }
  }
  
  if (!advancedMatching) {
    // Gerar hashes a partir dos dados normalizados
    const normalizedUserSource = purchaseData.normalized_user_data || {};
    normalizedUserData = {
      email: normalizedUserSource.email ?? normalizeEmail(email),
      phone: normalizedUserSource.phone ?? normalizePhone(phone),
      first_name: normalizedUserSource.first_name ?? normalizeName(first_name),
      last_name: normalizedUserSource.last_name ?? normalizeName(last_name),
      external_id: normalizedUserSource.external_id ?? normalizeExternalId(external_id || payer_cpf)
    };

    const normalizationSnapshot = buildNormalizationSnapshot(normalizedUserData);
    console.log('[NORMALIZE]', normalizationSnapshot);

    advancedMatching = buildAdvancedMatching(normalizedUserData);
    console.log('[ADVANCED-MATCH] gerado no servidor', advancedMatching);
  }

  const userData = {};

  if (advancedMatching.em) {
    userData.em = ensureArray(advancedMatching.em);
  }
  if (advancedMatching.ph) {
    userData.ph = ensureArray(advancedMatching.ph);
  }
  if (advancedMatching.fn) {
    userData.fn = ensureArray(advancedMatching.fn);
  }
  if (advancedMatching.ln) {
    userData.ln = ensureArray(advancedMatching.ln);
  }
  if (advancedMatching.external_id) {
    userData.external_id = ensureArray(advancedMatching.external_id);
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

  const eventSourceUrlNormalized = event_source_url
    ? normalizeUrlForEventSource(event_source_url) || event_source_url
    : null;

  const customData = {};

  if (typeof value === 'number') {
    customData.value = value;
    console.log('[PURCHASE-CAPI] ✅ Valor convertido:', {
      price_cents,
      value_reais: customData.value,
      currency
    });
  }

  if (currency) {
    customData.currency = currency;
  }

  if (transaction_id) {
    customData.transaction_id = transaction_id;
  }

  const normalizedContents = Array.isArray(contents)
    ? contents.map(item => ({
        id: item?.id || null,
        quantity: item?.quantity ?? 1,
        item_price:
          typeof item?.item_price === 'number'
            ? item.item_price
            : typeof value === 'number'
              ? value
              : null,
        title: item?.title || content_name || null
      }))
    : [];

  const filteredContents = normalizedContents.filter(content => Boolean(content.id));
  if (filteredContents.length > 0) {
    customData.contents = filteredContents;
  }

  const resolvedContentIds = ensureArray(content_ids).filter(Boolean);
  if (resolvedContentIds.length > 0) {
    customData.content_ids = resolvedContentIds;
  } else if (filteredContents.length > 0) {
    customData.content_ids = filteredContents.map(item => item.id).filter(Boolean);
  }

  if (content_type || (filteredContents.length > 0 && !customData.content_type)) {
    customData.content_type = content_type || 'product';
  }

  if (content_name || filteredContents.length > 0) {
    const derivedContentName = content_name || filteredContents.find(item => item?.title)?.title || null;
    if (derivedContentName) {
      customData.content_name = derivedContentName;
    }
  }

  if (fbclid) {
    customData.fbclid = fbclid;
  }

  if (utm_source) customData.utm_source = utm_source;
  if (utm_medium) customData.utm_medium = utm_medium;
  if (utm_campaign) customData.utm_campaign = utm_campaign;
  if (utm_term) customData.utm_term = utm_term;
  if (utm_content) customData.utm_content = utm_content;

  console.log('[PURCHASE-CAPI] 🧾 custom_data montado', customData);

  // Montar payload do evento
  const eventData = {
    event_name: 'Purchase',
    event_time: eventTimeUnix,
    event_id: resolvedEventId,
    action_source: 'website',
    user_data: userData,
    custom_data: customData
  };

  const resolvedEventSourceUrl = eventSourceUrlNormalized || event_source_url || null;
  if (resolvedEventSourceUrl) {
    eventData.event_source_url = resolvedEventSourceUrl;
  }

  console.log('[PURCHASE-CAPI] payload pronto', {
    event_id: resolvedEventId,
    action_source: eventData.action_source,
    event_source_url: eventData.event_source_url || null,
    user_data: userData,
    custom_data: customData
  });

  console.log('[PURCHASE-CAPI] 🧮 user_data final', userData);
  console.log('[PURCHASE-CAPI] 🌐 event_source_url', eventData.event_source_url || null);

  const { code: testEventCode, source: testEventSource } = getMetaTestEventCode(providedConfig);
  const hasTestEventCode = Boolean(testEventCode);
  const hasFbp = Boolean(userData.fbp);
  const hasFbc = Boolean(userData.fbc);
  const hasIp = Boolean(userData.client_ip_address);
  const hasUa = Boolean(userData.client_user_agent);

  console.info('[Meta CAPI] ready', {
    event_name: eventData.event_name,
    event_id: resolvedEventId,
    action_source: eventData.action_source,
    transaction_id,
    has_fbp: hasFbp,
    has_fbc: hasFbc,
    has_ip: hasIp,
    has_ua: hasUa,
    test_event_code: hasTestEventCode ? testEventCode : null,
    test_event_code_source: hasTestEventCode ? testEventSource : null
  });

  const payload = {
    data: [eventData],
    access_token: FB_PIXEL_TOKEN
  };

  if (hasTestEventCode) {
    payload.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;

  console.info(
    `[CAPI-PURCHASE] endpoint=${url} has_test_event_code=${hasTestEventCode} action_source=${eventData.action_source} event_time=${eventData.event_time} event_id=${eventData.event_id}`
  );

  const prettyRequestBody = JSON.stringify(payload, null, 2);
  console.info('[Meta CAPI] request:body');
  console.info(prettyRequestBody);

  // Tentar enviar com retry
  const maxAttempts = 3;
  const baseDelay = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      const responseData = response.data;
      const eventsReceived = responseData?.events_received ?? null;
      const fbtraceId = responseData?.fbtrace_id ?? null;

      console.info('[Meta CAPI] response:summary', {
        status: response.status,
        fbtrace_id: fbtraceId,
        events_received: eventsReceived,
        matched: null
      });
      console.info('[Meta CAPI] response:body');
      console.info(JSON.stringify(responseData ?? {}, null, 2));

      console.info('[PURCHASE-CAPI] sent', {
        success: true,
        status: response.status,
        events_received: eventsReceived,
        fbtrace_id: fbtraceId,
        event_id: resolvedEventId,
        transaction_id,
        test_event_code: hasTestEventCode ? testEventCode : null,
        attempt
      });

      return {
        success: true,
        response: responseData,
        status: response.status,
        attempt,
        event_id: resolvedEventId,
        transaction_id
      };

    } catch (error) {
      const status = error.response?.status;
      const responseData = error.response?.data ?? null;
      const eventsReceived = responseData?.events_received ?? null;
      const fbtraceId = responseData?.fbtrace_id ?? null;

      console.info('[Meta CAPI] response:summary', {
        status: status || 'network_error',
        fbtrace_id: fbtraceId,
        events_received: eventsReceived,
        matched: null
      });
      console.info('[Meta CAPI] response:body');
      console.info(JSON.stringify(responseData ?? { error: error.message }, null, 2));

      // Se for erro de servidor (5xx), retry
      const isRetryable = status && status >= 500 && status < 600;
      if (!isRetryable || attempt === maxAttempts) {
        console.info('[PURCHASE-CAPI] sent', {
          success: false,
          status: status || 'network_error',
          events_received: eventsReceived,
          fbtrace_id: fbtraceId,
          event_id: resolvedEventId,
          transaction_id,
          test_event_code: hasTestEventCode ? testEventCode : null,
          attempt
        });
        return {
          success: false,
          error: error.message,
          status,
          response: responseData,
          attempt,
          event_id: resolvedEventId,
          transaction_id
        };
      }

      // Aguardar antes do próximo retry
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: 'Max retry attempts reached',
    event_id: resolvedEventId,
    transaction_id
  };
}

/**
 * Valida se o token está pronto para enviar Purchase CAPI
 * @param {Object} tokenData - Dados do token
 * @returns {{valid: boolean, reason: string|null}}
 */
function validatePurchaseReadiness(tokenData) {
  if (!tokenData) {
    return { valid: false, reason: 'token_not_found' };
  }

  // Verificar se pixel já foi enviado
  if (!tokenData.pixel_sent) {
    return { valid: false, reason: 'pixel_not_sent' };
  }

  // Verificar se webhook já marcou como pronto
  if (!tokenData.capi_ready) {
    return { valid: false, reason: 'capi_not_ready' };
  }

  // Verificar se já foi enviado
  if (tokenData.capi_sent) {
    return { valid: false, reason: 'already_sent' };
  }

  // Verificar se tem email e telefone
  if (!tokenData.email || !tokenData.phone) {
    return { valid: false, reason: 'missing_email_or_phone' };
  }

  // Verificar se tem dados do webhook
  if (!tokenData.payer_name || !tokenData.payer_cpf) {
    return { valid: false, reason: 'missing_payer_data' };
  }

  return { valid: true, reason: null };
}

module.exports = {
  sendPurchaseEvent,
  validatePurchaseReadiness
};
