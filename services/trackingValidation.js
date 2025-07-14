function isRealTrackingData(data) {
  if (!data) return false;
  const { fbp, fbc, ip, user_agent } = data;

  const validFbp = fbp && typeof fbp === 'string' && !/FALLBACK/i.test(fbp.trim());
  const validFbc = fbc && typeof fbc === 'string' && !/FALLBACK/i.test(fbc.trim());

  if (!validFbp || !validFbc) {
    return false;
  }

  const ipIsServer = ip === '127.0.0.1' || ip === '::1';
  const uaIsServer = typeof user_agent === 'string' && /^axios\//i.test(user_agent);

  if (ipIsServer || uaIsServer) {
    return false;
  }

  return true;
}

module.exports = { isRealTrackingData };

