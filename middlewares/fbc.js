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

module.exports = function extractFbc(req, res, next) {
  const cookies = parseCookies(req.headers['cookie'] || '');
  const fbclid = req.query.fbclid || req.body?.fbclid || cookies.fbclid || null;
  let fbc = req.body?.fbc || req.body?._fbc || cookies._fbc || cookies.fbc;
  let source = null;

  if (!isValidFbc(fbc)) {
    const base = fbclid || Math.random().toString(36).substring(2, 10);
    source = fbclid ? 'fbclid' : 'fallback';
    fbc = `fb.1.${Math.floor(Date.now() / 1000)}.${base}`;
  }

  req.fbclid = fbclid || null;
  req.fbc = fbc;
  req.fbc_source = source; // null | 'fbclid' | 'fallback'
  next();
};
