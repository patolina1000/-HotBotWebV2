const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const { upsertTelegramUser, getTelegramUserById } = require('../services/telegramUsers');
const {
  normalizeZipHash,
  sendInitiateCheckoutEvent,
  sendLeadEvent
} = require('../services/metaCapi');
const { getPayloadById } = require('../services/payloads');

const MAX_START_PAYLOAD_BYTES = 1536;
const PAYLOAD_ID_REGEX = /^[a-f0-9]{6,32}$/i;
const PAYLOAD_ID_WITH_PREFIX_REGEX = /^pid:([a-f0-9]{6,32})$/i;
const FBP_REGEX = /^fb\.1\.\d+\.[\w-]+$/i;
const FBC_REGEX = /^fb\.1\.\d+\.[\w-]+$/i;
const MAX_TRACKING_LENGTH = 128;
const MAX_UTM_LENGTH = 256;

function normalizeGeoString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  const str = String(value).trim();
  return str || null;
}

function extractGeoFromSource(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const nestedGeo = source.geo && typeof source.geo === 'object' ? source.geo : null;
  const lookup = (keys) => {
    for (const key of keys) {
      const normalized = normalizeGeoString((nestedGeo && nestedGeo[key]) ?? source[key]);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  };

  const geo = {
    country: lookup(['geo_country', 'country']),
    country_code: lookup(['geo_country_code', 'country_code', 'countryCode']),
    region: lookup(['geo_region', 'region']),
    region_name: lookup(['geo_region_name', 'region_name', 'regionName']),
    city: lookup(['geo_city', 'city']),
    postal_code: lookup(['geo_postal_code', 'postal_code', 'postalCode', 'zip']),
    ip: lookup(['geo_ip_query', 'ip', 'query'])
  };

  const hasValue = Object.values(geo).some(value => value !== null);
  return hasValue ? geo : null;
}

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
    return { data: null, error: null };
  }

  try {
    const decodedBuffer = Buffer.from(payload, 'base64');
    if (!decodedBuffer || decodedBuffer.length === 0) {
      return { data: null, error: new Error('empty_payload') };
    }
    const decoded = decodedBuffer.toString('utf8');
    return { data: JSON.parse(decoded), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

function extractPayloadIdCandidate(rawValue) {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const trimmed = rawValue.trim();

  if (!trimmed) {
    return null;
  }

  if (PAYLOAD_ID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const prefixedMatch = trimmed.match(PAYLOAD_ID_WITH_PREFIX_REGEX);
  if (prefixedMatch) {
    return prefixedMatch[1].toLowerCase();
  }

  return null;
}

function sanitizeTrackingToken(value, regex) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_TRACKING_LENGTH) {
    const truncated = trimmed.slice(0, MAX_TRACKING_LENGTH);
    return regex.test(truncated) ? truncated : null;
  }

  return regex.test(trimmed) ? trimmed : null;
}

function normalizeUtmValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered.length > MAX_UTM_LENGTH ? lowered.slice(0, MAX_UTM_LENGTH) : lowered;
}

function sanitizeUtmPayload(utm = {}) {
  const normalized = {};
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  keys.forEach(key => {
    const normalizedValue = normalizeUtmValue(utm[key]);
    if (normalizedValue) {
      normalized[key] = normalizedValue;
    }
  });

  return normalized;
}

function buildLogToken(value) {
  if (!value) {
    return null;
  }
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

/**
 * Verifica se um IP é privado (RFC 1918, loopback, etc.)
 */
function isPrivateIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return true;
  }

  const cleanIp = ip.replace(/^::ffff:/, '');
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  if (!ipv4Pattern.test(cleanIp)) {
    if (cleanIp === '::1' || cleanIp === 'localhost') {
      return true;
    }
    // Para IPv6 público válido, aceitar como público
    // Para IPs malformados ou inválidos, rejeitar como privado
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv6Pattern.test(cleanIp)) {
      return false;
    }
    return true;
  }

  const parts = cleanIp.split('.').map(Number);
  if (parts.some(part => part < 0 || part > 255 || isNaN(part))) {
    return true;
  }

  const [a, b] = parts;

  // RFC 1918 ranges + loopback + link-local
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (cleanIp === '0.0.0.0' || cleanIp === 'localhost') return true;

  return false;
}

function resolveClientIp(req, payloadIp) {
  // Se payloadIp fornecido e é público, usar
  if (payloadIp && typeof payloadIp === 'string' && payloadIp.trim() && !isPrivateIP(payloadIp.trim())) {
    return payloadIp.trim();
  }
  
  // Tentar X-Forwarded-For e pegar primeiro IP público
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' 
      ? forwarded.split(',').map(ip => ip.trim()) 
      : (Array.isArray(forwarded) ? forwarded.map(ip => String(ip).trim()) : []);
    
    for (const ip of ips) {
      if (ip && !isPrivateIP(ip)) {
        console.log('[IP-CAPTURE-TELEGRAM] IP público encontrado no X-Forwarded-For:', ip);
        return ip;
      }
    }
  }
  
  // Fallback para req.ip
  if (req.ip && !isPrivateIP(req.ip)) {
    return req.ip;
  }
  
  console.warn('[IP-CAPTURE-TELEGRAM] ⚠️ Nenhum IP público encontrado');
  return null;
}

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function buildEventId(telegramId, createdAt, eventSuffix = 'ic') {
  const createdDate = createdAt ? new Date(createdAt) : new Date();
  const timestamp = Number.isFinite(createdDate.getTime())
    ? Math.floor(createdDate.getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  const normalizedSuffix = typeof eventSuffix === 'string' && eventSuffix.trim()
    ? eventSuffix.trim().toLowerCase()
    : 'evt';
  return `${telegramId}-${normalizedSuffix}-${timestamp}`;
}

function normalizeExternalIdHash(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (SHA256_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

function resolveTestEventCode(req) {
  const headerRaw = req.headers ? req.headers['x-test-event-code'] : null;
  const headerValue = Array.isArray(headerRaw)
    ? String(headerRaw[0] || '').trim()
    : typeof headerRaw === 'string'
      ? headerRaw.trim()
      : '';

  let bodyValue = '';
  if (req.body && typeof req.body === 'object') {
    const rawCandidate = req.body.test_event_code;
    if (typeof rawCandidate === 'string') {
      bodyValue = rawCandidate.trim();
    }
  }

  return headerValue || bodyValue || null;
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
    const requestId = req.requestId || null;
    const update = req.body;
    if (!update || typeof update !== 'object') {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const message = update.message || update.edited_message || null;
    if (!message || !message.from || !message.from.id) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const telegramId = String(message.from.id);
    const trackingContext = { fbc: null, fbp: null, geo: null };

    const payloadBase64 = extractStartPayload(message);
    if (!payloadBase64) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const payloadSize = Buffer.byteLength(payloadBase64, 'utf8');
    if (payloadSize > MAX_START_PAYLOAD_BYTES) {
      console.warn('[Telegram Webhook] start payload muito grande', {
        req_id: requestId,
        size: payloadSize
      });
      return res.status(400).json({ ok: false, error: 'start_payload_too_large' });
    }

    let parsedPayload = null;
    let payloadSource = null;
    let resolvedPayloadId = null;

    const trimmedPayload = typeof payloadBase64 === 'string' ? payloadBase64.trim() : '';
    const candidatePayloadId = extractPayloadIdCandidate(payloadBase64);

    console.log('[BOT-START]', {
      payload_id: candidatePayloadId || null,
      telegram_id: telegramId,
      username: message.from.username || null,
      first_name: message.from.first_name || null,
      last_name: message.from.last_name || null
    });
    if (candidatePayloadId) {
      resolvedPayloadId = candidatePayloadId;
      payloadSource = 'payload_id';

      // // [TELEGRAM-ENTRY] Log do payload_id recebido
      // console.log('[BOT-START] payload_id=', candidatePayloadId, 'telegram_id=', message.from.id);

      try {
        const storedPayload = await getPayloadById(candidatePayloadId);

        if (!storedPayload) {
          console.warn('[Telegram Webhook] payload_id não encontrado', {
            req_id: requestId,
            payload_id_hash: buildLogToken(candidatePayloadId)
          });
          return res.status(400).json({ ok: false, error: 'payload_not_found' });
        }

        const storedGeo = extractGeoFromSource(storedPayload);

        const storedUtmData = extractUtmData(storedPayload);

        // [TELEGRAM-ENTRY] Merge inteligente: priorizar dados da presell, fallback para telegram_entry
        const mergedFbp = storedPayload.fbp || storedPayload.telegram_entry_fbp || null;
        const mergedFbc = storedPayload.fbc || storedPayload.telegram_entry_fbc || null;
        const mergedFbclid = storedPayload.telegram_entry_fbclid || null;
        const mergedIp = storedPayload.ip || storedPayload.telegram_entry_ip || null;
        const mergedUserAgent = storedPayload.user_agent || storedPayload.telegram_entry_user_agent || null;
        const mergedEventSourceUrl = storedPayload.event_source_url ||
                                     storedPayload.telegram_entry_event_source_url ||
                                     storedPayload.landing_url || null;

        console.log('[MERGE-FBC] 🔎 fontes', {
          presell: {
            fbc: storedPayload?.fbc || '(vazio)',
            fbp: storedPayload?.fbp || '(vazio)',
            fbclid: storedPayload?.fbclid || '(vazio)'
          },
          telegram_entry: {
            fbc: storedPayload?.telegram_entry_fbc || '(vazio)',
            fbp: storedPayload?.telegram_entry_fbp || '(vazio)',
            fbclid: storedPayload?.telegram_entry_fbclid || '(vazio)'
          }
        });

        const fbcChosen = storedPayload?.fbc || storedPayload?.telegram_entry_fbc || null;
        const fbpChosen = storedPayload?.fbp || storedPayload?.telegram_entry_fbp || null;
        const fbcSource = storedPayload?.fbc ? 'presell' : (storedPayload?.telegram_entry_fbc ? 'telegram' : 'nenhum');
        const fbpSource = storedPayload?.fbp ? 'presell' : (storedPayload?.telegram_entry_fbp ? 'telegram' : 'nenhum');

        console.log('[MERGE-FBC] ✅ escolhidos', {
          fbc: fbcChosen || '(vazio)',
          fbc_source: fbcSource,
          fbp: fbpChosen || '(vazio)',
          fbp_source: fbpSource
        });

        trackingContext.fbc = trackingContext.fbc ?? fbcChosen ?? null;
        trackingContext.fbp = trackingContext.fbp ?? fbpChosen ?? null;

        if (!trackingContext.fbc && !trackingContext.fbp) {
          console.warn('[MERGE-FBC] ⚠️ FBC e FBP ausentes após merge — verificar captura na presell e no /telegram');
        }

        parsedPayload = {
          external_id: null,
          fbp: mergedFbp,
          fbc: mergedFbc,
          fbclid: mergedFbclid,
          zip: null,
          utm_data: storedUtmData,
          client_ip_address: mergedIp,
          client_user_agent: mergedUserAgent,
          event_source_url: mergedEventSourceUrl,
          landing_url: storedPayload.landing_url || mergedEventSourceUrl || null,
          geo: storedGeo
        };

        trackingContext.geo = trackingContext.geo || storedGeo || null;

        console.log('[bot] start linked', {
          telegram_id: telegramId,
          payload_id: resolvedPayloadId,
          geo_city: storedGeo?.city || null,
          geo_region_name: storedGeo?.region_name || null,
          geo_country: storedGeo?.country || null,
          geo_postal_code: storedGeo?.postal_code || null
        });
      } catch (error) {
        console.error('[Telegram Webhook] Falha ao buscar payload_id', {
          req_id: requestId,
          payload_id_hash: buildLogToken(candidatePayloadId),
          error: error.message
        });
        return res.status(500).json({ ok: false, error: 'payload_lookup_failed' });
      }
    } else {
      const looksLikePayloadId =
        typeof trimmedPayload === 'string' &&
        (/^pid:[a-z0-9]+$/i.test(trimmedPayload) || /^[a-f0-9]+$/i.test(trimmedPayload));
      if (looksLikePayloadId) {
        console.warn('[Telegram Webhook] payload_id com formato inválido', {
          req_id: requestId,
          payload_id_hash: buildLogToken(trimmedPayload)
        });
        return res.status(400).json({ ok: false, error: 'invalid_payload_id_format' });
      }

      const { data: base64Payload, error: base64Error } = decodePayload(payloadBase64);
      if (base64Error || !base64Payload) {
        console.warn('[Telegram Webhook] payload Base64 inválido', {
          req_id: requestId,
          reason: base64Error ? base64Error.message : 'empty_payload'
        });
        return res.status(400).json({ ok: false, error: 'start_payload_invalid_base64' });
      }

      parsedPayload = base64Payload;
      payloadSource = 'base64';
    }

    // const telegramId = String(message.from.id);
    const geoFromPayload = extractGeoFromSource(parsedPayload);
    const resolvedGeo = trackingContext.geo || geoFromPayload || null;
    trackingContext.geo = trackingContext.geo || resolvedGeo || null;

    const utmData = extractUtmData(parsedPayload.utm_data);
    const zipHash = normalizeZipHash(parsedPayload.zip);
    const clientIpAddress = resolveClientIp(req, parsedPayload.client_ip_address || parsedPayload.client_ip);
    const clientUserAgent = parsedPayload.client_user_agent || req.get('user-agent') || null;
    const eventSourceUrl = parsedPayload.event_source_url || parsedPayload.landing_url || null;

    const sanitizedFbp = sanitizeTrackingToken(parsedPayload.fbp, FBP_REGEX);
    const sanitizedFbc = sanitizeTrackingToken(parsedPayload.fbc, FBC_REGEX);
    const sanitizedUtmData = sanitizeUtmPayload(utmData);

    trackingContext.fbp = sanitizedFbp ?? trackingContext.fbp ?? null;
    trackingContext.fbc = sanitizedFbc ?? trackingContext.fbc ?? null;

    const normalizedExternalIdHash = normalizeExternalIdHash(
      parsedPayload.external_id || parsedPayload.external_id_hash
    );

    const upserted = await upsertTelegramUser({
      telegramId,
      externalIdHash: normalizedExternalIdHash,
      fbp: sanitizedFbp,
      fbc: sanitizedFbc,
      zipHash,
      clientIp: clientIpAddress,
      userAgent: clientUserAgent,
      utmSource: sanitizedUtmData.utm_source,
      utmMedium: sanitizedUtmData.utm_medium,
      utmCampaign: sanitizedUtmData.utm_campaign,
      utmContent: sanitizedUtmData.utm_content,
      utmTerm: sanitizedUtmData.utm_term,
      eventSourceUrl,
      geoCountry: resolvedGeo?.country || null,
      geoCountryCode: resolvedGeo?.country_code || null,
      geoRegion: resolvedGeo?.region || null,
      geoRegionName: resolvedGeo?.region_name || null,
      geoCity: resolvedGeo?.city || null,
      geoPostalCode: resolvedGeo?.postal_code || null,
      geoIpQuery: resolvedGeo?.ip || null
    });

    req.state = req.state || {};
    req.state.geo = resolvedGeo || null;

    const eventTime = Math.floor(Date.now() / 1000);
    const overrideTestEventCode = resolveTestEventCode(req);

    const finalExternalIdHash = normalizeExternalIdHash(
      upserted?.external_id_hash || normalizedExternalIdHash
    );

    const finalFbpForSend = upserted?.fbp || sanitizedFbp;
    const finalFbcForSend = upserted?.fbc || sanitizedFbc;
    trackingContext.fbp = finalFbpForSend ?? trackingContext.fbp ?? null;
    trackingContext.fbc = finalFbcForSend ?? trackingContext.fbc ?? null;

    console.log('[LEAD-CAPI] user_data.fbc/fbp', {
      fbc: trackingContext.fbc || '(vazio)',
      fbp: trackingContext.fbp || '(vazio)',
      event_id: '(gerado em metaCapi)'
    });

    const sendResult = await sendLeadEvent({
      telegramId,
      eventTime,
      eventSourceUrl: upserted?.event_source_url || eventSourceUrl,
      externalIdHash: finalExternalIdHash,
      fbp: finalFbpForSend,
      fbc: finalFbcForSend,
      zipHash: upserted?.zip_hash || zipHash,
      clientIpAddress: upserted?.ip_capturado || clientIpAddress,
      clientUserAgent: upserted?.ua_capturado || clientUserAgent,
      utmData: {
        utm_source: upserted?.utm_source || sanitizedUtmData.utm_source,
        utm_medium: upserted?.utm_medium || sanitizedUtmData.utm_medium,
        utm_campaign: upserted?.utm_campaign || sanitizedUtmData.utm_campaign,
        utm_content: upserted?.utm_content || sanitizedUtmData.utm_content,
        utm_term: upserted?.utm_term || sanitizedUtmData.utm_term
      },
      requestId,
      test_event_code: overrideTestEventCode
    });

    const resolvedEventId = sendResult?.event_id || null;

    console.info('[START] evento registrado', {
      req_id: requestId,
      source: payloadSource,
      payload_id_hash: resolvedPayloadId ? buildLogToken(resolvedPayloadId) : null,
      event_id: buildLogToken(resolvedEventId),
      event_name: 'Lead'
    });

    return res.status(200).json({
      ok: true,
      event_name: 'Lead',
      event_id: resolvedEventId,
      capi: Boolean(sendResult?.success),
      test_event_code: sendResult?.test_event_code || null,
      has_min_user_data: Boolean(sendResult?.hasMinUserData),
      capi_details: sendResult || null
    });
  } catch (error) {
    const requestId = req.requestId || null;
    console.error('[Telegram Webhook] Erro inesperado', {
      req_id: requestId,
      error: error.message
    });
    return res.status(500).json({ ok: false, error: 'internal_error' });
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

    const headerTestEventCodeRaw = req.headers['x-test-event-code'];
    const headerTestEventCode = Array.isArray(headerTestEventCodeRaw)
      ? String(headerTestEventCodeRaw[0] || '').trim()
      : typeof headerTestEventCodeRaw === 'string'
        ? headerTestEventCodeRaw.trim()
        : '';
    const bodyTestEventCodeRaw = req.body?.test_event_code;
    const bodyTestEventCode = typeof bodyTestEventCodeRaw === 'string' ? bodyTestEventCodeRaw.trim() : '';
    const overrideTestEventCode = headerTestEventCode || bodyTestEventCode || null;

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
      },
      test_event_code: overrideTestEventCode
    });

    return res.json({ ok: sendResult.success, event_id: eventId, capi: sendResult });
  } catch (error) {
    console.error('[Telegram Debug] Erro ao reenviar InitiateCheckout:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
