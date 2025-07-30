/**
 * event-tracking-initiate.js
 * Sistema de rastreamento de eventos AddToCart e InitiateCheckout
 * Implementação robusta com deduplicação
 */

(function() {
  'use strict';

  // CONFIGURAÇÕES GLOBAIS
  const EVENT_CONFIG = {
    ADD_TO_CART: {
      name: 'AddToCart',
      prefix: 'atc',
      value: 19.90,
      currency: 'BRL',
      content_type: 'product',
      content_ids: ['curso-vitalicio'],
      content_name: 'Curso Vitalício - Acesso Completo',
      content_category: 'Adult Content'
    },
    INITIATE_CHECKOUT: {
      name: 'InitiateCheckout',
      prefix: 'ic',
      value: 19.90,
      currency: 'BRL',
      content_type: 'product',
      content_ids: ['curso-vitalicio'],
      content_name: 'Curso Vitalício - Acesso Completo',
      content_category: 'Adult Content'
    }
  };

  // FUNÇÃO PARA GERAR EVENT ID ÚNICO E ROBUSTO
  function generateRobustEventID(eventName, prefix) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const sessionId = sessionStorage.getItem('session_id') || 
                     Math.random().toString(36).substring(2, 15);
    
    // Criar session_id se não existir
    if (!sessionStorage.getItem('session_id')) {
      sessionStorage.setItem('session_id', sessionId);
    }
    
    const eventID = `${prefix}_${timestamp}_${random}_${sessionId}`;
    
    return eventID;
  }

  // FUNÇÃO PARA CAPTURAR COOKIES DO FACEBOOK
  function captureFacebookCookies() {
    const cookies = {};
    
    // Função auxiliar para obter cookie
    function getCookie(name) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }

    // Capturar _fbp
    let fbp = localStorage.getItem('fbp') || getCookie('_fbp');
    if (fbp) {
      cookies.fbp = fbp;
    }

    // Capturar _fbc com fallback para fbclid
    let fbc = localStorage.getItem('fbc') || getCookie('_fbc');
    if (!fbc) {
      // Fallback: tentar extrair do fbclid
      const urlParams = new URLSearchParams(window.location.search);
      const fbclid = urlParams.get('fbclid');
      if (fbclid) {
        const timestamp = Date.now();
        fbc = `fb.1.${timestamp}.${fbclid}`;
      }
    }
    
    if (fbc) {
      cookies.fbc = fbc;
    }

    return cookies;
  }

  // FUNÇÃO PARA VALIDAR PIXEL DO FACEBOOK
  function validateFacebookPixel() {
    if (typeof fbq !== 'function') {
      console.error('Facebook Pixel não está carregado - fbq não disponível');
      return false;
    }
    
    if (!window.fbConfig || !window.fbConfig.FB_PIXEL_ID) {
      console.error('❌ Facebook Pixel ID não configurado');
      return false;
    }
    
    console.log('✅ Facebook Pixel validado e pronto para uso');
    return true;
  }

  // 🔥 FUNÇÃO PARA DISPARAR EVENTO ADD TO CART
  function triggerAddToCartEvent() {
    const config = EVENT_CONFIG.ADD_TO_CART;
    const eventID = generateRobustEventID(config.name, config.prefix);
    const cookies = captureFacebookCookies();
    
    console.log(`🔥 Iniciando AddToCart - EventID: ${eventID}`);
    
    if (!validateFacebookPixel()) {
      console.error('❌ AddToCart cancelado - Pixel não disponível');
      return { success: false, error: 'Pixel não disponível' };
    }

    try {
      const eventData = {
        value: config.value,
        currency: config.currency,
        content_type: config.content_type,
        content_ids: config.content_ids,
        content_name: config.content_name,
        content_category: config.content_category,
        eventID: eventID
      };

      // Adicionar cookies se disponíveis
      if (cookies.fbp) eventData._fbp = cookies.fbp;
      if (cookies.fbc) eventData._fbc = cookies.fbc;

      // Disparar evento
      fbq('track', config.name, eventData);
      
      console.log(`🔥 AddToCart disparado com sucesso!`);
      console.log(`   - EventID: ${eventID}`);
      console.log(`   - FBP: ${cookies.fbp ? cookies.fbp.substring(0, 20) + '...' : 'não encontrado'}`);
      console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
      console.log(`   - Valor: R$ ${config.value}`);
      
      return { 
        success: true, 
        eventID: eventID,
        fbp: cookies.fbp,
        fbc: cookies.fbc
      };
      
    } catch (error) {
      console.error('❌ Erro ao disparar AddToCart:', error);
      return { success: false, error: error.message };
    }
  }

  // 🔥 FUNÇÃO PARA DISPARAR EVENTO INITIATE CHECKOUT
  function triggerInitiateCheckoutEvent() {
    const config = EVENT_CONFIG.INITIATE_CHECKOUT;
    const eventID = generateRobustEventID(config.name, config.prefix);
    const cookies = captureFacebookCookies();
    
    console.log(`🛒 Iniciando InitiateCheckout - EventID: ${eventID}`);
    
    if (!validateFacebookPixel()) {
      console.error('❌ InitiateCheckout cancelado - Pixel não disponível');
      return { success: false, error: 'Pixel não disponível' };
    }

    try {
      const eventData = {
        value: config.value,
        currency: config.currency,
        content_type: config.content_type,
        content_ids: config.content_ids,
        content_name: config.content_name,
        content_category: config.content_category,
        eventID: eventID
      };

      // Adicionar cookies se disponíveis
      if (cookies.fbp) eventData._fbp = cookies.fbp;
      if (cookies.fbc) eventData._fbc = cookies.fbc;

      // Disparar evento
      fbq('track', config.name, eventData);
      
      // 🔥 ARMAZENAR EVENTID PARA USO POSTERIOR NO BACKEND
      localStorage.setItem('checkout_event_id', eventID);
      console.log(`💾 EventID armazenado em localStorage: ${eventID}`);
      
      console.log(`🛒 InitiateCheckout disparado com sucesso!`);
      console.log(`   - EventID: ${eventID}`);
      console.log(`   - FBP: ${cookies.fbp ? cookies.fbp.substring(0, 20) + '...' : 'não encontrado'}`);
      console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
      console.log(`   - Valor: R$ ${config.value}`);
      
      return { 
        success: true, 
        eventID: eventID,
        fbp: cookies.fbp,
        fbc: cookies.fbc
      };
      
    } catch (error) {
      console.error('❌ Erro ao disparar InitiateCheckout:', error);
      return { success: false, error: error.message };
    }
  }

  // 🔥 FUNÇÃO PRINCIPAL - DISPARAR AMBOS OS EVENTOS EM SEQUÊNCIA
  function triggerInitiateFlowEvents() {
    console.log('🚀 Iniciando fluxo de eventos AddToCart + InitiateCheckout');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    // Verificar se já foi disparado nesta sessão
    if (sessionStorage.getItem('flow_events_dispatched')) {
      console.log('⚠️ Eventos já disparados nesta sessão, ignorando');
      return { success: false, error: 'Eventos já disparados' };
    }

    // Disparar AddToCart primeiro
    const addToCartResult = triggerAddToCartEvent();
    
    // Aguardar 100ms antes de disparar InitiateCheckout
    setTimeout(() => {
      const initiateCheckoutResult = triggerInitiateCheckoutEvent();
      
      // Marcar como disparado
      sessionStorage.setItem('flow_events_dispatched', 'true');
      
      console.log('✅ Fluxo de eventos concluído!');
      console.log('📊 Resumo:');
      console.log(`   - AddToCart: ${addToCartResult.success ? '✅' : '❌'}`);
      console.log(`   - InitiateCheckout: ${initiateCheckoutResult.success ? '✅' : '❌'}`);
      
      // Retornar dados para uso posterior
      return {
        success: addToCartResult.success && initiateCheckoutResult.success,
        addToCart: addToCartResult,
        initiateCheckout: initiateCheckoutResult,
        timestamp: Date.now()
      };
    }, 100);
  }

  // 🔥 FUNÇÃO PARA OBTER DADOS PARA BACKEND
  function getEventDataForBackend() {
    const checkoutEventID = localStorage.getItem('checkout_event_id');
    const cookies = captureFacebookCookies();
    
    return {
      checkout_event_id: checkoutEventID,
      fbp: cookies.fbp,
      fbc: cookies.fbc,
      timestamp: Date.now(),
      url: window.location.href,
      user_agent: navigator.userAgent
    };
  }

  // 🔥 FUNÇÃO PARA LIMPAR DADOS (útil para testes)
  function clearEventData() {
    localStorage.removeItem('checkout_event_id');
    sessionStorage.removeItem('flow_events_dispatched');
    sessionStorage.removeItem('session_id');
    console.log('🧹 Dados de eventos limpos');
  }

  // 🔥 EXPOSIÇÃO DAS FUNÇÕES GLOBALMENTE
  window.EventTracking = {
    triggerInitiateFlowEvents,
    triggerAddToCartEvent,
    triggerInitiateCheckoutEvent,
    getEventDataForBackend,
    clearEventData,
    generateRobustEventID,
    captureFacebookCookies,
    validateFacebookPixel
  };

  // 🔥 LOG INICIAL
  console.log('📊 Event Tracking System carregado');
  console.log('🔧 Funções disponíveis:');
  console.log('   - triggerInitiateFlowEvents()');
  console.log('   - triggerAddToCartEvent()');
  console.log('   - triggerInitiateCheckoutEvent()');
  console.log('   - getEventDataForBackend()');
  console.log('   - clearEventData()');

})(); 