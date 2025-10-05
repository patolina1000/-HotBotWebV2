const { getPool, executeQuery } = require('../database/postgres');

function ensurePool() {
  const pool = getPool();
  if (!pool) {
    throw new Error('PostgreSQL pool is not initialized');
  }
  return pool;
}

function sanitizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

async function upsertTelegramUser(data) {
  const pool = ensurePool();
  const {
    telegramId,
    externalIdHash = null,
    fbp = null,
    fbc = null,
    zipHash = null,
    clientIp = null,
    userAgent = null,
    utmSource = null,
    utmMedium = null,
    utmCampaign = null,
    utmContent = null,
    utmTerm = null,
    eventSourceUrl = null
  } = data;

  const params = [
    telegramId,
    sanitizeString(externalIdHash),
    sanitizeString(fbp),
    sanitizeString(fbc),
    sanitizeString(zipHash),
    sanitizeString(clientIp),
    sanitizeString(userAgent),
    sanitizeString(utmSource),
    sanitizeString(utmMedium),
    sanitizeString(utmCampaign),
    sanitizeString(utmContent),
    sanitizeString(utmTerm),
    sanitizeString(eventSourceUrl)
  ];

  const query = `
    INSERT INTO telegram_users (
      telegram_id,
      external_id_hash,
      fbp,
      fbc,
      zip_hash,
      ip_capturado,
      ua_capturado,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      event_source_url
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
    )
    ON CONFLICT (telegram_id) DO UPDATE SET
      external_id_hash = COALESCE(EXCLUDED.external_id_hash, telegram_users.external_id_hash),
      fbp = COALESCE(EXCLUDED.fbp, telegram_users.fbp),
      fbc = COALESCE(EXCLUDED.fbc, telegram_users.fbc),
      zip_hash = COALESCE(EXCLUDED.zip_hash, telegram_users.zip_hash),
      ip_capturado = COALESCE(EXCLUDED.ip_capturado, telegram_users.ip_capturado),
      ua_capturado = COALESCE(EXCLUDED.ua_capturado, telegram_users.ua_capturado),
      utm_source = COALESCE(EXCLUDED.utm_source, telegram_users.utm_source),
      utm_medium = COALESCE(EXCLUDED.utm_medium, telegram_users.utm_medium),
      utm_campaign = COALESCE(EXCLUDED.utm_campaign, telegram_users.utm_campaign),
      utm_content = COALESCE(EXCLUDED.utm_content, telegram_users.utm_content),
      utm_term = COALESCE(EXCLUDED.utm_term, telegram_users.utm_term),
      event_source_url = COALESCE(EXCLUDED.event_source_url, telegram_users.event_source_url),
      criado_em = telegram_users.criado_em
    RETURNING telegram_id, external_id_hash, fbp, fbc, zip_hash, ip_capturado, ua_capturado,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, event_source_url, criado_em;
  `;

  const result = await executeQuery(pool, query, params);
  return result.rows[0] || null;
}

async function getTelegramUserById(telegramId) {
  const pool = ensurePool();
  const query = `
    SELECT telegram_id, external_id_hash, fbp, fbc, zip_hash, ip_capturado, ua_capturado,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term, event_source_url, criado_em
      FROM telegram_users
     WHERE telegram_id = $1
  `;
  const result = await executeQuery(pool, query, [telegramId]);
  return result.rows[0] || null;
}

module.exports = {
  upsertTelegramUser,
  getTelegramUserById
};
