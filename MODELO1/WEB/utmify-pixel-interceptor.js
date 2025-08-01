/**
 * 🎯 INTERCEPTADOR DO PIXEL DA UTMIFY
 * 
 * Este script intercepta e registra todas as requisições feitas pelo Pixel da UTMify
 * para facilitar o debugging e validação do rastreamento.
 * 
 * DEVE SER CARREGADO ANTES do Pixel da UTMify para capturar a primeira requisição.
 */

(function() {
  'use strict';
  
  // Configuração
  const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname.includes('dev');
  const UTMIFY_DOMAINS = ['cdn.utmify.com.br', 'api.utmify.com.br', 'utmify.com.br'];
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  
  // Contador de requisições
  let requestCounter = 0;
  const pageLoadTime = performance.now();
  
  // Logging centralizado
  function log(message, data = null, level = 'info') {
    if (!DEBUG_MODE && level === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const timeSinceLoad = (performance.now() - pageLoadTime).toFixed(2);
    const prefix = `[UTMIFY-INTERCEPTOR] [${timestamp}] [+${timeSinceLoad}ms]`;
    
    switch(level) {
      case 'error':
        console.error(prefix, message, data || '');
        break;
      case 'warn':
        console.warn(prefix, message, data || '');
        break;
      case 'debug':
        console.debug(prefix, message, data || '');
        break;
      default:
        console.log(prefix, message, data || '');
    }
  }
  
  // Função para verificar se é uma requisição da UTMify
  function isUTMifyRequest(url) {
    try {
      const urlObj = new URL(url);
      return UTMIFY_DOMAINS.some(domain => urlObj.hostname.includes(domain));
    } catch (e) {
      return false;
    }
  }
  
  // Função para analisar UTMs no formato nome|id
  function analyzeUTMs(payload) {
    const utmAnalysis = {};
    
    UTM_KEYS.forEach(key => {
      const value = payload[key];
      if (value) {
        const parts = value.split('|');
        if (parts.length === 2) {
          const [name, id] = parts;
          const isValid = name && id && /^\d+$/.test(id.trim());
          
          utmAnalysis[key] = {
            original: value,
            name: name.trim(),
            id: id.trim(),
            isValid: isValid,
            format: 'nome|id'
          };
        } else {
          utmAnalysis[key] = {
            original: value,
            name: value,
            id: null,
            isValid: false,
            format: 'simples'
          };
        }
      }
    });
    
    return utmAnalysis;
  }
  
  // Função para formatar payload para debug
  function formatPayload(payload) {
    try {
      const utmAnalysis = analyzeUTMs(payload);
      const hasValidUTMs = Object.values(utmAnalysis).some(utm => utm.isValid);
      
      return {
        summary: {
          totalUTMs: Object.keys(utmAnalysis).length,
          validUTMs: Object.values(utmAnalysis).filter(utm => utm.isValid).length,
          hasValidFormat: hasValidUTMs
        },
        utms: utmAnalysis,
        fullPayload: payload
      };
    } catch (e) {
      log('Erro ao formatar payload:', e, 'error');
      return { error: e.message, rawPayload: payload };
    }
  }
  
  // Interceptar XMLHttpRequest
  function interceptXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._utmifyInterceptor = {
        method: method,
        url: url,
        timestamp: performance.now()
      };
      return originalOpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
      if (this._utmifyInterceptor && isUTMifyRequest(this._utmifyInterceptor.url)) {
        requestCounter++;
        const requestId = `XHR-${requestCounter}`;
        
        log(`🔍 Interceptando ${requestId}:`, {
          method: this._utmifyInterceptor.method,
          url: this._utmifyInterceptor.url,
          data: data
        });
        
        // Interceptar resposta
        this.addEventListener('load', function() {
          try {
            const responseData = this.responseText;
            log(`✅ ${requestId} - Resposta recebida:`, {
              status: this.status,
              statusText: this.statusText,
              responseLength: responseData.length,
              responsePreview: responseData.substring(0, 200)
            });
          } catch (e) {
            log(`❌ ${requestId} - Erro ao processar resposta:`, e, 'error');
          }
        });
        
        this.addEventListener('error', function() {
          log(`❌ ${requestId} - Erro na requisição:`, {
            status: this.status,
            statusText: this.statusText
          }, 'error');
        });
      }
      
      return originalSend.apply(this, [data]);
    };
  }
  
  // Interceptar Fetch
  function interceptFetch() {
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
      if (isUTMifyRequest(url)) {
        requestCounter++;
        const requestId = `FETCH-${requestCounter}`;
        
        const requestData = {
          url: url,
          method: options.method || 'GET',
          headers: options.headers,
          body: options.body
        };
        
        log(`🔍 Interceptando ${requestId}:`, requestData);
        
        // Tentar parsear body se for JSON
        if (options.body && typeof options.body === 'string') {
          try {
            const parsedBody = JSON.parse(options.body);
            const formattedPayload = formatPayload(parsedBody);
            
            log(`📊 ${requestId} - Análise do Payload:`, formattedPayload);
            
            // Verificar se UTMs estão no formato correto
            if (formattedPayload.summary) {
              if (formattedPayload.summary.hasValidFormat) {
                log(`✅ ${requestId} - UTMs no formato nome|id válido`);
              } else {
                log(`⚠️ ${requestId} - UTMs não estão no formato nome|id esperado`, 'warn');
              }
            }
          } catch (e) {
            log(`❌ ${requestId} - Erro ao parsear body:`, e, 'error');
          }
        }
        
        return originalFetch.apply(this, [url, options]).then(response => {
          log(`✅ ${requestId} - Resposta recebida:`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
          });
          return response;
        }).catch(error => {
          log(`❌ ${requestId} - Erro na requisição:`, error, 'error');
          throw error;
        });
      }
      
      return originalFetch.apply(this, [url, options]);
    };
  }
  
  // Interceptar Beacon API (usado por alguns pixels)
  function interceptBeacon() {
    const originalSendBeacon = navigator.sendBeacon;
    
    navigator.sendBeacon = function(url, data) {
      if (isUTMifyRequest(url)) {
        requestCounter++;
        const requestId = `BEACON-${requestCounter}`;
        
        log(`🔍 Interceptando ${requestId}:`, {
          url: url,
          dataType: typeof data,
          dataLength: data ? data.length : 0
        });
        
        // Tentar parsear dados se for string
        if (data && typeof data === 'string') {
          try {
            const parsedData = JSON.parse(data);
            const formattedPayload = formatPayload(parsedData);
            log(`📊 ${requestId} - Análise do Payload:`, formattedPayload);
          } catch (e) {
            log(`❌ ${requestId} - Erro ao parsear dados:`, e, 'error');
          }
        }
      }
      
      return originalSendBeacon.apply(this, [url, data]);
    };
  }
  
  // Função para monitorar mudanças no DOM (pixels dinâmicos)
  function monitorDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Verificar se é um script da UTMify
            if (node.tagName === 'SCRIPT' && node.src) {
              if (isUTMifyRequest(node.src)) {
                log('🔍 Script da UTMify detectado no DOM:', {
                  src: node.src,
                  async: node.async,
                  defer: node.defer
                });
              }
            }
            
            // Verificar se é uma imagem de tracking
            if (node.tagName === 'IMG' && node.src) {
              if (isUTMifyRequest(node.src)) {
                log('🔍 Imagem de tracking da UTMify detectada:', {
                  src: node.src,
                  alt: node.alt
                });
              }
            }
          }
        });
      });
    });
    
    observer.observe(document, {
      childList: true,
      subtree: true
    });
    
    log('👁️ Monitoramento de mudanças no DOM ativado');
  }
  
  // Função para gerar relatório final
  function generateFinalReport() {
    const timeSinceLoad = (performance.now() - pageLoadTime).toFixed(2);
    
    log('📋 RELATÓRIO FINAL DO INTERCEPTADOR:', {
      totalRequests: requestCounter,
      timeSincePageLoad: `${timeSinceLoad}ms`,
      utmifyDomains: UTMIFY_DOMAINS,
      debugMode: DEBUG_MODE
    });
  }
  
  // Inicializar interceptadores
  function initialize() {
    log('🚀 Inicializando interceptador do Pixel da UTMify');
    
    interceptXHR();
    interceptFetch();
    interceptBeacon();
    monitorDOMChanges();
    
    log('✅ Interceptadores configurados');
    
    // Gerar relatório final quando página estiver completamente carregada
    window.addEventListener('load', () => {
      setTimeout(generateFinalReport, 2000); // Aguardar 2s para capturar requisições tardias
    });
  }
  
  // Expor funções globalmente para debugging manual
  window.UTMifyInterceptor = {
    isUTMifyRequest,
    analyzeUTMs,
    formatPayload,
    getRequestCount: () => requestCounter,
    getPageLoadTime: () => pageLoadTime,
    generateReport: generateFinalReport
  };
  
  // Inicializar imediatamente
  initialize();
  
})(); 