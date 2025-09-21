function getWhatsAppTrackingEnv() {
  const pixelId = process.env.WHATSAPP_FB_PIXEL_ID?.trim();
  const pixelToken = process.env.WHATSAPP_FB_PIXEL_TOKEN?.trim();
  const utmifyToken = process.env.WHATSAPP_UTMIFY_API_TOKEN?.trim();
  const baseUrl = process.env.BASE_URL?.trim();

  if (process.env.NODE_ENV === 'production') {
    const missingVars = [];

    if (!pixelId) {
      missingVars.push('WHATSAPP_FB_PIXEL_ID');
    }

    if (!pixelToken) {
      missingVars.push('WHATSAPP_FB_PIXEL_TOKEN');
    }

    if (!utmifyToken) {
      missingVars.push('WHATSAPP_UTMIFY_API_TOKEN');
    }

    if (missingVars.length > 0) {
      throw new Error(
        `[WhatsApp Tracking] Variáveis obrigatórias ausentes em produção: ${missingVars.join(', ')}`
      );
    }
  }

  return Object.freeze({
    pixelId,
    pixelToken,
    utmifyToken,
    baseUrl
  });
}

module.exports = {
  getWhatsAppTrackingEnv
};
