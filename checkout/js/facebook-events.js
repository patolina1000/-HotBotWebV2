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

            // Aguardar o carregamento do Facebook Pixel
            const checkFbq = () => {
                if (typeof fbq !== 'undefined') {
                    this.initialized = true;
                    console.log('📊 [FACEBOOK-EVENTS] Sistema inicializado com sucesso');
                } else {
                    // Tentar novamente em 100ms
                    setTimeout(checkFbq, 100);
                }
            };

            checkFbq();
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
            if (!this.initialized || typeof fbq === 'undefined') {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado ou fbq não disponível');
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
         * Evento ViewContent - Disparado após 3 segundos na página
         */
        trackViewContent(value = null, contentName = null, contentCategory = null) {
            if (!this.initialized || typeof fbq === 'undefined') {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado ou fbq não disponível');
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
         * Normaliza email para envio ao Pixel (lowercase, trim)
         */
        normalizeEmail(email) {
            if (!email || typeof email !== 'string') return null;
            return email.trim().toLowerCase() || null;
        },

        /**
         * Normaliza telefone para envio ao Pixel (apenas dígitos com DDI)
         */
        normalizePhone(phone) {
            if (!phone || typeof phone !== 'string') return null;
            const digits = phone.replace(/\D/g, '');
            if (!digits) return null;
            // Adicionar DDI 55 se for BR e não tiver
            if (digits.length === 11 || digits.length === 10) {
                return '55' + digits;
            }
            return digits;
        },

        /**
         * Normaliza nome para envio ao Pixel (lowercase, trim, sem acentos)
         */
        normalizeName(name) {
            if (!name || typeof name !== 'string') return null;
            return name.trim()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s'-]+/g, '')
                .toLowerCase() || null;
        },

        /**
         * Evento InitiateCheckout - Disparado quando usuário clica para gerar PIX
         * Reutiliza a lógica existente do projeto
         */
        trackInitiateCheckout(value, currency = 'BRL', contentName = null, contentCategory = null, userData = {}) {
            if (!this.initialized || typeof fbq === 'undefined') {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado ou fbq não disponível');
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

                // 🎯 ADVANCED MATCHING - Plain-text (não hashear no browser)
                // O Meta Pixel faz o hashing automático
                if (userData.email) {
                    const normalizedEmail = this.normalizeEmail(userData.email);
                    if (normalizedEmail) {
                        eventData.em = normalizedEmail;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: email incluído (plain-text)');
                    }
                }
                if (userData.phone) {
                    const normalizedPhone = this.normalizePhone(userData.phone);
                    if (normalizedPhone) {
                        eventData.ph = normalizedPhone;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: phone incluído (plain-text)');
                    }
                }
                if (userData.firstName) {
                    const normalizedFn = this.normalizeName(userData.firstName);
                    if (normalizedFn) {
                        eventData.fn = normalizedFn;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: firstName incluído (plain-text)');
                    }
                }
                if (userData.lastName) {
                    const normalizedLn = this.normalizeName(userData.lastName);
                    if (normalizedLn) {
                        eventData.ln = normalizedLn;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: lastName incluído (plain-text)');
                    }
                }
                if (userData.externalId) {
                    eventData.external_id = String(userData.externalId);
                    console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: external_id incluído (plain-text)');
                }

                // Disparar evento InitiateCheckout
                fbq('track', 'InitiateCheckout', eventData);
                
                // Armazenar eventID para uso posterior (seguindo padrão do projeto)
                localStorage.setItem('checkout_event_id', eventId);
                
                console.log('📊 [FACEBOOK-EVENTS] ✅ InitiateCheckout enviado com sucesso', {
                    eventId: eventId,
                    value: value,
                    currency: currency,
                    hasAdvancedMatching: !!(userData.email || userData.phone || userData.firstName || userData.lastName)
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
        trackPurchase(transactionId, value, currency = 'BRL', contentName = null, userData = {}) {
            if (!this.initialized || typeof fbq === 'undefined') {
                console.warn('📊 [FACEBOOK-EVENTS] Sistema não inicializado ou fbq não disponível');
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

                // 🎯 ADVANCED MATCHING - Plain-text (não hashear no browser)
                // O Meta Pixel faz o hashing automático
                if (userData.email) {
                    const normalizedEmail = this.normalizeEmail(userData.email);
                    if (normalizedEmail) {
                        eventData.em = normalizedEmail;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: email incluído (plain-text)');
                    }
                }
                if (userData.phone) {
                    const normalizedPhone = this.normalizePhone(userData.phone);
                    if (normalizedPhone) {
                        eventData.ph = normalizedPhone;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: phone incluído (plain-text)');
                    }
                }
                if (userData.firstName) {
                    const normalizedFn = this.normalizeName(userData.firstName);
                    if (normalizedFn) {
                        eventData.fn = normalizedFn;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: firstName incluído (plain-text)');
                    }
                }
                if (userData.lastName) {
                    const normalizedLn = this.normalizeName(userData.lastName);
                    if (normalizedLn) {
                        eventData.ln = normalizedLn;
                        console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: lastName incluído (plain-text)');
                    }
                }
                if (userData.externalId) {
                    eventData.external_id = String(userData.externalId);
                    console.log('📊 [FACEBOOK-EVENTS] Advanced Matching: external_id incluído (plain-text)');
                }

                // Disparar evento Purchase
                fbq('track', 'Purchase', eventData);
                
                console.log('📊 [FACEBOOK-EVENTS] ✅ Purchase enviado com sucesso', {
                    eventId: eventId,
                    transactionId: transactionId,
                    value: value,
                    currency: currency,
                    hasAdvancedMatching: !!(userData.email || userData.phone || userData.firstName || userData.lastName)
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
            // Aguardar um pouco mais para garantir que o Facebook Pixel carregou
            setTimeout(() => {
                FacebookEvents.init();
            }, 500);
        });
    } else {
        // Aguardar um pouco mais para garantir que o Facebook Pixel carregou
        setTimeout(() => {
            FacebookEvents.init();
        }, 500);
    }

    // Expor API globalmente
    window.FacebookEvents = FacebookEvents;
    
    // Compatibilidade com sistemas existentes
    window.trackFacebookPageView = () => FacebookEvents.trackPageView();
    window.trackFacebookViewContent = (value, name, category) => FacebookEvents.trackViewContent(value, name, category);
    window.trackFacebookInitiateCheckout = (value, currency, name, category, userData) => FacebookEvents.trackInitiateCheckout(value, currency, name, category, userData);
    window.trackFacebookPurchase = (transactionId, value, currency, name, userData) => FacebookEvents.trackPurchase(transactionId, value, currency, name, userData);

    console.log('📊 [FACEBOOK-EVENTS] Script carregado - API disponível em window.FacebookEvents');

})();
