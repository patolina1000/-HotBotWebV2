/**
 * Facebook Pixel Events - Sistema Compartilhado
 * Funções reutilizáveis para eventos do Facebook Pixel nas páginas de checkout
 * 
 * Baseado nas funções existentes do projeto:
 * - services/facebook.js (CAPI)
 * - MODELO1/WEB/tracking.js (Pixel)
 * - MODELO1/WEB/event-tracking-initiate.js (InitiateCheckout)
 */

(function() {
    'use strict';

    // Configuração global
    const FacebookEvents = {
        initialized: false,
        pixelId: null,
        testMode: false,

        /**
         * Inicializa o sistema de eventos do Facebook
         */
        init() {
            if (this.initialized) {
                console.log('📊 [FACEBOOK-EVENTS] Já inicializado');
                return;
            }

            console.log('📊 [FACEBOOK-EVENTS] Inicializando sistema de eventos...');

            // Verificar se o Pixel está disponível
            if (typeof fbq === 'undefined') {
                console.warn('📊 [FACEBOOK-EVENTS] Facebook Pixel não encontrado');
                return;
            }

            this.initialized = true;
            console.log('📊 [FACEBOOK-EVENTS] Sistema inicializado com sucesso');
        },

        /**
         * Gera um Event ID único para deduplicação
         */
        generateEventId(eventName, prefix = 'checkout') {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 15);
            return `${prefix}_${eventName}_${timestamp}_${random}`;
        },

        /**
         * Captura cookies do Facebook se disponíveis
         */
        getFacebookCookies() {
            const cookies = {};
            
            // Capturar _fbp
            const fbpMatch = document.cookie.match(/_fbp=([^;]+)/);
            if (fbpMatch) {
                cookies.fbp = fbpMatch[1];
            }

            // Capturar _fbc
            const fbcMatch = document.cookie.match(/_fbc=([^;]+)/);
            if (fbcMatch) {
                cookies.fbc = fbcMatch[1];
            }

            return cookies;
        },

        /**
         * Evento PageView - Disparado quando a página carrega
         */
        trackPageView() {
            if (!this.initialized) {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado');
                return;
            }

            try {
                console.log('📊 [FACEBOOK-EVENTS] Disparando PageView...');
                
                // Disparar evento PageView padrão do Facebook Pixel
                fbq('track', 'PageView');
                
                console.log('📊 [FACEBOOK-EVENTS] ✅ PageView enviado com sucesso');
                
            } catch (error) {
                console.error('📊 [FACEBOOK-EVENTS] ❌ Erro ao enviar PageView:', error);
            }
        },

        /**
         * Evento ViewContent - Disparado após 4 segundos na página
         */
        trackViewContent(value = null, contentName = null, contentCategory = null) {
            if (!this.initialized) {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado');
                return;
            }

            try {
                console.log('📊 [FACEBOOK-EVENTS] Disparando ViewContent...');
                
                const eventData = {
                    content_name: contentName || 'Página de Checkout',
                    content_category: contentCategory || 'E-commerce'
                };

                // Adicionar valor se fornecido
                if (value && typeof value === 'number') {
                    eventData.value = value;
                    eventData.currency = 'BRL';
                }

                // Disparar evento ViewContent
                fbq('track', 'ViewContent', eventData);
                
                console.log('📊 [FACEBOOK-EVENTS] ✅ ViewContent enviado com sucesso', eventData);
                
            } catch (error) {
                console.error('📊 [FACEBOOK-EVENTS] ❌ Erro ao enviar ViewContent:', error);
            }
        },

        /**
         * Evento InitiateCheckout - Disparado quando usuário clica para gerar PIX
         * Reutiliza a lógica existente do projeto
         */
        trackInitiateCheckout(value, currency = 'BRL', contentName = null, contentCategory = null) {
            if (!this.initialized) {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado');
                return;
            }

            try {
                console.log('📊 [FACEBOOK-EVENTS] Disparando InitiateCheckout...');
                
                const eventId = this.generateEventId('InitiateCheckout');
                const cookies = this.getFacebookCookies();
                
                const eventData = {
                    value: value,
                    currency: currency,
                    content_name: contentName || 'Produto',
                    content_category: contentCategory || 'E-commerce',
                    eventID: eventId
                };

                // Adicionar cookies se disponíveis
                if (cookies.fbp) eventData._fbp = cookies.fbp;
                if (cookies.fbc) eventData._fbc = cookies.fbc;

                // Disparar evento InitiateCheckout
                fbq('track', 'InitiateCheckout', eventData);
                
                // Armazenar eventID para uso posterior (seguindo padrão do projeto)
                localStorage.setItem('checkout_event_id', eventId);
                
                console.log('📊 [FACEBOOK-EVENTS] ✅ InitiateCheckout enviado com sucesso', {
                    eventId: eventId,
                    value: value,
                    currency: currency
                });
                
                return { success: true, eventId: eventId };
                
            } catch (error) {
                console.error('📊 [FACEBOOK-EVENTS] ❌ Erro ao enviar InitiateCheckout:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Evento Purchase - Disparado quando pagamento é confirmado
         * Reutiliza a lógica existente do projeto
         */
        trackPurchase(transactionId, value, currency = 'BRL', contentName = null) {
            if (!this.initialized) {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado');
                return;
            }

            try {
                console.log('📊 [FACEBOOK-EVENTS] Disparando Purchase...');
                
                const eventId = this.generateEventId('Purchase', transactionId);
                const cookies = this.getFacebookCookies();
                
                const eventData = {
                    value: value,
                    currency: currency,
                    content_name: contentName || 'Compra Realizada',
                    content_type: 'product',
                    eventID: eventId
                };

                // Adicionar cookies se disponíveis
                if (cookies.fbp) eventData._fbp = cookies.fbp;
                if (cookies.fbc) eventData._fbc = cookies.fbc;

                // Disparar evento Purchase
                fbq('track', 'Purchase', eventData);
                
                console.log('📊 [FACEBOOK-EVENTS] ✅ Purchase enviado com sucesso', {
                    eventId: eventId,
                    transactionId: transactionId,
                    value: value,
                    currency: currency
                });
                
                return { success: true, eventId: eventId };
                
            } catch (error) {
                console.error('📊 [FACEBOOK-EVENTS] ❌ Erro ao enviar Purchase:', error);
                return { success: false, error: error.message };
            }
        }
    };

    // Auto-inicializar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            FacebookEvents.init();
        });
    } else {
        FacebookEvents.init();
    }

    // Expor API globalmente
    window.FacebookEvents = FacebookEvents;
    
    // Compatibilidade com sistemas existentes
    window.trackFacebookPageView = () => FacebookEvents.trackPageView();
    window.trackFacebookViewContent = (value, name, category) => FacebookEvents.trackViewContent(value, name, category);
    window.trackFacebookInitiateCheckout = (value, currency, name, category) => FacebookEvents.trackInitiateCheckout(value, currency, name, category);
    window.trackFacebookPurchase = (transactionId, value, currency, name) => FacebookEvents.trackPurchase(transactionId, value, currency, name);

    console.log('📊 [FACEBOOK-EVENTS] Script carregado - API disponível em window.FacebookEvents');

})();
