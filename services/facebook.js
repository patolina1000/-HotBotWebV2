const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { isValidFbc } = require('./trackingValidation');

// Garantir carregamento das variáveis de ambiente locais
require('dotenv').config();

const PIXEL_ID = process.env.FB_PIXEL_ID;
const ACCESS_TOKEN = process.env.FB_PIXEL_TOKEN;

const dedupCache = new Map();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getDedupKey({event_name, event_time, event_id, fbp, fbc}) {
  return [event_name, event_id || '', event_time, fbp || '', fbc || ''].join('|');
}

function generateEventId(eventName, token) {
  return eventName === 'Purchase' && token ? token : uuidv4();
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
  external_id,
  fn,
  ln,
  client_ip_address,
  client_ip,
  client_user_agent,
  ip,
  userAgent,
  action_source = 'website',
  custom_data = {},
  test_event_code
}) {
  if (!ACCESS_TOKEN) {
    console.warn('FB_PIXEL_TOKEN não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_TOKEN not set' };
  }

  if (!PIXEL_ID) {
    console.warn('FB_PIXEL_ID não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_ID not set' };
  }

  const sanitizedFbc = isValidFbc(fbc) ? fbc : null;
  const key = getDedupKey({ event_name, event_time, event_id, fbp, fbc: sanitizedFbc });
  if (isDuplicate(key)) {
    return { success: false, duplicate: true };
  }

  const ipCandidate = client_ip || client_ip_address || ip;
  const ipValid = ipCandidate && ipCandidate !== '::1' && ipCandidate !== '127.0.0.1';
  const finalIp = ipValid ? ipCandidate : undefined;
  const finalUserAgent = client_user_agent || userAgent;

  console.log(`📤 Evento enviado: ${event_name} | Valor: ${value} | IP: ${finalIp || 'null'} | Fonte: API`);

  const user_data = {};
  if (fbp) user_data.fbp = fbp;
  if (isValidFbc(fbc)) user_data.fbc = fbc;

  if (external_id) user_data.external_id = external_id;
  if (fn) user_data.fn = fn;
  if (ln) user_data.ln = ln;

  if (finalIp) user_data.client_ip_address = finalIp;
  if (finalUserAgent) user_data.client_user_agent = finalUserAgent;
  if (event_source_url) user_data.event_source_url = event_source_url;

  console.log('🔧 user_data:', JSON.stringify(user_data));

  const payload = {
    event_name,
    event_time,
    event_id,
    action_source,
    user_data,
    custom_data: {
      value,
      currency,
      ...custom_data
    }
  };

  if (event_source_url) {
    payload.event_source_url = event_source_url;
  }

  const wrapper = {
    data: [payload]
  };

  const argTestCode =
    typeof test_event_code === 'string' && test_event_code.trim()
      ? test_event_code.trim()
      : '';

  const shouldUseEnvCode =
    process.env.FORCE_FB_TEST_MODE === '1' ||
    process.env.NODE_ENV !== 'production';

  let finalTestCode = argTestCode;

  if (!finalTestCode && shouldUseEnvCode) {
    const envTestCode = process.env.FB_TEST_EVENT_CODE;
    if (typeof envTestCode === 'string' && envTestCode.trim()) {
      finalTestCode = envTestCode.trim();
    }
  }

  if (finalTestCode) {
    wrapper.test_event_code = finalTestCode;
  }

  try {
    console.log('[DEBUG] Payload enviado para o Facebook:', wrapper);
    console.log('[DEBUG] wrapper.test_event_code:', wrapper.test_event_code);
    console.log('[DEBUG] process.env.NODE_ENV:', process.env.NODE_ENV);
    console.log('[DEBUG] process.env.FB_TEST_EVENT_CODE:', process.env.FB_TEST_EVENT_CODE);
    const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
    const res = await axios.post(url, wrapper);
    console.log('Resposta Facebook:', res.data);
    return { success: true, response: res.data };
  } catch (err) {
    console.error('Erro ao enviar evento Facebook:', err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

module.exports = { sendFacebookEvent, generateEventId };
