/**
 * Integração de Tracking para Checkout Privacy
 * Integra com o sistema de tracking principal para enviar eventos Purchase
 */

(function() {
  'use strict';

  console.log('[CHECKOUT-TRACKING] Sistema de tracking do checkout inicializado');

  // Função para detectar pagamento confirmado
  function setupPaymentTracking() {
    // Monitorar mudanças no DOM que indiquem pagamento aprovado
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Procurar por indicadores de pagamento aprovado
        const addedNodes = Array.from(mutation.addedNodes);
        addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            // Verificar se é um elemento de sucesso
            const successIndicators = [
              'sucesso', 'aprovado', 'confirmado', 'pago', 'success', 
              'approved', 'confirmed', 'paid', 'obrigado', 'thanks'
            ];
            
            const textContent = node.textContent ? node.textContent.toLowerCase() : '';
            const className = node.className ? node.className.toLowerCase() : '';
            const id = node.id ? node.id.toLowerCase() : '';
            
            const hasSuccessIndicator = successIndicators.some(indicator => 
              textContent.includes(indicator) || 
              className.includes(indicator) || 
              id.includes(indicator)
            );
            
            if (hasSuccessIndicator) {
              console.log('[CHECKOUT-TRACKING] Possível indicador de pagamento aprovado detectado:', node);
              handlePaymentSuccess();
            }
          }
        });
      });
    });

    // Observar mudanças no documento
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Monitorar mudanças na URL que indiquem sucesso
    let currentUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        if (currentUrl.includes('sucesso') || currentUrl.includes('obrigado') || currentUrl.includes('thanks')) {
          console.log('[CHECKOUT-TRACKING] URL de sucesso detectada:', currentUrl);
          handlePaymentSuccess();
        }
      }
    }, 1000);
  }

  // Função para detectar valor do plano selecionado
  function detectPlanValue() {
    // Tentar detectar o valor de várias formas
    const selectors = [
      '[data-price]',
      '.price',
      '.valor',
      '.plan-price',
      '.amount',
      '.total'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const value = element.getAttribute('data-price') || 
                     element.textContent || 
                     element.value;
        
        if (value) {
          const numericValue = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(numericValue) && numericValue > 0) {
            console.log('[CHECKOUT-TRACKING] Valor detectado:', numericValue);
            return numericValue;
          }
        }
      }
    }

    // Valores padrão baseados nos planos conhecidos
    const defaultValues = [7, 12, 27, 37, 47, 67, 97, 147];
    const randomDefault = defaultValues[Math.floor(Math.random() * defaultValues.length)];
    
    console.log('[CHECKOUT-TRACKING] Valor não detectado, usando padrão:', randomDefault);
    return randomDefault;
  }

  // Função chamada quando pagamento é confirmado
  function handlePaymentSuccess() {
    // Evitar disparos múltiplos
    if (window.purchaseTracked) {
      console.log('[CHECKOUT-TRACKING] Purchase já foi rastreado, ignorando');
      return;
    }
    window.purchaseTracked = true;

    console.log('[CHECKOUT-TRACKING] Processando pagamento confirmado...');

    const planValue = detectPlanValue();
    
    // Verificar se existe o sistema de tracking global
    if (window.TrackingSystem && typeof window.TrackingSystem.trackPurchase === 'function') {
      console.log('[CHECKOUT-TRACKING] Enviando Purchase via TrackingSystem:', planValue);
      window.TrackingSystem.trackPurchase(planValue);
    } else {
      // Fallback: enviar diretamente
      console.log('[CHECKOUT-TRACKING] TrackingSystem não encontrado, enviando diretamente');
      
      // Enviar para Facebook Pixel se disponível
      if (typeof fbq === 'function') {
        const purchaseData = {
          value: planValue,
          currency: 'BRL',
          eventID: `Purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        fbq('track', 'Purchase', purchaseData);
        console.log('[CHECKOUT-TRACKING] Purchase enviado via fbq:', purchaseData);
      }

      // Enviar para CAPI
      sendPurchaseToCAPI(planValue);
      
      // Enviar para UTMify
      sendPurchaseToUTMify(planValue);
      
      // Enviar para Kwai
      sendPurchaseToKwai(planValue);
    }
  }

  // Função para enviar Purchase para CAPI diretamente
  async function sendPurchaseToCAPI(value) {
    try {
      const payload = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href,
        value: value,
        currency: 'BRL',
        event_id: `Purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_data: {
          ip_address: null, // Será preenchido pelo servidor
          user_agent: navigator.userAgent,
          fbc: getCookie('_fbc') || localStorage.getItem('fbc'),
          fbp: getCookie('_fbp') || localStorage.getItem('fbp')
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
        console.log('[CHECKOUT-TRACKING] Purchase enviado para CAPI com sucesso');
      } else {
        console.error('[CHECKOUT-TRACKING] Erro ao enviar Purchase para CAPI:', response.statusText);
      }
    } catch (error) {
      console.error('[CHECKOUT-TRACKING] Erro CAPI:', error);
    }
  }

  // Função para enviar Purchase para UTMify diretamente
  async function sendPurchaseToUTMify(value) {
    try {
      // Capturar dados UTM do localStorage
      const utmData = {};
      const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      utmKeys.forEach(key => {
        const saved = localStorage.getItem(key);
        if (saved) {
          utmData[key] = saved;
        }
      });

      const payload = {
        value: value,
        currency: 'BRL',
        utm_data: utmData
      };

      const response = await fetch('/utimify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log('[CHECKOUT-TRACKING] Purchase enviado para UTMify com sucesso');
      } else {
        console.log('[CHECKOUT-TRACKING] UTMify não configurado ou erro no envio');
      }
    } catch (error) {
      console.error('[CHECKOUT-TRACKING] Erro UTMify:', error);
    }
  }

  // Função para enviar Purchase para Kwai diretamente
  async function sendPurchaseToKwai(value) {
    try {
      // Verificar se o KwaiTracker está disponível
      if (window.KwaiTracker && typeof window.KwaiTracker.trackPurchase === 'function') {
        window.KwaiTracker.trackPurchase({
          value: value,
          content_name: 'Compra Finalizada - Plano Privacy'
        });
        console.log('[CHECKOUT-TRACKING] Purchase enviado para Kwai via KwaiTracker');
        return;
      }

      // Fallback: enviar diretamente para a API
      const payload = {
        eventName: 'EVENT_PURCHASE',
        properties: {
          content_id: `purchase_${Date.now()}`,
          content_name: 'Plano Privacy',
          content_type: 'product',
          currency: 'BRL',
          value: value
        }
      };

      const response = await fetch('/api/kwai-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log('[CHECKOUT-TRACKING] Purchase enviado para Kwai com sucesso');
      } else {
        console.log('[CHECKOUT-TRACKING] Kwai não configurado ou erro no envio');
      }
    } catch (error) {
      console.error('[CHECKOUT-TRACKING] Erro Kwai:', error);
    }
  }

  // Função auxiliar para obter cookies
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Monitorar cliques em botões de PIX para InitiateCheckout
  function setupInitiateCheckoutTracking() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      const targetText = target.textContent ? target.textContent.toLowerCase() : '';
      const targetClass = target.className ? target.className.toLowerCase() : '';
      const targetId = target.id ? target.id.toLowerCase() : '';
      
      // Detectar cliques em botões de PIX
      const pixIndicators = ['pix', 'gerar', 'pagar', 'finalizar', 'checkout'];
      const isPixButton = pixIndicators.some(indicator => 
        targetText.includes(indicator) || 
        targetClass.includes(indicator) || 
        targetId.includes(indicator)
      );
      
      if (isPixButton) {
        console.log('[CHECKOUT-TRACKING] Botão PIX clicado:', target);
        
        if (window.TrackingSystem && typeof window.TrackingSystem.trackPixButtonClick === 'function') {
          window.TrackingSystem.trackPixButtonClick();
        } else if (typeof fbq === 'function') {
          const initiateData = {
            eventID: `InitiateCheckout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };
          
          const planValue = detectPlanValue();
          if (planValue) {
            initiateData.value = planValue;
            initiateData.currency = 'BRL';
          }
          
          fbq('track', 'InitiateCheckout', initiateData);
          console.log('[CHECKOUT-TRACKING] InitiateCheckout enviado:', initiateData);
        }
        
        // Enviar para Kwai - AddToCart quando clica em botão PIX
        if (window.KwaiTracker && typeof window.KwaiTracker.trackAddToCart === 'function') {
          const planValue = detectPlanValue();
          window.KwaiTracker.trackAddToCart({
            value: planValue,
            content_name: 'Checkout PIX - Plano Privacy'
          });
        }
      }
    });
  }

  // Inicializar tracking quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupPaymentTracking();
      setupInitiateCheckoutTracking();
    });
  } else {
    setupPaymentTracking();
    setupInitiateCheckoutTracking();
  }

  // Expor função para tracking manual
  window.CheckoutTracking = {
    trackPurchase: handlePaymentSuccess,
    detectValue: detectPlanValue
  };

})();
