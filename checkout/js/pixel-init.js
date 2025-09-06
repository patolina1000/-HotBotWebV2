/**
 * Sistema Unificado de Facebook Pixel para Rota 2 (Privacy)
 * Lê o mesmo FB_PIXEL_ID que os bots usam do .env
 * Sem window.fbConfig - usando window.__env
 */

(function() {
  'use strict';

  // Configuração
  const PIXEL_CONFIG = {
    pixelId: null,
    testMode: false,
    loaded: false,
    initialized: false
  };

  // Logs de debug
  function log(type, message, data = null) {
    console.log(`[PIXEL] ${type}: ${message}`, data || '');
  }

  // Carregar configurações do servidor (mesmo endpoint usado pelos bots)
  async function loadPixelConfig() {
    try {
      log('CONFIG', 'Carregando configurações do servidor...');
      
      const response = await fetch('/api/config');
      const config = await response.json();
      
      if (config.FB_PIXEL_ID) {
        PIXEL_CONFIG.pixelId = config.FB_PIXEL_ID;
        PIXEL_CONFIG.testMode = config.FORCE_FB_TEST_MODE || false;
        PIXEL_CONFIG.loaded = true;
        
        // Expor no window.__env para compatibilidade
        window.__env = window.__env || {};
        window.__env.FB_PIXEL_ID = config.FB_PIXEL_ID;
        window.__env.FORCE_FB_TEST_MODE = config.FORCE_FB_TEST_MODE;
        
        log('CONFIG', 'Configurações carregadas', {
          pixelId: PIXEL_CONFIG.pixelId,
          testMode: PIXEL_CONFIG.testMode
        });
        
        return true;
      } else {
        log('ERROR', 'FB_PIXEL_ID não encontrado na configuração');
        return false;
      }
    } catch (error) {
      log('ERROR', 'Erro ao carregar configurações', error);
      return false;
    }
  }

  // Carregar script do Facebook Pixel
  function loadFacebookPixelScript() {
    return new Promise((resolve, reject) => {
      if (window.fbq) {
        resolve();
        return;
      }

      // Carregar script do Facebook Pixel
      !function(f,b,e,v,n,t,s){
        if(f.fbq)return;n=f.fbq=function(){
          n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s);
        
        t.onload = resolve;
        t.onerror = reject;
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    });
  }

  // Gerar Event ID único
  function generateEventID(eventName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${eventName}_${timestamp}_${random}`;
  }

  // Inicializar Facebook Pixel
  async function initializePixel() {
    if (PIXEL_CONFIG.initialized) {
      log('INIT', 'Pixel já inicializado');
      return true;
    }

    try {
      // 1. Carregar configurações
      const configLoaded = await loadPixelConfig();
      if (!configLoaded) {
        log('ERROR', 'Falha ao carregar configurações do pixel');
        return false;
      }

      // 2. Carregar script do Facebook
      await loadFacebookPixelScript();

      // 3. Inicializar pixel
      if (typeof fbq === 'function' && PIXEL_CONFIG.pixelId) {
        // Desabilitar pushState para evitar conflitos
        fbq.disablePushState = true;
        
        // Inicializar pixel
        fbq('init', PIXEL_CONFIG.pixelId);
        
        PIXEL_CONFIG.initialized = true;
        
        log('INIT', `Facebook Pixel inicializado com sucesso`, {
          pixelId: PIXEL_CONFIG.pixelId,
          testMode: PIXEL_CONFIG.testMode
        });

        // Disparar PageView automaticamente
        trackEvent('PageView', {});

        return true;
      } else {
        log('ERROR', 'fbq não disponível ou pixelId não encontrado');
        return false;
      }
    } catch (error) {
      log('ERROR', 'Erro na inicialização do pixel', error);
      return false;
    }
  }

  // Rastrear evento
  function trackEvent(eventName, eventData = {}, customData = {}) {
    if (!PIXEL_CONFIG.initialized || typeof fbq !== 'function') {
      log('ERROR', `Não é possível rastrear ${eventName} - pixel não inicializado`);
      return false;
    }

    try {
      // Gerar eventID se não fornecido
      if (!eventData.eventID) {
        eventData.eventID = generateEventID(eventName);
      }

      // Preparar dados do evento
      const finalEventData = {
        ...eventData,
        ...customData
      };

      // Rastrear evento
      fbq('track', eventName, finalEventData);

      log(eventName, 'Evento enviado', finalEventData);

      // Enviar para CAPI também se disponível
      sendToCAPI(eventName, finalEventData);

      return true;
    } catch (error) {
      log('ERROR', `Erro ao rastrear ${eventName}`, error);
      return false;
    }
  }

  // Enviar evento para CAPI
  async function sendToCAPI(eventName, eventData) {
    try {
      // Coletar dados de contexto
      const event_name = eventName;
      const event_time = Math.floor(Date.now() / 1000);
      const event_id = eventData.eventID;
      const event_source_url = window.location.href;
      const value = eventData.value;
      const currency = eventData.currency || 'BRL';
      const fbp = localStorage.getItem('fbp') || getCookie('_fbp');
      const fbc = localStorage.getItem('fbc') || getCookie('_fbc');
      const client_ip_address = localStorage.getItem('client_ip_address');
      const client_user_agent = navigator.userAgent;

      const response = await fetch('/capi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_name,
          event_time,
          event_id,
          event_source_url,
          value,
          currency,
          user_data: {
            fbp,
            fbc,
            ip_address: client_ip_address,
            user_agent: client_user_agent
          },
          custom_data: eventData
        })
      });

      if (response.ok) {
        log('CAPI', `Evento ${eventName} enviado para CAPI`);
      } else {
        log('CAPI_ERROR', `Falha ao enviar ${eventName} para CAPI`);
      }
    } catch (error) {
      log('CAPI_ERROR', `Erro ao enviar ${eventName} para CAPI`, error);
    }
  }

  // Função auxiliar para cookies
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Rastrear ViewContent após 4 segundos
  function scheduleViewContent() {
    setTimeout(() => {
      trackEvent('ViewContent', {
        value: parseFloat((Math.random() * (49.90 - 19.90) + 19.90).toFixed(2)),
        currency: 'BRL',
        content_name: document.title,
        content_category: 'Privacy Checkout'
      });
    }, 4000);
  }

  // API pública
  window.PixelTracker = {
    init: initializePixel,
    track: trackEvent,
    getConfig: () => ({ ...PIXEL_CONFIG }),
    
    // Eventos específicos
    trackPageView: () => trackEvent('PageView', {}),
    trackViewContent: (value, contentName) => trackEvent('ViewContent', {
      value: value || parseFloat((Math.random() * (49.90 - 19.90) + 19.90).toFixed(2)),
      currency: 'BRL',
      content_name: contentName || document.title,
      content_category: 'Privacy Checkout'
    }),
    trackInitiateCheckout: (value, planName) => trackEvent('InitiateCheckout', {
      value: value || 0,
      currency: 'BRL',
      content_name: planName || 'Plano Privacy',
      content_category: 'Privacy Checkout'
    }),
    trackPurchase: (value, planName, transactionId) => trackEvent('Purchase', {
      value: value || 0,
      currency: 'BRL',
      content_name: planName || 'Plano Privacy',
      content_category: 'Privacy Checkout',
      transaction_id: transactionId
    })
  };

  // Auto-inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      const success = await initializePixel();
      if (success) {
        scheduleViewContent();
      }
    });
  } else {
    // DOM já pronto
    (async () => {
      const success = await initializePixel();
      if (success) {
        scheduleViewContent();
      }
    })();
  }

  log('SCRIPT', 'Sistema de Pixel da Rota 2 carregado');
})();