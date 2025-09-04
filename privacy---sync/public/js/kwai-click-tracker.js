/**
 * Sistema de captura e armazenamento do click_id do Kwai para Privacy
 * IDÊNTICO AO BOT DO TELEGRAM - Adaptado para web
 * Captura o click_id da URL e armazena para uso em eventos subsequentes
 * Implementado para a pasta privacy---sync - Versão idêntica ao bot
 */
(function() {
  'use strict';
  
  const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname.includes('dev') || localStorage.getItem('kwai_debug') === 'true';
  
  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[KWAI-TRACKER-PRIVACY] ${message}`, data || '');
    }
  }
  
  /**
   * 🔥 NOVO: Capturar click_id da URL - IDÊNTICO AO BOT
   */
  function captureClickId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let clickId = urlParams.get('click_id');
      
      // 🔥 NOVO: Tentar também kwai_click_id (compatibilidade)
      if (!clickId) {
        clickId = urlParams.get('kwai_click_id');
      }
      
      // 🔍 DEBUG: Log detalhado para entender o problema
      if (DEBUG_MODE) {
        console.log('🔍 [DEBUG] Capturando click_id da URL:', {
          search: window.location.search,
          hasClickId: !!clickId,
          clickId: clickId,
          allParams: Object.fromEntries(urlParams.entries()),
          currentUrl: window.location.href
        });
      }
      
      if (clickId) {
        log('Click ID capturado da URL:', clickId);
        
        // 🔥 NOVO: Armazenar no localStorage para persistir entre páginas (IDÊNTICO AO BOT)
        localStorage.setItem('kwai_click_id', clickId);
        localStorage.setItem('kwai_click_id_timestamp', Date.now().toString());
        
        // 🔥 NOVO: Armazenar também no sessionStorage para páginas subsequentes (IDÊNTICO AO BOT)
        sessionStorage.setItem('kwai_click_id', clickId);
        sessionStorage.setItem('kwai_click_id_timestamp', Date.now().toString());
        
        // 🔥 NOVO: Capturar e armazenar outros parâmetros de tracking (IDÊNTICO AO BOT)
        const trackingData = {
          utm_source: urlParams.get('utm_source'),
          utm_medium: urlParams.get('utm_medium'),
          utm_campaign: urlParams.get('utm_campaign'),
          utm_term: urlParams.get('utm_term'),
          utm_content: urlParams.get('utm_content'),
          fbp: urlParams.get('fbp'),
          fbc: urlParams.get('fbc'),
          user_agent: navigator.userAgent,
          ip: null // Será preenchido pelo backend se necessário
        };
        
        // Armazenar dados de tracking
        localStorage.setItem('kwai_tracking_data', JSON.stringify(trackingData));
        sessionStorage.setItem('kwai_tracking_data', JSON.stringify(trackingData));
        
        log('Dados de tracking capturados:', trackingData);
        
        return clickId;
      } else {
        log('Nenhum click_id encontrado na URL');
        
        // 🔥 NOVO: Tentar recuperar do sessionStorage se não estiver na URL (IDÊNTICO AO BOT)
        const sessionClickId = sessionStorage.getItem('kwai_click_id');
        if (sessionClickId) {
          log('Click ID recuperado do sessionStorage:', sessionClickId);
          return sessionClickId;
        }
        
        // 🔥 NOVO: Tentar recuperar do localStorage como fallback (IDÊNTICO AO BOT)
        const localClickId = localStorage.getItem('kwai_click_id');
        if (localClickId) {
          log('Click ID recuperado do localStorage:', localClickId);
          return localClickId;
        }
        
        return null;
      }
    } catch (error) {
      console.error('❌ [KWAI-TRACKER-PRIVACY] Erro ao capturar click_id:', error);
      return null;
    }
  }
  
  /**
   * 🔥 NOVO: Obter click_id armazenado - IDÊNTICO AO BOT
   */
  function getStoredClickId() {
    try {
      // 🔥 NOVO: Priorizar sessionStorage, depois localStorage (IDÊNTICO AO BOT)
      let clickId = sessionStorage.getItem('kwai_click_id');
      let timestamp = sessionStorage.getItem('kwai_click_id_timestamp');
      
      if (!clickId) {
        clickId = localStorage.getItem('kwai_click_id');
        timestamp = localStorage.getItem('kwai_click_id_timestamp');
      }
      
      if (clickId) {
        // Verificar se o click_id não está muito antigo (24 horas) - IDÊNTICO AO BOT
        const now = Date.now();
        const stored = parseInt(timestamp) || 0;
        const hoursDiff = (now - stored) / (1000 * 60 * 60);
        
        if (hoursDiff > 24) {
          log('Click ID expirado, removendo do storage');
          localStorage.removeItem('kwai_click_id');
          localStorage.removeItem('kwai_click_id_timestamp');
          sessionStorage.removeItem('kwai_click_id');
          sessionStorage.removeItem('kwai_click_id_timestamp');
          return null;
        }
        
        log('Click ID recuperado do storage:', clickId.substring(0, 10) + '...');
        return clickId;
      }
      
      return null;
    } catch (error) {
      console.error('❌ [KWAI-TRACKER-PRIVACY] Erro ao obter click_id armazenado:', error);
      return null;
    }
  }
  
  /**
   * 🔥 NOVO: Obter dados de tracking armazenados - IDÊNTICO AO BOT
   */
  function getStoredTrackingData() {
    try {
      let trackingData = sessionStorage.getItem('kwai_tracking_data');
      
      if (!trackingData) {
        trackingData = localStorage.getItem('kwai_tracking_data');
      }
      
      if (trackingData) {
        return JSON.parse(trackingData);
      }
      
      return null;
    } catch (error) {
      console.error('❌ [KWAI-TRACKER-PRIVACY] Erro ao obter dados de tracking:', error);
      return null;
    }
  }
  
  /**
   * Verificar se temos um click_id válido
   */
  function hasValidClickId() {
    return getStoredClickId() !== null;
  }
  
  /**
   * 🔥 NOVO: Método de compatibilidade para evitar erro
   * Alguns códigos podem estar chamando hasClickId() incorretamente
   */
  function hasClickId() {
    console.warn('⚠️ [KWAI-TRACKER-PRIVACY] hasClickId() está depreciado, use hasValidClickId()');
    return hasValidClickId();
  }
  
  /**
   * Limpar click_id armazenado
   */
  function clearClickId() {
    try {
      localStorage.removeItem('kwai_click_id');
      localStorage.removeItem('kwai_click_id_timestamp');
      localStorage.removeItem('kwai_tracking_data');
      sessionStorage.removeItem('kwai_click_id');
      sessionStorage.removeItem('kwai_click_id_timestamp');
      sessionStorage.removeItem('kwai_tracking_data');
      log('Click ID e dados de tracking limpos do storage');
    } catch (error) {
      console.error('❌ [KWAI-TRACKER-PRIVACY] Erro ao limpar click_id:', error);
    }
  }
  
  /**
   * 🔥 NOVO: Enviar evento para o backend - IDÊNTICO AO BOT
   */
  async function sendKwaiEvent(eventName, properties = {}) {
    const clickId = getStoredClickId();
    
    if (!clickId) {
      log(`Não é possível enviar evento ${eventName}: click_id não disponível`);
      return { success: false, reason: 'Click ID não disponível' };
    }
    
    try {
      log(`Enviando evento ${eventName} para o backend`);
      
      // 🔥 NOVO: Incluir dados de tracking se disponíveis (IDÊNTICO AO BOT)
      const trackingData = getStoredTrackingData();
      const enhancedProperties = {
        ...properties,
        ...(trackingData && {
          utm_source: trackingData.utm_source,
          utm_medium: trackingData.utm_medium,
          utm_campaign: trackingData.utm_campaign,
          utm_term: trackingData.utm_term,
          utm_content: trackingData.utm_content
        })
      };
      
      const response = await fetch('/api/kwai-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clickid: clickId,
          eventName: eventName,
          properties: enhancedProperties
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        log(`Evento ${eventName} enviado com sucesso`, result);
        return { success: true, data: result };
      } else {
        log(`Erro ao enviar evento ${eventName}`, result);
        return { success: false, error: result };
      }
      
    } catch (error) {
      log(`Erro ao enviar evento ${eventName}:`, error.message);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 🔥 NOVO: Enviar evento de visualização de conteúdo - IDÊNTICO AO BOT
   */
  async function sendContentView(properties = {}) {
    return sendKwaiEvent('EVENT_CONTENT_VIEW', {
      content_name: 'Privacy - Landing Page',
      content_category: 'Privacy',
      content_id: 'privacy_landing',
      currency: 'BRL',
      ...properties
    });
  }
  
  /**
   * 🔥 NOVO: Enviar evento de adicionar ao carrinho - IDÊNTICO AO BOT
   */
  async function sendAddToCart(value, properties = {}) {
    return sendKwaiEvent('EVENT_ADD_TO_CART', {
      value: value,
      content_name: 'Privacy - Assinatura',
      content_id: `privacy_plan_${Date.now()}`,
      content_category: 'Privacy',
      currency: 'BRL',
      quantity: 1,
      ...properties
    });
  }
  
  /**
   * 🔥 NOVO: Enviar evento de compra aprovada - IDÊNTICO AO BOT
   */
  async function sendPurchase(value, properties = {}) {
    return sendKwaiEvent('EVENT_PURCHASE', {
      value: value,
      content_name: 'Privacy - Assinatura',
      content_id: `privacy_purchase_${Date.now()}`,
      content_category: 'Privacy',
      currency: 'BRL',
      quantity: 1,
      ...properties
    });
  }
  
  /**
   * 🔥 NOVO: Tracking automático de visualização de página - IDÊNTICO AO BOT
   */
  function setupAutomaticTracking() {
    // Tracking automático quando a página carrega
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          if (hasValidClickId()) {
            log('🔄 Tracking automático: Enviando EVENT_CONTENT_VIEW');
            sendContentView({
              content_name: document.title || 'Privacy - Página',
              content_category: 'Privacy',
              content_id: window.location.pathname || 'privacy_page'
            });
          }
        }, 1000); // Delay de 1 segundo para garantir carregamento completo
      });
    } else {
      // Página já carregou, enviar imediatamente
      setTimeout(() => {
        if (hasValidClickId()) {
          log('🔄 Tracking automático: Enviando EVENT_CONTENT_VIEW (página já carregada)');
          sendContentView({
            content_name: document.title || 'Privacy - Página',
            content_category: 'Privacy',
            content_id: window.location.pathname || 'privacy_page'
          });
        }
      }, 1000);
    }
    
    // Tracking automático quando a página fica visível
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && hasValidClickId()) {
        log('🔄 Tracking automático: Página ficou visível, enviando EVENT_CONTENT_VIEW');
        sendContentView({
          content_name: document.title || 'Privacy - Página',
          content_category: 'Privacy',
          content_id: window.location.pathname || 'privacy_page'
        });
      }
    });
  }
  
  // Executar captura imediatamente
  const capturedClickId = captureClickId();
  
  // 🔥 NOVO: Configurar tracking automático
  setupAutomaticTracking();
  
  // Expor API global - IDÊNTICO AO BOT
  window.KwaiTracker = {
    // Métodos principais - IDÊNTICO AO BOT
    captureClickId: captureClickId,
    getClickId: getStoredClickId,
    hasValidClickId: hasValidClickId,
    clearClickId: clearClickId,
    sendEvent: sendKwaiEvent,
    
    // 🔥 NOVO: Método de compatibilidade para evitar erro
    hasClickId: hasClickId,
    
    // 🔥 NOVO: Método para obter dados de tracking
    getTrackingData: getStoredTrackingData,
    
    // Eventos - IDÊNTICO AO BOT
    sendContentView: (properties = {}) => sendKwaiEvent('EVENT_CONTENT_VIEW', properties),
    sendAddToCart: (properties = {}) => sendKwaiEvent('EVENT_ADD_TO_CART', properties),
    sendPurchase: (properties = {}) => sendKwaiEvent('EVENT_PURCHASE', properties)
  };
  
  // Log de inicialização
  log('Kwai Tracker inicializado para Privacy (IDÊNTICO AO BOT)', {
    clickIdCaptured: capturedClickId ? capturedClickId.substring(0, 10) + '...' : null,
    hasStoredClickId: hasValidClickId(),
    debugMode: DEBUG_MODE,
    trackingData: getStoredTrackingData()
  });
  
  // 🔥 NOVO: Log automático a cada 5 segundos em modo debug
  if (DEBUG_MODE) {
    setInterval(() => {
      const currentClickId = getStoredClickId();
      const trackingData = getStoredTrackingData();
      if (currentClickId) {
        log('Status: Click ID válido mantido', {
          clickId: currentClickId.substring(0, 10) + '...',
          trackingData: trackingData
        });
      } else {
        log('Status: Nenhum Click ID válido encontrado');
      }
    }, 5000);
  }
  
})();
