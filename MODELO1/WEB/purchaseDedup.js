/**
 * [SERVER-FIRST] Purchase Event ID Generator
 * Generates deterministic event_id for deduplication between CAPI and Pixel
 */
(function(window) {
  'use strict';

  /**
   * Generates deterministic event_id for Purchase events
   * Format: pur:${transactionId}
   * @param {string} txnId - Transaction ID
   * @returns {string} Event ID
   */
  function generatePurchaseEventId(txnId) {
    if (!txnId) {
      console.warn('[PURCHASE-DEDUP] Transaction ID missing, using timestamp fallback');
      return `pur:${Date.now()}`;
    }
    return `pur:${txnId}`;
  }

  // Export globally
  window.generatePurchaseEventId = generatePurchaseEventId;

  console.log('[PURCHASE-DEDUP] Module loaded');

})(window);
