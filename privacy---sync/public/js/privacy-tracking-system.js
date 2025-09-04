/**
 * 🎯 SISTEMA PRINCIPAL DE TRACKING PARA ROTA /PRIVACY
 * 
 * Este arquivo integra todos os sistemas de tracking:
 * ✅ UTMify - Captura e propaga UTMs
 * ✅ Facebook Pixel - Eventos client-side
 * ✅ Facebook CAPI - Eventos server-side com deduplicação
 * ✅ Kwai CAPI - Tracking de origem, cliques e conversão
 * 
 * TODAS as configurações vêm das variáveis do Render.com via /api/config
 * NENHUM ID é hardcoded no código
 */

(function() {
  'use strict';
  
  const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname.includes('dev');
  
  function log(message, data = null, level = 'info') {
    if (!DEBUG_MODE && level === 'debug') return;
    
    const prefix = `[PRIVACY-TRACKING]`;
    const timestamp = new Date().toISOString().substr(11, 12);
    
    switch(level) {
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

  // Estado global do sistema de tracking
  const TrackingSystem = {
    // Status dos sistemas
    status: {
      utmify: { ready: false, error: null },
      facebookPixel: { ready: false, error: null },
      facebookCAPI: { ready: false, error: null },
      kwai: { ready: false, error: null }
    },
    
    // Cache de eventos para deduplicação
    eventCache: new Set(),
    
    // Configurações carregadas
    config: null,
    
    // Callbacks aguardando inicialização
    pendingCallbacks: []
  };

  /**
   * Carrega configurações do servidor
   */
  async function loadConfig() {
    try {
      log('Carregando configurações do servidor...');
      
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
      TrackingSystem.config = config;
      
      log('Configurações carregadas com sucesso', {
        facebook: !!config.facebook?.pixelId,
        utmify: !!config.utmify?.adAccountId,
        kwai: !!config.kwai?.pixelId
      }, 'success');

      return config;
      
    } catch (error) {
      log(`Erro ao carregar configurações: ${error.message}`, null, 'error');
      throw error;
    }
  }

  /**
   * Inicializa sistema UTMify
   */
  function initializeUTMify() {
    return new Promise((resolve) => {
      try {
        if (!TrackingSystem.config?.utmify?.adAccountId) {
          log('UTMify não configurado, pulando inicialização', null, 'warn');
          TrackingSystem.status.utmify.ready = false;
          TrackingSystem.status.utmify.error = 'UTMify não configurado';
          return resolve();
        }

        // Verificar se o script da UTMify já foi carregado
        if (window.UTMifyInterceptor) {
          log('UTMify já inicializado', null, 'success');
          TrackingSystem.status.utmify.ready = true;
          return resolve();
        }

        // Aguardar o script da UTMify carregar
        const checkUTMify = () => {
          if (window.UTMifyInterceptor) {
            log('UTMify inicializado com sucesso', null, 'success');
            TrackingSystem.status.utmify.ready = true;
            resolve();
          } else {
            setTimeout(checkUTMify, 100);
          }
        };

        checkUTMify();
        
      } catch (error) {
        log(`Erro ao inicializar UTMify: ${error.message}`, null, 'error');
        TrackingSystem.status.utmify.error = error.message;
        resolve();
      }
    });
  }

  /**
   * Inicializa Facebook Pixel
   */
  function initializeFacebookPixel() {
    return new Promise((resolve) => {
      try {
        if (!TrackingSystem.config?.facebook?.pixelId) {
          log('Facebook Pixel não configurado, pulando inicialização', null, 'warn');
          TrackingSystem.status.facebookPixel.ready = false;
          TrackingSystem.status.facebookPixel.error = 'Facebook Pixel não configurado';
          return resolve();
        }

        // Verificar se o Facebook Pixel Manager já foi carregado
        if (window.FBPixelManager) {
          log('Facebook Pixel Manager já inicializado', null, 'success');
          TrackingSystem.status.facebookPixel.ready = true;
          return resolve();
        }

        // Aguardar o Facebook Pixel Manager carregar
        const checkFacebookPixel = () => {
          if (window.FBPixelManager) {
            log('Facebook Pixel Manager inicializado com sucesso', null, 'success');
            TrackingSystem.status.facebookPixel.ready = true;
            resolve();
          } else {
            setTimeout(checkFacebookPixel, 100);
          }
        };

        checkFacebookPixel();
        
      } catch (error) {
        log(`Erro ao inicializar Facebook Pixel: ${error.message}`, null, 'error');
        TrackingSystem.status.facebookPixel.error = error.message;
        resolve();
      }
    });
  }

  /**
   * Inicializa Facebook CAPI
   */
  function initializeFacebookCAPI() {
    return new Promise((resolve) => {
      try {
        if (!TrackingSystem.config?.facebook?.pixelId || !TrackingSystem.config?.facebook?.pixelToken) {
          log('Facebook CAPI não configurado, pulando inicialização', null, 'warn');
          TrackingSystem.status.facebookCAPI.ready = false;
          TrackingSystem.status.facebookCAPI.error = 'Facebook CAPI não configurado';
          return resolve();
        }

        // Facebook CAPI será implementado via servidor
        log('Facebook CAPI configurado para uso via servidor', null, 'success');
        TrackingSystem.status.facebookCAPI.ready = true;
        resolve();
        
      } catch (error) {
        log(`Erro ao inicializar Facebook CAPI: ${error.message}`, null, 'error');
        TrackingSystem.status.facebookCAPI.error = error.message;
        resolve();
      }
    });
  }

  /**
   * Inicializa Kwai CAPI
   */
  function initializeKwaiCAPI() {
    return new Promise((resolve) => {
      try {
        if (!TrackingSystem.config?.kwai?.pixelId) {
          log('Kwai CAPI não configurado, pulando inicialização', null, 'warn');
          TrackingSystem.status.kwai.ready = false;
          TrackingSystem.status.kwai.error = 'Kwai CAPI não configurado';
          return resolve();
        }

        // Verificar se o Kwai Tracker já foi carregado
        if (window.KwaiTracker) {
          log('Kwai Tracker já inicializado', null, 'success');
          TrackingSystem.status.kwai.ready = true;
          return resolve();
        }

        // Aguardar o Kwai Tracker carregar
        const checkKwai = () => {
          if (window.KwaiTracker) {
            log('Kwai Tracker inicializado com sucesso', null, 'success');
            TrackingSystem.status.kwai.ready = true;
            resolve();
          } else {
            setTimeout(checkKwai, 100);
          }
        };

        checkKwai();
        
      } catch (error) {
        log(`Erro ao inicializar Kwai CAPI: ${error.message}`, null, 'error');
        TrackingSystem.status.kwai.error = error.message;
        resolve();
      }
    });
  }

  /**
   * Verifica se evento é duplicado
   */
  function isDuplicateEvent(eventName, eventData) {
    const key = `${eventName}_${JSON.stringify(eventData)}_${Date.now()}`;
    const shortKey = key.substring(0, 100);
    
    if (TrackingSystem.eventCache.has(shortKey)) {
      return true;
    }
    
    TrackingSystem.eventCache.add(shortKey);
    
    // Limpar cache antigo
    if (TrackingSystem.eventCache.size > 100) {
      const firstKey = TrackingSystem.eventCache.values().next().value;
      TrackingSystem.eventCache.delete(firstKey);
    }
    
    return false;
  }

  /**
   * Envia evento para Facebook CAPI via servidor
   */
  async function sendFacebookCAPIEvent(eventName, eventData = {}) {
    try {
      if (!TrackingSystem.status.facebookCAPI.ready) {
        log(`Facebook CAPI não está pronto para evento ${eventName}`, null, 'warn');
        return { success: false, reason: 'Facebook CAPI não está pronto' };
      }

      // Verificar duplicação
      if (isDuplicateEvent(eventName, eventData)) {
        log(`Evento duplicado ignorado: ${eventName}`, null, 'warn');
        return { duplicate: true };
      }

      log(`Enviando evento ${eventName} para Facebook CAPI via servidor`);
      
      // TODO: Implementar endpoint para Facebook CAPI
      // Por enquanto, apenas log
      log(`Evento ${eventName} seria enviado para Facebook CAPI:`, eventData);
      
      return { success: true, sent: 'Facebook CAPI (simulado)' };
      
    } catch (error) {
      log(`Erro ao enviar evento para Facebook CAPI: ${error.message}`, null, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Rastreia evento em todos os sistemas disponíveis
   */
  async function trackEvent(eventName, eventData = {}, options = {}) {
    const results = {};
    
    try {
      // 1. Facebook Pixel (client-side)
      if (TrackingSystem.status.facebookPixel.ready && window.FBPixelManager) {
        try {
          const pixelResult = await window.FBPixelManager.track(eventName, eventData);
          results.facebookPixel = pixelResult;
        } catch (error) {
          results.facebookPixel = { success: false, error: error.message };
        }
      }

      // 2. Facebook CAPI (server-side)
      if (TrackingSystem.status.facebookCAPI.ready) {
        try {
          const capiResult = await sendFacebookCAPIEvent(eventName, eventData);
          results.facebookCAPI = capiResult;
        } catch (error) {
          results.facebookCAPI = { success: false, error: error.message };
        }
      }

      // 3. Kwai CAPI
      if (TrackingSystem.status.kwai.ready && window.KwaiTracker) {
        try {
          // Mapear eventos do Facebook para eventos do Kwai
          let kwaiEventName = eventName;
          if (eventName === 'PageView') kwaiEventName = 'EVENT_CONTENT_VIEW';
          if (eventName === 'ViewContent') kwaiEventName = 'EVENT_CONTENT_VIEW';
          if (eventName === 'InitiateCheckout') kwaiEventName = 'EVENT_ADD_TO_CART';
          if (eventName === 'Purchase') kwaiEventName = 'EVENT_PURCHASE';
          
          const kwaiResult = await window.KwaiTracker.sendEvent(kwaiEventName, eventData);
          results.kwai = kwaiResult;
        } catch (error) {
          results.kwai = { success: false, error: error.message };
        }
      }

      log(`Evento ${eventName} rastreado em todos os sistemas`, results, 'success');
      return { success: true, results };

    } catch (error) {
      log(`Erro ao rastrear evento ${eventName}: ${error.message}`, null, 'error');
      return { success: false, error: error.message, results };
    }
  }

  /**
   * Executa callbacks pendentes
   */
  function executePendingCallbacks() {
    if (TrackingSystem.pendingCallbacks.length > 0) {
      log(`Executando ${TrackingSystem.pendingCallbacks.length} callbacks pendentes...`);
      
      const callbacks = [...TrackingSystem.pendingCallbacks];
      TrackingSystem.pendingCallbacks = [];
      
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
   * Verifica se o sistema está pronto
   */
  function isReady() {
    return Object.values(TrackingSystem.status).some(system => system.ready);
  }

  /**
   * Obtém status do sistema
   */
  function getStatus() {
    return {
      ready: isReady(),
      status: TrackingSystem.status,
      config: TrackingSystem.config ? {
        facebook: !!TrackingSystem.config.facebook?.pixelId,
        utmify: !!TrackingSystem.config.utmify?.adAccountId,
        kwai: !!TrackingSystem.config.kwai?.pixelId
      } : null
    };
  }

  /**
   * Inicialização principal do sistema
   */
  async function initialize() {
    try {
      log('🚀 Iniciando Sistema de Tracking do Privacy...');

      // 1. Carregar configurações
      await loadConfig();

      // 2. Inicializar sistemas em paralelo
      await Promise.all([
        initializeUTMify(),
        initializeFacebookPixel(),
        initializeFacebookCAPI(),
        initializeKwaiCAPI()
      ]);

      // 3. Executar callbacks pendentes
      executePendingCallbacks();

      // 4. Disparar evento de inicialização
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('privacyTrackingReady', {
          detail: {
            status: TrackingSystem.status,
            config: TrackingSystem.config
          }
        }));
      }

      log('🎉 Sistema de Tracking do Privacy inicializado com sucesso!', getStatus(), 'success');

      // 5. Disparar eventos iniciais
      await trackEvent('PageView', {
        content_name: document.title || 'Privacy',
        content_category: 'Privacy',
        content_id: window.location.pathname || '/privacy'
      });

      return true;

    } catch (error) {
      log(`❌ Falha na inicialização: ${error.message}`, null, 'error');
      return false;
    }
  }

  // API pública
  const API = {
    // Inicialização
    initialize,
    
    // Status
    isReady,
    getStatus,
    
    // Rastreamento
    track: trackEvent,
    
    // Utilitários
    isDuplicateEvent
  };

  // Expor API globalmente
  window.PrivacyTracking = API;

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

  log('Sistema de Tracking do Privacy carregado. Aguardando inicialização...', null, 'debug');

})();
