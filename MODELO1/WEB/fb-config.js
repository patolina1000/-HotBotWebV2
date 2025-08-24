// fb-config.js - Configurações do Facebook Pixel carregadas do servidor
window.fbConfig = {
  FB_PIXEL_ID: '',
  FB_TEST_EVENT_CODE: '',
  loaded: false
};

// Função para carregar configurações do servidor
async function loadFacebookConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    
    window.fbConfig.FB_PIXEL_ID = config.FB_PIXEL_ID;
    window.fbConfig.FB_TEST_EVENT_CODE = config.FB_TEST_EVENT_CODE;
    window.fbConfig.loaded = true;
    
    // Log discreto para debug
    if (console && console.debug) {
      console.debug('🔧 FB Config carregado:', {
        pixelId: config.FB_PIXEL_ID ? 'DEFINIDO' : 'NÃO DEFINIDO',
        testEventCode: config.FB_TEST_EVENT_CODE ? 'DEFINIDO' : 'NÃO DEFINIDO'
      });
    }
    
    return config;
  } catch (error) {
    console.error('❌ Erro ao carregar configurações do Facebook:', error);
    return null;
  }
}

// Função para adicionar test_event_code aos eventos do Facebook Pixel
function addTestEventCode(eventData) {
  if (window.fbConfig && window.fbConfig.FB_TEST_EVENT_CODE) {
    eventData.test_event_code = window.fbConfig.FB_TEST_EVENT_CODE;
  }
  return eventData;
}

// Função wrapper para fbq que adiciona automaticamente o test_event_code
window.fbqWithTestCode = function(action, eventName, eventData = {}) {
  if (action === 'track') {
    eventData = addTestEventCode(eventData);
  }
  return fbq(action, eventName, eventData);
};

// Carregar configurações imediatamente
loadFacebookConfig();