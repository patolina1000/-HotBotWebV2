/**
 * FB Pixel Manager - Sistema robusto de inicialização do Facebook Pixel
 * 
 * Características:
 * - Carregamento dinâmico das configurações do .env
 * - Inicialização condicional que aguarda configurações estarem disponíveis
 * - Suporte automático ao modo de teste (test_event_code)
 * - Compatibilidade com SPAs e frameworks como Next.js
 * - Sistema de retry inteligente
 * - Deduplicação de eventos
 */

(function(window) {
  'use strict';

  // Estado global do manager
  const FBPixelManager = {
    // Configurações
    config: {
      FB_PIXEL_ID: '',
      FB_PIXEL_TOKEN: '',
      FB_TEST_EVENT_CODE: 'TEST74140',
      FORCE_FB_TEST_MODE: false,
      loaded: false,
      timestamp: null
    },
    
    // Estado de inicialização
    state: {
      configLoaded: false,
      pixelLoaded: false,
      pixelInitialized: false,
      retryCount: 0,
      maxRetries: 10,
      retryInterval: 500,
      lastError: null
    },
    
    // Cache de eventos para deduplicação
    eventCache: new Set(),
    
    // Callbacks aguardando inicialização
    pendingCallbacks: [],
    
    // Debug mode
    debug: window.location.hostname === 'localhost' || 
           window.location.hostname.includes('dev') || 
           window.location.search.includes('fb_debug=true')
  };

  /**
   * Log centralizado com controle de debug
   */
  function log(message, data = null, level = 'info') {
    if (!FBPixelManager.debug && level === 'debug') return;
    
    const prefix = `[FB-PIXEL-MANAGER]`;
    const timestamp = new Date().toISOString().substr(11, 12);
    
    switch (level) {
      case 'error':
        console.error(`${prefix} ${timestamp} ❌ ${message}`, data || '');
        break;
      case 'warn':
        console.warn(`${prefix} ${timestamp} ⚠️ ${message}`, data || '');
        break;
      case 'success':
        console.log(`${prefix} ${timestamp} ✅ ${message}`, data || '');
        break;
      case 'debug':
        console.log(`${prefix} ${timestamp} 🔍 ${message}`, data || '');
        break;
      default:
        console.log(`${prefix} ${timestamp} 📋 ${message}`, data || '');
    }
  }

  /**
   * Carrega configurações do servidor com retry
   */
  async function loadFacebookConfig(retryCount = 0) {
    try {
      log(`Carregando configurações do Facebook Pixel (tentativa ${retryCount + 1}/${FBPixelManager.state.maxRetries})...`);
      
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
      
      // Validar configuração recebida
      if (!config.FB_PIXEL_ID) {
        throw new Error('FB_PIXEL_ID não encontrado na configuração do servidor');
      }

      // Atualizar configuração global
      Object.assign(FBPixelManager.config, config);
      FBPixelManager.state.configLoaded = true;
      FBPixelManager.state.lastError = null;

      log('Configurações do Facebook Pixel carregadas com sucesso', {
        pixelId: config.FB_PIXEL_ID ? 'DEFINIDO' : 'NÃO DEFINIDO',
        testMode: config.FORCE_FB_TEST_MODE,
        testEventCode: config.FB_TEST_EVENT_CODE ? 'DEFINIDO' : 'NÃO DEFINIDO'
      }, 'success');

      return config;
      
    } catch (error) {
      FBPixelManager.state.lastError = error;
      log(`Erro ao carregar configurações: ${error.message}`, null, 'error');
      
      // Retry com backoff exponencial
      if (retryCount < FBPixelManager.state.maxRetries - 1) {
        const delay = FBPixelManager.state.retryInterval * Math.pow(2, retryCount);
        log(`Tentando novamente em ${delay}ms...`, null, 'warn');
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return await loadFacebookConfig(retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Inicializa o Facebook Pixel SDK
   */
  function initializeFacebookPixelSDK() {
    return new Promise((resolve, reject) => {
      // Verificar se o SDK já foi carregado
      if (window.fbq && typeof window.fbq === 'function') {
        log('Facebook Pixel SDK já estava carregado', null, 'debug');
        FBPixelManager.state.pixelLoaded = true;
        resolve();
        return;
      }

      log('Carregando Facebook Pixel SDK...');

      // Criar função fbq se não existir
      !function(f,b,e,v,n,t,s){
        if(f.fbq)return;n=f.fbq=function(){
          n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

      // Aguardar carregamento do script
      const checkSDKLoaded = () => {
        if (window.fbq && window.fbq.loaded) {
          log('Facebook Pixel SDK carregado com sucesso', null, 'success');
          FBPixelManager.state.pixelLoaded = true;
          resolve();
        } else {
          setTimeout(checkSDKLoaded, 100);
        }
      };

      // Timeout de segurança
      setTimeout(() => {
        if (!FBPixelManager.state.pixelLoaded) {
          const error = new Error('Timeout ao carregar Facebook Pixel SDK');
          log('Timeout ao carregar SDK', null, 'error');
          reject(error);
        }
      }, 10000);

      checkSDKLoaded();
    });
  }

  /**
   * Inicializa o pixel com as configurações carregadas
   */
  function initializePixel() {
    if (!FBPixelManager.state.configLoaded) {
      throw new Error('Configurações não foram carregadas');
    }

    if (!FBPixelManager.state.pixelLoaded) {
      throw new Error('Facebook Pixel SDK não foi carregado');
    }

    if (!FBPixelManager.config.FB_PIXEL_ID) {
      throw new Error('FB_PIXEL_ID não está definido');
    }

    log(`Inicializando Facebook Pixel ID: ${FBPixelManager.config.FB_PIXEL_ID}`);

    // Desabilitar pushState para evitar conflitos com SPAs
    if (window.fbq) {
      window.fbq.disablePushState = true;
    }

    // Inicializar o pixel
    window.fbq('init', FBPixelManager.config.FB_PIXEL_ID);
    
    FBPixelManager.state.pixelInitialized = true;
    log('Facebook Pixel inicializado com sucesso', null, 'success');

    // Disparar evento PageView inicial
    trackEvent('PageView', {}, true);
  }

  /**
   * Adiciona test_event_code aos dados do evento se necessário
   */
  function addTestEventCode(eventData = {}) {
    if (FBPixelManager.config.FORCE_FB_TEST_MODE && FBPixelManager.config.FB_TEST_EVENT_CODE) {
      eventData.test_event_code = FBPixelManager.config.FB_TEST_EVENT_CODE;
      log(`Test event code adicionado: ${FBPixelManager.config.FB_TEST_EVENT_CODE}`, null, 'debug');
    }
    return eventData;
  }

  /**
   * Gera ID único para evento
   */
  function generateEventID(eventName, additionalData = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const base = `${eventName}_${timestamp}_${additionalData}_${random}`;
    
    // Criar hash simples
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
      const char = base.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converter para 32bit
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Verifica se evento é duplicado
   */
  function isDuplicateEvent(eventName, eventData) {
    const key = `${eventName}_${JSON.stringify(eventData)}_${Date.now()}`;
    const shortKey = key.substring(0, 100); // Limitar tamanho da chave
    
    if (FBPixelManager.eventCache.has(shortKey)) {
      return true;
    }
    
    FBPixelManager.eventCache.add(shortKey);
    
    // Limpar cache antigo (manter apenas últimos 100 eventos)
    if (FBPixelManager.eventCache.size > 100) {
      const firstKey = FBPixelManager.eventCache.values().next().value;
      FBPixelManager.eventCache.delete(firstKey);
    }
    
    return false;
  }

  /**
   * Rastreia evento do Facebook Pixel
   */
  function trackEvent(eventName, eventData = {}, skipDuplicateCheck = false) {
    return new Promise((resolve, reject) => {
      try {
        // Verificar se o pixel foi inicializado
        if (!FBPixelManager.state.pixelInitialized) {
          log(`Evento ${eventName} aguardando inicialização do pixel...`, null, 'warn');
          FBPixelManager.pendingCallbacks.push(() => trackEvent(eventName, eventData, skipDuplicateCheck));
          return resolve({ queued: true });
        }

        // Verificar duplicação
        if (!skipDuplicateCheck && isDuplicateEvent(eventName, eventData)) {
          log(`Evento duplicado ignorado: ${eventName}`, null, 'warn');
          return resolve({ duplicate: true });
        }

        // Gerar eventID se não fornecido
        if (!eventData.eventID) {
          eventData.eventID = generateEventID(eventName);
        }

        // Adicionar test_event_code se necessário
        const finalEventData = addTestEventCode({ ...eventData });

        log(`Rastreando evento: ${eventName}`, finalEventData, 'debug');

        // Enviar evento
        window.fbq('track', eventName, finalEventData);

        log(`Evento enviado com sucesso: ${eventName}`, {
          eventID: finalEventData.eventID,
          testMode: !!finalEventData.test_event_code
        }, 'success');

        resolve({ 
          success: true, 
          eventID: finalEventData.eventID,
          testMode: !!finalEventData.test_event_code
        });

      } catch (error) {
        log(`Erro ao rastrear evento ${eventName}: ${error.message}`, null, 'error');
        reject(error);
      }
    });
  }

  /**
   * Executa callbacks pendentes
   */
  function executePendingCallbacks() {
    if (FBPixelManager.pendingCallbacks.length > 0) {
      log(`Executando ${FBPixelManager.pendingCallbacks.length} callbacks pendentes...`);
      
      const callbacks = [...FBPixelManager.pendingCallbacks];
      FBPixelManager.pendingCallbacks = [];
      
      callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          log(`Erro ao executar callback pendente: ${error.message}`, null, 'error');
        }
      });
    }
  }

  /**
   * Inicialização principal do sistema
   */
  async function initialize() {
    try {
      log('🚀 Iniciando Facebook Pixel Manager...');
      FBPixelManager.state.retryCount = 0;

      // 1. Carregar configurações do servidor
      await loadFacebookConfig();

      // 2. Inicializar SDK do Facebook Pixel
      await initializeFacebookPixelSDK();

      // 3. Inicializar o pixel
      initializePixel();

      // 4. Executar callbacks pendentes
      executePendingCallbacks();

      log('🎉 Facebook Pixel Manager inicializado com sucesso!', {
        pixelId: FBPixelManager.config.FB_PIXEL_ID,
        testMode: FBPixelManager.config.FORCE_FB_TEST_MODE
      }, 'success');

      // Disparar evento customizado para notificar outros scripts
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('fbPixelManagerReady', {
          detail: {
            pixelId: FBPixelManager.config.FB_PIXEL_ID,
            testMode: FBPixelManager.config.FORCE_FB_TEST_MODE,
            config: FBPixelManager.config
          }
        }));
      }

      return true;

    } catch (error) {
      log(`❌ Falha na inicialização: ${error.message}`, null, 'error');
      FBPixelManager.state.lastError = error;

      // Retry com delay
      if (FBPixelManager.state.retryCount < FBPixelManager.state.maxRetries) {
        FBPixelManager.state.retryCount++;
        const delay = FBPixelManager.state.retryInterval * FBPixelManager.state.retryCount;
        
        log(`Tentando reinicializar em ${delay}ms (tentativa ${FBPixelManager.state.retryCount}/${FBPixelManager.state.maxRetries})...`, null, 'warn');
        
        setTimeout(() => {
          initialize();
        }, delay);
      } else {
        log('❌ Máximo de tentativas de inicialização atingido', null, 'error');
      }

      return false;
    }
  }

  /**
   * Força reinicialização (útil para SPAs)
   */
  function reinitialize() {
    log('🔄 Forçando reinicialização...');
    
    // Reset do estado
    FBPixelManager.state.configLoaded = false;
    FBPixelManager.state.pixelInitialized = false;
    FBPixelManager.state.retryCount = 0;
    FBPixelManager.state.lastError = null;
    
    return initialize();
  }

  /**
   * Verifica se o manager está pronto
   */
  function isReady() {
    return FBPixelManager.state.configLoaded && 
           FBPixelManager.state.pixelLoaded && 
           FBPixelManager.state.pixelInitialized;
  }

  /**
   * Obtém status atual do manager
   */
  function getStatus() {
    return {
      ready: isReady(),
      config: FBPixelManager.config,
      state: FBPixelManager.state,
      pendingCallbacks: FBPixelManager.pendingCallbacks.length
    };
  }

  // API pública
  const API = {
    // Inicialização
    initialize,
    reinitialize,
    
    // Status
    isReady,
    getStatus,
    
    // Rastreamento
    track: trackEvent,
    
    // Utilitários
    generateEventID,
    addTestEventCode,
    
    // Configuração
    getConfig: () => ({ ...FBPixelManager.config }),
    
    // Debug
    enableDebug: () => { FBPixelManager.debug = true; },
    disableDebug: () => { FBPixelManager.debug = false; }
  };

  // Expor API globalmente
  window.FBPixelManager = API;

  // Auto-inicialização quando DOM estiver pronto
  function autoInitialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      // DOM já está pronto, inicializar imediatamente
      setTimeout(initialize, 100);
    }
  }

  // Inicialização automática
  autoInitialize();

  log('Facebook Pixel Manager carregado. Aguardando inicialização...', null, 'debug');

})(window);
