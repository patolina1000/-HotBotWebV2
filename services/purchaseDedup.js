/**
 * Serviço de Deduplicação para Eventos Facebook
 * Gerencia deduplicação entre Pixel (Browser) e CAPI (Server)
 * Suporta: Purchase, AddToCart, InitiateCheckout
 */

const { Pool } = require('pg');
const crypto = require('crypto');

// Cache em memória para deduplicação rápida
const memoryCache = new Map();
const transactionCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const MAX_CACHE_SIZE = 1000;
const DEFAULT_MARK_EXPIRES_MS = 5 * 24 * 60 * 60 * 1000; // 5 dias

function isPurchaseEventName(name) {
  const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
  return (
    normalized === 'purchase' ||
    normalized === 'subscribe' ||
    normalized === 'starttrial' ||
    normalized === 'start_trial'
  );
}

// Pool de conexão do banco (será injetado)
let pool = null;

/**
 * Inicializar o serviço com pool de conexão
 */
function initialize(databasePool) {
  pool = databasePool;
  console.log('[PURCHASE-DEDUP] Serviço inicializado');
  console.log(`[PURCHASE-DEDUP] Cache TTL configurado para ${CACHE_TTL_MS / 60000} minutos`);
  if (pool) {
    setImmediate(async () => {
      try {
        const columns = await pool.query(
          `SELECT column_name, data_type
           FROM information_schema.columns
           WHERE table_name = 'purchase_event_dedup'
           ORDER BY ordinal_position`
        );
        console.log('[PURCHASE-DEDUP] 📐 Schema detectado (colunas)', columns.rows);

        const indexes = await pool.query(
          `SELECT indexname, indexdef
           FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = 'purchase_event_dedup'
           ORDER BY indexname`
        );
        console.log('[PURCHASE-DEDUP] 🧭 Índices detectados', indexes.rows);
      } catch (error) {
        console.error('[PURCHASE-DEDUP] ❌ Erro ao inspecionar schema', error.message);
      }
    });
  }
}

/**
 * Gerar event_id baseado no transaction_id e tipo de evento
 */
function generatePurchaseEventId(transactionId) {
  if (!transactionId) {
    throw new Error('transaction_id é obrigatório para gerar event_id');
  }
  
  const input = `pur:${transactionId}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * 🔥 NOVA FUNÇÃO: Gerar event_id robusto baseado em transaction_id + event_name + janela de tempo
 */
function generateRobustEventId(transactionId, eventName, timeWindowMinutes = 5) {
  if (!transactionId || !eventName) {
    throw new Error('transaction_id e event_name são obrigatórios');
  }
  
  // Normalizar timestamp para janela de tempo (ex: 5 minutos)
  const now = Math.floor(Date.now() / 1000);
  const windowSize = timeWindowMinutes * 60; // converter para segundos
  const normalizedTime = Math.floor(now / windowSize) * windowSize;
  
  const input = `${eventName.toLowerCase()}:${transactionId}:${normalizedTime}`;
  const eventId = crypto.createHash('sha256').update(input).digest('hex');
  
  console.log(`🔥 EventID robusto gerado: ${eventName} | ${transactionId} | janela: ${timeWindowMinutes}min | ID: ${eventId.substring(0, 16)}...`);
  
  return eventId;
}

/**
 * Verificar se evento já foi enviado (cache em memória)
 */
function isEventInMemoryCache(eventId, source, eventName = 'Purchase') {
  if (!isPurchaseEventName(eventName)) {
    return false;
  }

  const key = `${eventId}_${source}`;
  const cached = memoryCache.get(key);
  
  if (!cached) return false;
  
  // Verificar se ainda está dentro do TTL
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Adicionar evento ao cache em memória
 */
function addToMemoryCache(eventId, source, data, eventName = 'Purchase') {
  if (!isPurchaseEventName(eventName)) {
    return;
  }

  const key = `${eventId}_${source}`;
  
  // Limitar tamanho do cache
  if (memoryCache.size >= MAX_CACHE_SIZE) {
    // Remover o item mais antigo
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  
  memoryCache.set(key, {
    eventId,
    source,
    data,
    timestamp: Date.now()
  });
}

function getTransactionCacheKey(transactionId, eventName = 'Purchase') {
  if (!transactionId || !isPurchaseEventName(eventName)) {
    return null;
  }

  return `${eventName.toLowerCase()}:${String(transactionId).toLowerCase()}`;
}

function isTransactionInMemoryCache(transactionId, eventName = 'Purchase') {
  const key = getTransactionCacheKey(transactionId, eventName);
  if (!key) {
    return false;
  }

  const cached = transactionCache.get(key);
  if (!cached) {
    return false;
  }

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    transactionCache.delete(key);
    return false;
  }

  return true;
}

function addTransactionToMemoryCache(transactionId, eventName = 'Purchase', data = null) {
  const key = getTransactionCacheKey(transactionId, eventName);
  if (!key) {
    return;
  }

  if (transactionCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = transactionCache.keys().next().value;
    transactionCache.delete(oldestKey);
  }

  transactionCache.set(key, {
    transactionId,
    eventName,
    data,
    timestamp: Date.now()
  });
}

function normalizeExpiresAt(value) {
  if (!value && value !== 0) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = numeric > 1e12 ? numeric : numeric * 1000;
      return new Date(millis);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function ensureExpiresAt(value) {
  const normalized = normalizeExpiresAt(value);
  if (normalized) {
    return normalized;
  }
  return new Date(Date.now() + DEFAULT_MARK_EXPIRES_MS);
}

/**
 * Verificar se evento já foi enviado (banco de dados)
 */
async function isEventInDatabase(eventId, source, eventName = 'Purchase') {
  if (!isPurchaseEventName(eventName)) {
    return false;
  }

  if (!pool) {
    console.warn('[PURCHASE-DEDUP] Pool de banco não disponível, usando apenas cache em memória');
    return false;
  }
  
  try {
    const query = `
      SELECT id, created_at, expires_at 
      FROM purchase_event_dedup 
      WHERE event_id = $1 AND source = $2
    `;
    
    const result = await pool.query(query, [eventId, source]);
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const row = result.rows[0];
    
    // Verificar se não expirou
    if (new Date() > new Date(row.expires_at)) {
      // Remover registro expirado
      await pool.query('DELETE FROM purchase_event_dedup WHERE id = $1', [row.id]);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[PURCHASE-DEDUP] Erro ao verificar no banco:', error);
    // Em caso de erro no banco, usar apenas cache em memória
    return false;
  }
}

/**
 * Registrar evento no banco de dados
 */
async function registerEventInDatabase(eventData) {
  if (!isPurchaseEventName(eventData?.event_name)) {
    return;
  }

  if (!pool) {
    console.warn('[PURCHASE-DEDUP] Pool de banco não disponível, usando apenas cache em memória');
    return;
  }
  
  try {
    const {
      event_id,
      transaction_id,
      event_name = 'Purchase',
      value,
      currency = 'BRL',
      source,
      fbp,
      fbc,
      external_id,
      ip_address,
      user_agent,
      created_at,
      expires_at
    } = eventData;

    // 🔥 CORREÇÃO: Tentar inserir com transaction_id, se falhar, inserir sem ela
    let query = `
      INSERT INTO purchase_event_dedup (
        event_id, transaction_id, event_name, value, currency, source,
        fbp, fbc, external_id, ip_address, user_agent, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (event_id) DO UPDATE SET
        transaction_id = EXCLUDED.transaction_id,
        value = EXCLUDED.value,
        currency = EXCLUDED.currency,
        source = EXCLUDED.source,
        fbp = EXCLUDED.fbp,
        fbc = EXCLUDED.fbc,
        external_id = EXCLUDED.external_id,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        expires_at = EXCLUDED.expires_at
      RETURNING id
    `;

    const sanitizedValue =
      value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))
        ? null
        : value;

    const expiresAtValue = ensureExpiresAt(expires_at);
    let createdAtValue;
    if (created_at instanceof Date) {
      createdAtValue = created_at;
    } else if (created_at) {
      const parsedCreatedAt = new Date(created_at);
      createdAtValue = Number.isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt;
    } else {
      createdAtValue = new Date();
    }

    let values = [
      event_id,
      transaction_id,
      event_name,
      sanitizedValue,
      currency,
      source,
      fbp,
      fbc,
      external_id,
      ip_address,
      user_agent,
      createdAtValue,
      expiresAtValue
    ];

    let result;
    try {
      result = await pool.query(query, values);
    } catch (error) {
      // Se erro indica que coluna transaction_id não existe, tentar sem ela
      if (error.message && error.message.includes('transaction_id')) {
        console.warn('[PURCHASE-DEDUP] Coluna transaction_id não existe, inserindo sem ela');

        query = `
          INSERT INTO purchase_event_dedup (
            event_id, event_name, value, currency, source,
            fbp, fbc, external_id, ip_address, user_agent, created_at, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (event_id) DO UPDATE SET
            value = EXCLUDED.value,
            currency = EXCLUDED.currency,
            source = EXCLUDED.source,
            fbp = EXCLUDED.fbp,
            fbc = EXCLUDED.fbc,
            external_id = EXCLUDED.external_id,
            ip_address = EXCLUDED.ip_address,
            user_agent = EXCLUDED.user_agent,
            expires_at = EXCLUDED.expires_at
          RETURNING id
        `;

        values = [
          event_id,
          event_name,
          sanitizedValue,
          currency,
          source,
          fbp,
          fbc,
          external_id,
          ip_address,
          user_agent,
          createdAtValue,
          expiresAtValue
        ];

        result = await pool.query(query, values);
      } else {
        throw error;
      }
    }
    
    console.log('[PURCHASE-DEDUP] 🧾 Registro persistido', {
      event_id,
      transaction_id,
      source,
      value: sanitizedValue,
      currency,
      fbp,
      fbc,
      external_id,
      ip_address,
      user_agent,
      expires_at: expiresAtValue
    });

    if (result.rows.length > 0) {
      console.log(`[PURCHASE-DEDUP] Evento registrado no banco: ${event_id} (${source})`);
    } else {
      console.log(`[PURCHASE-DEDUP] Evento já existia no banco: ${event_id} (${source})`);
    }
  } catch (error) {
    console.error('[PURCHASE-DEDUP] Erro ao registrar no banco:', error);
    // Em caso de erro no banco, continuar apenas com cache em memória
    console.warn('[PURCHASE-DEDUP] Continuando apenas com cache em memória');
  }
}

/**
 * Verificar se evento Purchase já foi enviado
 */
async function isPurchaseAlreadySent(eventId, source) {
  const eventName = 'Purchase';

  // 1. Verificar cache em memória primeiro (mais rápido)
  if (isEventInMemoryCache(eventId, source, eventName)) {
    console.log(`[PURCHASE-DEDUP] Evento encontrado no cache em memória: ${eventId} (${source})`);
    return true;
  }

  // 2. Verificar banco de dados
  const inDatabase = await isEventInDatabase(eventId, source, eventName);
  if (inDatabase) {
    console.log(`[PURCHASE-DEDUP] Evento encontrado no banco: ${eventId} (${source})`);
    return true;
  }
  
  return false;
}

/**
 * 🔥 NOVA FUNÇÃO: Verificar se qualquer evento já foi enviado (robusto)
 */
async function isEventAlreadySent(eventId, source, eventName = 'Purchase') {
  if (!isPurchaseEventName(eventName)) {
    return false;
  }

  // 1. Verificar cache em memória primeiro (mais rápido)
  if (isEventInMemoryCache(eventId, source, eventName)) {
    console.log(`[EVENT-DEDUP] ${eventName} encontrado no cache em memória: ${eventId} (${source})`);
    return true;
  }

  // 2. Verificar banco de dados
  const inDatabase = await isEventInDatabase(eventId, source, eventName);
  if (inDatabase) {
    console.log(`[EVENT-DEDUP] ${eventName} encontrado no banco: ${eventId} (${source})`);
    return true;
  }
  
  return false;
}

async function persistPurchaseRecord(recordInput) {
  if (!recordInput || typeof recordInput !== 'object') {
    return;
  }

  const record = { ...recordInput };
  record.event_name = record.event_name || 'Purchase';
  record.source = record.source || 'capi';
  if (!record.event_id && record.transaction_id) {
    record.event_id = generatePurchaseEventId(record.transaction_id);
  }
  if (record.transaction_id) {
    record.transaction_id = String(record.transaction_id).trim();
  }
  if (record.event_id) {
    record.event_id = String(record.event_id).trim();
  }
  record.currency = record.currency ? String(record.currency).toUpperCase() : 'BRL';
  record.expires_at = ensureExpiresAt(record.expires_at);

  const { event_id: eventId, source } = record;
  if (!eventId) {
    console.warn('[PURCHASE-DEDUP] Registro sem event_id ignorado');
    return;
  }

  if (record.created_at) {
    const createdAtDate = new Date(record.created_at);
    record.created_at = Number.isNaN(createdAtDate.getTime()) ? new Date() : createdAtDate;
  } else {
    record.created_at = new Date();
  }

  addToMemoryCache(eventId, source, record, record.event_name);

  if (record.transaction_id) {
    addTransactionToMemoryCache(record.transaction_id, record.event_name, record);
  }

  await registerEventInDatabase(record);

  console.log(`[PURCHASE-DEDUP] Evento marcado como enviado: ${eventId} (${source})`);
}

/**
 * Registrar evento Purchase como enviado
 */
async function markPurchaseAsSent(transactionIdOrRecord, expiresAt = null, metadata = {}) {
  if (transactionIdOrRecord && typeof transactionIdOrRecord === 'object' && !Array.isArray(transactionIdOrRecord)) {
    const record = { ...transactionIdOrRecord };
    if (!record.expires_at) {
      const metaExpires = metadata?.expires_at || metadata?.expiresAt || null;
      record.expires_at = expiresAt || metaExpires || null;
    }
    await persistPurchaseRecord(record);
    return;
  }

  const transactionId = transactionIdOrRecord;
  if (!transactionId) {
    return;
  }

  let extraMeta = metadata;
  let expiresInput = expiresAt;

  if (expiresAt && typeof expiresAt === 'object' && !(expiresAt instanceof Date)) {
    extraMeta = expiresAt;
    expiresInput = extraMeta?.expires_at || extraMeta?.expiresAt || null;
  }

  const record = {
    transaction_id: transactionId,
    event_id: extraMeta?.eventId || extraMeta?.event_id || generatePurchaseEventId(transactionId),
    event_name: extraMeta?.eventName || extraMeta?.event_name || 'Purchase',
    value: extraMeta?.value ?? null,
    currency: extraMeta?.currency || 'BRL',
    source: extraMeta?.source || 'capi',
    fbp: extraMeta?.fbp || null,
    fbc: extraMeta?.fbc || null,
    external_id: extraMeta?.external_id || extraMeta?.externalId || null,
    ip_address: extraMeta?.client_ip || extraMeta?.ip_address || null,
    user_agent: extraMeta?.client_ua || extraMeta?.user_agent || null,
    created_at: extraMeta?.created_at || extraMeta?.createdAt || new Date(),
    expires_at: expiresInput || extraMeta?.expires_at || extraMeta?.expiresAt || null
  };

  await persistPurchaseRecord(record);
}

/**
 * 🔥 NOVA FUNÇÃO: Registrar qualquer evento como enviado (robusto)
 */
async function markEventAsSent(eventData) {
  const { event_id, source, event_name = 'Purchase' } = eventData;

  if (!isPurchaseEventName(event_name)) {
    return;
  }

  const record = { ...eventData, event_name };

  // 1. Adicionar ao cache em memória
  addToMemoryCache(event_id, source, record, event_name);

  if (record.transaction_id) {
    addTransactionToMemoryCache(record.transaction_id, event_name, record);
  }

  // 2. Registrar no banco de dados
  await registerEventInDatabase(record);

  console.log(`[EVENT-DEDUP] ${event_name} marcado como enviado: ${event_id} (${source})`);
}

async function isTransactionAlreadySent(transactionId, eventName = 'Purchase') {
  if (!transactionId || !isPurchaseEventName(eventName)) {
    return false;
  }

  if (isTransactionInMemoryCache(transactionId, eventName)) {
    console.log(`[EVENT-DEDUP] ${eventName} encontrado no cache por transaction_id: ${transactionId}`);
    return true;
  }

  if (!pool) {
    console.warn('[PURCHASE-DEDUP] Pool de banco não disponível para verificação por transaction_id');
    return false;
  }

  try {
    const query = `
      SELECT id, created_at, expires_at
      FROM purchase_event_dedup
      WHERE transaction_id = $1 AND event_name = $2
    `;

    const result = await pool.query(query, [transactionId, eventName]);

    if (result.rows.length === 0) {
      return false;
    }

    const row = result.rows[0];
    if (new Date() > new Date(row.expires_at)) {
      await pool.query('DELETE FROM purchase_event_dedup WHERE id = $1', [row.id]);
      return false;
    }

    console.log(`[EVENT-DEDUP] ${eventName} encontrado no banco por transaction_id: ${transactionId}`);
    addTransactionToMemoryCache(transactionId, eventName, { id: row.id });
    return true;
  } catch (error) {
    console.error('[PURCHASE-DEDUP] Erro ao verificar transaction_id no banco:', error);
    return false;
  }
}

/**
 * Limpar cache em memória
 */
function cleanupMemoryCache() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, value] of memoryCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      memoryCache.delete(key);
      cleaned++;
    }
  }

  let transactionsCleaned = 0;
  for (const [key, value] of transactionCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      transactionCache.delete(key);
      transactionsCleaned++;
    }
  }

  if (cleaned > 0 || transactionsCleaned > 0) {
    console.log(
      `[PURCHASE-DEDUP] Cache limpo: ${cleaned} itens por event_id e ${transactionsCleaned} por transaction_id removidos`
    );
  }
}

/**
 * Limpar registros expirados do banco
 */
async function cleanupExpiredDatabase() {
  if (!pool) return;

  try {
    const result = await pool.query(`
      DELETE FROM funnel_events
      WHERE event_name = 'purchase'
        AND occurred_at < NOW() - INTERVAL '7 days'
    `);

    const deletedCountRaw =
      typeof result.rowCount === 'number'
        ? result.rowCount
        : typeof result.affectedRows === 'number'
          ? result.affectedRows
          : typeof result.changes === 'number'
            ? result.changes
            : Number(result?.rows?.[0]?.count ?? 0);

    const deletedCount = Number.isFinite(deletedCountRaw) ? deletedCountRaw : 0;

    if (deletedCount > 0) {
      console.log(`[PURCHASE-DEDUP] Limpeza concluída: ${deletedCount} registros removidos`);
    } else {
      console.log('[PURCHASE-DEDUP] Nenhum registro expirado para limpar');
    }
  } catch (error) {
    const message = error?.message || '';
    const normalizedMessage = message.toLowerCase();
    const isSQLiteError =
      normalizedMessage.includes('sqlite') ||
      normalizedMessage.includes('no such function') ||
      normalizedMessage.includes('near "now"') ||
      normalizedMessage.includes("near 'now'") ||
      normalizedMessage.includes('near "interval"') ||
      normalizedMessage.includes("near 'interval'");

    if (isSQLiteError) {
      console.log('[PURCHASE-DEDUP] Cleanup ignorado no SQLite');
      return;
    }

    console.error('[PURCHASE-DEDUP] Erro ao limpar:', message);
  }
}

/**
 * Obter estatísticas de deduplicação
 */
async function getDedupStats() {
  const stats = {
    memory_cache_size: memoryCache.size,
    memory_cache_max: MAX_CACHE_SIZE,
    database_stats: null
  };
  
  if (pool) {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT event_id) as unique_events,
          COUNT(CASE WHEN source = 'pixel' THEN 1 END) as pixel_events,
          COUNT(CASE WHEN source = 'capi' THEN 1 END) as capi_events,
          COUNT(CASE WHEN expires_at < CURRENT_TIMESTAMP THEN 1 END) as expired_events
        FROM purchase_event_dedup
      `);
      
      stats.database_stats = result.rows[0];
    } catch (error) {
      console.error('[PURCHASE-DEDUP] Erro ao obter estatísticas:', error);
    }
  }
  
  return stats;
}

// Limpeza automática a cada 5 minutos
setInterval(() => {
  cleanupMemoryCache();
  cleanupExpiredDatabase();
}, 5 * 60 * 1000);

module.exports = {
  initialize,
  generatePurchaseEventId,
  generateRobustEventId, // 🔥 NOVA FUNÇÃO EXPORTADA
  isPurchaseAlreadySent,
  isEventAlreadySent, // 🔥 NOVA FUNÇÃO EXPORTADA
  markPurchaseAsSent,
  markEventAsSent, // 🔥 NOVA FUNÇÃO EXPORTADA
  isTransactionAlreadySent,
  cleanupMemoryCache,
  cleanupExpiredDatabase,
  getDedupStats
};
