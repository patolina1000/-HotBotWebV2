/**
 * 🔐 SISTEMA DE TRACKING INVISÍVEL - CAPTURA
 * Captura dados de tracking na entrada e gera token JWT seguro
 * Implementação totalmente invisível - nenhum dado sensível no client
 */

(function() {
  'use strict';

  const DEBUG_MODE = window.location.hostname === 'localhost' || 
                     window.location.hostname.includes('dev') || 
                     localStorage.getItem('invisible_debug') === 'true';

  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[INVISIBLE-TRACKING] ${message}`, data || '');
    }
  }

  /**
   * 🎯 CAPTURAR UTMs DA URL
   * Extrai todos os parâmetros UTM da URL atual
   */
  function captureUTMsFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const utms = {};

    // Capturar todos os UTMs
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        utms[param] = value;
      }
    });

    log('UTMs capturados da URL:', utms);
    return utms;
  }

  /**
   * 🍪 CAPTURAR COOKIES FACEBOOK
   * Lê cookies _fbp e _fbc (apenas para envio ao backend)
   */
  function captureFacebookCookies() {
    function getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        return parts.pop().split(';').shift();
      }
      return null;
    }

    const fbp = getCookie('_fbp');
    const fbc = getCookie('_fbc');

    log('Cookies Facebook detectados:', {
      has_fbp: !!fbp,
      has_fbc: !!fbc,
      fbp_preview: fbp ? fbp.substring(0, 20) + '...' : null
    });

    return { fbp, fbc };
  }

  /**
   * 🔐 GERAR TRACKING TOKEN
   * Envia dados para backend e recebe token JWT assinado
   */
  async function generateTrackingToken() {
    try {
      log('Iniciando geração de tracking token...');

      // Capturar dados locais
      const utms = captureUTMsFromURL();
      const cookies = captureFacebookCookies();

      // Verificar se há dados para tracking
      const hasTrackingData = Object.keys(utms).length > 0 || cookies.fbp || cookies.fbc;
      
      if (!hasTrackingData) {
        log('Nenhum dado de tracking detectado - token não será gerado');
        return { success: false, reason: 'Sem dados de tracking' };
      }

      // Construir query string com UTMs
      const queryParams = new URLSearchParams(utms);

      // Fazer requisição para backend (cookies são enviados automaticamente)
      const response = await fetch(`/api/tracking-context?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include' // Incluir cookies automaticamente
      });

      const result = await response.json();

      if (result.success) {
        log('Tracking token gerado com sucesso:', {
          has_token: !!result.token,
          metadata: result.metadata
        });

        // Armazenar token em sessionStorage (seguro)
        sessionStorage.setItem('invisible_tracking_token', result.token);
        sessionStorage.setItem('invisible_tracking_metadata', JSON.stringify(result.metadata));

        return {
          success: true,
          token: result.token,
          metadata: result.metadata
        };
      } else {
        console.error('❌ Erro ao gerar tracking token:', result.error);
        return { success: false, error: result.error };
      }

    } catch (error) {
      console.error('❌ Erro na requisição de tracking token:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🔗 INTERCEPTAR REDIRECIONAMENTOS
   * Adiciona token aos links que levam ao checkout
   */
  function interceptCheckoutLinks() {
    // Selectors para links de checkout
    const checkoutSelectors = [
      'a[href*="privacy"]',
      'a[href*="checkout"]',
      '.checkout-button',
      '.buy-button',
      '.payment-button',
      '[data-checkout]'
    ];

    checkoutSelectors.forEach(selector => {
      const links = document.querySelectorAll(selector);
      
      links.forEach(link => {
        link.addEventListener('click', function(event) {
          const token = sessionStorage.getItem('invisible_tracking_token');
          
          if (token) {
            // Adicionar token à URL
            const currentHref = this.href;
            const separator = currentHref.includes('?') ? '&' : '?';
            const newHref = `${currentHref}${separator}tt=${encodeURIComponent(token)}`;
            
            this.href = newHref;
            
            log('Token adicionado ao link de checkout:', {
              original: currentHref,
              modified: newHref.substring(0, 100) + '...'
            });
          } else {
            log('Nenhum token disponível para adicionar ao checkout');
          }
        });
      });
    });

    log(`Interceptação configurada para ${document.querySelectorAll(checkoutSelectors.join(', ')).length} links`);
  }

  /**
   * 🚀 INICIALIZAR SISTEMA
   * Configura tracking invisível quando página carrega
   */
  async function initializeInvisibleTracking() {
    try {
      log('Inicializando sistema de tracking invisível...');

      // Aguardar Facebook Pixel carregar (se disponível)
      let fbPixelReady = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!fbPixelReady && attempts < maxAttempts) {
        if (typeof window.fbq !== 'undefined') {
          fbPixelReady = true;
          log('Facebook Pixel detectado');
        } else {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
      }

      if (!fbPixelReady) {
        log('Facebook Pixel não detectado - continuando sem cookies FB');
      }

      // Aguardar um pouco mais para cookies serem definidos
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Gerar tracking token
      const tokenResult = await generateTrackingToken();

      if (tokenResult.success) {
        // Configurar interceptação de links
        interceptCheckoutLinks();

        // Reconfigurar interceptação quando DOM muda
        const observer = new MutationObserver(() => {
          interceptCheckoutLinks();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        log('Sistema de tracking invisível inicializado com sucesso');
      } else {
        log('Sistema inicializado sem token:', tokenResult.reason || tokenResult.error);
      }

    } catch (error) {
      console.error('❌ Erro ao inicializar tracking invisível:', error);
    }
  }

  /**
   * 🔍 UTILITÁRIOS DE DEBUG
   */
  if (DEBUG_MODE) {
    window.InvisibleTrackingDebug = {
      getToken: () => sessionStorage.getItem('invisible_tracking_token'),
      getMetadata: () => JSON.parse(sessionStorage.getItem('invisible_tracking_metadata') || '{}'),
      regenerateToken: () => generateTrackingToken(),
      clearToken: () => {
        sessionStorage.removeItem('invisible_tracking_token');
        sessionStorage.removeItem('invisible_tracking_metadata');
      }
    };

    console.log('🔍 Debug mode ativo. Use window.InvisibleTrackingDebug para utilitários.');
  }

  /**
   * 🎬 INICIAR QUANDO DOM ESTIVER PRONTO
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeInvisibleTracking);
  } else {
    // DOM já está pronto
    initializeInvisibleTracking();
  }

})();
