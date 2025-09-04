/**
 * 🔐 INTEGRAÇÃO DE PAGAMENTO INVISÍVEL
 * Integra sistema de pagamento com tracking invisível
 * Salva dados de tracking quando PIX é gerado
 */

(function() {
  'use strict';

  const DEBUG_MODE = window.location.hostname === 'localhost' || 
                     window.location.hostname.includes('dev') || 
                     localStorage.getItem('invisible_debug') === 'true';

  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[INVISIBLE-PAYMENT] ${message}`, data || '');
    }
  }

  class InvisiblePaymentIntegration {
    constructor() {
      this.isInitialized = false;
    }

    /**
     * 🔐 INTERCEPTAR GERAÇÃO DE PIX
     * Salva dados de tracking quando PIX é gerado
     */
    interceptPixGeneration() {
      // Interceptar chamadas para APIs de pagamento
      const originalFetch = window.fetch;
      
      window.fetch = async function(url, options = {}) {
        // Verificar se é uma requisição de pagamento
        const isPaymentRequest = url.includes('/api/') && 
                                 (url.includes('pix') || url.includes('payment') || url.includes('checkout'));
        
        if (isPaymentRequest && options.method === 'POST') {
          log('Interceptando requisição de pagamento:', url);
          
          // Adicionar dados de tracking se disponíveis
          const trackingData = window.InvisibleTracking?.getTrackingData();
          if (trackingData) {
            try {
              // Parse do body se for JSON
              let body = options.body;
              if (typeof body === 'string') {
                try {
                  const parsedBody = JSON.parse(body);
                  
                  // Adicionar dados de tracking
                  parsedBody.invisible_tracking = {
                    external_id_hash: trackingData.external_id_hash,
                    utm_source: trackingData.utm_source,
                    utm_medium: trackingData.utm_medium,
                    utm_campaign: trackingData.utm_campaign,
                    utm_term: trackingData.utm_term,
                    utm_content: trackingData.utm_content,
                    fbp: trackingData.fbp,
                    fbc: trackingData.fbc,
                    ip: trackingData.ip,
                    user_agent: trackingData.user_agent
                  };
                  
                  options.body = JSON.stringify(parsedBody);
                  log('Dados de tracking adicionados à requisição de pagamento');
                } catch (e) {
                  log('Erro ao processar body da requisição:', e);
                }
              }
            } catch (error) {
              log('Erro ao adicionar tracking à requisição:', error);
            }
          }
        }
        
        // Executar requisição original
        const response = await originalFetch.call(this, url, options);
        
        // Interceptar resposta de pagamento bem-sucedida
        if (isPaymentRequest && response.ok) {
          try {
            const responseClone = response.clone();
            const responseData = await responseClone.json();
            
            // Se PIX foi gerado com sucesso
            if (responseData.success && responseData.transaction_id) {
              // Salvar tracking no banco
              await this.saveTrackingToDatabase(responseData.transaction_id);
              
              // 🔥 CORREÇÃO: Disparar AddToCart quando PIX é gerado
              log('PIX gerado com sucesso - disparando AddToCart');
              
              // Disparar AddToCart invisível (backend)
              if (window.InvisibleTracking?.hasTrackingData()) {
                await window.InvisibleTracking.triggerInvisibleAddToCart();
              }
              
              // Disparar AddToCart client-side (Meta Pixel Helper)
              if (window.MetaPixelBridge) {
                const value = responseData.value || responseData.amount || 19.90;
                window.MetaPixelBridge.fireAddToCart(value);
              }
            }
          } catch (error) {
            log('Erro ao processar resposta de pagamento:', error);
          }
        }
        
        return response;
      }.bind(this);

      log('Interceptação de geração de PIX configurada');
    }

    /**
     * 💾 SALVAR TRACKING NO BANCO
     * Salva dados de tracking associados à transação
     */
    async saveTrackingToDatabase(transactionId) {
      const trackingData = window.InvisibleTracking?.getTrackingData();
      
      if (!trackingData) {
        log('Nenhum dado de tracking disponível para salvar');
        return;
      }

      try {
        log('Salvando dados de tracking no banco...', { transactionId });

        const response = await fetch('/api/save-tracking-transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transaction_id: transactionId,
            external_id_hash: trackingData.external_id_hash,
            utm_source: trackingData.utm_source,
            utm_medium: trackingData.utm_medium,
            utm_campaign: trackingData.utm_campaign,
            utm_term: trackingData.utm_term,
            utm_content: trackingData.utm_content,
            fbp: trackingData.fbp,
            fbc: trackingData.fbc,
            ip: trackingData.ip,
            user_agent: trackingData.user_agent
          })
        });

        const result = await response.json();

        if (result.success) {
          log('Dados de tracking salvos com sucesso:', result);
          
          // Salvar no sessionStorage para referência
          sessionStorage.setItem('invisible_transaction_id', transactionId);
          sessionStorage.setItem('invisible_tracking_saved', '1');
        } else {
          console.error('❌ Erro ao salvar tracking:', result.error);
        }

      } catch (error) {
        console.error('❌ Erro na requisição de salvamento:', error);
      }
    }

    /**
     * 🔗 INTERCEPTAR FORMULÁRIOS DE PAGAMENTO
     * Adiciona dados de tracking aos formulários antes do envio
     */
    interceptPaymentForms() {
      const forms = document.querySelectorAll('form[data-payment], form.payment-form, form#payment-form');
      
      forms.forEach(form => {
        form.addEventListener('submit', async (event) => {
          const trackingData = window.InvisibleTracking?.getTrackingData();
          
          if (trackingData) {
            // Adicionar campos hidden com dados de tracking
            this.addTrackingFieldsToForm(form, trackingData);
            log('Dados de tracking adicionados ao formulário');
          }
        });
      });

      log(`Interceptação configurada para ${forms.length} formulários`);
    }

    /**
     * 🔒 ADICIONAR CAMPOS DE TRACKING AO FORMULÁRIO
     */
    addTrackingFieldsToForm(form, trackingData) {
      const trackingFields = {
        'invisible_external_id_hash': trackingData.external_id_hash,
        'invisible_utm_source': trackingData.utm_source || '',
        'invisible_utm_medium': trackingData.utm_medium || '',
        'invisible_utm_campaign': trackingData.utm_campaign || '',
        'invisible_utm_term': trackingData.utm_term || '',
        'invisible_utm_content': trackingData.utm_content || '',
        'invisible_fbp': trackingData.fbp || '',
        'invisible_fbc': trackingData.fbc || '',
        'invisible_ip': trackingData.ip || '',
        'invisible_user_agent': trackingData.user_agent || ''
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
     * 🎯 INTERCEPTAR BOTÕES DE PAGAMENTO
     * Configura eventos em botões antes do pagamento
     */
    interceptPaymentButtons() {
      const buttons = document.querySelectorAll(
        '.btn-subscription, .payment-button, .buy-button, [data-payment], button[id*="btn-"]'
      );
      
      buttons.forEach(button => {
        button.addEventListener('click', async (event) => {
          // Verificar se há dados de tracking
          if (window.InvisibleTracking?.hasTrackingData()) {
            log('Botão de pagamento clicado com dados de tracking disponíveis');
            
            // Disparar AddToCart se ainda não foi enviado
            if (!sessionStorage.getItem('invisible_addtocart_sent')) {
              await window.InvisibleTracking.triggerInvisibleAddToCart();
            }
          } else {
            log('Botão de pagamento clicado sem dados de tracking');
          }
        });
      });

      log(`Interceptação configurada para ${buttons.length} botões de pagamento`);
    }

    /**
     * 🚀 INICIALIZAR INTEGRAÇÃO
     */
    async initialize() {
      if (this.isInitialized) {
        log('Integração já inicializada');
        return;
      }

      try {
        log('Inicializando integração de pagamento invisível...');

        // Aguardar sistema de tracking estar pronto
        let attempts = 0;
        const maxAttempts = 20;

        while (!window.InvisibleTracking && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }

        if (!window.InvisibleTracking) {
          log('Sistema de tracking não encontrado - continuando sem integração');
          this.isInitialized = true;
          return;
        }

        // Aguardar tracking estar inicializado
        attempts = 0;
        while (!window.InvisibleTracking.hasTrackingData() && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }

        // Configurar interceptações
        this.interceptPixGeneration();
        this.interceptPaymentForms();
        this.interceptPaymentButtons();

        this.isInitialized = true;
        log('Integração de pagamento invisível inicializada com sucesso');

      } catch (error) {
        console.error('❌ Erro ao inicializar integração de pagamento:', error);
        this.isInitialized = true;
      }
    }
  }

  // Instância global
  window.InvisiblePaymentIntegration = new InvisiblePaymentIntegration();

  /**
   * 🔍 UTILITÁRIOS DE DEBUG
   */
  if (DEBUG_MODE) {
    window.InvisibleTrackingDebug = {
      ...window.InvisibleTrackingDebug,
      getPaymentIntegration: () => window.InvisiblePaymentIntegration,
      reinitializePayment: () => window.InvisiblePaymentIntegration.initialize()
    };

    console.log('🔍 Debug mode ativo. Use window.InvisibleTrackingDebug para utilitários de pagamento.');
  }

  /**
   * 🎬 INICIAR QUANDO DOM ESTIVER PRONTO
   */
  function initializeWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.InvisiblePaymentIntegration.initialize(), 2000);
      });
    } else {
      // DOM já está pronto
      setTimeout(() => window.InvisiblePaymentIntegration.initialize(), 2000);
    }
  }

  initializeWhenReady();

})();
