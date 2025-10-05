const express = require('express');
const router = express.Router();

const { upsertTelegramUser, getTelegramUserById } = require('../services/telegramUsers');
const { normalizeZipHash, sendInitiateCheckoutEvent } = require('../services/metaCapi');

function extractStartPayload(message = {}) {
  if (!message) {
    return null;
  }

  if (typeof message.start_payload === 'string' && message.start_payload.trim()) {
    return message.start_payload.trim();
  }

  const text = typeof message.text === 'string' ? message.text : '';
  const entities = Array.isArray(message.entities) ? message.entities : [];

  const commandEntity = entities.find(entity => entity.type === 'bot_command' && entity.offset === 0);
  if (commandEntity && typeof text === 'string') {
    const payload = text.substring(commandEntity.offset + commandEntity.length).trim();
    if (payload) {
      return payload;
    }
  }

  if (text.startsWith('/start')) {
    const payload = text.slice('/start'.length).trim();
    if (payload) {
      return payload;
    }
  }

  return null;
}

function decodePayload(payload) {
  if (!payload) {
    return null;
  }
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('[Telegram Webhook] Erro ao decodificar payload:', error.message);
    return null;
  }
}

function resolveClientIp(req, payloadIp) {
  if (payloadIp && typeof payloadIp === 'string' && payloadIp.trim()) {
    return payloadIp.trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return String(forwarded[0]).trim();
  }
  if (req.ip) {
    return req.ip;
  }
  return null;
}

function buildEventId(telegramId, createdAt) {
  const createdDate = createdAt ? new Date(createdAt) : new Date();
  const timestamp = Number.isFinite(createdDate.getTime())
    ? Math.floor(createdDate.getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  return `${telegramId}-ic-${timestamp}`;
}

function extractUtmData(utm = {}) {
  if (!utm || typeof utm !== 'object') {
    return {};
  }
  const {
    utm_source = null,
    utm_medium = null,
    utm_campaign = null,
    utm_content = null,
    utm_term = null
  } = utm;
  return {
    utm_source: utm_source || null,
    utm_medium: utm_medium || null,
    utm_campaign: utm_campaign || null,
    utm_content: utm_content || null,
    utm_term: utm_term || null
  };
}

router.post('/telegram/webhook', async (req, res) => {
  try {
    const update = req.body;
    if (!update || typeof update !== 'object') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const message = update.message || update.edited_message || null;
    if (!message || !message.from || !message.from.id) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const payloadBase64 = extractStartPayload(message);
    if (!payloadBase64) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const parsedPayload = decodePayload(payloadBase64);
    if (!parsedPayload) {
      return res.status(200).json({ ok: false, error: 'invalid_payload' });
    }

    const telegramId = String(message.from.id);
    const utmData = extractUtmData(parsedPayload.utm_data);
    const zipHash = normalizeZipHash(parsedPayload.zip);
    const clientIpAddress = resolveClientIp(req, parsedPayload.client_ip_address || parsedPayload.client_ip);
    const clientUserAgent = parsedPayload.client_user_agent || req.get('user-agent') || null;
    const eventSourceUrl = parsedPayload.event_source_url || parsedPayload.landing_url || null;

    const upserted = await upsertTelegramUser({
      telegramId,
      externalIdHash: parsedPayload.external_id || parsedPayload.external_id_hash,
      fbp: parsedPayload.fbp,
      fbc: parsedPayload.fbc,
      zipHash,
      clientIp: clientIpAddress,
      userAgent: clientUserAgent,
      utmSource: utmData.utm_source,
      utmMedium: utmData.utm_medium,
      utmCampaign: utmData.utm_campaign,
      utmContent: utmData.utm_content,
      utmTerm: utmData.utm_term,
      eventSourceUrl
    });

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = buildEventId(telegramId, upserted?.criado_em);

    const sendResult = await sendInitiateCheckoutEvent({
      telegramId,
      eventTime,
      eventSourceUrl: upserted?.event_source_url || eventSourceUrl,
      eventId,
      externalIdHash: upserted?.external_id_hash || parsedPayload.external_id || parsedPayload.external_id_hash,
      fbp: upserted?.fbp || parsedPayload.fbp,
      fbc: upserted?.fbc || parsedPayload.fbc,
      zipHash: upserted?.zip_hash || zipHash,
      clientIpAddress: upserted?.ip_capturado || clientIpAddress,
      clientUserAgent: upserted?.ua_capturado || clientUserAgent,
      utmData: {
        utm_source: upserted?.utm_source || utmData.utm_source,
        utm_medium: upserted?.utm_medium || utmData.utm_medium,
        utm_campaign: upserted?.utm_campaign || utmData.utm_campaign,
        utm_content: upserted?.utm_content || utmData.utm_content,
        utm_term: upserted?.utm_term || utmData.utm_term
      }
    });

    return res.status(200).json({ ok: true, event_id: eventId, capi: sendResult });
  } catch (error) {
    console.error('[Telegram Webhook] Erro inesperado:', error);
    return res.status(200).json({ ok: false, error: 'internal_error' });
  }
});

router.get('/debug/telegram_user/:id', async (req, res) => {
  try {
    const telegramId = String(req.params.id || '').trim();
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id_required' });
    }

    const user = await getTelegramUserById(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'not_found' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('[Telegram Debug] Erro ao buscar usuário:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/debug/capi/initiate', async (req, res) => {
  try {
    const telegramId = String(req.body.telegram_id || req.body.telegramId || '').trim();
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id_required' });
    }

    const user = await getTelegramUserById(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'not_found' });
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = buildEventId(telegramId, user.criado_em);

    const sendResult = await sendInitiateCheckoutEvent({
      telegramId,
      eventTime,
      eventSourceUrl: user.event_source_url,
      eventId,
      externalIdHash: user.external_id_hash,
      fbp: user.fbp,
      fbc: user.fbc,
      zipHash: user.zip_hash,
      clientIpAddress: user.ip_capturado,
      clientUserAgent: user.ua_capturado,
      utmData: {
        utm_source: user.utm_source,
        utm_medium: user.utm_medium,
        utm_campaign: user.utm_campaign,
        utm_content: user.utm_content,
        utm_term: user.utm_term
      }
    });

    return res.json({ ok: sendResult.success, event_id: eventId, capi: sendResult });
  } catch (error) {
    console.error('[Telegram Debug] Erro ao reenviar InitiateCheckout:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
