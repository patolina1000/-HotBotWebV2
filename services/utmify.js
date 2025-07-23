const axios = require('axios');

function formatDate(d) {
  const pad = n => (n < 10 ? '0' + n : n);
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate())
  ].join('-') + ' ' + [
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join(':');
}

async function enviarConversaoParaUtmify(orderId, utms = {}) {
  const token = process.env.UTMIFY_API_TOKEN;
  if (!token) {
    throw new Error('UTMIFY_API_TOKEN nao definido');
  }

  const url = 'https://api.utmify.com.br/api-credentials/orders';
  const now = formatDate(new Date());

  const payload = {
    orderId,
    paymentMethod: 'pix',
    status: 'paid',
    createdAt: now,
    approvedDate: now,
    trackingParameters: {
      utm_source: utms.utm_source || null,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_term: utms.utm_term || null,
      utm_content: utms.utm_content || null
    }
  };

  const config = {
    headers: {
      'x-api-token': token,
      'Content-Type': 'application/json'
    }
  };
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await axios.post(url, payload, config);
      console.log('✅ Conversao enviada para UTMify:', res.data);
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if (status >= 500 && status < 600 && attempt < maxAttempts) {
        const delayMs = attempt * 1000;
        console.warn(`❌ Falha ao enviar para UTMify (tentativa ${attempt}) - status ${status}. Retentando em ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      console.error('❌ Erro ao enviar conversao para UTMify:', err.response?.data || err.message);
      throw err;
    }
  }
}

module.exports = { enviarConversaoParaUtmify };
