/**
 * [SERVER-FIRST] Confirm Form Handler
 * Captures email/phone fields and triggers CAPI if values are present
 */
(function(window) {
  'use strict';

  /**
   * Attempts to capture email from various input selectors
   * @returns {string|null} Email value or null
   */
  function captureEmail() {
    const selectors = [
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      '#email'
    ];

    for (const selector of selectors) {
      try {
        const input = document.querySelector(selector);
        if (input && input.value && input.value.trim()) {
          return input.value.trim();
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    return null;
  }

  /**
   * Attempts to capture phone from various input selectors
   * @returns {string|null} Phone value (digits only) or null
   */
  function capturePhone() {
    const selectors = [
      'input[name*="phone"]',
      'input[name*="telefone"]',
      'input[type="tel"]',
      'input[id*="phone"]',
      '#phone'
    ];

    for (const selector of selectors) {
      try {
        const input = document.querySelector(selector);
        if (input && input.value && input.value.trim()) {
          const digits = input.value.replace(/\D/g, '');
          if (digits.length >= 10) {
            return digits;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    return null;
  }

  /**
   * Checks if both email and phone are available
   * @returns {object} { email, phone, hasValues }
   */
  function captureContactData() {
    const email = captureEmail();
    const phone = capturePhone();
    const hasValues = !!(email && phone);

    console.log('[SERVER-FIRST][FORM] Campos capturados:', {
      email: email ? '✓' : '✗',
      phone: phone ? '✓' : '✗',
      hasValues
    });

    return { email, phone, hasValues };
  }

  /**
   * Normalizes contact data for sending to CAPI
   * @param {string} email - Raw email
   * @param {string} phone - Raw phone (digits only)
   * @returns {object} Normalized user data
   */
  function normalizeContactData(email, phone) {
    const normalizationLib = window.PurchaseNormalization;
    if (!normalizationLib) {
      console.warn('[SERVER-FIRST][FORM] PurchaseNormalization library not loaded');
      return { email, phone };
    }

    // Normalize phone with DDI
    let phoneNormalized = normalizationLib.normalizePhone(phone);
    if (phoneNormalized && (phoneNormalized.length === 10 || phoneNormalized.length === 11)) {
      // Brazilian phone without DDI - add 55
      phoneNormalized = '55' + phoneNormalized;
    }

    return {
      email: normalizationLib.normalizeEmail(email),
      phone: phoneNormalized
    };
  }

  /**
   * Triggers CAPI immediately if email/phone are available
   * @param {object} context - Purchase context
   * @returns {Promise<void>}
   */
  async function triggerCapiIfReady(context) {
    if (window.__purchase_capi_sent) {
      console.log('[SERVER-FIRST][FORM] CAPI já enviado, pulando');
      return;
    }

    const contactData = captureContactData();
    
    if (!contactData.hasValues) {
      console.log('[SERVER-FIRST][FORM] Email/telefone ausentes, aguardando submit do formulário');
      return;
    }

    // We have values, send CAPI immediately
    console.log('[SERVER-FIRST][FORM] Email/telefone presentes, enviando CAPI imediatamente');

    // Normalize contact data
    const normalized = normalizeContactData(contactData.email, contactData.phone);

    // Update context with contact data
    const updatedContext = {
      ...context,
      normalized_user_data: {
        ...(context.normalized_user_data || {}),
        ...normalized
      }
    };

    // Send CAPI
    if (window.PurchaseFlow && window.PurchaseFlow.sendCapiPurchase) {
      const eventId = context.eventId || context.event_id;
      await window.PurchaseFlow.sendCapiPurchase(eventId, updatedContext);
    } else {
      console.error('[SERVER-FIRST][FORM] PurchaseFlow module not loaded');
    }
  }

  /**
   * Sets up form submit listener to capture CAPI if not sent yet
   * @param {string} formSelector - Form selector (default: '#contactForm')
   * @param {object} context - Purchase context
   */
  function setupFormSubmitListener(formSelector, context) {
    const form = document.querySelector(formSelector || '#contactForm');
    
    if (!form) {
      console.warn('[SERVER-FIRST][FORM] Formulário não encontrado:', formSelector);
      return;
    }

    console.log('[SERVER-FIRST][FORM] Listener de submit configurado');

    // We'll use event capturing to ensure we run before other handlers
    form.addEventListener('submit', async (e) => {
      // Don't prevent default - let the form submit proceed
      
      if (window.__purchase_capi_sent) {
        console.log('[SERVER-FIRST][FORM] submit capturado; CAPI já enviado anteriormente');
        return;
      }

      const contactData = captureContactData();
      
      if (!contactData.hasValues) {
        console.warn('[SERVER-FIRST][FORM] submit sem email/telefone válidos');
        return;
      }

      console.log('[SERVER-FIRST][FORM] submit capturado; enviando CAPI');

      // Normalize contact data
      const normalized = normalizeContactData(contactData.email, contactData.phone);

      // Update context with contact data
      const updatedContext = {
        ...context,
        normalized_user_data: {
          ...(context.normalized_user_data || {}),
          ...normalized
        }
      };

      // Send CAPI (non-blocking - don't wait)
      if (window.PurchaseFlow && window.PurchaseFlow.sendCapiPurchase) {
        const eventId = context.eventId || context.event_id;
        // Fire and forget - don't block form submission
        window.PurchaseFlow.sendCapiPurchase(eventId, updatedContext).catch(err => {
          console.error('[SERVER-FIRST][FORM] Erro ao enviar CAPI no submit:', err);
        });
      } else {
        console.error('[SERVER-FIRST][FORM] PurchaseFlow module not loaded');
      }
    }, true); // Use capturing phase to run early
  }

  /**
   * Main initialization function
   * Captures fields immediately if available, or sets up listener for form submit
   * @param {object} context - Purchase context
   * @param {string} formSelector - Form selector (default: '#contactForm')
   */
  async function initConfirmForm(context, formSelector) {
    console.log('[SERVER-FIRST][FORM] Inicializando confirm-form');

    // Try to trigger CAPI immediately if fields are already filled
    await triggerCapiIfReady(context);

    // Set up form listener for later submission
    setupFormSubmitListener(formSelector, context);
  }

  // Export globally
  window.ConfirmForm = {
    captureEmail,
    capturePhone,
    captureContactData,
    normalizeContactData,
    triggerCapiIfReady,
    setupFormSubmitListener,
    initConfirmForm
  };

  console.log('[SERVER-FIRST][FORM] Module loaded');

})(window);
