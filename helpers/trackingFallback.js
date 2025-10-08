const { getPool, executeQuery } = require('../database/postgres');

/**
 * Helper para buscar dados de tracking histórico (IP/UA) 
 * quando o evento não nasce de uma request de browser
 */

/**
 * Busca tracking por telegram_id
 * @param {string} telegramId 
 * @returns {Promise<{ip: string|null, user_agent: string|null}>}
 */
async function getTrackingByTelegramId(telegramId) {
  if (!telegramId) {
    return { ip: null, user_agent: null };
  }

  const pool = getPool();
  if (!pool) {
    console.warn('[TRACKING-FALLBACK] Pool PostgreSQL não disponível');
    return { ip: null, user_agent: null };
  }

  try {
    // Tentar buscar da tabela telegram_users primeiro (dados do /start)
    const telegramUserQuery = `
      SELECT ip_capturado as ip, ua_capturado as user_agent
      FROM telegram_users
      WHERE telegram_id = $1
      LIMIT 1
    `;
    const result = await executeQuery(pool, telegramUserQuery, [telegramId]);
    
    if (result.rows.length > 0 && (result.rows[0].ip || result.rows[0].user_agent)) {
      console.log('[TRACKING-FALLBACK] Dados encontrados em telegram_users', {
        telegram_id: telegramId,
        has_ip: !!result.rows[0].ip,
        has_ua: !!result.rows[0].user_agent
      });
      return {
        ip: result.rows[0].ip || null,
        user_agent: result.rows[0].user_agent || null
      };
    }

    // Fallback: buscar da tabela tracking_data
    const trackingDataQuery = `
      SELECT ip, user_agent
      FROM tracking_data
      WHERE telegram_id = $1
      LIMIT 1
    `;
    const trackingResult = await executeQuery(pool, trackingDataQuery, [telegramId]);
    
    if (trackingResult.rows.length > 0) {
      console.log('[TRACKING-FALLBACK] Dados encontrados em tracking_data', {
        telegram_id: telegramId,
        has_ip: !!trackingResult.rows[0].ip,
        has_ua: !!trackingResult.rows[0].user_agent
      });
      return {
        ip: trackingResult.rows[0].ip || null,
        user_agent: trackingResult.rows[0].user_agent || null
      };
    }

    console.warn('[TRACKING-FALLBACK] Nenhum dado encontrado para telegram_id', { telegram_id: telegramId });
    return { ip: null, user_agent: null };

  } catch (error) {
    console.error('[TRACKING-FALLBACK] Erro ao buscar por telegram_id', {
      telegram_id: telegramId,
      error: error.message
    });
    return { ip: null, user_agent: null };
  }
}

/**
 * Busca tracking por transaction_id
 * @param {string} transactionId 
 * @returns {Promise<{ip: string|null, user_agent: string|null, telegram_id: string|null}>}
 */
async function getTrackingByTransactionId(transactionId) {
  if (!transactionId) {
    return { ip: null, user_agent: null, telegram_id: null };
  }

  const pool = getPool();
  if (!pool) {
    console.warn('[TRACKING-FALLBACK] Pool PostgreSQL não disponível');
    return { ip: null, user_agent: null, telegram_id: null };
  }

  try {
    // Buscar na tabela tokens (que contém os dados de criação)
    const tokensQuery = `
      SELECT 
        ip_criacao as ip, 
        user_agent_criacao as user_agent,
        telegram_id
      FROM tokens
      WHERE id_transacao = $1
      LIMIT 1
    `;
    const result = await executeQuery(pool, tokensQuery, [transactionId]);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('[TRACKING-FALLBACK] Dados encontrados em tokens', {
        transaction_id: transactionId,
        has_ip: !!row.ip,
        has_ua: !!row.user_agent,
        has_telegram_id: !!row.telegram_id
      });

      // Se encontrou telegram_id, tentar buscar dados mais recentes de telegram_users
      if (row.telegram_id) {
        const telegramTracking = await getTrackingByTelegramId(row.telegram_id);
        if (telegramTracking.ip || telegramTracking.user_agent) {
          console.log('[TRACKING-FALLBACK] Usando dados mais recentes de telegram_users');
          return {
            ip: telegramTracking.ip || row.ip || null,
            user_agent: telegramTracking.user_agent || row.user_agent || null,
            telegram_id: row.telegram_id
          };
        }
      }

      return {
        ip: row.ip || null,
        user_agent: row.user_agent || null,
        telegram_id: row.telegram_id || null
      };
    }

    console.warn('[TRACKING-FALLBACK] Nenhum dado encontrado para transaction_id', { transaction_id: transactionId });
    return { ip: null, user_agent: null, telegram_id: null };

  } catch (error) {
    console.error('[TRACKING-FALLBACK] Erro ao buscar por transaction_id', {
      transaction_id: transactionId,
      error: error.message
    });
    return { ip: null, user_agent: null, telegram_id: null };
  }
}

/**
 * Busca tracking por payload_id
 * @param {string} payloadId 
 * @returns {Promise<{ip: string|null, user_agent: string|null}>}
 */
async function getTrackingByPayloadId(payloadId) {
  if (!payloadId) {
    return { ip: null, user_agent: null };
  }

  const pool = getPool();
  if (!pool) {
    console.warn('[TRACKING-FALLBACK] Pool PostgreSQL não disponível');
    return { ip: null, user_agent: null };
  }

  try {
    // Buscar na tabela payloads
    const payloadsQuery = `
      SELECT ip, user_agent
      FROM payloads
      WHERE payload_id = $1
      LIMIT 1
    `;
    const result = await executeQuery(pool, payloadsQuery, [payloadId]);
    
    if (result.rows.length > 0) {
      console.log('[TRACKING-FALLBACK] Dados encontrados em payloads', {
        payload_id: payloadId,
        has_ip: !!result.rows[0].ip,
        has_ua: !!result.rows[0].user_agent
      });
      return {
        ip: result.rows[0].ip || null,
        user_agent: result.rows[0].user_agent || null
      };
    }

    console.warn('[TRACKING-FALLBACK] Nenhum dado encontrado para payload_id', { payload_id: payloadId });
    return { ip: null, user_agent: null };

  } catch (error) {
    console.error('[TRACKING-FALLBACK] Erro ao buscar por payload_id', {
      payload_id: payloadId,
      error: error.message
    });
    return { ip: null, user_agent: null };
  }
}

/**
 * Tenta buscar tracking de múltiplas fontes em ordem de prioridade
 * @param {Object} identifiers - Identificadores disponíveis
 * @param {string} identifiers.transaction_id
 * @param {string} identifiers.telegram_id
 * @param {string} identifiers.payload_id
 * @returns {Promise<{ip: string|null, user_agent: string|null, source: string}>}
 */
async function getTrackingFallback(identifiers = {}) {
  const { transaction_id, telegram_id, payload_id } = identifiers;

  // Prioridade 1: transaction_id (geralmente mais completo)
  if (transaction_id) {
    const tracking = await getTrackingByTransactionId(transaction_id);
    if (tracking.ip || tracking.user_agent) {
      return { 
        ip: tracking.ip, 
        user_agent: tracking.user_agent, 
        source: 'transaction_id',
        telegram_id: tracking.telegram_id 
      };
    }
  }

  // Prioridade 2: telegram_id
  if (telegram_id) {
    const tracking = await getTrackingByTelegramId(telegram_id);
    if (tracking.ip || tracking.user_agent) {
      return { 
        ip: tracking.ip, 
        user_agent: tracking.user_agent, 
        source: 'telegram_id' 
      };
    }
  }

  // Prioridade 3: payload_id
  if (payload_id) {
    const tracking = await getTrackingByPayloadId(payload_id);
    if (tracking.ip || tracking.user_agent) {
      return { 
        ip: tracking.ip, 
        user_agent: tracking.user_agent, 
        source: 'payload_id' 
      };
    }
  }

  console.warn('[TRACKING-FALLBACK] Nenhum dado de tracking encontrado', identifiers);
  return { ip: null, user_agent: null, source: 'none' };
}

module.exports = {
  getTrackingByTelegramId,
  getTrackingByTransactionId,
  getTrackingByPayloadId,
  getTrackingFallback
};