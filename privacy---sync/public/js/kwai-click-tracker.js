/**
 * Sistema de captura e armazenamento do click_id do Kwai para Privacy
 * Captura o click_id da URL e armazena para uso em eventos subsequentes
 * Implementado para a pasta privacy---sync
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
    const clickId = urlParams.get('click_id');
    
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
      contentName: 'Privacy - Assinatura',
      contentId: `privacy_plan_${Date.now()}`,
      contentCategory: 'Privacy',
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
      contentName: 'Privacy - Assinatura',
      contentId: `privacy_purchase_${Date.now()}`,
      contentCategory: 'Privacy',
      currency: 'BRL',
      quantity: 1,
      ...properties
    });
  }
  
  // Executar captura imediatamente
  const capturedClickId = captureClickId();
  
  // Expor API global
  window.KwaiTracker = {
    // Métodos principais
    getClickId: getStoredClickId,
    hasClickId: hasValidClickId,
    clearClickId: clearClickId,
    
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
          }
        });
      }
    }
  };
  
  // Log de inicialização
  log('Kwai Tracker inicializado para Privacy', {
    capturedClickId: capturedClickId ? capturedClickId.substring(0, 10) + '...' : null,
    hasStoredClickId: hasValidClickId()
  });
  
  // Habilitar debug se solicitado
  if (localStorage.getItem('kwai_debug') === 'true') {
    DEBUG_MODE = true;
    log('Debug mode ativado via localStorage');
  }
  
})();
