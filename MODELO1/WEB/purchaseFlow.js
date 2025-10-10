/**
 * [SERVER-FIRST] Purchase Flow Manager
 * Handles CAPI immediate dispatch and Pixel scheduling for T0+30s
 */
(function(window) {
  'use strict';

  // [SERVER-FIRST] Fixed delay: 30 seconds
  const PIXEL_PURCHASE_DELAY_MS = 30000;

  /**
   * Sends Purchase event to CAPI immediately (server-first)
   * @param {string} eventId - Event ID for deduplication
   * @param {object} context - Purchase context data
   * @returns {Promise<object>} CAPI response
   */
  async function sendCapiPurchase(eventId, context) {
    if (window.__purchase_capi_sent) {
      console.log('[SERVER-FIRST][PURCHASE-CAPI] Já enviado anteriormente, pulando');
      return { success: false, reason: 'already_sent' };
    }

    console.log('[SERVER-FIRST][PURCHASE-CAPI] Enviando agora (imediato após montar Pixel)', { eventId });

    try {
      const {
        token,
        value,
        currency = 'BRL',
        transaction_id,
        content_ids,
        content_type,
        contents,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        fbclid,
        event_source_url,
        normalized_user_data
      } = context;

      // Build custom_data
      const custom_data = {};
      if (typeof value === 'number') custom_data.value = Number(value.toFixed(2));
      custom_data.currency = currency;
      if (transaction_id) custom_data.transaction_id = transaction_id;
      if (content_ids && content_ids.length) custom_data.content_ids = content_ids;
      if (content_type) custom_data.content_type = content_type;
      if (contents && contents.length) custom_data.contents = contents;
      if (utm_source) custom_data.utm_source = utm_source;
      if (utm_medium) custom_data.utm_medium = utm_medium;
      if (utm_campaign) custom_data.utm_campaign = utm_campaign;
      if (utm_term) custom_data.utm_term = utm_term;
      if (utm_content) custom_data.utm_content = utm_content;
      if (fbclid) custom_data.fbclid = fbclid;

      // Build CAPI payload
      const capiPayload = {
        token,
        event_id: eventId,
        action_source: 'website', // [SERVER-FIRST] sempre 'website'
        event_source_url: event_source_url || window.location.href,
        custom_data,
        normalized_user_data: normalized_user_data || {}
      };

      console.log('[SERVER-FIRST][PURCHASE-CAPI] Payload:', capiPayload);

      const response = await fetch('/api/capi/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload)
      });

      const responseText = await response.text();
      let responseData = null;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        responseData = { raw: responseText };
      }

      if (response.ok) {
        window.__purchase_capi_sent = true;
        const requestId = responseData?.request_id || responseData?.requestId || 'unknown';
        console.log('[SERVER-FIRST][PURCHASE-CAPI] OK 2xx', { eventId, requestId, response: responseData });
        return { success: true, data: responseData };
      } else {
        console.warn('[SERVER-FIRST][PURCHASE-CAPI] erro', { eventId, status: response.status, err: responseData });
        return { success: false, error: responseData };
      }
    } catch (err) {
      console.warn('[SERVER-FIRST][PURCHASE-CAPI] erro', { eventId, err });
      return { success: false, error: err.message };
    }
  }

  /**
   * Schedules Pixel Purchase event for T0 + 30s
   * @param {string} eventId - Event ID for deduplication
   * @param {object} customData - Pixel custom_data
   */
  function schedulePixelPurchaseAtT0PlusDelay(eventId, customData) {
    if (window.__purchase_pixel_scheduled) {
      console.log('[SERVER-FIRST][PURCHASE-BROWSER] Pixel já agendado, pulando');
      return;
    }

    window.__purchase_pixel_scheduled = true;

    const t0 = window.__purchase_t0 || performance.now();
    const fireAt = t0 + PIXEL_PURCHASE_DELAY_MS;
    const delay = Math.max(0, fireAt - performance.now());

    console.log('[SERVER-FIRST][PURCHASE-BROWSER] Pixel agendado para T+30s', {
      eventId,
      t0,
      fireAt,
      delay: `${delay}ms`
    });

    setTimeout(() => {
      if (window.__purchase_pixel_fired) {
        console.log('[SERVER-FIRST][PURCHASE-BROWSER] Pixel já disparado, pulando');
        return;
      }

      window.__purchase_pixel_fired = true;

      if (window.__fbqReady && window.__fbqReady()) {
        try {
          window.fbq('track', 'Purchase', customData, { eventID: eventId });
          console.log('[SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s)', {
            eventId,
            value: customData.value,
            currency: customData.currency,
            transaction_id: customData.transaction_id
          });
        } catch (err) {
          console.error('[SERVER-FIRST][PURCHASE-BROWSER] Erro ao disparar Pixel:', err);
        }
      } else {
        console.warn('[SERVER-FIRST][PURCHASE-BROWSER] fbq não disponível no momento do disparo');
      }
    }, delay);
  }

  /**
   * Builds Pixel custom_data from context
   * @param {object} context - Purchase context
   * @returns {object} Pixel custom_data
   */
  function buildPixelCustomData(context) {
    const {
      value,
      currency = 'BRL',
      transaction_id,
      contents,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      fbclid
    } = context;

    const customData = {};
    
    if (typeof value === 'number') customData.value = Number(value.toFixed(2));
    customData.currency = currency;
    if (transaction_id) customData.transaction_id = transaction_id;
    
    if (contents && contents.length) {
      customData.contents = contents;
      customData.content_ids = contents.map(item => item.id).filter(Boolean);
      customData.content_type = 'product';
      const firstContentWithTitle = contents.find(item => item && item.title);
      if (firstContentWithTitle && firstContentWithTitle.title) {
        customData.content_name = firstContentWithTitle.title;
      }
    }

    if (utm_source) customData.utm_source = utm_source;
    if (utm_medium) customData.utm_medium = utm_medium;
    if (utm_campaign) customData.utm_campaign = utm_campaign;
    if (utm_term) customData.utm_term = utm_term;
    if (utm_content) customData.utm_content = utm_content;
    if (fbclid) customData.fbclid = fbclid;

    return customData;
  }

  // Export globally
  window.PurchaseFlow = {
    sendCapiPurchase,
    schedulePixelPurchaseAtT0PlusDelay,
    buildPixelCustomData,
    PIXEL_PURCHASE_DELAY_MS
  };

  console.log('[SERVER-FIRST][PURCHASE-FLOW] Module loaded');

})(window);
