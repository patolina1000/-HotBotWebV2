/**
 * Sistema Completo de Rastreamento Web
 * UTMs + Facebook Pixel + Facebook CAPI + UTIMIFY
 * 
 * Compatível com memória do sistema [[memory:8176014]]
 */

(function() {
  'use strict';

  // 🔧 CONFIGURAÇÕES E ESTADO GLOBAL
  const DEBUG = window.location.hostname === 'localhost' || window.location.hostname.includes('dev');
  const isPrivacyRoute = window.location.pathname.includes('/privacy');
  const isTrackingEnabled = isPrivacyRoute; // Só ativa na Rota 2 (Privacy)
  
  let trackingData = {};
  let pixelInitialized = false;
  let currentPlan = null;

  // Estado dos eventos
  const eventState = {
    pageViewSent: false,
    viewContentSent: false,
    initiateCheckoutSent: false
  };

  // 📝 LOGGING CENTRALIZADO
  function log(category, message, data = null) {
    if (DEBUG) {
      const prefix = `[${category.toUpperCase()}]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  function logStatus() {
    log('STATUS', `Tracking ${isTrackingEnabled ? 'ATIVO' : 'DESATIVADO'} - Rota: ${isPrivacyRoute ? 'Privacy' : 'Telegram'}`);
  }

  // 🎯 FACEBOOK PIXEL - EVENTOS CLIENT-SIDE
  const FacebookPixel = {
    async init() {
      if (!isTrackingEnabled) {
        log('PIXEL', 'Facebook Pixel desativado - rota Telegram ativa');
        return;
      }

      try {
        // Aguardar configurações do servidor
        const config = await this.loadConfig();
        if (!config.FB_PIXEL_ID) {
          log('PIXEL', 'FB_PIXEL_ID não encontrado');
          return;
        }

        window.__env = window.__env || { FB_PIXEL_ID: '', loaded: false };
        window.__env.FB_PIXEL_ID = config.FB_PIXEL_ID;
        window.__env.loaded = true;
        
        // Inicializar Facebook Pixel se ainda não foi
        if (typeof fbq === 'undefined') {
          await this.loadPixelScript();
        }

        // Configurar pixel
        fbq.disablePushState = true;
        fbq('init', config.FB_PIXEL_ID);
        
        pixelInitialized = true;
        log('PIXEL', 'Facebook Pixel inicializado com sucesso', { pixelId: config.FB_PIXEL_ID });

        // Disparar PageView imediatamente
        this.trackPageView();

      } catch (error) {
        log('PIXEL', 'Erro ao inicializar Facebook Pixel:', error);
      }
    },

    async loadConfig() {
      const response = await fetch('/api/config');
      return await response.json();
    },

    loadPixelScript() {
      return new Promise((resolve) => {
        !function(f,b,e,v,n,t,s){
          if(f.fbq)return;n=f.fbq=function(){
            n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s);
          t.onload = resolve;
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      });
    },

    trackPageView() {
      if (!pixelInitialized || eventState.pageViewSent) return;
      
      const eventData = {
        eventID: this.generateEventId('PageView')
      };
      
      fbq('track', 'PageView', eventData);
      eventState.pageViewSent = true;
      
      log('PIXEL', 'PageView enviado', eventData);
      
      // Enviar para CAPI também
      FacebookCAPI.sendEvent('PageView', eventData);
    },

    trackViewContent() {
      if (!pixelInitialized || eventState.viewContentSent) return;

      const eventData = {
        eventID: this.generateEventId('ViewContent'),
        content_name: document.title || 'Página Privacy',
        content_category: 'Privacy'
      };
      
      fbq('track', 'ViewContent', eventData);
      eventState.viewContentSent = true;
      
      log('PIXEL', 'ViewContent enviado', eventData);
      
      // Enviar para CAPI também
      FacebookCAPI.sendEvent('ViewContent', eventData);
    },

    trackInitiateCheckout() {
      if (!pixelInitialized) return;

      const eventData = {
        eventID: this.generateEventId('InitiateCheckout')
      };
      
      if (currentPlan && currentPlan.valor) {
        eventData.value = currentPlan.valor;
        eventData.currency = 'BRL';
      }
      
      // Evento Facebook Pixel removido conforme solicitado
      eventState.initiateCheckoutSent = true;
      
      log('PIXEL', 'InitiateCheckout removido - evento não disparado', eventData);
      
      // Enviar para CAPI também
      FacebookCAPI.sendEvent('InitiateCheckout', eventData);
    },

    trackPurchase(value) {
      if (!pixelInitialized) return;

      const eventData = {
        eventID: this.generateEventId('Purchase'),
        value: value,
        currency: 'BRL'
      };
      
      fbq('track', 'Purchase', eventData);
      
      log('PIXEL', 'Purchase enviado:', value, eventData);
      
      // Enviar para CAPI também
      FacebookCAPI.sendEvent('Purchase', eventData);
    },

    generateEventId(eventName) {
      return `${eventName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  // 🚀 FACEBOOK CAPI - EVENTOS SERVER-SIDE
  const FacebookCAPI = {
    async sendEvent(eventName, eventData = {}) {
      if (!isTrackingEnabled) return;

      try {
        const payload = {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: window.location.href,
          value: eventData.value || null,
          currency: eventData.currency || 'BRL',
          event_id: eventData.eventID,
          user_data: {
            ip_address: trackingData.ip || null,
            user_agent: navigator.userAgent,
            fbc: trackingData.fbc || null,
            fbp: trackingData.fbp || null
          }
        };

        const response = await fetch('/capi', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          log('CAPI', `${eventName} enviado com sucesso`, payload);
        } else {
          log('CAPI', `Erro ao enviar ${eventName}:`, response.statusText);
        }

      } catch (error) {
        log('CAPI', `Erro CAPI ${eventName}:`, error);
      }
    }
  };

  // 🎯 UTM TRACKING
  const UTMTracking = {
    captureUTMs() {
      const urlParams = new URLSearchParams(window.location.search);
      const utms = {};
      const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      
      let hasNewUTMs = false;
      
      utmKeys.forEach(key => {
        const value = urlParams.get(key);
        if (value) {
          const decoded = decodeURIComponent(value);
          utms[key] = decoded;
          localStorage.setItem(key, decoded);
          hasNewUTMs = true;
          log('UTM', `Capturado ${key}: ${decoded}`);
        } else {
          // Tentar recuperar do localStorage
          const saved = localStorage.getItem(key);
          if (saved) {
            utms[key] = saved;
          }
        }
      });

      if (hasNewUTMs) {
        log('UTM', 'Novos UTMs capturados', utms);
        // Enviar para backend
        this.sendToBackend(utms);
      }

      return utms;
    },

    async sendToBackend(utms) {
      try {
        const response = await fetch('/utm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(utms)
        });

        if (response.ok) {
          log('UTM', 'UTMs enviados para backend com sucesso');
        }
      } catch (error) {
        log('UTM', 'Erro ao enviar UTMs para backend:', error);
      }
    }
  };

  // 💼 UTIMIFY INTEGRATION
  const UTIMIFYTracking = {
    async sendConversion(value) {
      if (!isTrackingEnabled) return;

      try {
        const payload = {
          value: value,
          currency: 'BRL',
          utm_data: trackingData
        };

        const response = await fetch('/utimify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          log('UTIMIFY', 'Conversão enviada com sucesso', payload);
        } else {
          log('UTIMIFY', 'Erro ao enviar conversão:', response.statusText);
        }

      } catch (error) {
        log('UTIMIFY', 'Erro UTIMIFY:', error);
      }
    }
  };

  // 🔍 DADOS DE TRACKING
  const TrackingDataCollector = {
    async gather() {
      const data = {};

      // Capturar UTMs
      const utms = UTMTracking.captureUTMs();
      Object.assign(data, utms);

      // Capturar Facebook cookies
      data.fbp = this.getCookie('_fbp') || localStorage.getItem('fbp') || 'nofbp';
      data.fbc = this.getCookie('_fbc') || localStorage.getItem('fbc') || 'nofbc';

      // Capturar IP (se não estiver em cache)
      if (!localStorage.getItem('client_ip_address')) {
        try {
          const ipResponse = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipResponse.json();
          data.ip = ipData.ip;
          localStorage.setItem('client_ip_address', data.ip);
        } catch (error) {
          log('TRACKING', 'Erro ao obter IP:', error);
        }
      } else {
        data.ip = localStorage.getItem('client_ip_address');
      }

      data.user_agent = navigator.userAgent;

      trackingData = data;
      log('TRACKING', 'Dados coletados', data);
      return data;
    },

    getCookie(name) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }
  };

  // 🎮 API PÚBLICA
  window.TrackingSystem = {
    // Inicializar sistema completo
    async init() {
      logStatus();
      
      if (!isTrackingEnabled) {
        log('INIT', 'Sistema de tracking desativado - Rota Telegram ativa');
        return false;
      }

      log('INIT', 'Inicializando sistema de tracking completo...');

      // 1. Coletar dados de tracking
      await TrackingDataCollector.gather();

      // 2. Inicializar Facebook Pixel
      await FacebookPixel.init();

      // 3. Programar ViewContent após 4 segundos
      setTimeout(() => {
        FacebookPixel.trackViewContent();
      }, 4000);

      log('INIT', 'Sistema de tracking inicializado com sucesso');
      return true;
    },

    // Disparar evento de clique no botão PIX
    trackPixButtonClick() {
      if (!isTrackingEnabled) return;
      
      log('EVENT', 'Botão PIX clicado - disparando InitiateCheckout');
      FacebookPixel.trackInitiateCheckout();
    },

    // Disparar evento de compra confirmada
    trackPurchase(value) {
      if (!isTrackingEnabled) return;
      
      log('EVENT', 'Purchase confirmado - valor:', value);
      FacebookPixel.trackPurchase(value);
      UTIMIFYTracking.sendConversion(value);
    },

    // Definir plano atual
    setPlan(plan) {
      currentPlan = plan;
      log('PLAN', 'Plano definido:', plan);
    },

    // Obter dados de tracking atuais
    getTrackingData() {
      return trackingData;
    },

    // Status do sistema
    getStatus() {
      return {
        enabled: isTrackingEnabled,
        route: isPrivacyRoute ? 'Privacy' : 'Telegram',
        pixelInitialized,
        trackingData,
        eventState
      };
    }
  };

  // 🚀 AUTO-INICIALIZAÇÃO
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.TrackingSystem.init();
    });
  } else {
    window.TrackingSystem.init();
  }

  // DEBUG: Overlay de status (opcional)
  if (DEBUG && isTrackingEnabled) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-family: monospace;
      font-size: 12px;
      z-index: 9999;
      max-width: 300px;
    `;
    
    function updateOverlay() {
      const status = window.TrackingSystem.getStatus();
      overlay.innerHTML = `
        <strong>🎯 TRACKING DEBUG</strong><br>
        Status: ${status.enabled ? '✅ ATIVO' : '❌ INATIVO'}<br>
        Rota: ${status.route}<br>
        Pixel: ${status.pixelInitialized ? '✅' : '❌'}<br>
        PageView: ${status.eventState.pageViewSent ? '✅' : '❌'}<br>
        ViewContent: ${status.eventState.viewContentSent ? '✅' : '❌'}<br>
        InitiateCheckout: ${status.eventState.initiateCheckoutSent ? '✅' : '❌'}
      `;
    }
    
    document.body.appendChild(overlay);
    updateOverlay();
    setInterval(updateOverlay, 1000);
  }

})();
