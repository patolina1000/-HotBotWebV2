const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const adAccountId = process.env.UTMIFY_AD_ACCOUNT_ID; // ex: '129355640213755'

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

async function enviarConversaoParaUtmify({ payer_name, telegram_id, transactionValueCents, trackingData, orderId }) {
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
        name: 'Curso Vitalício',
        planId: 'curso-vitalicio',
        planName: 'Curso Vitalício',
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
  console.log('UTMify Payload:', JSON.stringify(payload, null, 2));
  console.log('📊 UTM details:', {
    utmCampaignProcessed,
    utmMediumProcessed,
    utmContentProcessed
  });
  try {
    const res = await axios.post(
      'https://api.utmify.com.br/api-credentials/orders',
      payload,
      { headers: { 'x-api-token': process.env.UTMIFY_API_TOKEN } }
    );
    console.log('Resposta UTMify:', res.data);
    return res.data;
  } catch (err) {
    console.error('Erro UTMify:', err.response?.status, err.response?.data);
    console.error('Payload enviado:', JSON.stringify(payload, null, 2));
    throw err;
  }
}

module.exports = { enviarConversaoParaUtmify };
