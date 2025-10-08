// utils/envioUrl.js
/**
 * Helper para obter URL de envio por bot via variáveis de ambiente
 * 
 * Cada bot tem sua própria URL configurada em .env:
 * - bot1 → URL_ENVIO_1
 * - bot2 → URL_ENVIO_2
 * - bot3 → URL_ENVIO_3 (especial: nunca recebe query params)
 * - bot4+ → URL_ENVIO_4, URL_ENVIO_5, etc.
 * 
 * IMPORTANTE: Esta função retorna apenas a URL raw do .env
 * NUNCA adiciona UTMs, fbp, fbc ou qualquer query parameter
 */

/**
 * Extrai número do bot_id e retorna URL de envio correspondente
 * @param {string} botId - ID do bot (ex: 'bot1', 'bot2', 'bot3')
 * @returns {string|null} URL de envio ou null se não configurada
 */
function getEnvioUrl(botId) {
  // Extrair número do botId (ex: 'bot1' -> '1', 'bot_especial2' -> '2')
  const match = botId?.match(/\d+/);
  const n = match ? match[0] : null;
  
  if (!n) {
    console.log('[ENVIO-URL] ⚠️ Não foi possível extrair número do bot_id:', botId);
    return null;
  }
  
  const envKey = `URL_ENVIO_${n}`;
  const url = process.env[envKey];
  
  if (!url || url.trim() === '') {
    console.log(`[ENVIO-URL] ⚠️ ${envKey} não configurada no .env`);
    return null;
  }
  
  // Retornar URL raw sem qualquer modificação
  // Não adicionar query params, UTMs, fbp, fbc, etc.
  console.log(`[ENVIO-URL] ✅ ${envKey} encontrada para ${botId}`);
  return url.trim();
}

module.exports = { getEnvioUrl };