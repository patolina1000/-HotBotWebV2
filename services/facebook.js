const axios = require('axios');

const PIXEL_ID = process.env.FB_PIXEL_ID;
const ACCESS_TOKEN = process.env.FB_PIXEL_TOKEN;

const dedupCache = new Map();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getDedupKey({event_name, event_time, event_id, fbp, fbc}) {
  return [event_name, event_id || '', event_time, fbp || '', fbc || ''].join('|');
}

function isDuplicate(key) {
  const now = Date.now();
  const ts = dedupCache.get(key);
  if (ts && now - ts < DEDUP_TTL_MS) {
    return true;
  }
  dedupCache.set(key, now);
  // cleanup
  for (const [k, t] of dedupCache) {
    if (now - t > DEDUP_TTL_MS) dedupCache.delete(k);
  }
  return false;
}

async function sendFacebookEvent({
  event_name,
  event_time = Math.floor(Date.now() / 1000),
  event_id,
  event_source_url,
  value,
  currency = 'BRL',
  fbp,
  fbc,
  ip,
  userAgent,
  custom_data = {}
}) {
  if (!ACCESS_TOKEN) {
    console.warn('FB_PIXEL_TOKEN não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_TOKEN not set' };
  }

  if (!PIXEL_ID) {
    console.warn('FB_PIXEL_ID não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_ID not set' };
  }

  const key = getDedupKey({ event_name, event_time, event_id, fbp, fbc });
  if (isDuplicate(key)) {
    return { success: false, duplicate: true };
  }

  const payload = {
    data: [
      {
        event_name,
        event_time,
        event_id,
        event_source_url,
        action_source: 'website',
        user_data: {
          client_ip_address: ip,
          client_user_agent: userAgent,
          fbp,
          fbc
        },
        custom_data: {
          value,
          currency,
          ...custom_data
        }
      }
    ],
    access_token: ACCESS_TOKEN
  };

  try {
    const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;
    const res = await axios.post(url, payload);
    return { success: true, response: res.data };
  } catch (err) {
    console.error('Erro ao enviar evento Facebook:', err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

module.exports = { sendFacebookEvent };
