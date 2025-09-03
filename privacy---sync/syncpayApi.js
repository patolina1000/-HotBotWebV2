const axios = require('axios');
const { getToken } = require('./authService');

const API_BASE = 'https://api.syncpayments.com.br/api/partner/v1';

async function syncpayGet(endpoint, config = {}) {
  const token = await getToken();
  return axios.get(`${API_BASE}${endpoint}`, {
    ...config,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(config.headers || {})
    }
  });
}

async function syncpayPost(endpoint, data, config = {}) {
  const token = await getToken();
  return axios.post(`${API_BASE}${endpoint}`, data, {
    ...config,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(config.headers || {})
    }
  });
}

module.exports = { syncpayGet, syncpayPost };
