const maxmind = require('maxmind');
const path = require('path');

let cityReader = null;

async function initGeo() {
  try {
    const dbPath = path.join(__dirname, 'GeoLite2-City.mmdb');
    
    if (!require('fs').existsSync(dbPath)) {
      console.log('[GEO] Arquivo GeoLite2-City.mmdb não encontrado');
      return false;
    }

    cityReader = await maxmind.open(dbPath);
    console.log('[GEO] DB pronto - GeoLite2-City carregado');
    return true;
  } catch (error) {
    console.error('[GEO] Erro ao carregar DB:', error.message);
    return false;
  }
}

function getClientIP(req) {
  // Priorizar X-Forwarded-For (primeiro IP)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0];
  }

  // Fallback para outros headers
  const realIP = req.headers['x-real-ip'];
  if (realIP) return realIP;

  const cfConnectingIP = req.headers['cf-connecting-ip'];
  if (cfConnectingIP) return cfConnectingIP;

  // IP direto da conexão
  const remoteAddr = req.connection?.remoteAddress || 
                    req.socket?.remoteAddress || 
                    req.ip;

  if (remoteAddr) {
    // Remover prefixo IPv6 se presente
    return remoteAddr.replace(/^::ffff:/, '');
  }

  return null;
}

function geoMiddleware(req, res, next) {
  try {
    const clientIP = getClientIP(req);
    
    if (!cityReader || !clientIP) {
      req.geo = {
        source: 'maxmind',
        country: null,
        state: null,
        stateCode: null,
        city: null,
        lat: null,
        lon: null
      };
      return next();
    }

    const geoData = cityReader.get(clientIP);
    
    if (!geoData) {
      req.geo = {
        source: 'maxmind',
        country: null,
        state: null,
        stateCode: null,
        city: null,
        lat: null,
        lon: null
      };
      return next();
    }

    req.geo = {
      source: 'maxmind',
      country: geoData.country?.iso_code || null,
      state: geoData.subdivisions?.[0]?.names?.en || null,
      stateCode: geoData.subdivisions?.[0]?.iso_code || null,
      city: geoData.city?.names?.en || null,
      lat: geoData.location?.latitude || null,
      lon: geoData.location?.longitude || null
    };

    next();
  } catch (error) {
    console.error('[GEO] Erro no middleware:', error.message);
    req.geo = {
      source: 'maxmind',
      country: null,
      state: null,
      stateCode: null,
      city: null,
      lat: null,
      lon: null
    };
    next();
  }
}

module.exports = {
  initGeo,
  geoMiddleware
};
