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

  const decodedCampaign = decodeURIComponent(utm_campaign || '');
  const [campaignNameRaw, campaignIdRaw] = decodedCampaign.split('|');
  const campaignName = sanitizeName(campaignNameRaw || '');
  const campaignId = campaignIdRaw || null;

  const decodedContent = decodeURIComponent(utm_content || '');
  const [adNameRaw, adIdRaw] = decodedContent.split('|');
  const adName = sanitizeName(adNameRaw || '');
  const adId = adIdRaw || null;

  if (!campaignId || !adId) {
    console.warn('UTM parsing issue:', { campaignId, adId, utm_campaign, utm_content });
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
      utm_medium,
      utm_campaign: campaignName,
      utm_campaign_id: campaignId,
      utm_content: adName,
      utm_content_id: adId,
      utm_term
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
    campaignId,
    campaignName,
    adId,
    adName
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
