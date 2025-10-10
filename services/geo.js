const axios = require('axios');

const DEFAULT_BASE_URL = 'https://pro.ip-api.com/json/';
const DEFAULT_FIELDS = 'status,country,countryCode,region,regionName,city,query';
let lastKeyUrlWarningAt = 0;

class GeoConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeoConfigurationError';
    this.code = 'GEO_CONFIG';
  }
}

function maskToken(token) {
  if (!token) {
    return '';
  }

  const str = String(token);
  if (!str) {
    return '';
  }

  if (str.length <= 4) {
    return `${str.slice(0, 1)}***`;
  }

  const prefixLength = str.length >= 6 ? 6 : 4;
  const prefix = str.slice(0, prefixLength);
  return `${prefix}****`;
}

function maskUrl(urlString) {
  if (!urlString) {
    return '';
  }

  try {
    const parsed = new URL(urlString);
    if (parsed.searchParams.has('key')) {
      const keyValue = parsed.searchParams.get('key');
      parsed.searchParams.set('key', maskToken(keyValue));
    }
    return parsed.toString();
  } catch (error) {
    return urlString.replace(/(key=)([^&#]+)/i, (_, prefix, value) => `${prefix}${maskToken(value)}`);
  }
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      sanitized[key] = value.map(item => (typeof item === 'string' ? item : String(item)));
    } else if (value === undefined || value === null) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = value;
    } else {
      sanitized[key] = String(value);
    }
  }
  return sanitized;
}

function resolveBaseUrl() {
  const rawUrl = (process.env.GEO_API_URL || process.env.GEO_PROVIDER_URL || '').trim();
  if (rawUrl) {
    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    return `https://${rawUrl}`;
  }
  return DEFAULT_BASE_URL;
}

function buildIpApiUrl(ip) {
  const trimmedIp = typeof ip === 'string' ? ip.trim() : '';
  const encodedIp = trimmedIp ? encodeURIComponent(trimmedIp) : '';
  const rawKey = (process.env.GEO_API_KEY || '').trim();
  const baseUrlCandidate = resolveBaseUrl();
  const keyLooksLikeUrl = Boolean(rawKey && /^https?:\/\//i.test(rawKey));

  let baseUrl = baseUrlCandidate;

  if (!process.env.GEO_API_URL && !process.env.GEO_PROVIDER_URL && keyLooksLikeUrl) {
    baseUrl = rawKey;
    const now = Date.now();
    if (!lastKeyUrlWarningAt || now - lastKeyUrlWarningAt > 60000) {
      console.warn('[geo][warn] Detected GEO_API_KEY as URL. Prefer use GEO_API_URL for full URL, or GEO_API_KEY for token only.');
      lastKeyUrlWarningAt = now;
    }
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch (error) {
    throw new GeoConfigurationError(`URL base inválida para GEO_API_URL: ${error.message}`);
  }

  const params = new URLSearchParams(url.search);
  url.search = '';

  const hasPlaceholder = /\{ip\}|:ip/.test(url.pathname || '');
  if (hasPlaceholder) {
    const replacement = encodedIp;
    url.pathname = (url.pathname || '/json/').replace(/\{ip\}|:ip/g, replacement);
    if (!replacement && !url.pathname.endsWith('/')) {
      url.pathname = `${url.pathname}/`;
    }
  } else {
    url.pathname = encodedIp ? `/json/${encodedIp}` : '/json/';
  }

  if (!params.has('fields')) {
    params.set('fields', DEFAULT_FIELDS);
  }

  const hasKeyInUrl = params.has('key');

  if (!hasKeyInUrl) {
    if (rawKey && !keyLooksLikeUrl) {
      params.set('key', rawKey);
    } else if (!rawKey) {
      throw new GeoConfigurationError('GEO_API_KEY não configurada');
    }
  }

  url.search = params.toString();

  const finalUrl = url.toString();
  const maskedUrl = maskUrl(finalUrl);

  const mode = hasKeyInUrl || process.env.GEO_API_URL || process.env.GEO_PROVIDER_URL || keyLooksLikeUrl ? 'URL' : 'KEY';

  return { url: finalUrl, maskedUrl, mode };
}

async function lookupGeo(ip, options = {}) {
  const { timeout = 4000, requestId = null } = options;
  const { url, maskedUrl, mode } = buildIpApiUrl(ip);
  const lookupIp = ip || null;

  console.log('[geo][debug] lookup', {
    url: maskedUrl,
    mode,
    ip: lookupIp,
    timeout,
    request_id: requestId
  });

  try {
    const response = await axios.get(url, { timeout });
    return {
      ok: true,
      mode,
      url,
      maskedUrl,
      status: response.status,
      statusText: response.statusText,
      data: response.data
    };
  } catch (error) {
    const status = error.response?.status ?? null;
    const statusText = error.response?.statusText ?? null;
    const code = error.code || null;
    const data = error.response?.data ?? null;
    const headers = sanitizeHeaders(error.response?.headers);

    console.warn('[geo] lookup falhou', {
      mode,
      url: maskedUrl,
      ip: lookupIp,
      request_id: requestId,
      status,
      statusText,
      code,
      data,
      headers
    });

    return {
      ok: false,
      mode,
      url,
      maskedUrl,
      status,
      statusText,
      code,
      data,
      headers,
      errorMessage: error.message
    };
  }
}

function getGeoEnvironmentSummary() {
  const rawKey = (process.env.GEO_API_KEY || '').trim();
  const rawUrl = (process.env.GEO_API_URL || process.env.GEO_PROVIDER_URL || '').trim();
  const keyLooksLikeUrl = Boolean(rawKey && /^https?:\/\//i.test(rawKey));
  let mode = 'UNCONFIGURED';
  if (rawUrl || keyLooksLikeUrl) {
    mode = 'URL';
  } else if (rawKey) {
    mode = 'KEY';
  }
  return {
    keyConfigured: Boolean(rawKey),
    urlConfigured: Boolean(rawUrl),
    keyLooksLikeUrl,
    mode
  };
}

function isGeoConfigured() {
  const summary = getGeoEnvironmentSummary();
  return summary.keyConfigured || summary.urlConfigured || summary.keyLooksLikeUrl;
}

module.exports = {
  DEFAULT_FIELDS,
  GeoConfigurationError,
  buildIpApiUrl,
  lookupGeo,
  maskToken,
  maskUrl,
  isGeoConfigured,
  getGeoEnvironmentSummary
};
