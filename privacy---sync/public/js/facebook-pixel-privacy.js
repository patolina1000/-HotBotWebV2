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

  // Configurações do Facebook Pixel para Privacy - PADRONIZADO COM ROTA 1
  const FB_CONFIG = {
    PIXEL_ID: null, // Será carregado dinamicamente do .env via /api/config
    TEST_EVENT_CODE: 'TEST74140', // Para testes
    initialized: false,
    loaded: false
  };

  /**
   * Carregar configurações do servidor
   */
  async function loadFacebookConfig() {
    try {
      log('Carregando configurações do Facebook Pixel do servidor...');
      
      const response = await fetch('/api/config', {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const config = await response.json();
      
      if (!config.FB_PIXEL_ID) {
        throw new Error('FB_PIXEL_ID não encontrado na configuração do servidor');
      }

      FB_CONFIG.PIXEL_ID = config.FB_PIXEL_ID;
      FB_CONFIG.TEST_EVENT_CODE = config.FB_TEST_EVENT_CODE || 'TEST74140';
      FB_CONFIG.loaded = true;

      log('Configurações do Facebook Pixel carregadas:', {
        pixelId: config.FB_PIXEL_ID ? 'DEFINIDO' : 'NÃO DEFINIDO',
        testEventCode: FB_CONFIG.TEST_EVENT_CODE
      });

      return config;

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao carregar configurações:', error);
      throw error;
    }
  }

  /**
   * Inicializar Facebook Pixel - PADRONIZADO COM ROTA 1
   */
  async function initFacebookPixel() {
    try {
      // 1. Carregar configurações do servidor
      if (!FB_CONFIG.loaded) {
        await loadFacebookConfig();
      }

      if (!FB_CONFIG.PIXEL_ID) {
        console.error('[FB-PIXEL-PRIVACY] Pixel ID não configurado');
        return;
      }

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

      // Capturar UTMs para eventos futuros usando sistema padronizado
      captureAndStoreUTMs();

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao inicializar Facebook Pixel:', error);
    }
  }

  /**
   * Capturar e armazenar UTMs - PADRONIZADO COM ROTA 1
   */
  function captureAndStoreUTMs() {
    const urlParams = new URLSearchParams(window.location.search);
    const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    
    const utmData = {};
    UTM_KEYS.forEach(key => {
      const value = urlParams.get(key) || localStorage.getItem(key);
      if (value) {
        utmData[key] = value;
        localStorage.setItem(key, value);
      }
    });

    // Armazenar também no formato legacy para compatibilidade
    if (Object.keys(utmData).length > 0) {
      localStorage.setItem('privacy_utm_data', JSON.stringify(utmData));
      log('UTMs capturados e armazenados:', utmData);
    }
  }

  /**
   * Sistema de deduplicação global
   */
  const eventCache = new Set();
  const CACHE_EXPIRY = 60000; // 1 minuto
  
  function generateEventID(eventName, data = {}) {
    const timestamp = Date.now();
    const hash = JSON.stringify({ eventName, ...data, timestamp: Math.floor(timestamp / 1000) });
    return btoa(hash).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
  
  function isDuplicateEvent(eventID) {
    if (eventCache.has(eventID)) {
      return true;
    }
    
    eventCache.add(eventID);
    
    // Limpar cache antigo
    setTimeout(() => {
      eventCache.delete(eventID);
    }, CACHE_EXPIRY);
    
    return false;
  }

  /**
   * Enviar evento InitiateCheckout - COM DEDUPLICAÇÃO
   */
  window.sendFBInitiateCheckout = function(value = 49.90, currency = 'BRL') {
    try {
      if (!FB_CONFIG.initialized || typeof fbq === 'undefined') {
        console.warn('[FB-PIXEL-PRIVACY] Facebook Pixel não inicializado');
        return;
      }

      // Recuperar UTMs armazenados usando sistema padronizado
      const utmData = window.UTMTracking ? window.UTMTracking.get() : {};

      const eventData = {
        value: value,
        currency: currency,
        content_type: 'product',
        content_name: 'Privacy - Checkout Initiated',
        ...utmData
      };

      // Gerar eventID único
      const eventID = generateEventID('InitiateCheckout', eventData);
      
      // Verificar duplicação
      if (isDuplicateEvent(eventID)) {
        log('Evento InitiateCheckout duplicado ignorado:', eventID);
        return;
      }

      eventData.eventID = eventID;

      fbq('track', 'InitiateCheckout', eventData);
      log('Evento InitiateCheckout enviado:', eventData);

      // Enviar para CAPI também
      sendToCAPI('InitiateCheckout', eventData);

    } catch (error) {
      console.error('[FB-PIXEL-PRIVACY] Erro ao enviar InitiateCheckout:', error);
    }
  };

  /**
   * Enviar evento Purchase - COM DEDUPLICAÇÃO
   */
  window.sendFBPurchase = function(value, currency = 'BRL', transactionId = null) {
    try {
      if (!FB_CONFIG.initialized || typeof fbq === 'undefined') {
        console.warn('[FB-PIXEL-PRIVACY] Facebook Pixel não inicializado');
        return;
      }

      // Recuperar UTMs armazenados usando sistema padronizado
      const utmData = window.UTMTracking ? window.UTMTracking.get() : {};

      const eventData = {
        value: value,
        currency: currency,
        content_type: 'product',
        content_name: 'Privacy - Purchase Completed',
        transaction_id: transactionId || `privacy_${Date.now()}`,
        ...utmData
      };

      // Gerar eventID único
      const eventID = generateEventID('Purchase', eventData);
      
      // Verificar duplicação
      if (isDuplicateEvent(eventID)) {
        log('Evento Purchase duplicado ignorado:', eventID);
        return;
      }

      eventData.eventID = eventID;

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