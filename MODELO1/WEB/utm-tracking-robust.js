/**
 * UTM Tracking Script Robusto
 * Captura e preserva parâmetros UTM com validação completa
 * Executa o mais cedo possível para evitar perda de dados
 */
(function() {
  'use strict';
  
  // Configuração
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname.includes('dev');
  
  // Logging centralizado
  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[UTM-TRACKING] ${message}`, data || '');
    }
  }
  
  // Função para decodificar valor UTM
  function decodeUTMValue(value) {
    if (!value || typeof value !== 'string') return null;
    
    try {
      const decoded = decodeURIComponent(value);
      log(`Decodificado: "${value}" → "${decoded}"`);
      return decoded;
    } catch (error) {
      log(`Erro ao decodificar "${value}":`, error);
      return value; // Retorna original se falhar
    }
  }
  
  // Função para validar e separar formato nome|id
  function parseUTMValue(value) {
    if (!value || typeof value !== 'string') return null;
    
    const parts = value.split('|');
    if (parts.length === 2) {
      const [name, id] = parts;
      const isValid = name && id && /^\d+$/.test(id.trim());
      
      log(`Parse UTM: "${value}" → nome: "${name}", id: "${id}", válido: ${isValid}`);
      
      return {
        original: value,
        name: name.trim(),
        id: id.trim(),
        isValid: isValid
      };
    } else {
      log(`UTM sem formato nome|id: "${value}"`);
      return {
        original: value,
        name: value,
        id: null,
        isValid: false
      };
    }
  }
  
  // Função para capturar UTMs da URL atual
  function captureUTMsFromURL() {
    const url = window.location.href;
    const searchParams = window.location.search;
    
    log('URL Original:', url);
    log('Query Params Bruto:', searchParams);
    
    if (!searchParams) {
      log('Nenhum parâmetro UTM encontrado na URL');
      return {};
    }
    
    const params = new URLSearchParams(searchParams);
    const capturedUTMs = {};
    
    UTM_KEYS.forEach(key => {
      const rawValue = params.get(key);
      if (rawValue !== null) {
        const decodedValue = decodeUTMValue(rawValue);
        const parsed = parseUTMValue(decodedValue);
        
        capturedUTMs[key] = {
          raw: rawValue,
          decoded: decodedValue,
          parsed: parsed
        };
        
        log(`UTM ${key}:`, capturedUTMs[key]);
      }
    });
    
    return capturedUTMs;
  }
  
  // Função para obter UTMs salvos do localStorage
  function getSavedUTMs() {
    const savedUTMs = {};
    
    UTM_KEYS.forEach(key => {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = parseUTMValue(saved);
        savedUTMs[key] = {
          saved: saved,
          parsed: parsed
        };
        log(`UTM salvo ${key}:`, savedUTMs[key]);
      }
    });
    
    return savedUTMs;
  }
  
  // Função para salvar UTMs no localStorage
  function saveUTMs(utms) {
    Object.keys(utms).forEach(key => {
      const utmData = utms[key];
      if (utmData && utmData.decoded) {
        localStorage.setItem(key, utmData.decoded);
        log(`Salvo no localStorage: ${key} = "${utmData.decoded}"`);
      }
    });
  }
  
  // Função para preservar UTMs em redirecionamentos
  function preserveUTMsInRedirect(newUrl) {
    const currentSearch = window.location.search;
    if (!currentSearch) return newUrl;
    
    const urlObj = new URL(newUrl, window.location.origin);
    const currentParams = new URLSearchParams(currentSearch);
    
    // Adicionar UTMs atuais se não existirem na nova URL
    UTM_KEYS.forEach(key => {
      const currentValue = currentParams.get(key);
      if (currentValue && !urlObj.searchParams.has(key)) {
        urlObj.searchParams.set(key, currentValue);
        log(`Preservando UTM ${key} em redirecionamento: "${currentValue}"`);
      }
    });
    
    const finalUrl = urlObj.toString();
    log('URL com UTMs preservados:', finalUrl);
    return finalUrl;
  }
  
  // Função principal de captura
  function captureAndProcessUTMs() {
    log('=== INICIANDO CAPTURA DE UTMs ===');
    
    // 1. Capturar UTMs da URL atual
    const urlUTMs = captureUTMsFromURL();
    
    // 2. Obter UTMs salvos do localStorage
    const savedUTMs = getSavedUTMs();
    
    // 3. Processar e salvar UTMs válidos
    const validUTMs = {};
    
    UTM_KEYS.forEach(key => {
      const urlUTM = urlUTMs[key];
      const savedUTM = savedUTMs[key];
      
      if (urlUTM && urlUTM.parsed && urlUTM.parsed.isValid) {
        // Priorizar UTMs da URL se válidos
        validUTMs[key] = urlUTM.decoded;
        log(`Usando UTM da URL: ${key} = "${urlUTM.decoded}"`);
      } else if (savedUTM && savedUTM.parsed && savedUTM.parsed.isValid) {
        // Fallback para UTMs salvos se válidos
        validUTMs[key] = savedUTM.saved;
        log(`Usando UTM salvo: ${key} = "${savedUTM.saved}"`);
      } else if (urlUTM && urlUTM.decoded) {
        // Salvar mesmo se não tiver formato nome|id
        validUTMs[key] = urlUTM.decoded;
        log(`Salvando UTM sem formato nome|id: ${key} = "${urlUTM.decoded}"`);
      }
    });
    
    // 4. Salvar no localStorage
    saveUTMs(urlUTMs);
    
    log('=== UTMs CAPTURADOS ===', validUTMs);
    return validUTMs;
  }
  
  // Interceptar redirecionamentos para preservar UTMs
  function setupRedirectPreservation() {
    // Sobrescrever window.location.href
    const originalLocationHref = Object.getOwnPropertyDescriptor(window.location, 'href');
    
    Object.defineProperty(window.location, 'href', {
      set: function(url) {
        const preservedUrl = preserveUTMsInRedirect(url);
        originalLocationHref.set.call(this, preservedUrl);
      },
      get: originalLocationHref.get,
      configurable: true
    });
    
    // Sobrescrever window.location.replace
    const originalReplace = window.location.replace;
    window.location.replace = function(url) {
      const preservedUrl = preserveUTMsInRedirect(url);
      return originalReplace.call(this, preservedUrl);
    };
    
    // Sobrescrever window.location.assign
    const originalAssign = window.location.assign;
    window.location.assign = function(url) {
      const preservedUrl = preserveUTMsInRedirect(url);
      return originalAssign.call(this, preservedUrl);
    };
    
    log('Interceptação de redirecionamentos configurada');
  }
  
  // Função para obter UTMs processados
  function getProcessedUTMs() {
    const utms = {};
    UTM_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        utms[key] = value;
      }
    });
    return utms;
  }
  
  // Executar captura imediatamente
  const capturedUTMs = captureAndProcessUTMs();
  
  // Configurar preservação de redirecionamentos
  setupRedirectPreservation();
  
  // Expor funções globalmente
  window.UTMTracking = {
    capture: captureAndProcessUTMs,
    get: getProcessedUTMs,
    preserve: preserveUTMsInRedirect,
    log: log
  };
  
  // Executar novamente quando DOM estiver pronto (fallback)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      log('Re-executando captura após DOMContentLoaded');
      captureAndProcessUTMs();
    });
  }
  
  log('Script UTM Tracking carregado e executado');
})(); 