const axios = require('axios');
const crypto = require('crypto');
const express = require('express');
const { getInstance: getSessionTracking } = require('./sessionTracking');
const { formatForCAPI, validatePurchaseValue } = require('./purchaseValidation');
const { getWhatsAppTrackingEnv } = require('../config/env');
const {
  initialize: initPurchaseDedup,
  generatePurchaseEventId,
  generateRobustEventId, // 🔥 NOVA FUNÇÃO IMPORTADA
  isPurchaseAlreadySent,
  isEventAlreadySent, // 🔥 NOVA FUNÇÃO IMPORTADA
  markPurchaseAsSent,
  markEventAsSent // 🔥 NOVA FUNÇÃO IMPORTADA
} = require('./purchaseDedup');
const {
  isGenericPixelValue,
  validateFbpFormat,
  validateFbcFormat
} = require('./trackingValidation');

const PIXEL_ID = process.env.FB_PIXEL_ID;
const ACCESS_TOKEN = process.env.FB_PIXEL_TOKEN;

const whatsappTrackingEnv = getWhatsAppTrackingEnv();

// Router para expor configurações do Facebook Pixel
const router = express.Router();
router.get('/api/config', (req, res) => {
  const pixelToken = whatsappTrackingEnv.pixelToken || '';
  const whatsappConfig = {
    pixelId: whatsappTrackingEnv.pixelId || '',
    pixelToken,
    accessToken: pixelToken,
    baseUrl: whatsappTrackingEnv.baseUrl || ''
  };

  res.json({
    FB_PIXEL_ID: process.env.FB_PIXEL_ID || '',
    FORCE_FB_TEST_MODE: process.env.FORCE_FB_TEST_MODE === 'true' || false,
    // 🔥 CORREÇÃO: Expor variáveis específicas do WhatsApp
    WHATSAPP_FB_PIXEL_ID: process.env.WHATSAPP_FB_PIXEL_ID || '',
    WHATSAPP_FB_PIXEL_TOKEN: process.env.WHATSAPP_FB_PIXEL_TOKEN || '',
    whatsapp: whatsappConfig
  });
  console.debug('[FB CONFIG] Endpoint /api/config carregado');
});

const dedupCache = new Map();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_EVENT_SOURCE_URL = `${process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000'}/obrigado.html`;

function hasValidPixelValue(value, validator) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  if (isGenericPixelValue(value)) {
    return false;
  }

  return validator(value);
}

// 🔥 NOVA FUNÇÃO: Sincronização de timestamp para deduplicação perfeita
function generateSyncedTimestamp(clientTimestamp = null, fallbackTimestamp = null) {
  const hasClientTimestamp = typeof clientTimestamp === 'number' && !Number.isNaN(clientTimestamp);

  // Se um timestamp do cliente foi fornecido (do navegador), usar ele
  if (hasClientTimestamp) {
    // Validar se o timestamp é razoável (não muito antigo nem futuro)
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - clientTimestamp);

    // Se a diferença for menor que 5 minutos, usar o timestamp do cliente
    if (diff < 300) { // 5 minutos = 300 segundos
      console.log(`🕐 Usando timestamp sincronizado do cliente: ${clientTimestamp} (diff: ${diff}s)`);
      return clientTimestamp;
    }

    console.warn(`⚠️ Timestamp do cliente muito divergente (${diff}s), usando fallback disponível`);
  }

  if (typeof fallbackTimestamp === 'number' && !Number.isNaN(fallbackTimestamp)) {
    return fallbackTimestamp;
  }

  return null;
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

async function sendFacebookEvent(eventName, payload) {
  // Extrair dados do payload mantendo compatibilidade
  const event = typeof eventName === 'object' ? eventName : { event_name: eventName, ...payload };
  
  const {
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
    user_data = {}, // 🔥 NOVO: user_data já pronto do endpoint /api/whatsapp/verificar-token

    user_data_hash = null, // Novos dados pessoais hasheados
    source = 'unknown', // Origem do evento: 'pixel', 'capi', 'cron'
    token = null, // Token para atualizar flags no banco
    pool = null, // Pool de conexão do banco
    telegram_id = null, // 🔥 NOVO: ID do Telegram para buscar cookies automaticamente
    client_timestamp = null // 🔥 NOVO: Timestamp do cliente para sincronização
  } = event;

  const isWhatsAppCapiEvent = source === 'capi' && event.origin === 'whatsapp';
  const pixelId = isWhatsAppCapiEvent
    ? process.env.WHATSAPP_FB_PIXEL_ID
    : PIXEL_ID;
  const accessToken = isWhatsAppCapiEvent
    ? process.env.WHATSAPP_FB_PIXEL_TOKEN
    : ACCESS_TOKEN;

  if (!accessToken) {
    const tokenEnvName = isWhatsAppCapiEvent ? 'WHATSAPP_FB_PIXEL_TOKEN' : 'FB_PIXEL_TOKEN';
    console.warn(`${tokenEnvName} não definido. Evento não será enviado.`);
    return { success: false, error: `${tokenEnvName} not set` };
  }

  if (!pixelId) {
    const pixelEnvName = isWhatsAppCapiEvent ? 'WHATSAPP_FB_PIXEL_ID' : 'FB_PIXEL_ID';
    console.warn(`${pixelEnvName} não definido. Evento não será enviado.`);
    return { success: false, error: `${pixelEnvName} not set` };
  }

  // 🔥 NOVO SISTEMA DE DEDUPLICAÇÃO ROBUSTO
  let finalEventId = event_id;
  if (!finalEventId) {
    // Para eventos Purchase, usar o sistema de deduplicação robusto
    if (event_name === 'Purchase' && token) {
      finalEventId = generatePurchaseEventId(token);
      console.log(`🔥 Purchase event_id gerado via sistema de deduplicação: ${finalEventId}`);
    } else if (['AddToCart', 'InitiateCheckout'].includes(event_name) && token) {
      // 🔥 NOVO: Para AddToCart e InitiateCheckout, usar sistema robusto com janela de tempo
      finalEventId = generateRobustEventId(token, event_name, 5); // janela de 5 minutos
      console.log(`🔥 ${event_name} event_id gerado via sistema robusto: ${finalEventId}`);
    } else {
      finalEventId = generateEventId(event_name, telegram_id || token || '', event_time);
      console.log(`⚠️ event_id não fornecido. Gerado automaticamente: ${finalEventId}`);
    }
  }

  // 🔥 NOVO: Buscar cookies do SessionTracking se telegram_id fornecido e fbp/fbc não estão definidos
  let finalFbp = fbp;
  let finalFbc = fbc;
  let finalIpAddress = client_ip_address || client_ip || ip;
  let finalUserAgent = client_user_agent || userAgent;

  let hasValidFbp = hasValidPixelValue(finalFbp, validateFbpFormat);
  let hasValidFbc = hasValidPixelValue(finalFbc, validateFbcFormat);

  if (telegram_id && (!hasValidFbp || !hasValidFbc)) {
    try {
      const sessionTracking = getSessionTracking();
      const sessionData = sessionTracking.getTrackingData(telegram_id);

      if (sessionData) {
        // Usar dados do SessionTracking apenas se não foram fornecidos
        if (!hasValidFbp && hasValidPixelValue(sessionData.fbp, validateFbpFormat)) {
          finalFbp = sessionData.fbp;
          hasValidFbp = true;
          console.log(`🔥 FBP recuperado do SessionTracking para telegram_id ${telegram_id}`);
        }
        if (!hasValidFbc && hasValidPixelValue(sessionData.fbc, validateFbcFormat)) {
          finalFbc = sessionData.fbc;
          hasValidFbc = true;
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

  if (!hasValidFbp) {
    finalFbp = null;
  }
  if (!hasValidFbc) {
    finalFbc = null;
  }

  // 🔥 SINCRONIZAÇÃO DE TIMESTAMP: Usar timestamp do cliente quando disponível
  let finalEventTime = event_time;
  let timestampSource = 'event_time (fornecido)';

  if (typeof client_timestamp === 'number' && !Number.isNaN(client_timestamp)) {
    const syncedTimestamp = generateSyncedTimestamp(client_timestamp, event_time);

    if (typeof syncedTimestamp === 'number' && !Number.isNaN(syncedTimestamp)) {
      finalEventTime = syncedTimestamp;

      if (syncedTimestamp === client_timestamp) {
        timestampSource = 'cliente (sincronizado)';
      } else if (syncedTimestamp === event_time) {
        timestampSource = 'event_time (fallback por divergência)';
      } else {
        timestampSource = 'fallback (erro)';
      }
      
      console.log(`🕐 [WHATSAPP-SYNC] Timestamp sincronizado: ${client_timestamp} → ${finalEventTime} (${timestampSource})`);
    } else {
      timestampSource = 'event_time (fallback por erro)';
      console.log(`⚠️ [WHATSAPP-SYNC] Falha na sincronização, usando fallback: ${finalEventTime}`);
    }
  } else {
    console.log(`ℹ️ [WHATSAPP-SYNC] client_timestamp não fornecido, usando event_time: ${finalEventTime}`);
  }

  // 🔥 NOVO SISTEMA DE DEDUPLICAÇÃO UNIFICADO PARA TODOS OS EVENTOS
  console.log(`🔍 DEDUPLICAÇÃO ROBUSTA | ${source.toUpperCase()} | ${event_name}`);
  console.log(`   - event_id: ${finalEventId}`);
  console.log(`   - transaction_id: ${token || 'N/A'}`);
  console.log(`   - source: ${source}`);
  console.log(`   - event_time: ${finalEventTime}`);
  
  // Verificar se evento já foi enviado usando sistema robusto
  const alreadySent = await isEventAlreadySent(finalEventId, source, event_name);
  if (alreadySent) {
    console.log(`🔄 ${event_name} duplicado detectado e ignorado | ${source} | ${finalEventId}`);
    return { success: false, duplicate: true };
  }

  console.log(`🕐 Timestamp final usado: ${finalEventTime} | Fonte: ${timestampSource} | Evento: ${event_name}`);

  const ipValid = finalIpAddress && finalIpAddress !== '::1' && finalIpAddress !== '127.0.0.1';
  const finalIp = ipValid ? finalIpAddress : undefined;

  console.log(`📤 Evento enviado: ${event_name} | Valor: ${value} | IP: ${finalIp || 'null'} | Fonte: ${source.toUpperCase()}`);
  
  // 🔥 Log de rastreamento invisível
  if (telegram_id && (hasValidFbp || hasValidFbc)) {
    console.log(
      `🔥 Rastreamento invisível ativo - Telegram ID: ${telegram_id} | FBP: ${hasValidFbp} | FBC: ${hasValidFbc}`
    );
  }

  // Log de auditoria de segurança
  logSecurityAudit(`send_${event_name.toLowerCase()}`, token, user_data_hash, source);

  // 🔥 PLANO DE DEDUPLICAÇÃO: Usar apenas user_data passado, sem fallbacks
  let finalUserData = { ...user_data }; // Usar user_data já pronto do endpoint

  // Se user_data não foi passado ou está vazio, montar apenas com dados básicos disponíveis
  if (!user_data || Object.keys(user_data).length === 0) {
    finalUserData = {};
    
    // Adicionar apenas parâmetros básicos se disponíveis (sem fallbacks)
    if (hasValidFbp) finalUserData.fbp = finalFbp;
    if (hasValidFbc) finalUserData.fbc = finalFbc;
    if (finalIp) finalUserData.client_ip_address = finalIp;
    if (finalUserAgent) finalUserData.client_user_agent = finalUserAgent;

    // Para eventos Purchase, adicionar external_id apenas se necessário
    if (event_name === 'Purchase' && (telegram_id || finalFbp)) {
      const extId = generateExternalId(telegram_id, finalFbp, finalIpAddress);
      finalUserData.external_id = extId;
      console.log('🔐 external_id gerado para Purchase (fallback)');
    }

    // Para AddToCart, adicionar external_id usando hash do token se disponível
    if (event_name === 'AddToCart' && (token || telegram_id)) {
      const idToHash = token || telegram_id.toString();
      const externalIdHash = crypto.createHash('sha256').update(idToHash).digest('hex');
      finalUserData.external_id = externalIdHash;
      console.log(`🔐 external_id gerado para AddToCart usando ${token ? 'token' : 'telegram_id'} (fallback)`);
    }
  } else {
    console.log('✅ Usando user_data já pronto do endpoint (sem fallbacks)');
  }

  // 🔥 MELHORIA: Enriquecer com user_data_hash apenas se disponível (sem fallbacks)
  if (user_data_hash) {
    // Validar segurança dos dados hasheados antes de usar
    const validation = validateHashedDataSecurity(user_data_hash);
    if (!validation.valid) {
      console.error(`❌ Dados hasheados com problemas de segurança: ${validation.warnings.join(', ')}`);
    }

    // Mapear campos hasheados para o objeto user_data final apenas se não existirem
    if (user_data_hash.em && !finalUserData.em) finalUserData.em = [user_data_hash.em];
    if (user_data_hash.ph && !finalUserData.ph) finalUserData.ph = [user_data_hash.ph];
    if (user_data_hash.fn && !finalUserData.fn) finalUserData.fn = [user_data_hash.fn];
    if (user_data_hash.ln && !finalUserData.ln) finalUserData.ln = [user_data_hash.ln];
    
    console.log('👤 Dados de usuário (PII) hasheados adicionados para enriquecer o evento.');
  }

  // Validação específica para AddToCart: precisa de pelo menos 2 parâmetros obrigatórios
  if (event_name === 'AddToCart') {
    const requiredParams = ['fbp', 'fbc', 'client_ip_address', 'client_user_agent', 'external_id'];
    const availableParams = requiredParams.filter(param => finalUserData[param]);
    
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

  // 🔥 LOGS DE DEBUG PARA DEDUPLICAÇÃO
  console.log('[CAPI-DEDUPE] Enviando evento para Facebook:', {
    event_name: event_name,
    event_id: finalEventId,
    user_data: finalUserData
  });

  console.log('🔧 user_data final:', JSON.stringify(finalUserData));

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
    user_data: finalUserData, // 🔥 USAR finalUserData em vez de user_data
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

  const requestPayload = {
    data: [eventPayload]
  };

  // 🔥 ADICIONAR test_event_code na raiz do payload SEMPRE para WhatsApp CAPI
  // Código de teste removido - pronto para produção

  // 🔥 LOGS DE DEBUG EXCLUSIVOS PARA CAPI DO WHATSAPP
  // Verificar se é um evento do CAPI do WhatsApp (source === 'capi' e event_name === 'Purchase')
  if (isWhatsAppCapiEvent) {
    const partialToken =
      accessToken && accessToken.length > 12
        ? `${accessToken.slice(0, 6)}...${accessToken.slice(-6)}`
        : accessToken || 'não configurado';
    console.log(`[CAPI-DEBUG] [WhatsApp] Enviando evento ${event_name} para Pixel ID: ${pixelId}`);
    console.log(`[CAPI-DEBUG] [WhatsApp] Access Token (parcial): ${partialToken}`);
    console.log(`[CAPI-DEBUG] [WhatsApp] event_id: ${finalEventId}`);
  }

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
  console.log(JSON.stringify(requestPayload, null, 2));
  console.log('----------------------------------------------------');



      try {
    const url = `https://graph.facebook.com/v18.0/${pixelId}/events`;

    const res = await axios.post(
      url,
      requestPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Evento ${event_name} enviado com sucesso via ${source.toUpperCase()}:`, res.data);

    // 🔥 REGISTRAR TODOS OS EVENTOS NO SISTEMA DE DEDUPLICAÇÃO ROBUSTO
    const dedupValueForDatabase = finalValue ?? null;

    try {
      await markEventAsSent({
        event_id: finalEventId,
        transaction_id: token || 'unknown',
        event_name: event_name,
        value: dedupValueForDatabase,
        currency: currency,
        source: source,
        fbp: finalFbp,
        fbc: finalFbc,
        external_id: finalUserData.external_id,
        ip_address: finalIp,
        user_agent: finalUserAgent
      });
      console.log(`🔥 ${event_name} registrado no sistema de deduplicação robusto: ${finalEventId} (${source})`);
    } catch (error) {
      console.error(`❌ Erro ao registrar ${event_name} no sistema de deduplicação:`, error);
      // Não falhar o envio por causa do registro de deduplicação
    }

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
      'cron': 'cron_sent',
      'webhook': 'capi_sent'
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
    
    console.log(`🏷️ Flag ${flagColumn} (${source}) atualizada para token ${token}`);
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

function buildInitiateCheckoutEvent(options = {}) {
  const {
    telegramId,
    eventTime = Math.floor(Date.now() / 1000),
    eventId = null,
    eventSourceUrl = null,
    externalIdHash,
    zipHash = null,
    fbp = null,
    fbc = null,
    client_ip_address = null,
    client_user_agent = null,
    utms = {},
    actionSource = 'system_generated',
    contentType = 'product'
  } = options;

  if (!telegramId) {
    throw new Error('telegramId is required to build InitiateCheckout event');
  }

  if (!externalIdHash) {
    throw new Error('externalIdHash is required to build InitiateCheckout event');
  }

  const userData = {
    external_id: externalIdHash
  };

  if (zipHash) {
    userData.zip = zipHash;
  }

  if (fbp) {
    userData.fbp = fbp;
  }

  if (fbc) {
    userData.fbc = fbc;
  }

  if (client_ip_address) {
    userData.client_ip_address = client_ip_address;
  }

  if (client_user_agent) {
    userData.client_user_agent = client_user_agent;
  }

  const customData = {
    content_type: contentType
  };

  const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  utmFields.forEach(field => {
    if (utms && typeof utms === 'object' && utms[field]) {
      customData[field] = utms[field];
    }
  });

  const eventPayload = {
    event_name: 'InitiateCheckout',
    event_time: eventTime,
    telegram_id: telegramId,
    user_data: userData,
    custom_data: customData,
    action_source: actionSource,
    source: 'capi'
  };

  if (eventId) {
    eventPayload.event_id = eventId;
  }

  if (eventSourceUrl) {
    eventPayload.event_source_url = eventSourceUrl;
  }

  if (client_ip_address) {
    eventPayload.client_ip_address = client_ip_address;
  }

  if (client_user_agent) {
    eventPayload.client_user_agent = client_user_agent;
  }

  return eventPayload;
}

async function sendInitiateCheckoutCapi(options = {}) {
  const eventPayload = buildInitiateCheckoutEvent(options);
  return sendFacebookEvent(eventPayload);
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
  generateRobustEventId, // 🔥 NOVA FUNÇÃO EXPORTADA
  buildInitiateCheckoutEvent,
  sendInitiateCheckoutCapi,
  router
};
