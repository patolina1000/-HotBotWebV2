const { isValidFbc } = require('../services/trackingValidation');

function parseCookies(str = '') {
  const out = {};
  if (!str) return out;
  for (const part of str.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function gerarFallback() {
  return `fb.1.${Math.floor(Date.now() / 1000)}.${Math.random().toString(36).substring(2,10)}`;
}

module.exports = function captureTracking(req, res, next) {
  const cookies = parseCookies(req.headers['cookie'] || '');
  const fbp = cookies._fbp || null;

  let fbc = cookies._fbc;
  let source = null;
  const fbclid = req.query.fbclid || null;

  if (!isValidFbc(fbc)) {
    if (fbclid) {
      fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`;
      source = 'fbclid';
    } else {
      fbc = gerarFallback();
      source = 'fallback';
      console.log('[tracking] fbc fallback usado');
    }
  }

  req.trackingData = Object.assign({}, req.trackingData, { fbp, fbc });
  req.fbp = fbp;
  req.fbc = fbc;
  req.fbc_source = source; // null | 'fbclid' | 'fallback'
  next();
};
