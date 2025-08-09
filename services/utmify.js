const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const adAccountId = process.env.UTMIFY_AD_ACCOUNT_ID; // ex: '129355640213755'

// Configurações de retry
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 segundo
  maxDelay: 10000, // 10 segundos
  backoffMultiplier: 2
};

/**
 * Função de retry com backoff exponencial
 * @param {Function} fn - Função a ser executada
 * @param {Object} options - Opções de retry
 * @returns {Promise} - Resultado da função
 */
async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = RETRY_CONFIG.maxRetries, baseDelay = RETRY_CONFIG.baseDelay } = options;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Calcular delay com backoff exponencial
      const delay = Math.min(
        baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        RETRY_CONFIG.maxDelay
      );
      
      console.log(`🔄 Tentativa ${attempt + 1} falhou, tentando novamente em ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Valida se o preço exibido é consistente com o preço cobrado
 * @param {number} displayedPriceCents - Preço exibido em centavos
 * @param {number} chargedPriceCents - Preço cobrado em centavos
 * @returns {Object} - Resultado da validação
 */
function validatePriceConsistency(displayedPriceCents, chargedPriceCents) {
  if (!displayedPriceCents || !chargedPriceCents) {
    return { isValid: false, warning: 'Preços não disponíveis para validação' };
  }
  
  const difference = Math.abs(displayedPriceCents - chargedPriceCents);
  const differencePercent = (difference / displayedPriceCents) * 100;
  
  if (difference > 0) {
    return {
      isValid: false,
      warning: `⚠️ DIVERGÊNCIA DE PREÇO: Exibido: R$ ${(displayedPriceCents / 100).toFixed(2)}, Cobrado: R$ ${(chargedPriceCents / 100).toFixed(2)} (diferença: R$ ${(difference / 100).toFixed(2)} - ${differencePercent.toFixed(2)}%)`
    };
  }
  
  return { isValid: true, warning: null };
}

function formatDateUTC(date) {
  const pad = n => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    '-' +
    pad(date.getUTCMonth() + 1) +
    '-' +
    pad(date.getUTCDate()) +
    ' ' +
    pad(date.getUTCHours()) +
    ':' +
    pad(date.getUTCMinutes()) +
    ':' +
    pad(date.getUTCSeconds())
  );
}

function gerarEmailFake() {
  return `${uuidv4()}@example.org`;
}

function sanitizeName(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// 🔥 NOVA FUNÇÃO: Processar UTM no formato nome|id (similar à do server.js)
function processUTMForUtmify(utmValue) {
  if (!utmValue) return { name: null, id: null, formatted: null };
  
  try {
    const decoded = decodeURIComponent(utmValue);
    const parts = decoded.split('|');
    
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const id = parts[1].trim();
      
      // Validar se o ID é numérico
      if (name && id && /^\d+$/.test(id)) {
        const formatted = `${name}|${id}`;
        console.log(`✅ UTM processado para UTMify: "${utmValue}" → nome: "${name}", id: "${id}", formatado: "${formatted}"`);
        return { name, id, formatted };
      }
    }
    
    // Se não tem formato nome|id, retorna apenas o nome
    console.log(`ℹ️ UTM sem formato nome|id para UTMify: "${utmValue}"`);
    return { name: decoded, id: null, formatted: decoded };
    
  } catch (error) {
    console.error(`❌ Erro ao processar UTM para UTMify "${utmValue}":`, error.message);
    return { name: utmValue, id: null, formatted: utmValue };
  }
}

async function enviarConversaoParaUtmify({ payer_name, telegram_id, transactionValueCents, trackingData, orderId, nomeOferta, displayedPriceCents = null }) {
  const now = new Date();
  const createdAt = formatDateUTC(now);
  const finalOrderId = orderId || uuidv4();
  const {
    src,
    sck = null,
    utm_source = null,
    utm_medium = null,
    utm_campaign = null,
    utm_content = null,
    utm_term = null
  } = trackingData;

  // 🔥 CORREÇÃO: Usar função processUTMForUtmify para processar UTMs
  const utmCampaignProcessed = processUTMForUtmify(utm_campaign);
  const utmMediumProcessed = processUTMForUtmify(utm_medium);
  const utmContentProcessed = processUTMForUtmify(utm_content);

  if (!utmCampaignProcessed.id || !utmContentProcessed.id) {
    console.warn('UTM parsing issue:', { 
      campaignId: utmCampaignProcessed.id, 
      adId: utmContentProcessed.id, 
      utm_campaign, 
      utm_content 
    });
  }

  // Validar consistência de preços se disponível
  if (displayedPriceCents) {
    const priceValidation = validatePriceConsistency(displayedPriceCents, transactionValueCents);
    if (!priceValidation.isValid) {
      console.warn(`[${telegram_id}] ${priceValidation.warning}`);
    }
  }

  const payload = {
    orderId: finalOrderId,
    platform: 'pushinpay',
    paymentMethod: 'pix',
    status: 'paid',
    createdAt,
    approvedDate: createdAt,
    refundedAt: null,
    customer: {
      name: payer_name,
      email: gerarEmailFake(),
      phone: null,
      document: null
    },
    products: [
      {
        id: 'curso-vitalicio',
        name: nomeOferta || 'Oferta Desconhecida',
        planId: 'curso-vitalicio',
        planName: nomeOferta || 'Oferta Desconhecida',
        quantity: 1,
        priceInCents: transactionValueCents
      }
    ],
    trackingParameters: {
      src,
      sck,
      utm_source,
      utm_medium: utm_medium, // Manter original
      utm_content: utm_content, // Manter original
      utm_term,
      // 🔥 CORREÇÃO: Usar utm_campaign no formato nome|id
      utm_campaign: utmCampaignProcessed.formatted
    },
    commission: {
      totalPriceInCents: transactionValueCents,
      gatewayFeeInCents: 30,
      userCommissionInCents: transactionValueCents - 30
    },
    isTest: false
  };

  console.log(`[${telegram_id}] 📊 UTMify Payload para ${finalOrderId}:`, JSON.stringify(payload, null, 2));
  console.log(`[${telegram_id}] 📊 UTM details:`, {
    utmCampaignProcessed,
    utmMediumProcessed,
    utmContentProcessed
  });

  // Função de envio com retry
  const sendToUtmify = async () => {
    const res = await axios.post(
      'https://api.utmify.com.br/api-credentials/orders',
      payload,
      { 
        headers: { 'x-api-token': process.env.UTMIFY_API_TOKEN },
        timeout: 10000 // 10 segundos de timeout
      }
    );
    return res.data;
  };

  try {
    const result = await retryWithBackoff(sendToUtmify, {
      maxRetries: 3,
      baseDelay: 1000
    });
    
    console.log(`[${telegram_id}] ✅ UTMify: Conversão enviada com sucesso para ${finalOrderId}:`, result);
    return result;
  } catch (err) {
    console.error(`[${telegram_id}] ❌ UTMify: Falha após todas as tentativas para ${finalOrderId}:`, {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message
    });
    console.error(`[${telegram_id}] ❌ Payload que falhou:`, JSON.stringify(payload, null, 2));
    throw err;
  }
}

module.exports = { enviarConversaoParaUtmify };
