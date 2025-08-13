const axios = require('axios');
const crypto = require('crypto');
const express = require('express');
const { getInstance: getSessionTracking } = require('./sessionTracking');
const { formatForCAPI, validatePurchaseValue } = require('./purchaseValidation');

const PIXEL_ID = process.env.FB_PIXEL_ID;
const ACCESS_TOKEN = process.env.FB_PIXEL_TOKEN;

// Router para expor configurações do Facebook Pixel
const router = express.Router();
router.get('/api/config', (req, res) => {
  res.json({
    FB_PIXEL_ID: process.env.FB_PIXEL_ID || ''
  });
  console.debug('[FB CONFIG] Endpoint /api/config carregado');
});

const dedupCache = new Map();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_EVENT_SOURCE_URL = 'https://ohvips.xyz/obrigado.html';

// 🔥 NOVA FUNÇÃO: Sincronização de timestamp para deduplicação perfeita
function generateSyncedTimestamp(clientTimestamp = null) {
  // Se um timestamp do cliente foi fornecido (do navegador), usar ele
  if (clientTimestamp && typeof clientTimestamp === 'number') {
    // Validar se o timestamp é razoável (não muito antigo nem futuro)
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - clientTimestamp);
    
    // Se a diferença for menor que 5 minutos, usar o timestamp do cliente
    if (diff < 300) { // 5 minutos = 300 segundos
      console.log(`🕐 Usando timestamp sincronizado do cliente: ${clientTimestamp} (diff: ${diff}s)`);
      return clientTimestamp;
    } else {
      console.warn(`⚠️ Timestamp do cliente muito divergente (${diff}s), usando timestamp do servidor`);
    }
  }
  
  // Fallback para timestamp do servidor
  return Math.floor(Date.now() / 1000);
}

// 🔥 NOVA FUNÇÃO: Gerar chave de deduplicação mais robusta
function getEnhancedDedupKey({event_name, event_time, event_id, fbp, fbc, client_timestamp = null, value = null}) {
  // Para eventos Purchase, usar uma janela de tempo mais ampla para deduplicação
  let normalizedTime = event_time;
  
  if (event_name === 'Purchase') {
    // Normalizar timestamp para janelas de 30 segundos para Purchase
    // Isso permite deduplicação mesmo com pequenas diferenças de timing
    normalizedTime = Math.floor(event_time / 30) * 30;
    console.log(`🔄 Timestamp normalizado para deduplicação: ${event_time} → ${normalizedTime}`);
  }
  
  // 🔥 CORREÇÃO CRÍTICA: Incluir valor na chave de deduplicação para eventos Purchase
  // Isso evita que eventos com o mesmo eventID mas valores diferentes sejam tratados como duplicatas
  if (event_name === 'Purchase' && value !== null && value !== undefined) {
    // Normalizar valor para evitar problemas de precisão decimal
    const normalizedValue = Math.round(Number(value) * 100) / 100;
    return [event_name, event_id || '', normalizedTime, normalizedValue, fbp || '', fbc || ''].join('|');
  }
  
  return [event_name, event_id || '', normalizedTime, fbp || '', fbc || ''].join('|');
}

function getDedupKey({event_name, event_time, event_id, fbp, fbc}) {
  return [event_name, event_id || '', event_time, fbp || '', fbc || ''].join('|');
}

function generateEventId(eventName, userId = '', timestamp = Date.now()) {
  if (eventName === 'Purchase' && userId) return userId;
  const input = `${eventName}_${userId}_${timestamp}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 16);
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

function generateExternalId(telegram_id, fbp, ip) {
  const base = `${telegram_id || ''}|${fbp || ''}|${ip || ''}`;
  return crypto.createHash('sha256').update(base).digest('hex');
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

  user_data_hash = null, // Novos dados pessoais hasheados
  source = 'unknown', // Origem do evento: 'pixel', 'capi', 'cron'
  token = null, // Token para atualizar flags no banco
  pool = null, // Pool de conexão do banco
  telegram_id = null, // 🔥 NOVO: ID do Telegram para buscar cookies automaticamente
  client_timestamp = null // 🔥 NOVO: Timestamp do cliente para sincronização
}) {
  if (!ACCESS_TOKEN) {
    console.warn('FB_PIXEL_TOKEN não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_TOKEN not set' };
  }

  if (!PIXEL_ID) {
    console.warn('FB_PIXEL_ID não definido. Evento não será enviado.');
    return { success: false, error: 'FB_PIXEL_ID not set' };
  }

  // Garantir que event_id sempre esteja presente para deduplicação
  let finalEventId = event_id;
  if (!finalEventId) {
    finalEventId = generateEventId(event_name, telegram_id || token || '', event_time);
    console.log(`⚠️ event_id não fornecido. Gerado automaticamente: ${finalEventId}`);
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

  // 🔥 SINCRONIZAÇÃO DE TIMESTAMP: Usar timestamp do cliente quando disponível
  const syncedEventTime = generateSyncedTimestamp(client_timestamp) || event_time;
  
  // 🔥 DEDUPLICAÇÃO MELHORADA: Usar chave robusta para eventos Purchase
  const dedupKey = event_name === 'Purchase'
    ? getEnhancedDedupKey({ event_name, event_time: syncedEventTime, event_id: finalEventId, fbp: finalFbp, fbc: finalFbc, client_timestamp, value: finalValue })
    : getDedupKey({ event_name, event_time: syncedEventTime, event_id: finalEventId, fbp: finalFbp, fbc: finalFbc });
    
  // 🔥 LOG DETALHADO PARA DEBUG DE DEDUPLICAÇÃO
  console.log(`🔍 DEDUP DEBUG | ${source.toUpperCase()} | ${event_name}`);
  console.log(`   - event_id: ${finalEventId}`);
  console.log(`   - event_time: ${syncedEventTime}`);
  console.log(`   - fbp: ${finalFbp ? finalFbp.substring(0, 20) + '...' : 'null'}`);
  console.log(`   - fbc: ${finalFbc ? finalFbc.substring(0, 20) + '...' : 'null'}`);
  console.log(`   - event_source_url: ${event_source_url || 'default'}`);
  console.log(`   - dedupKey: ${dedupKey.substring(0, 50)}...`);
    
  if (isDuplicate(dedupKey)) {
    console.log(`🔄 Evento duplicado detectado e ignorado | ${source} | ${event_name} | ${finalEventId} | timestamp: ${syncedEventTime}`);
    return { success: false, duplicate: true };
  }
  
  console.log(`🕐 Timestamp final usado: ${syncedEventTime} | Fonte: ${client_timestamp ? 'cliente' : 'servidor'} | Evento: ${event_name}`);
  
  // Usar o timestamp sincronizado para o evento
  const finalEventTime = syncedEventTime;

  const ipValid = finalIpAddress && finalIpAddress !== '::1' && finalIpAddress !== '127.0.0.1';
  const finalIp = ipValid ? finalIpAddress : undefined;

  console.log(`📤 Evento enviado: ${event_name} | Valor: ${value} | IP: ${finalIp || 'null'} | Fonte: ${source.toUpperCase()}`);
  
  // 🔥 Log de rastreamento invisível
  if (telegram_id && (finalFbp || finalFbc)) {
    console.log(`🔥 Rastreamento invisível ativo - Telegram ID: ${telegram_id} | FBP: ${!!finalFbp} | FBC: ${!!finalFbc}`);
  }

  // Log de auditoria de segurança
  logSecurityAudit(`send_${event_name.toLowerCase()}`, token, user_data_hash, source);

  // Montar user_data com validação específica para AddToCart
  const user_data = {};

  // Adicionar parâmetros básicos se disponíveis
  if (finalFbp) user_data.fbp = finalFbp;
  if (finalFbc) user_data.fbc = finalFbc;
  if (finalIp) user_data.client_ip_address = finalIp;
  if (finalUserAgent) user_data.client_user_agent = finalUserAgent;

  if (event_name === 'Purchase') {
    const extId = generateExternalId(telegram_id, finalFbp, finalIpAddress);
    user_data.external_id = extId;
    console.log('🔐 external_id gerado para Purchase');
  }

  // Para AddToCart, adicionar external_id usando hash do token se disponível
  if (event_name === 'AddToCart' && (token || telegram_id)) {
    const idToHash = token || telegram_id.toString();
    const externalIdHash = crypto.createHash('sha256').update(idToHash).digest('hex');
    user_data.external_id = externalIdHash;
    console.log(`🔐 external_id gerado para AddToCart usando ${token ? 'token' : 'telegram_id'}`);
  }

  // 🔥 MELHORIA 2: Enriquecer o Evento do Servidor com Mais Dados do Usuário (Melhorar EMQ)
  // Expande o user_data com PII hasheado, se disponível, para maximizar a EMQ.
  if (user_data_hash) {
    // Validar segurança dos dados hasheados antes de usar
    const validation = validateHashedDataSecurity(user_data_hash);
    if (!validation.valid) {
      console.error(`❌ Dados hasheados com problemas de segurança: ${validation.warnings.join(', ')}`);
      // Em produção, considere bloquear o envio se houver problemas críticos
    }

    // 🔥 ADICIONAR ESTE BLOCO LÓGICO:
    // Mapear campos hasheados para o objeto user_data final
    if (user_data_hash.em) user_data.em = [user_data_hash.em];
    if (user_data_hash.ph) user_data.ph = [user_data_hash.ph];
    if (user_data_hash.fn) user_data.fn = [user_data_hash.fn];
    if (user_data_hash.ln) user_data.ln = [user_data_hash.ln];
    
    console.log('👤 Dados de usuário (PII) hasheados foram adicionados para enriquecer o evento.');
    console.log(`🔐 Dados pessoais hasheados incluídos no evento ${event_name} | Fonte: ${source.toUpperCase()}`);
  }

  // Validação específica para AddToCart: precisa de pelo menos 2 parâmetros obrigatórios
  if (event_name === 'AddToCart') {
    const requiredParams = ['fbp', 'fbc', 'client_ip_address', 'client_user_agent', 'external_id'];
    const availableParams = requiredParams.filter(param => user_data[param]);
    
    if (availableParams.length < 2) {
      const error = `❌ AddToCart rejeitado: insuficientes parâmetros de user_data. Disponíveis: [${availableParams.join(', ')}]. Necessários: pelo menos 2 entre [${requiredParams.join(', ')}]`;
      console.error(error);
      console.log('💡 Solução: Certifique-se de que o usuário passou pelo pixel do Facebook antes de acessar o bot, ou que os dados de sessão estejam sendo salvos corretamente.');
      return { 
        success: false, 
        error: 'Parâmetros insuficientes para AddToCart',
        details: error,
        available_params: availableParams,
        required_count: 2
      };
    }
    
    console.log(`✅ AddToCart validado com ${availableParams.length} parâmetros: [${availableParams.join(', ')}]`);
  }

  console.log('🔧 user_data:', JSON.stringify(user_data));

  // 🔥 NOVA VALIDAÇÃO: Usar purchaseValidation para eventos Purchase
  let finalValue = value;
  if (event_name === 'Purchase' && value !== undefined) {
    const validation = validatePurchaseValue(value);
    if (validation.valid) {
      finalValue = validation.formattedValue;
      console.log(`✅ Valor Purchase validado e formatado: ${value} → ${finalValue}`);
    } else {
      console.warn(`⚠️ Erro na validação do valor Purchase: ${validation.error}`);
      finalValue = 0.01; // Valor mínimo de segurança
    }
  }

  const eventPayload = {
    event_name,
    event_time: finalEventTime, // 🔥 USAR TIMESTAMP SINCRONIZADO
    event_id: finalEventId,
    action_source: 'website',
    user_data,
    custom_data: {
      value: finalValue,
      currency,
      ...custom_data
    }
  };

  const finalEventSourceUrl = event_source_url || DEFAULT_EVENT_SOURCE_URL;
  if (!eventPayload.event_source_url) {
    eventPayload.event_source_url = finalEventSourceUrl;
  }

  const payload = {
    data: [eventPayload],
    test_event_code: 'TEST11543'
  };

  // 🔥 MELHORIA 3: Implementar Logs de Comparação Detalhados para Auditoria
  console.log('📊 LOG_DE_AUDITORIA_FINAL --------------------------------');
  console.log('  Dados Originais Recebidos na Requisição:');
  console.log(`    - event_name: ${event_name}`);
  console.log(`    - value: ${value}`);
  console.log(`    - currency: ${currency}`);
  console.log(`    - client_timestamp: ${client_timestamp || 'não fornecido'}`);
  console.log(`    - source: ${source}`);
  console.log(`    - telegram_id: ${telegram_id || 'não fornecido'}`);
  console.log(`    - fbp: ${finalFbp ? finalFbp.substring(0, 20) + '...' : 'não fornecido'}`);
  console.log(`    - fbc: ${finalFbc ? finalFbc.substring(0, 20) + '...' : 'não fornecido'}`);
  console.log(`    - ip: ${finalIpAddress || 'não fornecido'}`);
  console.log(`    - user_agent: ${finalUserAgent ? finalUserAgent.substring(0, 50) + '...' : 'não fornecido'}`);
  console.log(`    - user_data_hash: ${user_data_hash ? 'disponível' : 'não fornecido'}`);
  console.log('----------------------------------------------------');
  console.log('  Payload Final Enviado para a API de Conversões:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('----------------------------------------------------');

  try {
    const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events`;

    const res = await axios.post(
      url,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
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
    // WHITELIST DE COLUNAS VÁLIDAS PARA PREVENIR SQL INJECTION
    const validFlagColumns = {
      'pixel': 'pixel_sent',
      'capi': 'capi_sent', 
      'cron': 'cron_sent'
    };

    // Validar se a fonte é permitida
    if (!validFlagColumns[source]) {
      console.error(`❌ Fonte inválida para atualização de flag: ${source}`);
      return;
    }

    const flagColumn = validFlagColumns[source];
    const now = new Date().toISOString();
    
    // Query segura usando prepared statements sem interpolação
    const query = `
      UPDATE tokens 
      SET ${flagColumn} = TRUE,
          first_event_sent_at = COALESCE(first_event_sent_at, $2),
          event_attempts = event_attempts + 1
      WHERE token = $1
    `;
    
    await pool.query(query, [token, now]);
    
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
  generateExternalId,
  updateEventFlags,
  checkIfEventSent,
  incrementEventAttempts,
  validateHashedDataSecurity,
  logSecurityAudit,
  generateSyncedTimestamp, // 🔥 NOVA FUNÇÃO EXPORTADA
  getEnhancedDedupKey, // 🔥 NOVA FUNÇÃO EXPORTADA
  router
};
