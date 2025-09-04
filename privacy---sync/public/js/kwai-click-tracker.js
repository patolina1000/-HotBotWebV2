/**
 * Sistema de captura e armazenamento do click_id do Kwai para Privacy
 * Captura o click_id da URL e armazena para uso em eventos subsequentes
 * Implementado para a pasta privacy---sync
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
   * Capturar click_id da URL
   */
  function captureClickId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const clickId = urlParams.get('click_id');
      
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
        
        // Armazenar no localStorage para persistir entre páginas
        localStorage.setItem('kwai_click_id', clickId);
        
        // Armazenar timestamp de captura
        localStorage.setItem('kwai_click_id_timestamp', Date.now().toString());
        
        // 🔥 NOVO: Armazenar também no sessionStorage para páginas subsequentes
        sessionStorage.setItem('kwai_click_id', clickId);
        
        return clickId;
      } else {
        log('Nenhum click_id encontrado na URL');
        
        // 🔥 NOVO: Tentar recuperar do sessionStorage se não estiver na URL
        const sessionClickId = sessionStorage.getItem('kwai_click_id');
        if (sessionClickId) {
          log('Click ID recuperado do sessionStorage:', sessionClickId);
          return sessionClickId;
        }
        
        return null;
      }
    } catch (error) {
      console.error('❌ [KWAI-TRACKER-PRIVACY] Erro ao capturar click_id:', error);
      return null;
    }
  }
  
  /**
   * Obter click_id armazenado
   */
  function getStoredClickId() {
    try {
      // 🔥 NOVO: Priorizar sessionStorage, depois localStorage
      let clickId = sessionStorage.getItem('kwai_click_id');
      let timestamp = sessionStorage.getItem('kwai_click_id_timestamp');
      
      if (!clickId) {
        clickId = localStorage.getItem('kwai_click_id');
        timestamp = localStorage.getItem('kwai_click_id_timestamp');
      }
      
      if (clickId) {
        // Verificar se o click_id não está muito antigo (24 horas)
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
   * Verificar se temos um click_id válido
   */
  function hasValidClickId() {
    return getStoredClickId() !== null;
  }
  
  /**
   * Limpar click_id armazenado
   */
  function clearClickId() {
    try {
      localStorage.removeItem('kwai_click_id');
      localStorage.removeItem('kwai_click_id_timestamp');
      sessionStorage.removeItem('kwai_click_id');
      sessionStorage.removeItem('kwai_click_id_timestamp');
      log('Click ID limpo do storage');
    } catch (error) {
      console.error('❌ [KWAI-TRACKER-PRIVACY] Erro ao limpar click_id:', error);
    }
  }
  
  /**
   * Enviar evento para o backend
   */
  async function sendKwaiEvent(eventName, properties = {}) {
    const clickId = getStoredClickId();
    
    if (!clickId) {
      log(`Não é possível enviar evento ${eventName}: click_id não disponível`);
      return { success: false, reason: 'Click ID não disponível' };
    }
    
    try {
      log(`Enviando evento ${eventName} para o backend`);
      
      const response = await fetch('/api/kwai-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clickid: clickId,
          eventName: eventName,
          properties: properties
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
   * Enviar evento de visualização de conteúdo
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
   * Enviar evento de adicionar ao carrinho
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
   * Enviar evento de compra aprovada
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
  
  // 🔥 NOVO: Função para forçar captura de click_id
  function forceCaptureClickId() {
    log('Forçando captura de click_id...');
    const captured = captureClickId();
    if (captured) {
      log('Click ID capturado com sucesso:', captured.substring(0, 10) + '...');
    } else {
      log('Nenhum click_id encontrado para capturar');
    }
    return captured;
  }
  
  // Executar captura imediatamente
  const capturedClickId = captureClickId();
  
  // 🔥 NOVO: Executar captura também quando a página carrega
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      log('DOM carregado, verificando click_id...');
      if (!capturedClickId) {
        forceCaptureClickId();
      }
    });
  } else {
    // DOM já carregado
    if (!capturedClickId) {
      log('DOM já carregado, verificando click_id...');
      forceCaptureClickId();
    }
  }
  
  // Expor API global
  window.KwaiTracker = {
    // Métodos principais
    captureClickId: captureClickId,
    getClickId: getStoredClickId,
    hasValidClickId: hasValidClickId,
    clearClickId: clearClickId,
    forceCaptureClickId: forceCaptureClickId,
    
    // Eventos
    sendContentView: sendContentView,
    sendAddToCart: sendAddToCart,
    sendPurchase: sendPurchase,
    sendEvent: sendKwaiEvent,
    
    // Informações
    getCapturedClickId: () => capturedClickId,
    isConfigured: () => hasValidClickId(),
    
    // Debug
    debug: () => {
      if (DEBUG_MODE) {
        console.log('🔍 [KWAI-TRACKER-PRIVACY] Debug Info:', {
          capturedClickId: capturedClickId,
          storedClickId: getStoredClickId(),
          hasValidClickId: hasValidClickId(),
          localStorage: {
            kwai_click_id: localStorage.getItem('kwai_click_id'),
            kwai_click_id_timestamp: localStorage.getItem('kwai_click_id_timestamp')
          },
          sessionStorage: {
            kwai_click_id: sessionStorage.getItem('kwai_click_id'),
            kwai_click_id_timestamp: sessionStorage.getItem('kwai_click_id_timestamp')
          },
          currentUrl: window.location.href,
          searchParams: window.location.search
        });
      }
    }
  };
  
  // Log de inicialização
  log('Kwai Tracker inicializado para Privacy', {
    capturedClickId: capturedClickId ? capturedClickId.substring(0, 10) + '...' : null,
    hasStoredClickId: hasValidClickId(),
    debugMode: DEBUG_MODE
  });
  
  // 🔥 NOVO: Log automático a cada 5 segundos em modo debug
  if (DEBUG_MODE) {
    setInterval(() => {
      const currentClickId = getStoredClickId();
      if (currentClickId) {
        log('Status: Click ID válido mantido', currentClickId.substring(0, 10) + '...');
      } else {
        log('Status: Nenhum Click ID válido encontrado');
      }
    }, 5000);
  }
  
})();
