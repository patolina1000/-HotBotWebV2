// src/utils/envioUrl.js
function getEnvioUrl(botId) {
  let n = botId?.match(/\d+/)?.[0]; // 'bot1' -> '1'
  if (!n && botId === 'bot_especial') {
    n = '3';
  }
  const key = n ? `URL_ENVIO_${n}` : null;
  const url = key ? process.env[key] : null;
  return url || null; // nunca adiciona query, nunca gera fallback
}

module.exports = { getEnvioUrl };
