/**
 * Sistema de Rastreamento Facebook Pixel para Privacy
 * Configuração e eventos específicos para a rota /privacy
 * Compatível com UTMify e CAPI do Facebook
 */
(function() {
  'use strict';
  
  const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname.includes('dev') || localStorage.getItem('fb_debug') === 'true';
  
  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[FB-PIXEL-PRIVACY] ${message}`, data || '');
    }
  }

  // Configurações do Facebook Pixel para Privacy
  const FB_CONFIG = {
    PIXEL_ID: '916142607046004', // ID do pixel já usado no projeto
    TEST_EVENT_CODE: 'TEST74140', // Para testes
    initialized: false
  };

  /**
   * Inicializar Facebook Pixel
   */
  function initFacebookPixel() {
    try {
      if (typeof fbq === 'undefined') {
        console.warn('[FB-PIXEL-PRIVACY] Facebook Pixel não carregado ainda, tentando novamente...');
        setTimeout(initFacebookPixel, 500);
        return;
      }

      if (FB_CONFIG.initialized) {
        log('Facebook Pixel já inicializado');
        return;
      }

      // Inicializar pixel
      fbq('init', FB_CONFIG.PIXEL_ID);
      FB_CONFIG.initialized = true;
      
      log('Facebook Pixel inicializado:', FB_CONFIG.PIXEL_ID);

      // Evento PageView automático para /privacy
      fbq('track', 'PageView');
      log('Evento PageView enviado para /privacy');

      // Evento ViewContent para página de checkout
      fbq('track', 'ViewContent', {
        content_type: 'product',
        content_name: 'Privacy - Checkout Page',
        content_category: 'Privacy Content',
        value: 49.90,
        currency: 'BRL'
      });
      log('Evento ViewContent enviado para /privacy');

      // Capturar UTMs para eventos futuros
      const urlParams = new URLSearchParams(window.location.search);
      const utmData = {
        utm_source: urlParams.get('utm_source'),
        utm_medium: urlParams.get('utm_medium'),
        utm_campaign: urlParams.get('utm_campaign'),
        utm_term: urlParams.get('utm_term'),
        utm_content: urlParams.get('utm_content')
      };

      // Armazenar UTMs para uso em eventos futuros
      if (Object.values(utmData).some(val => val !== null)) {
        localStorage.setItem('privacy_utm_data', JSON.stringify(utmData));
        log('UTMs capturados e armazenados:', utmData);
      }

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao inicializar Facebook Pixel:', error);
    }
  }

  /**
   * Enviar evento InitiateCheckout
   */
  window.sendFBInitiateCheckout = function(value = 49.90, currency = 'BRL') {
    try {
      if (!FB_CONFIG.initialized || typeof fbq === 'undefined') {
        console.warn('[FB-PIXEL-PRIVACY] Facebook Pixel não inicializado');
        return;
      }

      // Recuperar UTMs armazenados
      const storedUtms = localStorage.getItem('privacy_utm_data');
      const utmData = storedUtms ? JSON.parse(storedUtms) : {};

      const eventData = {
        value: value,
        currency: currency,
        content_type: 'product',
        content_name: 'Privacy - Checkout Initiated',
        ...utmData
      };

      fbq('track', 'InitiateCheckout', eventData);
      log('Evento InitiateCheckout enviado:', eventData);

      // Enviar para CAPI também
      sendToCAPI('InitiateCheckout', eventData);

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao enviar InitiateCheckout:', error);
    }
  };

  /**
   * Enviar evento Purchase
   */
  window.sendFBPurchase = function(value, currency = 'BRL', transactionId = null) {
    try {
      if (!FB_CONFIG.initialized || typeof fbq === 'undefined') {
        console.warn('[FB-PIXEL-PRIVACY] Facebook Pixel não inicializado');
        return;
      }

      // Recuperar UTMs armazenados
      const storedUtms = localStorage.getItem('privacy_utm_data');
      const utmData = storedUtms ? JSON.parse(storedUtms) : {};

      const eventData = {
        value: value,
        currency: currency,
        content_type: 'product',
        content_name: 'Privacy - Purchase Completed',
        transaction_id: transactionId || `privacy_${Date.now()}`,
        ...utmData
      };

      fbq('track', 'Purchase', eventData);
      log('Evento Purchase enviado:', eventData);

      // Enviar para CAPI também
      sendToCAPI('Purchase', eventData);

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao enviar Purchase:', error);
    }
  };

  /**
   * Enviar evento para CAPI (Conversions API)
   */
  function sendToCAPI(eventName, eventData) {
    try {
      // Preparar dados para CAPI
      const capiData = {
        event_id: `privacy_${eventName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        url: window.location.href,
        fbp: getCookie('_fbp'),
        fbc: getCookie('_fbc'),
        ip: null, // Será capturado pelo servidor
        user_agent: navigator.userAgent,
        external_id: null,
        content_type: eventData.content_type || 'product',
        value: eventData.value,
        currency: eventData.currency || 'BRL',
        custom_data: eventData
      };

      // Endpoint específico baseado no evento
      let endpoint = '/api/capi/viewcontent';
      if (eventName === 'InitiateCheckout') {
        endpoint = '/api/capi/initiatecheckout';
      } else if (eventName === 'Purchase') {
        endpoint = '/api/capi/purchase';
      }

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(capiData)
      }).then(response => {
        if (response.ok) {
          log(`Evento ${eventName} enviado para CAPI com sucesso`);
        } else {
          console.warn(`[FB-PIXEL-PRIVACY] Falha ao enviar ${eventName} para CAPI:`, response.status);
        }
      }).catch(error => {
        console.warn(`[FB-PIXEL-PRIVACY] Erro ao enviar ${eventName} para CAPI:`, error);
      });

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao preparar dados para CAPI:', error);
    }
  }

  /**
   * Utilitário para capturar cookies
   */
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFacebookPixel);
  } else {
    initFacebookPixel();
  }

  // Também tentar inicializar após um pequeno delay (fallback)
  setTimeout(initFacebookPixel, 1000);

  log('Sistema de rastreamento Facebook Pixel para Privacy carregado');

})();