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
           utm_content, fbp, fbc, ip, user_agent, kwai_click_id,
           geo_country, geo_country_code, geo_region, geo_region_name,
           geo_city, geo_postal_code, geo_ip_query,
           telegram_entry_at, telegram_entry_fbc, telegram_entry_fbp, telegram_entry_fbclid,
           telegram_entry_user_agent, telegram_entry_event_source_url,
           telegram_entry_referrer, telegram_entry_ip
      FROM payloads
     WHERE payload_id = $1
     LIMIT 1
  `;

  const result = await executeQuery(pool, query, [sanitized]);

  return result.rows[0] || null;
}

async function cleanupExpiredPayloads({ olderThanHours = 72 } = {}) {
  const pool = ensurePool();
  const hours = Number.parseInt(olderThanHours, 10);

  if (!Number.isFinite(hours) || hours <= 0) {
    return { deleted: 0 };
  }

  const { rowCount } = await executeQuery(
    pool,
    `DELETE FROM payloads WHERE created_at < NOW() - ($1::int * INTERVAL '1 hour')`,
    [hours]
  );

  return { deleted: rowCount || 0 };
}

async function ensurePayloadIndexes() {
  const pool = ensurePool();

  await executeQuery(
    pool,
    `CREATE INDEX IF NOT EXISTS idx_payloads_created_at ON payloads (created_at)`
  );
}

module.exports = {
  getPayloadById,
  cleanupExpiredPayloads,
  ensurePayloadIndexes
};
