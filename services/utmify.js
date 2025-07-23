const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

function gerarEmailFake() {
  return `${uuidv4()}@example.org`;
}

async function enviarConversaoParaUtmify({ payer_name, telegram_id, transactionValueCents, tracking }) {
  const payload = {
    platform: 'telegram',
    customer: {
      name: payer_name,
      email: gerarEmailFake(),
      phone: null,
      document: null
    },
    commission: {
      totalPriceInCents: transactionValueCents,
      gatewayFeeInCents: 0,
      userCommissionInCents: 0
    },
    products: [
      { id: 'curso-vitalicio', quantity: 1, unitPriceInCents: transactionValueCents }
    ],
    metadata: {
      telegram_id,
      utm_source: tracking.utm_source,
      utm_medium: tracking.utm_medium,
      utm_campaign: tracking.utm_campaign,
      utm_term: tracking.utm_term,
      utm_content: tracking.utm_content
    }
  };
  await axios.post(
    'https://api.utmify.com.br/api-credentials/orders',
    payload,
    { headers: { Authorization: `Bearer ${process.env.UTMIFY_API_TOKEN}` } }
  );
}

module.exports = { enviarConversaoParaUtmify };
