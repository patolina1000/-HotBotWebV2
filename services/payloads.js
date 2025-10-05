const { getPool, executeQuery } = require('../database/postgres');

function ensurePool() {
  const pool = getPool();

  if (!pool) {
    throw new Error('PostgreSQL pool is not initialized');
  }

  return pool;
}

function sanitizePayloadId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

async function getPayloadById(payloadId) {
  const sanitized = sanitizePayloadId(payloadId);

  if (!sanitized) {
    return null;
  }

  const pool = ensurePool();

  const query = `
    SELECT payload_id, utm_source, utm_medium, utm_campaign, utm_term,
           utm_content, fbp, fbc, ip, user_agent, kwai_click_id
      FROM payloads
     WHERE payload_id = $1
     LIMIT 1
  `;

  const result = await executeQuery(pool, query, [sanitized]);

  return result.rows[0] || null;
}

module.exports = {
  getPayloadById,
};
