const express = require('express');
const uuid = require('crypto').randomUUID;
const router = express.Router();
const db = require('../database/postgres');
const getPool = db.getPool;

function parseUtmsFromQuery(search) {
  try {
    const params = new URLSearchParams(search || '');
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      utm_term: params.get('utm_term'),
      payload_id: params.get('payload_id') || params.get('start') || null
    };
  } catch (_) { return {}; }
}

function parseUtmsFromReferer(req) {
  try{
    const ref = req.headers['referer'] || req.headers['referrer'] || '';
    if(!ref) return {};
    const url = new URL(ref);
    return parseUtmsFromQuery(url.search);
  }catch(_){
    return {};
  }
}

router.post('/track/welcome', async (req, res) => {
  try{
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    const sessionId = body.session_id || null;
    const payloadId = body.payload_id || null;

    const utmsFromBody = {
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_content: body.utm_content ?? null,
      utm_term: body.utm_term ?? null,
    };

    const utmsFromReferer = parseUtmsFromReferer(req);

    const utm_source = utmsFromBody.utm_source ?? utmsFromReferer.utm_source ?? null;
    const utm_medium = utmsFromBody.utm_medium ?? utmsFromReferer.utm_medium ?? null;
    const utm_campaign = utmsFromBody.utm_campaign ?? utmsFromReferer.utm_campaign ?? null;
    const utm_content = utmsFromBody.utm_content ?? utmsFromReferer.utm_content ?? null;
    const utm_term = utmsFromBody.utm_term ?? utmsFromReferer.utm_term ?? null;

    const eventId = sessionId ? `wel:${sessionId}` : `wel:${uuid()}`;

    const pool = getPool();
    const meta = { utm_source, utm_medium, utm_campaign, utm_term, utm_content };
    const result = await db.insertFunnelEvent(pool, {
      event_id: eventId,
      event_name: 'welcome',
      occurred_at: new Date().toISOString(), // UTC
      session_id: sessionId,
      payload_id: payloadId || utmsFromReferer.payload_id || null,
      meta
    });

    console.log('[TRACK] welcome', { inserted: result.inserted, event_id: eventId });
    return res.json({ ok: true });
  }catch(err){
    console.error('[TRACK_ERR] welcome', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/track/cta_click', async (req, res) => {
  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    const sessionId = body.session_id || null;
    const payloadId = body.payload_id || null;

    const utmsFromBody = {
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_content: body.utm_content ?? null,
      utm_term: body.utm_term ?? null,
    };

    const utmsFromReferer = parseUtmsFromReferer(req);

    const utm_source = utmsFromBody.utm_source ?? utmsFromReferer.utm_source ?? null;
    const utm_medium = utmsFromBody.utm_medium ?? utmsFromReferer.utm_medium ?? null;
    const utm_campaign = utmsFromBody.utm_campaign ?? utmsFromReferer.utm_campaign ?? null;
    const utm_content = utmsFromBody.utm_content ?? utmsFromReferer.utm_content ?? null;
    const utm_term = utmsFromBody.utm_term ?? utmsFromReferer.utm_term ?? null;

    const eventId = payloadId ? `cta:${payloadId}` : (sessionId ? `cta:${sessionId}` : `cta:${uuid()}`);

    const pool = getPool();
    const meta = { utm_source, utm_medium, utm_campaign, utm_term, utm_content };
    const result = await db.insertFunnelEvent(pool, {
      event_id: eventId,
      event_name: 'cta_click',
      occurred_at: new Date().toISOString(),
      session_id: sessionId,
      payload_id: payloadId || utmsFromReferer.payload_id || null,
      meta
    });

    console.log('[TRACK] cta_click', { inserted: result.inserted, event_id: eventId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[TRACK_ERR] cta_click', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
