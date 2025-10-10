/**
 * [SERVER-FIRST] Facebook Pixel Initialization with T0 tracking
 * Sets up the Pixel and records the mounting timestamp
 */
(function(window) {
  'use strict';

  /**
   * Initializes Facebook Pixel and sets T0 (mounting timestamp)
   * @param {string} pixelId - Facebook Pixel ID
   * @param {object} advancedMatching - Advanced Matching data (optional)
   */
  function ensureFacebookPixel(pixelId, advancedMatching) {
    if (!pixelId) {
      console.error('[PIXEL] Cannot initialize without Pixel ID');
      return;
    }

    // [SERVER-FIRST] Record T0 - moment of pixel mounting
    window.__purchase_t0 = performance.now();
    console.log('[SERVER-FIRST][PIXEL] T0 definido:', window.__purchase_t0);

    // Initialize guards
    if (typeof window.__purchase_capi_sent === 'undefined') {
      window.__purchase_capi_sent = false;
    }
    if (typeof window.__purchase_pixel_scheduled === 'undefined') {
      window.__purchase_pixel_scheduled = false;
    }
    if (typeof window.__purchase_pixel_fired === 'undefined') {
      window.__purchase_pixel_fired = false;
    }

    // Initialize Pixel
    if (window.__fbqReady && window.__fbqReady()) {
      try {
        if (advancedMatching) {
          // [SERVER-FIRST] AM client reduzido; enriquecimento fica no CAPI
          window.fbq('init', pixelId, advancedMatching);
          console.log('[PIXEL] ✅ Meta Pixel inicializado com AM:', pixelId);
        } else {
          window.fbq('init', pixelId);
          console.log('[PIXEL] ✅ Meta Pixel inicializado:', pixelId);
        }
      } catch (err) {
        console.error('[PIXEL] ❌ Erro ao inicializar Pixel:', err);
      }
    } else {
      console.warn('[PIXEL] ⚠️ fbq não está pronto ainda');
    }
  }

  // Export globally
  window.ensureFacebookPixel = ensureFacebookPixel;

  console.log('[SERVER-FIRST][PIXEL] Module loaded');

})(window);
