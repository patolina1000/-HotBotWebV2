const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const panelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

function hashFragment(value) {
  if (!value) {
    return null;
  }
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function requirePanelToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const expected = process.env.PANEL_ACCESS_TOKEN || 'admin123';

  if (!token || token !== expected) {
    const masked = hashFragment(token) || 'missing';
    console.warn('[panel-auth] acesso negado', {
      path: req.originalUrl,
      token_hash: masked
    });
    return res.status(403).json({ error: 'unauthorized' });
  }

  res.locals.panelTokenHash = hashFragment(token);
  return next();
}

module.exports = {
  panelLimiter,
  requirePanelToken,
  hashFragment
};
