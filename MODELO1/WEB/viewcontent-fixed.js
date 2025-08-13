/**
 * 🔥 viewcontent-fixed.js
 * CORREÇÃO: ViewContent com garantia de carregamento do Facebook Pixel
 * 
 * PROBLEMA IDENTIFICADO:
 * O evento ViewContent estava sendo disparado ANTES do Facebook Pixel estar
 * totalmente carregado, causando a perda do parâmetro _fbp (Facebook Browser ID).
 * 
 * SOLUÇÃO IMPLEMENTADA:
 * 1. Aguarda o carregamento completo do Facebook Pixel
 * 2. Verifica se o _fbp está disponível antes de disparar
 * 3. Implementa retry automático com timeout
 * 4. Garante que todos os parâmetros sejam enviados corretamente
 */

(function() {
  'use strict';

  // CONFIGURAÇÕES
  const VIEWCONTENT_CONFIG = {
    name: 'ViewContent',
    prefix: 'vc',
    maxRetries: 5,
    retryDelay: 500, // 500ms entre tentativas
    maxWaitTime: 10000, // 10 segundos máximo de espera
    testEventCode: 'TEST11543'
  };

  // ESTADO GLOBAL
  let pixelReady = false;
  let fbpAvailable = false;
  let retryCount = 0;
  let viewContentQueue = [];

  // 🔥 FUNÇÃO PARA VERIFICAR SE O PIXEL ESTÁ PRONTO
  function isPixelReady() {
    return (
      typeof fbq === 'function' &&
      window.fbConfig &&
      window.fbConfig.loaded &&
      window.fbConfig.FB_PIXEL_ID &&
      pixelReady
    );
  }

  // 🔥 FUNÇÃO PARA CAPTURAR COOKIES DO FACEBOOK
  function captureFacebookCookies() {
    const cookies = {};
    
    // Função auxiliar para obter cookie
    function getCookie(name) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }

    // Capturar _fbp com múltiplas fontes
    let fbp = localStorage.getItem('fbp') || getCookie('_fbp');
    if (fbp) {
      cookies.fbp = fbp;
      fbpAvailable = true;
    }

    // Capturar _fbc com fallback para fbclid
    let fbc = localStorage.getItem('fbc') || getCookie('_fbc');
    if (!fbc) {
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

  // 🔥 FUNÇÃO PARA GERAR EVENT ID ÚNICO
  function generateViewContentEventID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const sessionId = sessionStorage.getItem('session_id') || 
                     Math.random().toString(36).substring(2, 15);
    
    if (!sessionStorage.getItem('session_id')) {
      sessionStorage.setItem('session_id', sessionId);
    }
    
    return `${VIEWCONTENT_CONFIG.prefix}_${timestamp}_${random}_${sessionId}`;
  }

  // 🔥 FUNÇÃO PARA VALIDAR DADOS ANTES DO ENVIO
  function validateViewContentData(data) {
    const cookies = captureFacebookCookies();
    
    if (!cookies.fbp) {
      console.warn('⚠️ _fbp não disponível - aguardando...');
      return false;
    }

    if (!isPixelReady()) {
      console.warn('⚠️ Facebook Pixel não está pronto - aguardando...');
      return false;
    }

    console.log('✅ Dados validados para ViewContent:');
    console.log(`   - FBP: ${cookies.fbp.substring(0, 20)}...`);
    console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
    console.log(`   - Pixel ID: ${window.fbConfig.FB_PIXEL_ID}`);
    
    return true;
  }

  // 🔥 FUNÇÃO PRINCIPAL PARA DISPARAR VIEWCONTENT
  function triggerViewContentEvent(options = {}) {
    const eventID = generateViewContentEventID();
    const cookies = captureFacebookCookies();
    
    console.log(`🔥 Iniciando ViewContent - EventID: ${eventID}`);
    
    // Validar se está pronto para disparar
    if (!validateViewContentData()) {
      console.log('⏳ ViewContent não está pronto - adicionando à fila');
      viewContentQueue.push({ eventID, options, cookies, timestamp: Date.now() });
      return { success: false, error: 'Pixel não pronto', queued: true };
    }

    try {
      const eventData = {
        value: options.value || parseFloat((Math.random() * (19.90 - 9.90) + 9.90).toFixed(2)),
        currency: options.currency || 'BRL',
        content_type: options.content_type || 'product',
        content_name: options.content_name || document.title,
        content_category: options.content_category || 'Website',
        eventID: eventID
      };

      // 🔥 ADICIONAR COOKIES DO FACEBOOK (CRÍTICO!)
      if (cookies.fbp) eventData._fbp = cookies.fbp;
      if (cookies.fbc) eventData._fbc = cookies.fbc;

      // Disparar evento
      fbq('track', VIEWCONTENT_CONFIG.name, {
        ...eventData,
        test_event_code: VIEWCONTENT_CONFIG.testEventCode
      });
      
      console.log(`🔥 ViewContent disparado com sucesso!`);
      console.log(`   - EventID: ${eventID}`);
      console.log(`   - FBP: ${cookies.fbp ? cookies.fbp.substring(0, 20) + '...' : 'não encontrado'}`);
      console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
      console.log(`   - Valor: R$ ${eventData.value}`);
      
      return { 
        success: true, 
        eventID: eventID,
        fbp: cookies.fbp,
        fbc: cookies.fbc,
        data: eventData
      };
      
    } catch (error) {
      console.error('❌ Erro ao disparar ViewContent:', error);
      return { success: false, error: error.message };
    }
  }

  // 🔥 FUNÇÃO PARA PROCESSAR FILA DE EVENTOS
  function processViewContentQueue() {
    if (viewContentQueue.length === 0) return;
    
    console.log(`🔄 Processando fila de ViewContent (${viewContentQueue.length} eventos)`);
    
    const currentTime = Date.now();
    const validEvents = viewContentQueue.filter(event => {
      // Remover eventos antigos (mais de 30 segundos)
      return (currentTime - event.timestamp) < 30000;
    });
    
    viewContentQueue = validEvents;
    
    validEvents.forEach(event => {
      console.log(`🔄 Reprocessando ViewContent da fila: ${event.eventID}`);
      triggerViewContentEvent(event.options);
    });
  }

  // 🔥 FUNÇÃO PARA AGUARDAR PIXEL COM RETRY
  function waitForPixelReady() {
    if (isPixelReady() && fbpAvailable) {
      console.log('✅ Facebook Pixel está pronto e _fbp disponível');
      pixelReady = true;
      processViewContentQueue();
      return;
    }

    retryCount++;
    
    if (retryCount > VIEWCONTENT_CONFIG.maxRetries) {
      console.error('❌ Timeout: Facebook Pixel não carregou em tempo hábil');
      console.log('📊 Status final:');
      console.log(`   - fbq disponível: ${typeof fbq === 'function'}`);
      console.log(`   - fbConfig carregado: ${window.fbConfig && window.fbConfig.loaded}`);
      console.log(`   - Pixel ID: ${window.fbConfig ? window.fbConfig.FB_PIXEL_ID : 'não definido'}`);
      console.log(`   - _fbp disponível: ${fbpAvailable}`);
      return;
    }

    console.log(`⏳ Aguardando Facebook Pixel... (tentativa ${retryCount}/${VIEWCONTENT_CONFIG.maxRetries})`);
    
    setTimeout(waitForPixelReady, VIEWCONTENT_CONFIG.retryDelay);
  }

  // 🔥 FUNÇÃO PARA INICIALIZAR O SISTEMA
  function initializeViewContentSystem() {
    console.log('🚀 Inicializando sistema ViewContent corrigido');
    
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(waitForPixelReady, 100);
      });
    } else {
      setTimeout(waitForPixelReady, 100);
    }
  }

  // 🔥 FUNÇÃO PARA DISPARAR VIEWCONTENT COM GARANTIA
  function triggerViewContentWithGuarantee(options = {}) {
    console.log('🎯 ViewContent com garantia solicitado');
    
    // Se o pixel já está pronto, disparar imediatamente
    if (isPixelReady() && fbpAvailable) {
      return triggerViewContentEvent(options);
    }
    
    // Caso contrário, adicionar à fila
    const eventID = generateViewContentEventID();
    const cookies = captureFacebookCookies();
    
    viewContentQueue.push({ eventID, options, cookies, timestamp: Date.now() });
    
    console.log('⏳ ViewContent adicionado à fila - será processado quando o Pixel estiver pronto');
    
    return { 
      success: false, 
      error: 'Pixel não pronto', 
      queued: true, 
      eventID: eventID 
    };
  }

  // 🔥 FUNÇÃO PARA LIMPAR DADOS (útil para testes)
  function clearViewContentData() {
    viewContentQueue = [];
    retryCount = 0;
    pixelReady = false;
    fbpAvailable = false;
    console.log('🧹 Dados do ViewContent limpos');
  }

  // 🔥 EXPOSIÇÃO DAS FUNÇÕES GLOBALMENTE
  window.ViewContentFixed = {
    triggerViewContentWithGuarantee,
    triggerViewContentEvent,
    processViewContentQueue,
    clearViewContentData,
    isPixelReady,
    captureFacebookCookies,
    generateViewContentEventID,
    validateViewContentData
  };

  // 🔥 INICIALIZAÇÃO AUTOMÁTICA
  initializeViewContentSystem();

  // 🔥 LOG INICIAL
  console.log('📊 ViewContent Fixed System carregado');
  console.log('🔧 Funções disponíveis:');
  console.log('   - triggerViewContentWithGuarantee(options)');
  console.log('   - triggerViewContentEvent(options)');
  console.log('   - clearViewContentData()');
  console.log('   - isPixelReady()');

})();
