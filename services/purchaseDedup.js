/**
 * Serviço de Deduplicação para Eventos Facebook
 * Gerencia deduplicação entre Pixel (Browser) e CAPI (Server)
 * Suporta: Purchase, AddToCart, InitiateCheckout
 */

const { Pool } = require('pg');
const crypto = require('crypto');

// Cache em memória para deduplicação rápida
const memoryCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const MAX_CACHE_SIZE = 1000;

// Pool de conexão do banco (será injetado)
let pool = null;

/**
 * Inicializar o serviço com pool de conexão
 */
function initialize(databasePool) {
  pool = databasePool;
  console.log('[PURCHASE-DEDUP] Serviço inicializado');
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
function isEventInMemoryCache(eventId, source) {
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
function addToMemoryCache(eventId, source, data) {
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

/**
 * Verificar se evento já foi enviado (banco de dados)
 */
async function isEventInDatabase(eventId, source) {
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
      user_agent
    } = eventData;
    
    const query = `
      INSERT INTO purchase_event_dedup (
        event_id, transaction_id, event_name, value, currency, source,
        fbp, fbc, external_id, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id
    `;
    
    const sanitizedValue =
      value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))
        ? null
        : value;

    const values = [
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
      user_agent
    ];
    
    const result = await pool.query(query, values);
    
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
  // 1. Verificar cache em memória primeiro (mais rápido)
  if (isEventInMemoryCache(eventId, source)) {
    console.log(`[PURCHASE-DEDUP] Evento encontrado no cache em memória: ${eventId} (${source})`);
    return true;
  }
  
  // 2. Verificar banco de dados
  const inDatabase = await isEventInDatabase(eventId, source);
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
  // 1. Verificar cache em memória primeiro (mais rápido)
  if (isEventInMemoryCache(eventId, source)) {
    console.log(`[EVENT-DEDUP] ${eventName} encontrado no cache em memória: ${eventId} (${source})`);
    return true;
  }
  
  // 2. Verificar banco de dados
  const inDatabase = await isEventInDatabase(eventId, source);
  if (inDatabase) {
    console.log(`[EVENT-DEDUP] ${eventName} encontrado no banco: ${eventId} (${source})`);
    return true;
  }
  
  return false;
}

/**
 * Registrar evento Purchase como enviado
 */
async function markPurchaseAsSent(eventData) {
  const { event_id, source } = eventData;
  
  // 1. Adicionar ao cache em memória
  addToMemoryCache(event_id, source, eventData);
  
  // 2. Registrar no banco de dados
  await registerEventInDatabase(eventData);
  
  console.log(`[PURCHASE-DEDUP] Evento marcado como enviado: ${event_id} (${source})`);
}

/**
 * 🔥 NOVA FUNÇÃO: Registrar qualquer evento como enviado (robusto)
 */
async function markEventAsSent(eventData) {
  const { event_id, source, event_name = 'Purchase' } = eventData;
  
  // 1. Adicionar ao cache em memória
  addToMemoryCache(event_id, source, eventData);
  
  // 2. Registrar no banco de dados
  await registerEventInDatabase(eventData);
  
  console.log(`[EVENT-DEDUP] ${event_name} marcado como enviado: ${event_id} (${source})`);
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
  
  if (cleaned > 0) {
    console.log(`[PURCHASE-DEDUP] Cache limpo: ${cleaned} itens removidos`);
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
  cleanupMemoryCache,
  cleanupExpiredDatabase,
  getDedupStats
};
