/**
 * 🔗 META PIXEL BRIDGE - EVENTOS CLIENT-SIDE DETECTÁVEIS
 * Bridge entre sistema invisível e Facebook Pixel client-side
 * Para compatibilidade com Meta Pixel Helper
 */

(function() {
  'use strict';

  const DEBUG_MODE = window.location.hostname === 'localhost' || 
                     window.location.hostname.includes('dev') || 
                     localStorage.getItem('invisible_debug') === 'true';

  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[META-PIXEL-BRIDGE] ${message}`, data || '');
    }
  }

  class MetaPixelBridge {
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
        const eventID = `${eventName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
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
        sessionStorage.setItem(`pixel_event_${eventName}_sent`, eventID);

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
     * Quando página carrega
     */
    fireViewContent() {
      // Verificar se já foi enviado nesta sessão
      if (sessionStorage.getItem('pixel_event_ViewContent_sent')) {
        log('ViewContent já enviado nesta sessão - evitando duplicação');
        return;
      }

      const trackingData = window.InvisibleTracking?.getTrackingData();
      
      const eventData = {
        content_name: document.title || 'Privacy Page',
        content_category: 'Privacy',
        content_type: 'website',
        value: 0,
        currency: 'BRL'
      };

      // Adicionar UTMs se disponíveis
      if (trackingData) {
        if (trackingData.utm_source) eventData.utm_source = trackingData.utm_source;
        if (trackingData.utm_campaign) eventData.utm_campaign = trackingData.utm_campaign;
      }

      const eventID = this.firePixelEvent('ViewContent', eventData);
      
      if (eventID) {
        log('ViewContent client-side disparado - Visível no Meta Pixel Helper');
      }
    }

    /**
     * 🛒 DISPARAR ADD_TO_CART
     * Quando PIX é gerado (não no carregamento da página)
     */
    fireAddToCart(value = 19.90) {
      // Verificar se já foi enviado nesta sessão
      if (sessionStorage.getItem('pixel_event_AddToCart_sent')) {
        log('AddToCart já enviado nesta sessão - evitando duplicação');
        return;
      }

      const trackingData = window.InvisibleTracking?.getTrackingData();
      
      const eventData = {
        content_name: 'Privacy Subscription',
        content_category: 'Subscription',
        content_type: 'product',
        value: parseFloat(value),
        currency: 'BRL',
        content_ids: ['privacy_subscription'],
        contents: [{
          id: 'privacy_subscription',
          quantity: 1
        }]
      };

      // Adicionar UTMs se disponíveis
      if (trackingData) {
        if (trackingData.utm_source) eventData.utm_source = trackingData.utm_source;
        if (trackingData.utm_campaign) eventData.utm_campaign = trackingData.utm_campaign;
      }

      const eventID = this.firePixelEvent('AddToCart', eventData);
      
      if (eventID) {
        log('AddToCart client-side disparado - Visível no Meta Pixel Helper');
      }

      return eventID;
    }

    /**
     * 💰 DISPARAR PURCHASE
     * Quando pagamento é confirmado
     */
    firePurchase(value, transactionId = null) {
      const trackingData = window.InvisibleTracking?.getTrackingData();
      
      const eventData = {
        content_name: 'Privacy Subscription',
        content_category: 'Subscription',
        content_type: 'purchase',
        value: parseFloat(value),
        currency: 'BRL',
        content_ids: ['privacy_subscription'],
        contents: [{
          id: 'privacy_subscription',
          quantity: 1
        }]
      };

      // Usar transaction_id como eventID para deduplicação
      if (transactionId) {
        eventData.eventID = transactionId;
      }

      // Adicionar UTMs se disponíveis
      if (trackingData) {
        if (trackingData.utm_source) eventData.utm_source = trackingData.utm_source;
        if (trackingData.utm_campaign) eventData.utm_campaign = trackingData.utm_campaign;
      }

      const eventID = this.firePixelEvent('Purchase', eventData);
      
      if (eventID) {
        log('Purchase client-side disparado - Visível no Meta Pixel Helper');
      }

      return eventID;
    }

    /**
     * 🔗 INTEGRAR COM SISTEMA DE PAGAMENTO
     * Intercepta geração de PIX para disparar AddToCart
     */
    integrateWithPaymentSystem() {
      // Interceptar cliques nos botões de assinatura
      const subscriptionButtons = document.querySelectorAll('.btn-subscription, .payment-button, [data-payment]');
      
      subscriptionButtons.forEach(button => {
        button.addEventListener('click', (event) => {
          log('Botão de assinatura clicado - preparando AddToCart');
          
          // Extrair valor do botão se disponível
          const buttonText = button.textContent || button.innerHTML;
          const valueMatch = buttonText.match(/R\$\s*(\d+(?:,\d{2})?)/);
          let value = 19.90; // valor padrão
          
          if (valueMatch) {
            value = parseFloat(valueMatch[1].replace(',', '.'));
          }

          // Disparar AddToCart após pequeno delay para garantir que a ação foi iniciada
          setTimeout(() => {
            this.fireAddToCart(value);
          }, 1000);
        });
      });

      log(`Integração configurada para ${subscriptionButtons.length} botões de assinatura`);
    }

    /**
     * 🔗 INTEGRAR COM SISTEMA INVISÍVEL
     * Conecta com o sistema de tracking invisível existente
     */
    integrateWithInvisibleSystem() {
      // Aguardar sistema invisível estar pronto
      let attempts = 0;
      const maxAttempts = 20;

      const checkInvisibleSystem = () => {
        if (window.InvisibleTracking?.hasTrackingData()) {
          log('Sistema de tracking invisível detectado - integrando');
          
          // Disparar ViewContent automaticamente
          setTimeout(() => {
            this.fireViewContent();
          }, 1000);

          return true;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkInvisibleSystem, 500);
        } else {
          log('Sistema invisível não encontrado - funcionando independentemente');
          
          // Disparar ViewContent mesmo sem sistema invisível
          setTimeout(() => {
            this.fireViewContent();
          }, 1000);
        }
        return false;
      };

      checkInvisibleSystem();
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
        log('Inicializando Meta Pixel Bridge...');

        // Verificar Facebook Pixel
        this.checkFacebookPixel();

        // Integrar com sistema de pagamento
        this.integrateWithPaymentSystem();

        // Integrar com sistema invisível
        this.integrateWithInvisibleSystem();

        this.isInitialized = true;
        log('Meta Pixel Bridge inicializado com sucesso');

      } catch (error) {
        console.error('❌ Erro ao inicializar Meta Pixel Bridge:', error);
        this.isInitialized = true;
      }
    }
  }

  // Instância global
  window.MetaPixelBridge = new MetaPixelBridge();

  /**
   * 🔍 UTILITÁRIOS DE DEBUG
   */
  if (DEBUG_MODE) {
    window.MetaPixelBridgeDebug = {
      fireViewContent: () => window.MetaPixelBridge.fireViewContent(),
      fireAddToCart: (value) => window.MetaPixelBridge.fireAddToCart(value),
      firePurchase: (value, transactionId) => window.MetaPixelBridge.firePurchase(value, transactionId),
      checkPixelStatus: () => ({
        pixelReady: window.MetaPixelBridge.pixelReady,
        queueLength: window.MetaPixelBridge.eventQueue.length,
        isInitialized: window.MetaPixelBridge.isInitialized
      })
    };

    console.log('🔍 Debug mode ativo. Use window.MetaPixelBridgeDebug para utilitários.');
  }

  /**
   * 🎬 INICIAR QUANDO DOM ESTIVER PRONTO
   */
  function initializeWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.MetaPixelBridge.initialize(), 2000);
      });
    } else {
      // DOM já está pronto
      setTimeout(() => window.MetaPixelBridge.initialize(), 2000);
    }
  }

  initializeWhenReady();

})();
