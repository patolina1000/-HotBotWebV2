const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getInstance: getSessionTracking } = require('./sessionTracking');

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
  user_data_hash = null, // Novos dados pessoais hasheados
  source = 'unknown', // Origem do evento: 'pixel', 'capi', 'cron'
  token = null, // Token para atualizar flags no banco
  pool = null, // Pool de conexão do banco
  telegram_id = null // 🔥 NOVO: ID do Telegram para buscar cookies automaticamente
}) {
  if (!ACCESS_TOKEN) {
    console.warn('FB_PIXEL_TOKEN não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_TOKEN not set' };
  }

  if (!PIXEL_ID) {
    console.warn('FB_PIXEL_ID não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_ID not set' };
  }

  // 🔥 NOVO: Buscar cookies do SessionTracking se telegram_id fornecido e fbp/fbc não estão definidos
  let finalFbp = fbp;
  let finalFbc = fbc;
  let finalIpAddress = client_ip_address || client_ip || ip;
  let finalUserAgent = client_user_agent || userAgent;

  if (telegram_id && (!finalFbp || !finalFbc)) {
    try {
      const sessionTracking = getSessionTracking();
      const sessionData = sessionTracking.getTrackingData(telegram_id);
      
      if (sessionData) {
        // Usar dados do SessionTracking apenas se não foram fornecidos
        if (!finalFbp && sessionData.fbp) {
          finalFbp = sessionData.fbp;
          console.log(`🔥 FBP recuperado do SessionTracking para telegram_id ${telegram_id}`);
        }
        if (!finalFbc && sessionData.fbc) {
          finalFbc = sessionData.fbc;
          console.log(`🔥 FBC recuperado do SessionTracking para telegram_id ${telegram_id}`);
        }
        if (!finalIpAddress && sessionData.ip) {
          finalIpAddress = sessionData.ip;
        }
        if (!finalUserAgent && sessionData.user_agent) {
          finalUserAgent = sessionData.user_agent;
        }
      }
    } catch (error) {
      console.warn('Erro ao buscar dados do SessionTracking:', error.message);
    }
  }

  const key = getDedupKey({ event_name, event_time, event_id, fbp: finalFbp, fbc: finalFbc });
  if (isDuplicate(key)) {
    console.log(`🔄 Evento duplicado detectado e ignorado | ${source} | ${event_name} | ${event_id}`);
    return { success: false, duplicate: true };
  }

  const ipValid = finalIpAddress && finalIpAddress !== '::1' && finalIpAddress !== '127.0.0.1';
  const finalIp = ipValid ? finalIpAddress : undefined;

  console.log(`📤 Evento enviado: ${event_name} | Valor: ${value} | IP: ${finalIp || 'null'} | Fonte: ${source.toUpperCase()}`);
  
  // 🔥 Log de rastreamento invisível
  if (telegram_id && (finalFbp || finalFbc)) {
    console.log(`🔥 Rastreamento invisível ativo - Telegram ID: ${telegram_id} | FBP: ${!!finalFbp} | FBC: ${!!finalFbc}`);
  }

  // Log de auditoria de segurança
  logSecurityAudit(`send_${event_name.toLowerCase()}`, token, user_data_hash, source);

  const user_data = {
    fbp: finalFbp,
    fbc: finalFbc
  };

  if (finalIp) user_data.client_ip_address = finalIp;
  if (finalUserAgent) user_data.client_user_agent = finalUserAgent;
  if (event_source_url) user_data.event_source_url = event_source_url;

  // Adicionar dados pessoais hasheados apenas para eventos Purchase
  if (event_name === 'Purchase' && user_data_hash) {
    // Validar segurança dos dados hasheados antes de usar
    const validation = validateHashedDataSecurity(user_data_hash);
    if (!validation.valid) {
      console.error(`❌ Dados hasheados com problemas de segurança: ${validation.warnings.join(', ')}`);
      // Em produção, considere bloquear o envio se houver problemas críticos
    }

    if (user_data_hash.fn) user_data.fn = user_data_hash.fn;
    if (user_data_hash.ln) user_data.ln = user_data_hash.ln;
    if (user_data_hash.external_id) user_data.external_id = user_data_hash.external_id;
    
    console.log(`🔐 Dados pessoais hasheados incluídos no evento Purchase | Fonte: ${source.toUpperCase()}`);
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
    console.log(`✅ Evento ${event_name} enviado com sucesso via ${source.toUpperCase()}:`, res.data);

    // Atualizar flags no banco se token e pool fornecidos
    if (token && pool && event_name === 'Purchase') {
      await updateEventFlags(pool, token, source);
    }

    return { success: true, response: res.data };
  } catch (err) {
    console.error(`❌ Erro ao enviar evento ${event_name} via ${source.toUpperCase()}:`, err.response?.data || err.message);
    
    // Incrementar contador de tentativas mesmo em caso de erro
    if (token && pool) {
      await incrementEventAttempts(pool, token);
    }
    
    return { success: false, error: err.response?.data || err.message };
  }
}

// Função para atualizar flags de controle de eventos
async function updateEventFlags(pool, token, source) {
  if (!pool || !token) return;
  
  try {
    const flagColumn = `${source}_sent`;
    const now = new Date().toISOString();
    
    // Atualizar flag específica da fonte e timestamp do primeiro envio
    await pool.query(`
      UPDATE tokens 
      SET ${flagColumn} = TRUE,
          first_event_sent_at = COALESCE(first_event_sent_at, $2),
          event_attempts = event_attempts + 1
      WHERE token = $1
    `, [token, now]);
    
    console.log(`🏷️ Flag ${flagColumn} atualizada para token ${token}`);
  } catch (error) {
    console.error('Erro ao atualizar flags de evento:', error);
  }
}

// Função para incrementar contador de tentativas
async function incrementEventAttempts(pool, token) {
  if (!pool || !token) return;
  
  try {
    await pool.query(`
      UPDATE tokens 
      SET event_attempts = event_attempts + 1
      WHERE token = $1
    `, [token]);
  } catch (error) {
    console.error('Erro ao incrementar tentativas de evento:', error);
  }
}

// Função para verificar se evento já foi enviado
async function checkIfEventSent(pool, token) {
  if (!pool || !token) return false;
  
  try {
    const result = await pool.query(`
      SELECT pixel_sent, capi_sent, cron_sent, first_event_sent_at, event_attempts
      FROM tokens 
      WHERE token = $1
    `, [token]);
    
    if (result.rows.length === 0) return false;
    
    const row = result.rows[0];
    return {
      pixel_sent: row.pixel_sent,
      capi_sent: row.capi_sent,
      cron_sent: row.cron_sent,
      any_sent: row.pixel_sent || row.capi_sent || row.cron_sent,
      first_event_sent_at: row.first_event_sent_at,
      event_attempts: row.event_attempts || 0
    };
  } catch (error) {
    console.error('Erro ao verificar status de evento:', error);
    return false;
  }
}

// Função para validar segurança dos dados hasheados
function validateHashedDataSecurity(user_data_hash) {
  if (!user_data_hash) return { valid: true, warnings: [] };
  
  const warnings = [];
  const hashPattern = /^[a-f0-9]{64}$/i; // SHA-256 hex pattern
  
  // Verificar se os hashes estão no formato correto
  if (user_data_hash.fn && !hashPattern.test(user_data_hash.fn)) {
    warnings.push('Hash fn não está no formato SHA-256 válido');
  }
  
  if (user_data_hash.ln && !hashPattern.test(user_data_hash.ln)) {
    warnings.push('Hash ln não está no formato SHA-256 válido');
  }
  
  if (user_data_hash.external_id && !hashPattern.test(user_data_hash.external_id)) {
    warnings.push('Hash external_id não está no formato SHA-256 válido');
  }
  
  // Verificar se algum hash parece conter dados em plain text
  const suspiciousPatterns = [
    /\s/, // espaços
    /@/, // email
    /\d{11}/, // CPF/CNPJ patterns
    /[A-Z][a-z]+/ // Nomes próprios
  ];
  
  [user_data_hash.fn, user_data_hash.ln, user_data_hash.external_id].forEach((hash, index) => {
    if (hash) {
      const fieldNames = ['fn', 'ln', 'external_id'];
      suspiciousPatterns.forEach(pattern => {
        if (pattern.test(hash)) {
          warnings.push(`Hash ${fieldNames[index]} pode conter dados não hasheados`);
        }
      });
    }
  });
  
  return {
    valid: warnings.length === 0,
    warnings: warnings
  };
}

// Função para log de auditoria de segurança
function logSecurityAudit(action, token, user_data_hash = null, source = 'unknown') {
  const timestamp = new Date().toISOString();
  const auditLog = {
    timestamp,
    action,
    token: token ? token.substring(0, 8) + '***' : null, // Mascarar token
    source,
    has_hashed_data: !!user_data_hash,
    data_fields: user_data_hash ? Object.keys(user_data_hash).filter(k => user_data_hash[k]) : []
  };
  
  // Log de auditoria (em produção, enviar para sistema de logging seguro)
  console.log(`🔒 AUDIT: ${JSON.stringify(auditLog)}`);
  
  if (user_data_hash) {
    const validation = validateHashedDataSecurity(user_data_hash);
    if (!validation.valid) {
      console.warn(`⚠️ SECURITY WARNING: ${validation.warnings.join(', ')} | Token: ${auditLog.token}`);
    }
  }
}

module.exports = { 
  sendFacebookEvent, 
  generateEventId, 
  generateHashedUserData,
  updateEventFlags,
  checkIfEventSent,
  incrementEventAttempts,
  validateHashedDataSecurity,
  logSecurityAudit
};
