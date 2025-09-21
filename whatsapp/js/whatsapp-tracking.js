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
  const VIEW_CONTENT_DELAY = 4000;
  const FB_PIXEL_SRC = 'https://connect.facebook.net/en_US/fbevents.js';

  let pixelInitialized = false;
  let pixelInitializationPromise = null;
  let facebookPixelScriptPromise = null;
  let configCache = null;
  let configPromise = null;
  let cachedUserId = null;
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
    if (window.fbq && window.fbq.callMethod) {
      return Promise.resolve();
    }

    if (facebookPixelScriptPromise) {
      return facebookPixelScriptPromise;
    }

    ensureFbqStub();

    facebookPixelScriptPromise = new Promise((resolve, reject) => {
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
            facebookPixelScriptPromise = null;
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
          facebookPixelScriptPromise = null;
          reject(new Error('Falha ao carregar a biblioteca do Facebook Pixel.'));
        };

        const head = document.head || document.getElementsByTagName('head')[0] || document.body;
        if (head) {
          head.appendChild(script);
        } else {
          facebookPixelScriptPromise = null;
          reject(new Error('Não foi possível anexar o script do Facebook Pixel.'));
        }
      } catch (error) {
        facebookPixelScriptPromise = null;
        reject(error);
      }
    });

    return facebookPixelScriptPromise;
  }

  async function loadConfig() {
    if (configCache) {
      return configCache;
    }

    if (configPromise) {
      return configPromise;
    }

    if (typeof fetch === 'undefined') {
      const error = new Error('Fetch API não está disponível neste ambiente.');
      logError('Não foi possível buscar as configurações do WhatsApp.', error);
      throw error;
    }

    const promise = (async () => {
      try {
        const response = await fetch('/api/config', { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`Falha ao carregar configuração do WhatsApp (status ${response.status})`);
        }

        const data = await response.json();
        configCache = data;
        return data;
      } catch (error) {
        logError('Erro ao carregar configuração do WhatsApp.', error);
        throw error;
      } finally {
        configPromise = null;
      }
    })();

    configPromise = promise;
    return promise;
  }

  async function initWhatsAppPixel() {
    if (pixelInitialized) {
      return true;
    }

    if (pixelInitializationPromise) {
      return pixelInitializationPromise;
    }

    const promise = (async () => {
      try {
        const config = await loadConfig();
        const pixelId = config && config.whatsapp && config.whatsapp.pixelId;

        if (!pixelId) {
          log('Pixel ID do WhatsApp não configurado. Rastreamento desativado.');
          return false;
        }

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
      } finally {
        pixelInitializationPromise = null;
      }
    })();

    pixelInitializationPromise = promise;
    return promise;
  }

  function getUserId() {
    if (cachedUserId) {
      return cachedUserId;
    }

    if (!window.localStorage) {
      cachedUserId = 'anonimo';
      return cachedUserId;
    }

    try {
      const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
      if (stored) {
        cachedUserId = stored;
        return stored;
      }

      const generated = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(USER_ID_STORAGE_KEY, generated);
      cachedUserId = generated;
      return generated;
    } catch (error) {
      cachedUserId = 'anonimo';
      return cachedUserId;
    }
  }

  async function generateHash(input) {
    const source = String(input ?? '');
    const cryptoObj = typeof window !== 'undefined' && window.crypto && window.crypto.subtle ? window.crypto : null;

    if (cryptoObj && typeof TextEncoder !== 'undefined') {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(source);
        const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
        return hashHex.slice(0, 16);
      } catch (error) {
        logError('Falha ao gerar hash usando crypto.subtle.', error);
      }
    }

    const fallback = `${source}|${Date.now()}|${Math.random()}`;
    let hash = 0;
    for (let i = 0; i < fallback.length; i += 1) {
      const charCode = fallback.charCodeAt(i);
      hash = (hash << 5) - hash + charCode;
      hash |= 0;
    }

    const fallbackHex = (
      Math.abs(hash).toString(16) +
      Date.now().toString(16) +
      Math.floor(Math.random() * 0xffffffff).toString(16)
    ).padEnd(16, '0');

    return fallbackHex.slice(0, 16);
  }

  async function generateEventId(eventName, userId, timestamp) {
    const safeEvent = eventName || 'event';
    const safeUser = userId || 'anonimo';
    const safeTimestamp = typeof timestamp === 'number' ? timestamp : Date.now();
    const randomPart = Math.random().toString(36).slice(2, 10);

    const input = `${safeEvent}|${safeUser}|${safeTimestamp}|${randomPart}`;
    return generateHash(input);
  }

  async function trackPageView() {
    if (!pixelInitialized || typeof window.fbq !== 'function') {
      log('Pixel não inicializado. PageView não será enviado.');
      return;
    }

    try {
      const eventID = await generateEventId('PageView', getUserId(), Date.now());
      window.fbq('track', 'PageView', { eventID });
      log('Evento PageView enviado.', { eventID, pixelId: activePixelId });
    } catch (error) {
      logError('Erro ao enviar evento PageView.', error);
    }
  }

  async function trackViewContent() {
    if (!pixelInitialized || typeof window.fbq !== 'function') {
      log('Pixel não inicializado. ViewContent não será enviado.');
      return;
    }

    try {
      const eventID = await generateEventId('ViewContent', getUserId(), Date.now());
      window.fbq('track', 'ViewContent', { eventID });
      log('Evento ViewContent enviado.', { eventID, pixelId: activePixelId });
    } catch (error) {
      logError('Erro ao enviar evento ViewContent.', error);
    }
  }

  async function init() {
    const initialized = await initWhatsAppPixel();
    if (!initialized) {
      log('Inicialização do Pixel falhou ou foi desabilitada.');
      return;
    }

    await trackPageView();

    log(`Agendando ViewContent para daqui a ${VIEW_CONTENT_DELAY / 1000} segundos.`);
    window.setTimeout(() => {
      trackViewContent();
    }, VIEW_CONTENT_DELAY);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.whatsappTracking = {
    init,
    trackPageView,
    trackViewContent,
    generateEventId,
    generateHash
  };
})();
