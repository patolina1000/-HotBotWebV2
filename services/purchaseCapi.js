const axios = require('axios');
const { hashEmail, hashPhone, hashCpf, hashName } = require('../helpers/purchaseFlow');

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
    price_cents,
    currency = 'BRL',
    // Dados da página de obrigado
    email,
    phone,
    // Dados de tracking
    fbp,
    fbc,
    client_ip_address,
    client_user_agent,
    event_source_url,
    // UTMs
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    // Timestamp
    event_time = Math.floor(Date.now() / 1000)
  } = purchaseData;

  console.log(`[PURCHASE-CAPI] 📦 Preparando payload Purchase`, {
    event_id,
    transaction_id,
    has_email: !!email,
    has_phone: !!phone,
    has_payer_name: !!payer_name,
    has_payer_cpf: !!payer_cpf,
    price_cents,
    currency
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

  // Montar user_data com dados hasheados
  const userData = {};

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

  // CPF como external_id (hasheado)
  if (payer_cpf) {
    const hashedCpf = hashCpf(payer_cpf);
    if (hashedCpf) {
      userData.external_id = [hashedCpf];
      console.log('[PURCHASE-CAPI] ✅ CPF hasheado como external_id');
    }
  }

  // Nome (primeiro e último, hasheados)
  if (payer_name) {
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
  if (price_cents !== null && price_cents !== undefined) {
    // Converter centavos para reais
    customData.value = parseFloat((price_cents / 100).toFixed(2));
    customData.currency = currency;
    console.log('[PURCHASE-CAPI] ✅ Valor convertido:', { 
      price_cents, 
      value_reais: customData.value, 
      currency 
    });
  }

  // Transaction ID
  if (transaction_id) {
    customData.transaction_id = transaction_id;
  }

  // UTMs
  if (utm_source) customData.utm_source = utm_source;
  if (utm_medium) customData.utm_medium = utm_medium;
  if (utm_campaign) customData.utm_campaign = utm_campaign;
  if (utm_term) customData.utm_term = utm_term;
  if (utm_content) customData.utm_content = utm_content;

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

  const payload = {
    data: [eventData],
    access_token: FB_PIXEL_TOKEN
  };

  const url = `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FB_PIXEL_ID}/events`;

  console.log('[PURCHASE-CAPI] 🚀 Enviando Purchase para Meta CAPI', {
    event_id,
    transaction_id,
    user_data_fields: Object.keys(userData),
    custom_data_fields: Object.keys(customData),
    url
  });

  // Tentar enviar com retry
  const maxAttempts = 3;
  const baseDelay = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(url, payload, { timeout: 10000 });
      
      console.log('[PURCHASE-CAPI] ✅ Purchase enviado com sucesso', {
        event_id,
        transaction_id,
        status: response.status,
        attempt,
        events_received: response.data?.events_received,
        fbtrace_id: response.data?.fbtrace_id
      });

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

      console.error('[PURCHASE-CAPI] ❌ Erro ao enviar Purchase', {
        event_id,
        transaction_id,
        status: status || 'network_error',
        attempt,
        error: error.message,
        response_data: responseData
      });

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
