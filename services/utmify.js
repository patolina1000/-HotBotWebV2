const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

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

async function enviarConversaoParaUtmify({ payer_name, telegram_id, transactionValueCents, tracking, orderId }) {
  const now = new Date();
  const createdAt = formatDateUTC(now);
  const finalOrderId = orderId || uuidv4();
  const payload = {
    orderId: finalOrderId,
    platform: 'telegram',
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
        quantity: 1,
        priceInCents: transactionValueCents
      }
    ],
    trackingParameters: {
      src: null,
      sck: null,
      utm_source: tracking.utm_source,
      utm_campaign: tracking.utm_campaign,
      utm_medium: tracking.utm_medium,
      utm_content: tracking.utm_content,
      utm_term: tracking.utm_term
    },
    commission: {
      totalPriceInCents: transactionValueCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: 0
    },
    isTest: false
  };
  const res = await axios.post(
    'https://api.utmify.com.br/api-credentials/orders',
    payload,
    { headers: { 'x-api-token': process.env.UTMIFY_API_TOKEN } }
  );
  return res.data;
}

module.exports = { enviarConversaoParaUtmify };
