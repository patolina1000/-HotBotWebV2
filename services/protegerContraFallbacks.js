function protegerContraFallbacks(req, res, next) {
  const userAgent = String(req.get('user-agent') || '').toLowerCase();

  if (/axios\/|node-fetch/i.test(userAgent)) {
    return res.status(400).json({ error: 'Requisição de sistema bloqueada' });
  }

  next();
}

module.exports = protegerContraFallbacks;
