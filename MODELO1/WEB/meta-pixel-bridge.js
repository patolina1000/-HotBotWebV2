/**
 * 🔗 META PIXEL BRIDGE - MODELO1/WEB
 * Bridge entre sistema invisível e Facebook Pixel client-side
 * Para compatibilidade com Meta Pixel Helper na página inicial
 */

(function() {
  'use strict';

  const DEBUG_MODE = window.location.hostname === 'localhost' || 
                     window.location.hostname.includes('dev') || 
                     localStorage.getItem('invisible_debug') === 'true';

  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[META-PIXEL-BRIDGE-MODELO1] ${message}`, data || '');
    }
  }

  class MetaPixelBridgeModelo1 {
    constructor() {
      this.isInitialized = false;
      this.pixelReady = false;
      this.eventQueue = [];
    }

    /**
     * 🔍 VERIFICAR SE FACEBOOK PIXEL ESTÁ DISPONÍVEL
     */
    checkFacebookPixel() {
      let attempts = 0;
      const maxAttempts = 20;

      const checkPixel = () => {
        if (typeof window.fbq !== 'undefined') {
          this.pixelReady = true;
          log('Facebook Pixel detectado e pronto');
          this.processEventQueue();
          return true;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkPixel, 500);
        } else {
          log('Facebook Pixel não encontrado após 10 segundos');
          this.pixelReady = false;
        }
        return false;
      };

      return checkPixel();
    }

    /**
     * 📤 DISPARAR EVENTO FACEBOOK PIXEL CLIENT-SIDE
     * Compatível com Meta Pixel Helper
     */
    firePixelEvent(eventName, eventData = {}) {
      if (!this.pixelReady) {
        log(`Evento ${eventName} adicionado à fila - Pixel não pronto`);
        this.eventQueue.push({ eventName, eventData });
        return;
      }

      try {
        // Gerar eventID único baseado no timestamp
        const eventID = `${eventName.toLowerCase()}_modelo1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const finalEventData = {
          ...eventData,
          eventID: eventID
        };

        log(`Disparando evento ${eventName} client-side:`, {
          eventID: eventID,
          value: finalEventData.value,
          currency: finalEventData.currency
        });

        // Disparar evento via Facebook Pixel
        window.fbq('track', eventName, finalEventData);

        // Salvar no localStorage para evitar duplicação
        sessionStorage.setItem(`pixel_event_${eventName}_modelo1_sent`, eventID);

        log(`✅ Evento ${eventName} disparado com sucesso - Detectável pelo Meta Pixel Helper`);

        return eventID;

      } catch (error) {
        console.error(`❌ Erro ao disparar evento ${eventName}:`, error);
        return null;
      }
    }

    /**
     * 🔄 PROCESSAR FILA DE EVENTOS
     */
    processEventQueue() {
      if (this.eventQueue.length === 0) return;

      log(`Processando ${this.eventQueue.length} eventos da fila`);

      while (this.eventQueue.length > 0) {
        const { eventName, eventData } = this.eventQueue.shift();
        this.firePixelEvent(eventName, eventData);
      }
    }

    /**
     * 👁️ DISPARAR VIEW_CONTENT
     * Quando página inicial carrega
     */
    fireViewContent() {
      // Verificar se já foi enviado nesta sessão
      if (sessionStorage.getItem('pixel_event_ViewContent_modelo1_sent')) {
        log('ViewContent já enviado nesta sessão - evitando duplicação');
        return;
      }

      // Capturar UTMs da URL
      const urlParams = new URLSearchParams(window.location.search);
      
      const eventData = {
        content_name: document.title || 'Landing Page',
        content_category: 'Landing',
        content_type: 'website',
        value: 0,
        currency: 'BRL'
      };

      // Adicionar UTMs se disponíveis
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
        const value = urlParams.get(param);
        if (value) {
          eventData[param] = value;
        }
      });

      const eventID = this.firePixelEvent('ViewContent', eventData);
      
      if (eventID) {
        log('ViewContent client-side disparado - Visível no Meta Pixel Helper');
      }
    }

    /**
     * 🎯 DISPARAR LEAD
     * Quando usuário interage significativamente com a página
     */
    fireLead() {
      // Verificar se já foi enviado nesta sessão
      if (sessionStorage.getItem('pixel_event_Lead_modelo1_sent')) {
        log('Lead já enviado nesta sessão - evitando duplicação');
        return;
      }

      // Capturar UTMs da URL
      const urlParams = new URLSearchParams(window.location.search);
      
      const eventData = {
        content_name: 'Landing Page Interaction',
        content_category: 'Lead Generation',
        value: 0,
        currency: 'BRL'
      };

      // Adicionar UTMs se disponíveis
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
        const value = urlParams.get(param);
        if (value) {
          eventData[param] = value;
        }
      });

      const eventID = this.firePixelEvent('Lead', eventData);
      
      if (eventID) {
        log('Lead client-side disparado - Visível no Meta Pixel Helper');
      }

      return eventID;
    }

    /**
     * 🔗 CONFIGURAR EVENTOS DE INTERAÇÃO
     * Detecta interações significativas para disparar Lead
     */
    setupInteractionTracking() {
      let interactionScore = 0;
      let leadFired = false;

      // Scroll tracking
      let maxScroll = 0;
      window.addEventListener('scroll', () => {
        const scrollPercent = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
        if (scrollPercent > maxScroll) {
          maxScroll = scrollPercent;
          
          // Lead quando usuário rola 50% da página
          if (scrollPercent > 0.5 && !leadFired) {
            interactionScore += 2;
            log('Usuário rolou 50% da página - pontuação de interação: ' + interactionScore);
          }
        }
      });

      // Click tracking
      document.addEventListener('click', (event) => {
        interactionScore += 1;
        log('Click detectado - pontuação de interação: ' + interactionScore);
      });

      // Time on page tracking
      setTimeout(() => {
        interactionScore += 2;
        log('Usuário permaneceu 30 segundos na página - pontuação de interação: ' + interactionScore);
      }, 30000);

      // Verificar score a cada 10 segundos
      setInterval(() => {
        if (interactionScore >= 3 && !leadFired) {
          leadFired = true;
          this.fireLead();
        }
      }, 10000);
    }

    /**
     * 🔗 INTERCEPTAR LINKS PARA CHECKOUT
     * Adiciona eventos quando usuário vai para checkout
     */
    interceptCheckoutLinks() {
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
          link.addEventListener('click', () => {
            log('Link para checkout clicado - disparando Lead se ainda não foi enviado');
            
            // Disparar Lead se ainda não foi disparado
            if (!sessionStorage.getItem('pixel_event_Lead_modelo1_sent')) {
              this.fireLead();
            }
          });
        });
      });

      log(`Interceptação configurada para ${document.querySelectorAll(checkoutSelectors.join(', ')).length} links de checkout`);
    }

    /**
     * 🚀 INICIALIZAR BRIDGE
     */
    async initialize() {
      if (this.isInitialized) {
        log('Bridge já inicializado');
        return;
      }

      try {
        log('Inicializando Meta Pixel Bridge para MODELO1...');

        // Verificar Facebook Pixel
        this.checkFacebookPixel();

        // Disparar ViewContent após delay
        setTimeout(() => {
          this.fireViewContent();
        }, 3000);

        // Configurar tracking de interação
        this.setupInteractionTracking();

        // Interceptar links para checkout
        this.interceptCheckoutLinks();

        this.isInitialized = true;
        log('Meta Pixel Bridge MODELO1 inicializado com sucesso');

      } catch (error) {
        console.error('❌ Erro ao inicializar Meta Pixel Bridge MODELO1:', error);
        this.isInitialized = true;
      }
    }
  }

  // Instância global
  window.MetaPixelBridgeModelo1 = new MetaPixelBridgeModelo1();

  /**
   * 🔍 UTILITÁRIOS DE DEBUG
   */
  if (DEBUG_MODE) {
    window.MetaPixelBridgeDebug = {
      ...window.MetaPixelBridgeDebug,
      fireViewContentModelo1: () => window.MetaPixelBridgeModelo1.fireViewContent(),
      fireLeadModelo1: () => window.MetaPixelBridgeModelo1.fireLead(),
      checkPixelStatusModelo1: () => ({
        pixelReady: window.MetaPixelBridgeModelo1.pixelReady,
        queueLength: window.MetaPixelBridgeModelo1.eventQueue.length,
        isInitialized: window.MetaPixelBridgeModelo1.isInitialized
      })
    };

    console.log('🔍 Debug mode ativo. Use window.MetaPixelBridgeDebug para utilitários MODELO1.');
  }

  /**
   * 🎬 INICIAR QUANDO DOM ESTIVER PRONTO
   */
  function initializeWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.MetaPixelBridgeModelo1.initialize(), 2000);
      });
    } else {
      // DOM já está pronto
      setTimeout(() => window.MetaPixelBridgeModelo1.initialize(), 2000);
    }
  }

  initializeWhenReady();

})();
