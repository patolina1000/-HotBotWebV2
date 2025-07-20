const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

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

function generateHashedUserData(payer_name, payer_national_registration) {
  if (!payer_name || !payer_national_registration) {
    return null;
  }

  try {
    // Limpar e processar nome
    const nomeNormalizado = payer_name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .trim()
      .replace(/\s+/g, ' '); // Remove espaços extras

    const partesNome = nomeNormalizado.split(' ');
    const primeiroNome = partesNome[0] || '';
    const restanteNome = partesNome.slice(1).join(' ') || '';

    // Limpar CPF (manter apenas números)
    const cpfLimpo = payer_national_registration.replace(/\D/g, '');

    // Gerar hashes SHA-256
    const fnHash = crypto.createHash('sha256').update(primeiroNome.toLowerCase()).digest('hex');
    const lnHash = crypto.createHash('sha256').update(restanteNome.toLowerCase()).digest('hex');
    const externalIdHash = crypto.createHash('sha256').update(cpfLimpo).digest('hex');

    return {
      fn: fnHash,
      ln: lnHash,
      external_id: externalIdHash,
      fn_hash: fnHash,
      ln_hash: lnHash,
      external_id_hash: externalIdHash
    };
  } catch (error) {
    console.error('Erro ao gerar hashes de dados pessoais:', error);
    return null;
  }
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
  client_ip_address,
  client_ip,
  client_user_agent,
  ip,
  userAgent,
  custom_data = {},
  test_event_code,
  user_data_hash = null // Novos dados pessoais hasheados
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

  const ipCandidate = client_ip || client_ip_address || ip;
  const ipValid = ipCandidate && ipCandidate !== '::1' && ipCandidate !== '127.0.0.1';
  const finalIp = ipValid ? ipCandidate : undefined;
  const finalUserAgent = client_user_agent || userAgent;

  console.log(`📤 Evento enviado: ${event_name} | Valor: ${value} | IP: ${finalIp || 'null'} | Fonte: API`);

  const user_data = {
    fbp,
    fbc
  };

  if (finalIp) user_data.client_ip_address = finalIp;
  if (finalUserAgent) user_data.client_user_agent = finalUserAgent;
  if (event_source_url) user_data.event_source_url = event_source_url;

  // Adicionar dados pessoais hasheados apenas para eventos Purchase
  if (event_name === 'Purchase' && user_data_hash) {
    if (user_data_hash.fn) user_data.fn = user_data_hash.fn;
    if (user_data_hash.ln) user_data.ln = user_data_hash.ln;
    if (user_data_hash.external_id) user_data.external_id = user_data_hash.external_id;
    
    console.log('🔐 Dados pessoais hasheados incluídos no evento Purchase');
  }

  console.log('🔧 user_data:', JSON.stringify(user_data));

  const eventPayload = {
    event_name,
    event_time,
    event_id,
    action_source: 'website',
    user_data,
    custom_data: {
      value,
      currency,
      ...custom_data
    }
  };

  if (event_source_url) {
    eventPayload.event_source_url = event_source_url;
  }

  const payload = {
    data: [eventPayload]
  };

  const finalTestCode = test_event_code || process.env.FB_TEST_EVENT_CODE;
  if (finalTestCode) {
    payload.test_event_code = finalTestCode;
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
    const res = await axios.post(url, payload);
    console.log('Resposta Facebook:', res.data);
    return { success: true, response: res.data };
  } catch (err) {
    console.error('Erro ao enviar evento Facebook:', err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

module.exports = { sendFacebookEvent, generateEventId, generateHashedUserData };
