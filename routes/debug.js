const express = require('express');
const crypto = require('crypto');
const postgres = require('../database/postgres');
const { getInstance: getSessionTracking } = require('../services/sessionTracking');
const facebookService = require('../services/facebook');
const utmifyService = require('../services/utmify');
const { panelLimiter, requirePanelToken, hashFragment } = require('../middleware/panelAccess');

const router = express.Router();

router.use(panelLimiter);
router.use(requirePanelToken);

router.use((req, res, next) => {
  const requestId = req.requestId || null;
  const tokenHash = res.locals.panelTokenHash || 'unknown';
  console.log('[panel-access] debug', {
    req_id: requestId,
    token_hash: tokenHash,
    path: req.path
  });
  next();
});

const { buildInitiateCheckoutEvent, sendInitiateCheckoutCapi, sendPurchaseCapi } = facebookService;

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function toIso(value) {
  if (!value && value !== 0) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function fetchTrackingRow(telegramId) {
  const pool = postgres.getPool();
  if (!pool) {
    return { db: null, cache: null };
  }

  const sessionTracking = getSessionTracking();
  let cache = null;
  try {
    cache = sessionTracking?.getTrackingData(telegramId) || null;
  } catch (error) {
    console.warn('[debug] erro ao acessar cache de tracking', { error: error.message });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM tracking_data WHERE telegram_id = $1 LIMIT 1', [telegramId]);
    const db = rows.length > 0 ? rows[0] : null;
    return { db, cache };
  } catch (error) {
    console.warn('[debug] erro ao consultar tracking_data', { error: error.message });
    return { db: null, cache };
  }
}

function buildTrackingResponse(telegramId, dbRow, cacheRow) {
  const merged = {
    telegram_id: telegramId,
    external_id_hash: pick(dbRow?.external_id_hash, cacheRow?.external_id_hash),
    zip_hash: pick(dbRow?.zip_hash, cacheRow?.zip_hash),
    fbp: pick(dbRow?.fbp, cacheRow?.fbp),
    fbc: pick(dbRow?.fbc, cacheRow?.fbc),
    utm_source: pick(dbRow?.utm_source, cacheRow?.utm_source),
    utm_medium: pick(dbRow?.utm_medium, cacheRow?.utm_medium),
    utm_campaign: pick(dbRow?.utm_campaign, cacheRow?.utm_campaign),
    utm_term: pick(dbRow?.utm_term, cacheRow?.utm_term),
    utm_content: pick(dbRow?.utm_content, cacheRow?.utm_content),
    client_ip_address: pick(dbRow?.client_ip_address, dbRow?.ip, cacheRow?.client_ip_address, cacheRow?.ip),
    client_user_agent: pick(dbRow?.client_user_agent, dbRow?.user_agent, cacheRow?.client_user_agent, cacheRow?.user_agent),
    event_source_url: pick(dbRow?.event_source_url, cacheRow?.event_source_url)
  };

  merged.created_at = toIso(pick(dbRow?.created_at, dbRow?.updated_at, cacheRow?.created_at));
  merged.updated_at = toIso(pick(dbRow?.updated_at, cacheRow?.last_updated));
  merged.cache_created_at = toIso(cacheRow?.created_at);
  merged.cache_last_seen_at = toIso(cacheRow?.last_updated || cacheRow?.last_access);

  return merged;
}

router.get('/health/full', async (req, res) => {
  const requestId = req.requestId || null;
  const checks = {
    database: false,
    fb_pixel_id: Boolean((process.env.FB_PIXEL_ID || '').trim()),
    fb_pixel_token: Boolean((process.env.FB_PIXEL_TOKEN || '').trim()),
    whatsapp_fb_pixel_id: Boolean((process.env.WHATSAPP_FB_PIXEL_ID || '').trim()),
    whatsapp_fb_pixel_token: Boolean((process.env.WHATSAPP_FB_PIXEL_TOKEN || '').trim()),
    utmify_api_url: Boolean((process.env.UTMIFY_API_URL || '').trim()),
    utmify_api_token: Boolean((process.env.UTMIFY_API_TOKEN || '').trim()),
    geo_provider_url: Boolean((process.env.GEO_PROVIDER_URL || 'https://api.ipdata.co').trim()),
    geo_api_key: Boolean((process.env.GEO_API_KEY || '').trim()),
    panel_access_token: Boolean((process.env.PANEL_ACCESS_TOKEN || '').trim())
  };

  try {
    const pool = postgres.getPool();
    if (pool) {
      await pool.query('SELECT 1');
      checks.database = true;
    }
  } catch (error) {
    console.warn('[debug-health] banco indisponível', {
      req_id: requestId,
      error: error.message
    });
  }

  const ok = Object.values(checks).every(value => value === true);

  console.log('[debug-health] full', { req_id: requestId, ok });

  return res.json({ ok, checks });
});

router.get('/capi/dry-run', (req, res) => {
  const requestId = req.requestId || null;
  const type = String(req.query.type || '').trim() || 'InitiateCheckout';

  if (type !== 'InitiateCheckout') {
    return res.status(400).json({ ok: false, error: 'unsupported_type' });
  }

  if (!process.env.FB_PIXEL_ID || !process.env.FB_PIXEL_TOKEN) {
    return res.status(503).json({ ok: false, error: 'pixel_not_configured' });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const hashedId = crypto.createHash('sha256').update('debug-dry-run').digest('hex');
    const sampleEvent = buildInitiateCheckoutEvent({
      telegramId: '0',
      eventTime: now,
      eventId: `dry-run-${now}`,
      externalIdHash: hashedId,
      zipHash: null,
      fbp: 'fb.1.1700000000.dry-run',
      fbc: 'fb.1.1700000000.dry-run',
      utms: { utm_source: 'dry-run' },
      client_ip_address: '0.0.0.0',
      client_user_agent: 'dry-run-agent',
      event_source_url: 'https://example.com/dry-run'
    });

    console.log('[debug-capi] dry-run executado', {
      req_id: requestId,
      type
    });

    return res.json({
      ok: true,
      type,
      event: {
        event_name: sampleEvent.event_name,
        has_user_data: Boolean(sampleEvent.user_data),
        has_custom_data: Boolean(sampleEvent.custom_data)
      }
    });
  } catch (error) {
    console.error('[debug-capi] dry-run falhou', {
      req_id: requestId,
      error: error.message
    });
    return res.status(500).json({ ok: false, error: 'dry_run_failed' });
  }
});

function buildUtms(tracking) {
  return ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].reduce((acc, key) => {
    if (tracking[key]) {
      acc[key] = tracking[key];
    }
    return acc;
  }, {});
}

async function fetchTokenRow(telegramId, token) {
  const pool = postgres.getPool();
  if (!pool) {
    throw new Error('database_unavailable');
  }

  const params = [];
  let query = '';

  if (token) {
    params.push(token);
    query = 'SELECT * FROM tokens WHERE token = $1 OR id_transacao = $1 ORDER BY coalesce(criado_em, data_criacao) DESC LIMIT 1';
    const { rows } = await pool.query(query, params);
    if (rows.length > 0) {
      return rows[0];
    }
  }

  if (!telegramId) {
    return null;
  }

  params.length = 0;
  params.push(String(telegramId));
  query =
    'SELECT * FROM tokens WHERE telegram_id = $1 AND status IN (\'valido\', \'usado\') ORDER BY coalesce(criado_em, data_criacao) DESC LIMIT 1';
  const { rows } = await pool.query(query, params);
  return rows.length > 0 ? rows[0] : null;
}

function parseCurrency(row) {
  return row?.currency || 'BRL';
}

function parseValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(2));
}

router.get('/telegram/:telegramId', async (req, res) => {
  const telegramId = String(req.params.telegramId || '').trim();

  if (!telegramId) {
    return res.status(400).json({ ok: false, error: 'telegram_id_required' });
  }

  const tokenHash = res.locals.panelTokenHash || 'unknown';
  const tgHash = hashFragment(telegramId);

  const { db, cache } = await fetchTrackingRow(telegramId);
  if (!db && !cache) {
    console.log('[debug] tracking ausente', { req_id: req.requestId || null, tg: tgHash, token_hash: tokenHash });
    return res.status(404).json({ ok: false, error: 'tracking_not_found' });
  }

  const tracking = buildTrackingResponse(telegramId, db, cache);
  const fromCache = Boolean(cache);

  console.log('[debug] tracking consultado', {
    req_id: req.requestId || null,
    tg: tgHash,
    token_hash: tokenHash,
    from_cache: fromCache,
    db: Boolean(db)
  });

  return res.json({
    ok: true,
    telegramId,
    fromCache,
    sources: {
      db: Boolean(db),
      cache: fromCache
    },
    tracking
  });
});

router.post('/retry/capi', async (req, res) => {
  const { telegram_id: telegramIdRaw, type, token } = req.body || {};
  const telegramId = telegramIdRaw ? String(telegramIdRaw).trim() : '';
  const normalizedType = type === 'InitiateCheckout' || type === 'Purchase' ? type : null;

  if (!telegramId) {
    return res.status(400).json({ ok: false, error: 'telegram_id_required' });
  }

  if (!normalizedType) {
    return res.status(400).json({ ok: false, error: 'invalid_type' });
  }

  const tokenHash = res.locals.panelTokenHash || 'unknown';
  const tgHash = hashFragment(telegramId);
  const tokenSummary = token ? hashFragment(token) : null;

  console.log('[debug] retry capi solicitado', {
    req_id: req.requestId || null,
    tg: tgHash,
    token_hash: tokenHash,
    type: normalizedType,
    token_provided: Boolean(token)
  });

  const { db, cache } = await fetchTrackingRow(telegramId);
  if (!db && !cache) {
    return res.status(404).json({ ok: false, error: 'tracking_not_found' });
  }

  const tracking = buildTrackingResponse(telegramId, db, cache);
  const utms = buildUtms(tracking);
  const clientIp = tracking.client_ip_address;
  const clientUa = tracking.client_user_agent;

  try {
    if (normalizedType === 'InitiateCheckout') {
      if (!tracking.external_id_hash) {
        return res.status(400).json({ ok: false, error: 'external_id_hash_required' });
      }

      const eventId = `dbg-ic:${telegramId}:${Date.now()}`;
      const eventTime = Math.floor(Date.now() / 1000);
      const result = await sendInitiateCheckoutCapi({
        telegramId,
        eventTime,
        eventId,
        eventSourceUrl: tracking.event_source_url || null,
        externalIdHash: tracking.external_id_hash,
        zipHash: tracking.zip_hash || null,
        fbp: tracking.fbp || null,
        fbc: tracking.fbc || null,
        client_ip_address: clientIp || null,
        client_user_agent: clientUa || null,
        utms
      });

      return res.json({
        ok: Boolean(result?.success),
        event_name: 'InitiateCheckout',
        event_id: eventId,
        duplicate: Boolean(result?.duplicate),
        sent: Boolean(result?.success),
        error: result?.error || null
      });
    }

    const tokenRow = await fetchTokenRow(telegramId, token);
    if (!tokenRow) {
      return res.status(404).json({ ok: false, error: 'token_not_found' });
    }

    const value = parseValue(tokenRow.valor);
    const currency = parseCurrency(tokenRow);
    const eventResult = await sendPurchaseCapi({
      telegramId,
      value,
      currency,
      token: tokenRow.token || token || null,
      eventSourceUrl: tracking.event_source_url || null,
      externalIdHash: tracking.external_id_hash || tokenRow.external_id_hash || null,
      zipHash: tracking.zip_hash || tokenRow.zip_hash || null,
      fbp: tracking.fbp || tokenRow.fbp || null,
      fbc: tracking.fbc || tokenRow.fbc || null,
      client_ip_address: clientIp || tokenRow.ip_criacao || null,
      client_user_agent: clientUa || tokenRow.user_agent || tokenRow.user_agent_criacao || null,
      utms
    });

    console.log('[debug] retry purchase concluído', {
      req_id: req.requestId || null,
      tg: tgHash,
      token_hash: tokenHash,
      purchase_token: tokenSummary,
      success: Boolean(eventResult?.success),
      duplicate: Boolean(eventResult?.duplicate)
    });

    return res.json({
      ok: Boolean(eventResult?.success),
      event_name: 'Purchase',
      event_id: eventResult?.eventId || null,
      duplicate: Boolean(eventResult?.duplicate),
      sent: Boolean(eventResult?.success),
      error: eventResult?.error || null
    });
  } catch (error) {
    console.warn('[debug] retry capi falhou', {
      req_id: req.requestId || null,
      tg: tgHash,
      token_hash: tokenHash,
      type: normalizedType,
      error: error.message
    });
    return res.status(500).json({ ok: false, error: 'capi_retry_failed', message: error.message });
  }
});

router.post('/retry/utmify', async (req, res) => {
  const { telegram_id: telegramIdRaw, token } = req.body || {};
  const telegramId = telegramIdRaw ? String(telegramIdRaw).trim() : '';

  if (!telegramId || !token) {
    return res.status(400).json({ ok: false, error: 'telegram_id_and_token_required' });
  }

  const tokenHash = res.locals.panelTokenHash || 'unknown';
  const tgHash = hashFragment(telegramId);
  const tokenSummary = hashFragment(token);

  console.log('[debug] retry utmify solicitado', {
    req_id: req.requestId || null,
    tg: tgHash,
    token_hash: tokenHash,
    token: tokenSummary
  });

  const { db, cache } = await fetchTrackingRow(telegramId);
  if (!db && !cache) {
    return res.status(404).json({ ok: false, error: 'tracking_not_found' });
  }

  const tracking = buildTrackingResponse(telegramId, db, cache);
  const utms = buildUtms(tracking);

  try {
    const tokenRow = await fetchTokenRow(telegramId, token);
    if (!tokenRow) {
      return res.status(404).json({ ok: false, error: 'token_not_found' });
    }

    const value = parseValue(tokenRow.valor);
    const currency = parseCurrency(tokenRow);
    const ids = {
      external_id_hash: tracking.external_id_hash || tokenRow.external_id_hash || null,
      fbp: tracking.fbp || tokenRow.fbp || null,
      fbc: tracking.fbc || tokenRow.fbc || null,
      zip_hash: tracking.zip_hash || tokenRow.zip_hash || null
    };

    const client = {
      ip: tracking.client_ip_address || tokenRow.ip_criacao || null,
      user_agent: tracking.client_user_agent || tokenRow.user_agent || tokenRow.user_agent_criacao || null
    };

    const result = await utmifyService.postOrder({
      order_id: tokenRow.token || token,
      value,
      currency,
      utm: utms,
      ids,
      client,
      requestId: req.requestId || null
    });

    return res.json({
      ok: Boolean(result?.ok),
      sent: Boolean(result?.sent),
      attempt: result?.attempt || (result?.sent ? 1 : 0),
      error: result?.error || null
    });
  } catch (error) {
    console.warn('[debug] retry utmify falhou', {
      req_id: req.requestId || null,
      tg: tgHash,
      token_hash: tokenHash,
      token: tokenSummary,
      error: error.message
    });
    return res.status(500).json({ ok: false, error: 'utmify_retry_failed', message: error.message });
  }
});

router.get('/config', (req, res) => {
  const tokenHash = res.locals.panelTokenHash || 'unknown';

  const pixelConfigured = Boolean(process.env.FB_PIXEL_ID);
  const accessTokenConfigured = Boolean(process.env.FB_PIXEL_TOKEN || process.env.FB_ACCESS_TOKEN);
  const utmifyConfigured = utmifyService.isConfigured();
  const geoConfigured = Boolean(process.env.GEO_API_KEY || process.env.GEO_PROVIDER);

  console.log('[debug] config consultada', {
    req_id: req.requestId || null,
    token_hash: tokenHash,
    pixel: pixelConfigured,
    utmify: utmifyConfigured,
    geo: geoConfigured
  });

  return res.json({
    ok: true,
    pixelConfigured,
    hasAccessToken: accessTokenConfigured,
    utmifyConfigured,
    geoProviderConfigured: geoConfigured
  });
});

module.exports = router;
