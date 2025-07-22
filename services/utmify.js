const axios = require('axios');

const UTMIFY_URL = 'https://api.utmify.com.br/api-credentials/orders';
const TOKEN = 'rko69K641p0JrvuhdqAHSRa2UzuhjOfCMszn';

async function enviarConversaoParaUtmify(orderId, utms = {}) {
  if (!orderId) {
    console.error('[UTMIFY] orderId é obrigatório');
    return null;
  }

  const payload = {
    orderId,
    paymentMethod: 'pix',
    status: 'paid',
    createdAt: new Date().toISOString(),
    approvedDate: new Date().toISOString(),
    trackingParameters: {
      utm_source: utms.utm_source || undefined,
      utm_medium: utms.utm_medium || undefined,
      utm_campaign: utms.utm_campaign || undefined,
      utm_term: utms.utm_term || undefined,
      utm_content: utms.utm_content || undefined
    }
  };

  try {
    const { data } = await axios.post(UTMIFY_URL, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[UTMIFY] Conversão enviada com sucesso para orderId ${orderId}`);
    return data;
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error(`[UTMIFY] Falha ao enviar conversão para orderId ${orderId}:`, msg);
    return null;
  }
}

module.exports = enviarConversaoParaUtmify;
