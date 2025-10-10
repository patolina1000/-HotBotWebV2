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

async function getPayloadTrackingById(payloadId) {
  const sanitized = sanitizePayloadId(payloadId);

  if (!sanitized) {
    return null;
  }

  const pool = ensurePool();

  const result = await executeQuery(
    pool,
    `SELECT payload_id, telegram_id, fbp, fbc, ip, user_agent,
            geo_country, geo_country_code, geo_region, geo_region_name,
            geo_city, geo_postal_code, geo_ip_query, created_at
       FROM payload_tracking
      WHERE payload_id = $1
      LIMIT 1`,
    [sanitized]
  );

  return result.rows[0] || null;
}

function sanitizeMinutes(value, fallback = 15) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 120);
}

function sanitizeTelegramId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

async function findRecentPayloadTrackingByTelegramId(telegramId, { windowMinutes = 15 } = {}) {
  const sanitizedTelegramId = sanitizeTelegramId(telegramId);
  if (!sanitizedTelegramId) {
    return null;
  }

  const minutes = sanitizeMinutes(windowMinutes);
  const pool = ensurePool();

  const result = await executeQuery(
    pool,
    `SELECT payload_id, telegram_id, fbp, fbc, ip, user_agent,
            geo_country, geo_country_code, geo_region, geo_region_name,
            geo_city, geo_postal_code, geo_ip_query, created_at
       FROM payload_tracking
      WHERE telegram_id = $1::bigint
        AND created_at >= NOW() - ($2::int * INTERVAL '1 minute')
      ORDER BY created_at DESC
      LIMIT 1`,
    [sanitizedTelegramId, minutes]
  );

  return result.rows[0] || null;
}

async function findRecentPayloadTrackingByIp(ip, { windowMinutes = 15 } = {}) {
  if (!ip || typeof ip !== 'string') {
    return null;
  }

  const trimmedIp = ip.trim();
  if (!trimmedIp) {
    return null;
  }

  const minutes = sanitizeMinutes(windowMinutes);
  const pool = ensurePool();

  const result = await executeQuery(
    pool,
    `SELECT payload_id, telegram_id, fbp, fbc, ip, user_agent,
            geo_country, geo_country_code, geo_region, geo_region_name,
            geo_city, geo_postal_code, geo_ip_query, created_at
       FROM payload_tracking
      WHERE ip = $1
        AND created_at >= NOW() - ($2::int * INTERVAL '1 minute')
      ORDER BY created_at DESC
      LIMIT 1`,
    [trimmedIp, minutes]
  );

  return result.rows[0] || null;
}

async function ensurePayloadTelegramLink(payloadId, telegramId) {
  const sanitizedPayloadId = sanitizePayloadId(payloadId);
  const sanitizedTelegramId = sanitizeTelegramId(telegramId);

  if (!sanitizedPayloadId || !sanitizedTelegramId) {
    return { updated: false };
  }

  const pool = ensurePool();

  const result = await executeQuery(
    pool,
    `UPDATE payload_tracking
        SET telegram_id = $2::bigint
      WHERE payload_id = $1
        AND (telegram_id IS DISTINCT FROM $2::bigint)` ,
    [sanitizedPayloadId, sanitizedTelegramId]
  );

  return { updated: (result?.rowCount || 0) > 0 };
}

async function getHydratedPayloadById(payloadId) {
  const sanitized = sanitizePayloadId(payloadId);

  if (!sanitized) {
    return null;
  }

  const [payloadRow, trackingRow] = await Promise.all([
    getPayloadById(sanitized),
    getPayloadTrackingById(sanitized)
  ]);

  if (!payloadRow && !trackingRow) {
    return null;
  }

  const merged = {
    ...(payloadRow || {}),
    payload_tracking: trackingRow || null
  };

  if (!merged.payload_id) {
    merged.payload_id = sanitized;
  }

  const fallbackFields = [
    'fbp',
    'fbc',
    'ip',
    'user_agent',
    'kwai_click_id',
    'geo_country',
    'geo_country_code',
    'geo_region',
    'geo_region_name',
    'geo_city',
    'geo_postal_code',
    'geo_ip_query'
  ];

  if (trackingRow) {
    for (const field of fallbackFields) {
      const current = merged[field];
      if ((current === null || current === undefined || current === '') && trackingRow[field] !== undefined && trackingRow[field] !== null && trackingRow[field] !== '') {
        merged[field] = trackingRow[field];
      }
    }

    if (!merged.created_at && trackingRow.created_at) {
      merged.created_at = trackingRow.created_at;
    }
  }

  return merged;
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
  getPayloadTrackingById,
  findRecentPayloadTrackingByTelegramId,
  findRecentPayloadTrackingByIp,
  ensurePayloadTelegramLink,
  getHydratedPayloadById,
  cleanupExpiredPayloads,
  ensurePayloadIndexes
};
