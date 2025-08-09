const axios = require('axios');

module.exports = async function httpLog(payload, opts = {}) {
  const { url, data } = payload || {};
  if (!url) return;
  await axios.post(url, data, { timeout: opts.timeout });
};
