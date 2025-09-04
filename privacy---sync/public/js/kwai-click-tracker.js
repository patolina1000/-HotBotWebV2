/**
 * Sistema de captura e armazenamento do click_id do Kwai
 * VERSÃO PRIVACY - Adaptado para funcionar com a rota /api/config do privacy
 * Captura o click_id da URL e armazena para uso em eventos subsequentes
 */
(function() {
  'use strict';
  
  const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname.includes('dev');
  
  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[KWAI-TRACKER-PRIVACY] ${message}`, data || '');
    }
  }
  
  /**
   * Capturar click_id da URL
   */
  function captureClickId() {
    const urlParams = new URLSearchParams(window.location.search);
    const clickId = urlParams.get('click_id') || urlParams.get('kwai_click_id');
    
    // 🔍 DEBUG: Log detalhado para entender o problema
    console.log('🔍 [DEBUG] Capturando click_id da URL:', {
      search: window.location.search,
      hasClickId: !!clickId,
      clickId: clickId,
      allParams: Object.fromEntries(urlParams.entries())
    });
    
    if (clickId) {
      log('Click ID capturado da URL:', clickId);
      
      // Armazenar no localStorage para persistir entre páginas
      localStorage.setItem('kwai_click_id', clickId);
      
      // Armazenar timestamp de captura
      localStorage.setItem('kwai_click_id_timestamp', Date.now().toString());
      
      return clickId;
    } else {
      log('Nenhum click_id encontrado na URL');
      return null;
    }
  }
  
  /**
   * Obter click_id armazenado
   */
  function getStoredClickId() {
    const clickId = localStorage.getItem('kwai_click_id');
    const timestamp = localStorage.getItem('kwai_click_id_timestamp');
    
    if (clickId) {
      // Verificar se o click_id não está muito antigo (24 horas)
      const now = Date.now();
      const stored = parseInt(timestamp) || 0;
      const hoursDiff = (now - stored) / (1000 * 60 * 60);
      
      if (hoursDiff > 24) {
        log('Click ID expirado, removendo do storage');
        localStorage.removeItem('kwai_click_id');
        localStorage.removeItem('kwai_click_id_timestamp');
        return null;
      }
      
      log('Click ID recuperado do storage:', clickId.substring(0, 10) + '...');
      return clickId;
    }
    
    return null;
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
    localStorage.removeItem('kwai_click_id');
    localStorage.removeItem('kwai_click_id_timestamp');
    log('Click ID limpo do storage');
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
  
  // Executar captura imediatamente
  const capturedClickId = captureClickId();
  
  // Expor API global
  window.KwaiTracker = {
    captureClickId: captureClickId,
    getClickId: getStoredClickId,
    hasValidClickId: hasValidClickId,
    clearClickId: clearClickId,
    sendEvent: sendKwaiEvent,
    
    // 🔥 NOVO: Método de compatibilidade para evitar erro
    hasClickId: hasClickId,
    
    // Métodos de conveniência para eventos específicos
    sendContentView: (properties = {}) => sendKwaiEvent('EVENT_CONTENT_VIEW', properties),
    sendAddToCart: (properties = {}) => sendKwaiEvent('EVENT_ADD_TO_CART', properties),
    sendPurchase: (properties = {}) => sendKwaiEvent('EVENT_PURCHASE', properties)
  };
  
  log('Sistema de tracking do Kwai (Privacy) inicializado', {
    clickIdCaptured: !!capturedClickId,
    hasStoredClickId: hasValidClickId()
  });
  
})();
