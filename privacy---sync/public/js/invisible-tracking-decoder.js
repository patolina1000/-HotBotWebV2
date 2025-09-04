/**
 * 🔐 SISTEMA DE TRACKING INVISÍVEL - DECODIFICADOR
 * Decodifica token JWT do tracking e dispara eventos invisíveis no checkout
 * Implementação totalmente invisível - nenhum dado sensível no client
 */

(function() {
  'use strict';

  const DEBUG_MODE = window.location.hostname === 'localhost' || 
                     window.location.hostname.includes('dev') || 
                     localStorage.getItem('invisible_debug') === 'true';

  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[INVISIBLE-DECODER] ${message}`, data || '');
    }
  }

  class InvisibleTrackingDecoder {
    constructor() {
      this.trackingData = null;
      this.isInitialized = false;
      this.addToCartSent = false;
    }

    /**
     * 🔓 EXTRAIR TOKEN DA URL
     * Busca parâmetro 'tt' (tracking token) na URL
     */
    extractTokenFromURL() {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('tt');
      
      if (token) {
        log('Token encontrado na URL');
        // Limpar token da URL para segurança
        this.cleanTokenFromURL();
        return token;
      }
      
      // Fallback: tentar sessionStorage
      const sessionToken = sessionStorage.getItem('invisible_tracking_token');
      if (sessionToken) {
        log('Token encontrado no sessionStorage');
        return sessionToken;
      }
      
      return null;
    }

    /**
     * 🧹 LIMPAR TOKEN DA URL
     * Remove token da URL por segurança (sem reload)
     */
    cleanTokenFromURL() {
      const url = new URL(window.location);
      if (url.searchParams.has('tt')) {
        url.searchParams.delete('tt');
        window.history.replaceState({}, document.title, url.toString());
        log('Token removido da URL por segurança');
      }
    }

    /**
     * 🔓 DECODIFICAR TOKEN NO BACKEND
     * Envia token para backend e recebe dados decodificados
     */
    async decodeTrackingToken(token) {
      try {
        log('Decodificando token no backend...');

        const response = await fetch('/api/decode-tracking-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (result.success) {
          log('Token decodificado com sucesso:', {
            has_fbp: !!result.data.fbp,
            has_fbc: !!result.data.fbc,
            utm_source: result.data.utm_source_name,
            utm_campaign: result.data.utm_campaign_name,
            external_id_hash: result.data.external_id_hash?.substring(0, 8) + '...'
          });

          this.trackingData = result.data;
          return { success: true, data: result.data };
        } else {
          console.warn('⚠️ Erro ao decodificar token:', result.error);
          return { success: false, error: result.error };
        }

      } catch (error) {
        console.error('❌ Erro na requisição de decodificação:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * 🎯 DISPARAR ADDTOCART INVISÍVEL
     * Envia evento AddToCart via backend (invisível)
     */
    async triggerInvisibleAddToCart(value = 19.90) {
      if (this.addToCartSent) {
        log('AddToCart já foi enviado - evitando duplicação');
        return { success: true, duplicate: true };
      }

      if (!this.trackingData) {
        log('Nenhum dado de tracking disponível para AddToCart');
        return { success: false, error: 'Sem dados de tracking' };
      }

      try {
        log('Disparando AddToCart invisível...', { value });

        // Gerar token temporário (apenas para esta sessão)
        const sessionToken = this.generateSessionToken();

        const response = await fetch('/api/invisible-addtocart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: sessionToken,
            value: value
          })
        });

        const result = await response.json();

        if (result.success) {
          this.addToCartSent = true;
          log('AddToCart invisível enviado com sucesso:', {
            event_id: result.event_id
          });

          // Salvar no sessionStorage para evitar duplicação
          sessionStorage.setItem('invisible_addtocart_sent', '1');
          sessionStorage.setItem('invisible_addtocart_event_id', result.event_id);

          return result;
        } else {
          console.error('❌ Erro ao enviar AddToCart invisível:', result.error);
          return result;
        }

      } catch (error) {
        console.error('❌ Erro na requisição AddToCart:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * 🔑 GERAR TOKEN DE SESSÃO
     * Cria token temporário com dados de tracking para backend
     */
    generateSessionToken() {
      if (!this.trackingData) return null;

      // Criar payload simples para sessão
      const sessionPayload = {
        external_id_hash: this.trackingData.external_id_hash,
        fbp: this.trackingData.fbp,
        fbc: this.trackingData.fbc,
        ip: this.trackingData.ip,
        user_agent: this.trackingData.user_agent,
        utm_source: this.trackingData.utm_source,
        utm_medium: this.trackingData.utm_medium,
        utm_campaign: this.trackingData.utm_campaign,
        utm_term: this.trackingData.utm_term,
        utm_content: this.trackingData.utm_content,
        session_id: Date.now()
      };

      // Codificar em base64 (não é criptografia, apenas encoding)
      return btoa(JSON.stringify(sessionPayload));
    }

    /**
     * 🎯 CONFIGURAR EVENTOS AUTOMÁTICOS
     * Configura eventos que devem ser disparados automaticamente
     */
    setupAutomaticEvents() {
      // 🔥 CORREÇÃO: ViewContent quando página carrega (2 segundos)
      setTimeout(() => {
        log('Disparando ViewContent após 2 segundos do carregamento');
        // ViewContent é disparado pelo Meta Pixel Bridge
        if (window.MetaPixelBridge) {
          window.MetaPixelBridge.fireViewContent();
        }
      }, 2000);

      // 🔥 CORREÇÃO: AddToCart apenas quando PIX é gerado, não no carregamento
      // Interceptar formulários de pagamento
      this.interceptPaymentForms();

      // Interceptar botões de checkout
      this.interceptCheckoutButtons();
    }

    /**
     * 🔗 INTERCEPTAR FORMULÁRIOS DE PAGAMENTO
     * Adiciona dados de tracking aos formulários
     */
    interceptPaymentForms() {
      const forms = document.querySelectorAll('form[data-payment], form.payment-form, form#payment-form');
      
      forms.forEach(form => {
        form.addEventListener('submit', (event) => {
          if (this.trackingData) {
            // Adicionar campos hidden com dados de tracking
            this.addHiddenTrackingFields(form);
            log('Dados de tracking adicionados ao formulário de pagamento');
          }
        });
      });

      log(`Interceptação configurada para ${forms.length} formulários de pagamento`);
    }

    /**
     * 🔗 INTERCEPTAR BOTÕES DE CHECKOUT
     * Configura eventos em botões de finalização
     */
    interceptCheckoutButtons() {
      const buttons = document.querySelectorAll(
        '.checkout-button, .payment-button, .buy-button, [data-checkout], button[type="submit"]'
      );
      
      buttons.forEach(button => {
        button.addEventListener('click', () => {
          // Disparar AddToCart se ainda não foi enviado
          if (!this.addToCartSent && this.trackingData) {
            this.triggerInvisibleAddToCart();
          }
        });
      });

      log(`Interceptação configurada para ${buttons.length} botões de checkout`);
    }

    /**
     * 🔒 ADICIONAR CAMPOS HIDDEN DE TRACKING
     * Adiciona campos ocultos com dados de tracking ao formulário
     */
    addHiddenTrackingFields(form) {
      if (!this.trackingData) return;

      const trackingFields = {
        'tracking_external_id': this.trackingData.external_id_hash,
        'tracking_utm_source': this.trackingData.utm_source || '',
        'tracking_utm_campaign': this.trackingData.utm_campaign || '',
        'tracking_session_token': this.generateSessionToken()
      };

      Object.entries(trackingFields).forEach(([name, value]) => {
        // Remover campo existente se houver
        const existingField = form.querySelector(`input[name="${name}"]`);
        if (existingField) {
          existingField.remove();
        }

        // Adicionar novo campo
        const hiddenField = document.createElement('input');
        hiddenField.type = 'hidden';
        hiddenField.name = name;
        hiddenField.value = value;
        form.appendChild(hiddenField);
      });
    }

    /**
     * 🚀 INICIALIZAR SISTEMA
     * Configura decodificador quando página carrega
     */
    async initialize() {
      if (this.isInitialized) {
        log('Sistema já inicializado');
        return;
      }

      try {
        log('Inicializando decodificador de tracking invisível...');

        // Verificar se AddToCart já foi enviado
        if (sessionStorage.getItem('invisible_addtocart_sent')) {
          this.addToCartSent = true;
          log('AddToCart já foi enviado nesta sessão');
        }

        // Extrair token da URL
        const token = this.extractTokenFromURL();
        
        if (!token) {
          log('Nenhum token de tracking encontrado');
          this.isInitialized = true;
          return { success: false, reason: 'Sem token' };
        }

        // Decodificar token
        const decodeResult = await this.decodeTrackingToken(token);
        
        if (decodeResult.success) {
          // Configurar eventos automáticos
          this.setupAutomaticEvents();
          
          this.isInitialized = true;
          log('Sistema de tracking invisível inicializado com sucesso');
          
          return { success: true, data: this.trackingData };
        } else {
          log('Falha ao decodificar token:', decodeResult.error);
          this.isInitialized = true;
          return decodeResult;
        }

      } catch (error) {
        console.error('❌ Erro ao inicializar decodificador:', error);
        this.isInitialized = true;
        return { success: false, error: error.message };
      }
    }

    /**
     * 🔍 UTILITÁRIOS PÚBLICOS
     */
    hasTrackingData() {
      return !!this.trackingData;
    }

    getTrackingData() {
      return this.trackingData;
    }

    getExternalIdHash() {
      return this.trackingData?.external_id_hash || null;
    }
  }

  // Instância global
  window.InvisibleTracking = new InvisibleTrackingDecoder();

  /**
   * 🔍 UTILITÁRIOS DE DEBUG
   */
  if (DEBUG_MODE) {
    window.InvisibleTrackingDebug = {
      ...window.InvisibleTrackingDebug,
      getDecodedData: () => window.InvisibleTracking.getTrackingData(),
      hasData: () => window.InvisibleTracking.hasTrackingData(),
      triggerAddToCart: (value) => window.InvisibleTracking.triggerInvisibleAddToCart(value),
      reinitialize: () => window.InvisibleTracking.initialize()
    };

    console.log('🔍 Debug mode ativo. Use window.InvisibleTrackingDebug para utilitários do decoder.');
  }

  /**
   * 🎬 INICIAR QUANDO DOM ESTIVER PRONTO
   */
  function initializeWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.InvisibleTracking.initialize(), 1000);
      });
    } else {
      // DOM já está pronto
      setTimeout(() => window.InvisibleTracking.initialize(), 1000);
    }
  }

  initializeWhenReady();

})();
