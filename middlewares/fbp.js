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

module.exports = function extractFbp(req, res, next) {
  const cookies = parseCookies(req.headers['cookie'] || '');
  const fbp = req.body?.fbp || req.body?._fbp || cookies._fbp || cookies.fbp || null;
  req.fbp = fbp;
  next();
};
