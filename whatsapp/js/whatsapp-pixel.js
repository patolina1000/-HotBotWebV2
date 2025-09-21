// whatsapp-pixel.js - Pixel WhatsApp

(function() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  function isLocalhost() {
    if (!window.location || !window.location.hostname) {
      return false;
    }

    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  const DEBUG = isLocalhost();
  const LOG_PREFIX = '[WhatsApp Tracking]';
  const USER_ID_STORAGE_KEY = 'whatsapp_tracking_user_id';
  const FB_PIXEL_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

  let pixelInitialized = false;
  let activePixelId = null;

  function log(message, data) {
    if (!DEBUG) {
      return;
    }

    if (typeof data !== 'undefined') {
      console.log(`${LOG_PREFIX} ${message}`, data);
    } else {
      console.log(`${LOG_PREFIX} ${message}`);
    }
  }

  function logError(message, error) {
    if (!DEBUG) {
      return;
    }

    if (error) {
      console.error(`${LOG_PREFIX} ${message}`, error);
    } else {
      console.error(`${LOG_PREFIX} ${message}`);
    }
  }

  if (DEBUG) {
    log('Ambiente localhost detectado - logs habilitados.');
  }

  function ensureFbqStub() {
    if (window.fbq) {
      return;
    }

    const fbqStub = function() {
      fbqStub.callMethod ? fbqStub.callMethod.apply(fbqStub, arguments) : fbqStub.queue.push(arguments);
    };

    if (!window._fbq) {
      window._fbq = fbqStub;
    }

    fbqStub.push = fbqStub;
    fbqStub.loaded = false;
    fbqStub.version = '2.0';
    fbqStub.queue = [];
    window.fbq = fbqStub;
  }

  function loadFacebookPixelScript() {
    return new Promise((resolve, reject) => {
      try {
        const existingScript = document.querySelector(`script[src="${FB_PIXEL_SRC}"]`);

        if (existingScript) {
          if (existingScript.getAttribute('data-loaded') === 'true' || (window.fbq && window.fbq.callMethod)) {
            resolve();
            return;
          }

          existingScript.addEventListener('load', () => {
            existingScript.setAttribute('data-loaded', 'true');
            resolve();
          }, { once: true });

          existingScript.addEventListener('error', () => {
            reject(new Error('Falha ao carregar a biblioteca do Facebook Pixel.'));
          }, { once: true });

          return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = FB_PIXEL_SRC;

        script.onload = () => {
          script.setAttribute('data-loaded', 'true');
          resolve();
        };

        script.onerror = () => {
          reject(new Error('Falha ao carregar a biblioteca do Facebook Pixel.'));
        };

        const head = document.head || document.getElementsByTagName('head')[0] || document.body;
        if (head) {
          head.appendChild(script);
        } else {
          reject(new Error('Não foi possível anexar o script do Facebook Pixel.'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async function loadConfig() {
    if (typeof fetch === 'undefined') {
      const error = new Error('Fetch API não está disponível neste ambiente.');
      logError('Não foi possível buscar as configurações do WhatsApp.', error);
      throw error;
    }

    try {
      const response = await fetch('/api/config', { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error(`Falha ao carregar configuração do WhatsApp (status ${response.status})`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logError('Erro ao carregar configuração do WhatsApp.', error);
      throw error;
    }
  }

  async function initWhatsAppPixel() {
    if (pixelInitialized) {
      return true;
    }

    try {
      const config = await loadConfig();
      const pixelId = config && config.whatsapp && config.whatsapp.pixelId;

      if (!pixelId) {
        log('Pixel ID do WhatsApp não configurado. Rastreamento desativado.');
        return false;
      }

      ensureFbqStub();
      await loadFacebookPixelScript();

      if (typeof window.fbq !== 'function') {
        throw new Error('fbq não está disponível após carregar a biblioteca do Facebook Pixel.');
      }

      window.fbq('init', pixelId);
      window.fbq('set', 'autoConfig', true, pixelId);

      pixelInitialized = true;
      activePixelId = pixelId;

      log('Facebook Pixel do WhatsApp inicializado.', { pixelId });
      return true;
    } catch (error) {
      logError('Erro ao inicializar o Facebook Pixel do WhatsApp.', error);
      return false;
    }
  }

  function getUserId() {
    if (!window.localStorage) {
      return 'anonimo';
    }

    try {
      const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
      if (stored) {
        return stored;
      }

      const generated = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
      return generated;
    } catch (error) {
      return 'anonimo';
    }
  }

  async function generateEventId(eventName, userId, timestamp) {
    const safeEvent = eventName || 'event';
    const safeUser = userId || 'anonimo';
    const safeTimestamp = typeof timestamp === 'number' ? timestamp : Date.now();
    const randomPart = Math.random().toString(36).slice(2, 10);

    const input = `${safeEvent}|${safeUser}|${safeTimestamp}|${randomPart}`;
    return input.slice(0, 16);
  }

  // Função de teste do evento do WhatsApp
  async function testEvent() {
    if (!pixelInitialized || typeof window.fbq !== 'function') {
      log('Pixel não inicializado. Teste de evento não será enviado.');
      return false;
    }

    try {
      const testEventCode = 'TEST50600';
      const eventID = await generateEventId('TestEvent', getUserId(), Date.now());
      
      window.fbq('track', 'TestEvent', { 
        eventID,
        test_event_code: testEventCode
      });
      
      log('Evento de teste enviado.', { 
        eventID, 
        test_event_code: testEventCode,
        pixelId: activePixelId 
      });
      
      return true;
    } catch (error) {
      logError('Erro ao enviar evento de teste.', error);
      return false;
    }
  }

  async function init() {
    const initialized = await initWhatsAppPixel();
    if (!initialized) {
      log('Inicialização do Pixel falhou ou foi desabilitada.');
      return false;
    }

    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.whatsappTracking = {
    init,
    testEvent
  };
})();

