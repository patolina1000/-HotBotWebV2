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
  let fbp = req.body?.fbp || req.body?._fbp || cookies._fbp || cookies.fbp;
  if (!fbp) {
    fbp = `fb.1.${Date.now()}.${Math.random().toString(36).substring(2,10)}`;
  }
  req.fbp = fbp;
  next();
};
