/**
 * Kwai Event Tracker - Frontend
 * Sistema completo de tracking para eventos Kwai seguindo a documentação oficial
 * 
 * Funcionalidades:
 * - Captura e propagação de click_id
 * - Eventos: view_content, add_to_cart, purchase
 * - Integração com localStorage e cookies
 * - Logs detalhados para debugging
 */

(function() {
  'use strict';

  // Configuração global do Kwai Tracker
  const KwaiTracker = {
    // Configurações
    config: {
      apiEndpoint: '/api/kwai-event',
      storagePrefix: 'kwai_',
      debug: true, // Ativar logs detalhados
      autoTrackPageView: true
    },

    // Estado interno
    initialized: false,
    clickId: null,
    sessionData: {},

    /**
     * Inicializa o Kwai Tracker
     */
    init() {
      if (this.initialized) {
        console.log('🎯 [KWAI-TRACKER] Já inicializado');
        return;
      }

      console.log('🎯 [KWAI-TRACKER] Inicializando...');
      
      // Capturar click_id da URL
      this.captureClickIdFromUrl();
      
      // Tentar recuperar click_id armazenado
      this.loadStoredClickId();
      
      // Auto-track page view se habilitado
      if (this.config.autoTrackPageView) {
        this.trackPageView();
      }
      
      // Configurar listeners
      this.setupEventListeners();
      
      this.initialized = true;
      console.log('🎯 [KWAI-TRACKER] Inicializado com sucesso', {
        clickId: this.clickId ? this.clickId.substring(0, 20) + '...' : 'não encontrado',
        url: window.location.href
      });
    },

    /**
     * Captura click_id da URL atual
     */
    captureClickIdFromUrl() {
      const urlParams = new URLSearchParams(window.location.search);
      const clickIdFromUrl = urlParams.get('click_id');
      
      if (clickIdFromUrl) {
        this.setClickId(clickIdFromUrl);
        console.log('🎯 [KWAI-TRACKER] Click ID capturado da URL:', clickIdFromUrl.substring(0, 20) + '...');
        
        // Limpar URL para não expor o click_id
        if (window.history && window.history.replaceState) {
          urlParams.delete('click_id');
          const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
          window.history.replaceState({}, document.title, newUrl);
        }
      }
    },

    /**
     * Carrega click_id armazenado do localStorage/cookie
     */
    loadStoredClickId() {
      if (this.clickId) return; // Já temos click_id da URL
      
      // Tentar localStorage primeiro
      const storedClickId = localStorage.getItem(this.config.storagePrefix + 'click_id');
      if (storedClickId) {
        this.clickId = storedClickId;
        console.log('🎯 [KWAI-TRACKER] Click ID recuperado do localStorage');
        return;
      }
      
      // Tentar cookie como fallback
      const cookieClickId = this.getCookie('kwai_click_id');
      if (cookieClickId) {
        this.clickId = cookieClickId;
        console.log('🎯 [KWAI-TRACKER] Click ID recuperado do cookie');
      }
    },

    /**
     * Define e armazena o click_id
     * @param {string} clickId - Click ID do Kwai
     */
    setClickId(clickId) {
      if (!clickId) return;
      
      this.clickId = clickId;
      
      // Armazenar em localStorage (persistente)
      localStorage.setItem(this.config.storagePrefix + 'click_id', clickId);
      
      // Armazenar em cookie como backup (30 dias)
      this.setCookie('kwai_click_id', clickId, 30);
      
      // Armazenar em sessionStorage
      sessionStorage.setItem(this.config.storagePrefix + 'click_id', clickId);
      
      console.log('🎯 [KWAI-TRACKER] Click ID armazenado em localStorage, cookie e sessionStorage');
    },

    /**
     * Obtém o click_id atual
     * @returns {string|null} Click ID ou null se não encontrado
     */
    getClickId() {
      return this.clickId;
    },

    /**
     * Configura listeners para eventos automáticos
     */
    setupEventListeners() {
      // Listener para cliques em botões de checkout/PIX
      document.addEventListener('click', (event) => {
        this.handleButtonClick(event);
      });

      // Listener para submissão de formulários
      document.addEventListener('submit', (event) => {
        this.handleFormSubmit(event);
      });

      // Listener para mudanças de página (SPA)
      if (window.history && window.history.pushState) {
        const originalPushState = window.history.pushState;
        window.history.pushState = (...args) => {
          originalPushState.apply(window.history, args);
          setTimeout(() => this.trackPageView(), 100);
        };
      }
    },

    /**
     * Manipula cliques em botões
     * @param {Event} event - Evento de clique
     */
    handleButtonClick(event) {
      const target = event.target;
      const targetText = target.textContent ? target.textContent.toLowerCase() : '';
      const targetClass = target.className ? target.className.toLowerCase() : '';
      const targetId = target.id ? target.id.toLowerCase() : '';
      
      // Detectar cliques em botões de PIX/checkout
      const checkoutIndicators = ['pix', 'gerar', 'pagar', 'finalizar', 'checkout', 'comprar'];
      const isCheckoutButton = checkoutIndicators.some(indicator => 
        targetText.includes(indicator) || 
        targetClass.includes(indicator) || 
        targetId.includes(indicator)
      );
      
      if (isCheckoutButton) {
        console.log('🎯 [KWAI-TRACKER] Botão de checkout detectado:', target);
        this.trackAddToCart();
      }
    },

    /**
     * Manipula submissão de formulários
     * @param {Event} event - Evento de submit
     */
    handleFormSubmit(event) {
      console.log('🎯 [KWAI-TRACKER] Formulário submetido');
      // Aqui pode adicionar lógica específica para formulários se necessário
    },

    /**
     * Rastreia visualização de página (view_content)
     * @param {Object} customData - Dados customizados (opcional)
     */
    trackPageView(customData = {}) {
      if (!this.clickId) {
        console.warn('🎯 [KWAI-TRACKER] Não é possível rastrear PageView - click_id não encontrado');
        return;
      }

      // Detectar tipo de página e dados relevantes
      const pageData = this.detectPageData();
      
      const eventData = {
        content_id: customData.content_id || pageData.content_id || this.generateContentId(),
        content_name: customData.content_name || pageData.content_name || document.title,
        content_type: 'product',
        content_category: customData.content_category || pageData.content_category || 'checkout',
        ...customData
      };

      // Adicionar valor se detectado
      if (pageData.value) {
        eventData.value = pageData.value;
        eventData.currency = 'BRL';
      }

      console.log('🎯 [KWAI-TRACKER] Tracking PageView:', eventData);
      this.sendEvent('EVENT_CONTENT_VIEW', eventData);
    },

    /**
     * Rastreia adição ao carrinho (add_to_cart)
     * @param {Object} customData - Dados customizados (opcional)
     */
    trackAddToCart(customData = {}) {
      if (!this.clickId) {
        console.warn('🎯 [KWAI-TRACKER] Não é possível rastrear AddToCart - click_id não encontrado');
        return;
      }

      const pageData = this.detectPageData();
      
      const eventData = {
        content_id: customData.content_id || pageData.content_id || this.generateContentId(),
        content_name: customData.content_name || pageData.content_name || 'Plano Privacy',
        content_type: 'product',
        currency: 'BRL',
        value: customData.value || pageData.value || this.detectPlanValue(),
        quantity: customData.quantity || 1,
        ...customData
      };

      console.log('🎯 [KWAI-TRACKER] Tracking AddToCart:', eventData);
      this.sendEvent('EVENT_ADD_TO_CART', eventData);
    },

    /**
     * Rastreia compra finalizada (purchase)
     * @param {Object} customData - Dados customizados (opcional)
     */
    trackPurchase(customData = {}) {
      if (!this.clickId) {
        console.warn('🎯 [KWAI-TRACKER] Não é possível rastrear Purchase - click_id não encontrado');
        return;
      }

      const pageData = this.detectPageData();
      
      const eventData = {
        content_id: customData.content_id || pageData.content_id || this.generateContentId(),
        content_name: customData.content_name || pageData.content_name || 'Plano Privacy',
        content_type: 'product',
        currency: 'BRL',
        value: customData.value || pageData.value || this.detectPlanValue(),
        quantity: customData.quantity || 1,
        ...customData
      };

      console.log('🎯 [KWAI-TRACKER] Tracking Purchase:', eventData);
      this.sendEvent('EVENT_PURCHASE', eventData);
    },

    /**
     * Detecta dados da página atual
     * @returns {Object} Dados detectados da página
     */
    detectPageData() {
      const data = {
        content_id: null,
        content_name: null,
        content_category: null,
        value: null
      };

      // Detectar ID do conteúdo de atributos data-*
      const contentElement = document.querySelector('[data-content-id], [data-product-id], [data-plan-id]');
      if (contentElement) {
        data.content_id = contentElement.getAttribute('data-content-id') || 
                         contentElement.getAttribute('data-product-id') || 
                         contentElement.getAttribute('data-plan-id');
      }

      // Detectar nome do conteúdo
      const titleElement = document.querySelector('h1, .plan-title, .product-title, [data-plan-name]');
      if (titleElement) {
        data.content_name = titleElement.textContent.trim() || titleElement.getAttribute('data-plan-name');
      }

      // Detectar valor
      data.value = this.detectPlanValue();

      // Detectar categoria baseada na URL
      const path = window.location.pathname.toLowerCase();
      if (path.includes('checkout') || path.includes('finalizar')) {
        data.content_category = 'checkout';
      } else if (path.includes('plano') || path.includes('produto')) {
        data.content_category = 'product';
      } else if (path.includes('obrigado') || path.includes('sucesso')) {
        data.content_category = 'success';
      }

      return data;
    },

    /**
     * Detecta valor do plano/produto da página
     * @returns {number|null} Valor detectado ou null
     */
    detectPlanValue() {
      // Seletores para encontrar preços
      const priceSelectors = [
        '[data-price]',
        '[data-value]',
        '.price',
        '.valor',
        '.plan-price',
        '.amount',
        '.total',
        '.preco'
      ];

      for (const selector of priceSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const value = element.getAttribute('data-price') || 
                       element.getAttribute('data-value') || 
                       element.textContent || 
                       element.value;
          
          if (value) {
            const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
            if (!isNaN(numericValue) && numericValue > 0) {
              return numericValue;
            }
          }
        }
      }

      // Valores padrão conhecidos do sistema
      const defaultValues = [19.90, 41.90, 59.90, 67, 97, 147];
      
      // Tentar detectar da URL ou outros indicadores
      const urlParams = new URLSearchParams(window.location.search);
      const planParam = urlParams.get('plano') || urlParams.get('plan') || urlParams.get('value');
      if (planParam) {
        const planValue = parseFloat(planParam);
        if (!isNaN(planValue) && planValue > 0) {
          return planValue;
        }
      }

      return null;
    },

    /**
     * Gera um ID de conteúdo único
     * @returns {string} ID gerado
     */
    generateContentId() {
      const timestamp = Date.now();
      const path = window.location.pathname.replace(/[^a-zA-Z0-9]/g, '_');
      return `page_${path}_${timestamp}`;
    },

    /**
     * Envia evento para o backend
     * @param {string} eventName - Nome do evento
     * @param {Object} properties - Propriedades do evento
     */
    async sendEvent(eventName, properties) {
      if (!this.clickId) {
        console.error('🎯 [KWAI-TRACKER] Não é possível enviar evento - click_id não encontrado');
        return;
      }

      const payload = {
        eventName,
        clickid: this.clickId,
        properties
      };

      try {
        console.log(`🎯 [KWAI-TRACKER] Enviando ${eventName}:`, {
          clickid: this.clickId.substring(0, 20) + '...',
          properties
        });

        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ [KWAI-TRACKER] ${eventName} enviado com sucesso:`, result);
        } else {
          console.error(`❌ [KWAI-TRACKER] Erro ao enviar ${eventName}:`, response.statusText);
        }
      } catch (error) {
        console.error(`❌ [KWAI-TRACKER] Erro na requisição ${eventName}:`, error);
      }
    },

    /**
     * Utilitários para cookies
     */
    setCookie(name, value, days) {
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    },

    getCookie(name) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    },

    /**
     * API pública para uso externo
     */
    api: {
      // Rastrear eventos manualmente
      trackPageView: (data) => KwaiTracker.trackPageView(data),
      trackAddToCart: (data) => KwaiTracker.trackAddToCart(data),
      trackPurchase: (data) => KwaiTracker.trackPurchase(data),
      
      // Gerenciar click_id
      setClickId: (clickId) => KwaiTracker.setClickId(clickId),
      getClickId: () => KwaiTracker.getClickId(),
      
      // Estado do tracker
      isInitialized: () => KwaiTracker.initialized,
      hasClickId: () => !!KwaiTracker.clickId
    }
  };

  // Auto-inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      KwaiTracker.init();
    });
  } else {
    KwaiTracker.init();
  }

  // Expor API globalmente
  window.KwaiTracker = KwaiTracker.api;
  
  // Compatibilidade com sistemas existentes
  window.sendKwaiEvent = (eventName, clickid, properties) => {
    if (clickid) KwaiTracker.setClickId(clickid);
    return KwaiTracker.sendEvent(eventName, properties);
  };

  console.log('🎯 [KWAI-TRACKER] Script carregado - API disponível em window.KwaiTracker');

})();
