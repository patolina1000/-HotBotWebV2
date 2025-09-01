// fb-config.js - Configurações do Facebook Pixel (LEGADO - Mantido para compatibilidade)
// NOVO SISTEMA: Use fb-pixel-manager.js para funcionalidade completa

console.warn('⚠️ fb-config.js é um sistema legado. Use FBPixelManager para funcionalidade completa.');

window.fbConfig = {
  FB_PIXEL_ID: '',
  FB_TEST_EVENT_CODE: 'TEST74140',
  loaded: false
};

// Função legada para carregar configurações do servidor
async function loadFacebookConfig() {
  try {
    // Verificar se o novo sistema está disponível
    if (window.FBPixelManager && window.FBPixelManager.getConfig) {
      const config = window.FBPixelManager.getConfig();
      
      window.fbConfig.FB_PIXEL_ID = config.FB_PIXEL_ID;
      window.fbConfig.FB_TEST_EVENT_CODE = config.FB_TEST_EVENT_CODE;
      window.fbConfig.loaded = true;
      
      console.log('🔧 FB Config sincronizado com FBPixelManager:', {
        pixelId: config.FB_PIXEL_ID ? 'DEFINIDO' : 'NÃO DEFINIDO',
        testEventCode: config.FB_TEST_EVENT_CODE ? 'DEFINIDO' : 'NÃO DEFINIDO'
      });
      
      return config;
    }
    
    // Fallback para método legado
    const response = await fetch('/api/config');
    const config = await response.json();
    
    window.fbConfig.FB_PIXEL_ID = config.FB_PIXEL_ID;
    window.fbConfig.FB_TEST_EVENT_CODE = config.FB_TEST_EVENT_CODE;
    window.fbConfig.loaded = true;
    
    console.debug('🔧 FB Config carregado (método legado):', {
      pixelId: config.FB_PIXEL_ID ? 'DEFINIDO' : 'NÃO DEFINIDO',
      testEventCode: config.FB_TEST_EVENT_CODE ? 'DEFINIDO' : 'NÃO DEFINIDO'
    });
    
    return config;
  } catch (error) {
    console.error('❌ Erro ao carregar configurações do Facebook:', error);
    return null;
  }
}

// Função legada para adicionar test_event_code aos eventos do Facebook Pixel
function addTestEventCode(eventData) {
  // Usar o novo sistema se disponível
  if (window.FBPixelManager && window.FBPixelManager.addTestEventCode) {
    return window.FBPixelManager.addTestEventCode(eventData);
  }
  
  // Fallback para método legado
  if (window.fbConfig && window.fbConfig.FB_TEST_EVENT_CODE) {
    eventData.test_event_code = window.fbConfig.FB_TEST_EVENT_CODE;
  }
  return eventData;
}

// Função wrapper legada para fbq que adiciona automaticamente o test_event_code
window.fbqWithTestCode = function(action, eventName, eventData = {}) {
  console.warn('⚠️ fbqWithTestCode é legado. Use FBPixelManager.track() para melhor funcionalidade.');
  
  if (action === 'track') {
    eventData = addTestEventCode(eventData);
  }
  return fbq(action, eventName, eventData);
};

// Aguardar FBPixelManager se disponível, senão carregar configurações legadas
if (window.FBPixelManager) {
  // Aguardar inicialização do FBPixelManager
  const waitForManager = () => {
    if (window.FBPixelManager.isReady()) {
      loadFacebookConfig();
    } else {
      setTimeout(waitForManager, 100);
    }
  };
  waitForManager();
} else {
  // Fallback para método legado
  loadFacebookConfig();
}