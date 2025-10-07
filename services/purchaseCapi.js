const axios = require('axios');
const { hashEmail, hashPhone, hashCpf, hashName, hashSha256 } = require('../helpers/purchaseFlow');
const { toIntOrNull, centsToValue } = require('../helpers/price');

const FACEBOOK_API_VERSION = 'v17.0';
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
async function sendPurchaseEvent(purchaseData) {
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
    // UTMs
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    // Timestamp
    event_time = Math.floor(Date.now() / 1000)
  } = purchaseData;

  const price_cents = toIntOrNull(priceCentsInput);
  const value = centsToValue(price_cents);

  console.log('[PURCHASE-CAPI] 📦 Preparando payload Purchase', {
    event_id,
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

  // Validações mínimas
  if (!event_id) {
    console.error('[PURCHASE-CAPI] ❌ event_id é obrigatório');
    return { success: false, error: 'event_id_required' };
  }

  if (!transaction_id) {
    console.error('[PURCHASE-CAPI] ❌ transaction_id é obrigatório');
    return { success: false, error: 'transaction_id_required' };
  }

  // 🎯 VALIDAÇÃO CRÍTICA: Bloquear envio se value ausente ou 0
  if (!price_cents || price_cents === 0) {
    console.error('[PURCHASE-CAPI] ❌ BLOQUEADO: price_cents ausente ou zero', {
      event_id,
      transaction_id,
      price_cents
    });
    return { success: false, error: 'value_missing_or_zero', status: 422 };
  }

  console.log(
    `[DEBUG] price_cents(type)=${typeof price_cents} value(type)=${typeof value} price_cents=${price_cents} value=${value}`
  );

  // Montar user_data com dados hasheados
  const userData = {};

  console.log('[PURCHASE-CAPI] 👤 user_data (antes do hash)', {
    email,
    phone,
    payer_cpf,
    first_name,
    last_name,
    fbp,
    fbc,
    fbclid,
    client_ip_address,
    client_user_agent
  });

  // Email (hasheado)
  if (email) {
    const hashedEmail = hashEmail(email);
    if (hashedEmail) {
      userData.em = [hashedEmail];
      console.log('[PURCHASE-CAPI] ✅ Email hasheado adicionado');
    }
  }

  // Telefone (hasheado, E.164)
  if (phone) {
    const hashedPhone = hashPhone(phone);
    if (hashedPhone) {
      userData.ph = [hashedPhone];
      console.log('[PURCHASE-CAPI] ✅ Telefone hasheado adicionado');
    }
  }

  // 🎯 external_id: usar hash pré-calculado se disponível, senão hashear CPF
  if (external_id) {
    userData.external_id = [external_id];
    console.log('[PURCHASE-CAPI] ✅ external_id (hash do CPF) adicionado');
  } else if (payer_cpf) {
    const hashedCpf = hashCpf(payer_cpf);
    if (hashedCpf) {
      userData.external_id = [hashedCpf];
      console.log('[PURCHASE-CAPI] ✅ CPF hasheado como external_id (fallback)');
    }
  }

  // Nome (primeiro e último, hasheados)
  if (first_name || last_name) {
    if (first_name) {
      const hashedFirst = hashSha256(first_name);
      if (hashedFirst) {
        userData.fn = [hashedFirst];
      }
    }
    if (last_name) {
      const hashedLast = hashSha256(last_name);
      if (hashedLast) {
        userData.ln = [hashedLast];
      }
    }
    console.log('[PURCHASE-CAPI] ✅ Nome hasheado adicionado', {
      has_fn: Array.isArray(userData.fn),
      has_ln: Array.isArray(userData.ln)
    });
  } else if (payer_name) {
    const { fn, ln } = hashName(payer_name);
    if (fn) userData.fn = [fn];
    if (ln) userData.ln = [ln];
    console.log('[PURCHASE-CAPI] ✅ Nome hasheado adicionado', { has_fn: !!fn, has_ln: !!ln });
  }

  // _fbp e _fbc (NÃO hashear - texto claro)
  if (fbp) {
    userData.fbp = fbp;
    console.log('[PURCHASE-CAPI] ✅ _fbp adicionado');
  }
  if (fbc) {
    userData.fbc = fbc;
    console.log('[PURCHASE-CAPI] ✅ _fbc adicionado');
  }

  // IP e User Agent
  if (client_ip_address) {
    userData.client_ip_address = client_ip_address;
  }
  if (client_user_agent) {
    userData.client_user_agent = client_user_agent;
  }

  // Montar custom_data
  const customData = {};

  // Valor e moeda
  if (currency) {
    customData.currency = currency;
  }

  if (value !== null) {
    customData.value = value;
    console.log('[PURCHASE-CAPI] ✅ Valor convertido:', {
      price_cents,
      value_reais: customData.value,
      currency
    });
  } else if (currency) {
    console.warn('[PURCHASE-CAPI] ⚠️ price_cents ausente, mantendo apenas currency no payload', {
      currency
    });
  }

  // Transaction ID
  if (transaction_id) {
    customData.transaction_id = transaction_id;
  }

  if (Array.isArray(contents) && contents.length > 0) {
    customData.contents = contents.map(item => ({
      ...item,
      item_price: value !== null ? value : item.item_price
    }));
  }

  if (Array.isArray(content_ids) && content_ids.length > 0) {
    customData.content_ids = content_ids;
  }

  if (content_type) {
    customData.content_type = content_type;
  }

  if (fbclid) {
    customData.fbclid = fbclid;
  }

  // UTMs
  if (utm_source) customData.utm_source = utm_source;
  if (utm_medium) customData.utm_medium = utm_medium;
  if (utm_campaign) customData.utm_campaign = utm_campaign;
  if (utm_term) customData.utm_term = utm_term;
  if (utm_content) customData.utm_content = utm_content;

  console.log('[PURCHASE-CAPI] 🧾 custom_data montado', customData);

  // Montar payload do evento
  const eventData = {
    event_name: 'Purchase',
    event_time: event_time,
    event_id: event_id,
    action_source: 'website',
    user_data: userData,
    custom_data: customData
  };

  if (event_source_url) {
    eventData.event_source_url = event_source_url;
  }

  console.log('[PURCHASE-CAPI] 🧮 user_data final', userData);
  console.log('[PURCHASE-CAPI] 🌐 event_source_url', event_source_url);

  const payload = {
    data: [eventData],
    access_token: FB_PIXEL_TOKEN
  };

  const url = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;

  console.log('[PURCHASE-CAPI] payload=', payload);

  // Tentar enviar com retry
  const maxAttempts = 3;
  const baseDelay = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, payload, { timeout: 10000 });

      console.log(
        `[PURCHASE-CAPI] response status=${response.status} attempt=${attempt} event_id=${event_id} transaction_id=${transaction_id} body=`,
        response.data
      );

      return {
        success: true,
        response: response.data,
        status: response.status,
        attempt,
        event_id,
        transaction_id
      };

    } catch (error) {
      const status = error.response?.status;
      const responseData = error.response?.data;

      console.error(
        `[PURCHASE-CAPI] response status=${status || 'network_error'} attempt=${attempt} event_id=${event_id} transaction_id=${transaction_id} body=`,
        responseData
      );

      // Se for erro de servidor (5xx), retry
      const isRetryable = status && status >= 500 && status < 600;
      if (!isRetryable || attempt === maxAttempts) {
        return {
          success: false,
          error: error.message,
          status,
          response: responseData,
          attempt,
          event_id,
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
    event_id,
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
