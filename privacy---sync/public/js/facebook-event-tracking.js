/**
 * Facebook Event Tracking para Privacy
 * Sistema completo de tracking de eventos do Facebook Pixel
 */

(function() {
    'use strict';

    // CONFIGURAÇÕES GLOBAIS DOS EVENTOS
    const EVENT_CONFIG = {
        CONTENT_VIEW: {
            name: 'ViewContent',
            prefix: 'vc',
            value: 19.90,
            currency: 'BRL',
            content_type: 'product',
            content_ids: ['curso-vitalicio'],
            content_name: 'Curso Vitalício - Acesso Completo',
            content_category: 'Adult Content'
        },
        INITIATE_CHECKOUT: {
            name: 'InitiateCheckout',
            prefix: 'ic',
            value: 19.90,
            currency: 'BRL',
            content_type: 'product',
            content_ids: ['curso-vitalicio'],
            content_name: 'Curso Vitalício - Acesso Completo',
            content_category: 'Adult Content'
        },
        PURCHASE: {
            name: 'Purchase',
            prefix: 'p',
            value: 19.90,
            currency: 'BRL',
            content_type: 'product',
            content_ids: ['curso-vitalicio'],
            content_name: 'Curso Vitalício - Acesso Completo',
            content_category: 'Adult Content'
        }
    };

    // FUNÇÃO PARA GERAR EVENT ID ÚNICO E ROBUSTO
    function generateRobustEventID(eventName, prefix) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const sessionId = sessionStorage.getItem('session_id') || 
                         Math.random().toString(36).substring(2, 15);
        
        // Criar session_id se não existir
        if (!sessionStorage.getItem('session_id')) {
            sessionStorage.setItem('session_id', sessionId);
        }
        
        const eventID = `${prefix}_${timestamp}_${random}_${sessionId}`;
        
        return eventID;
    }

    // FUNÇÃO PARA CAPTURAR COOKIES DO FACEBOOK
    function captureFacebookCookies() {
        const cookies = {};
        
        // Função auxiliar para obter cookie
        function getCookie(name) {
            const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return match ? decodeURIComponent(match[1]) : null;
        }

        // Capturar _fbp
        let fbp = localStorage.getItem('fbp') || getCookie('_fbp');
        if (fbp) {
            cookies.fbp = fbp;
        }

        // Capturar _fbc com fallback para fbclid
        let fbc = localStorage.getItem('fbc') || getCookie('_fbc');
        if (!fbc) {
            // Fallback: tentar extrair do fbclid
            const urlParams = new URLSearchParams(window.location.search);
            const fbclid = urlParams.get('fbclid');
            if (fbclid) {
                const timestamp = Date.now();
                fbc = `fb.1.${timestamp}.${fbclid}`;
            }
        }
        
        if (fbc) {
            cookies.fbc = fbc;
        }

        return cookies;
    }

    // FUNÇÃO PARA VALIDAR PIXEL DO FACEBOOK
    function validateFacebookPixel() {
        if (typeof fbq !== 'function') {
            console.error('Facebook Pixel não está carregado - fbq não disponível');
            return false;
        }
        
        console.log('✅ Facebook Pixel validado e pronto para uso');
        return true;
    }

    // FUNÇÃO PARA ADICIONAR TEST EVENT CODE (se necessário)
    function addTestEventCode(eventData) {
        // Se estiver em modo de teste, adicionar test_event_code
        const urlParams = new URLSearchParams(window.location.search);
        const testEventCode = urlParams.get('test_event_code');
        
        if (testEventCode) {
            eventData.test_event_code = testEventCode;
            console.log('🧪 Test Event Code adicionado:', testEventCode);
        }
        
        return eventData;
    }

    // 🔥 FUNÇÃO PARA DISPARAR EVENTO CONTENT VIEW
    function triggerContentViewEvent() {
        const config = EVENT_CONFIG.CONTENT_VIEW;
        const eventID = generateRobustEventID(config.name, config.prefix);
        const cookies = captureFacebookCookies();
        
        console.log(`🔥 Iniciando ViewContent - EventID: ${eventID}`);
        
        if (!validateFacebookPixel()) {
            console.error('❌ ViewContent cancelado - Pixel não disponível');
            return { success: false, error: 'Pixel não disponível' };
        }

        try {
            const eventData = {
                value: config.value,
                currency: config.currency,
                content_type: config.content_type,
                content_ids: config.content_ids,
                content_name: config.content_name,
                content_category: config.content_category,
                eventID: eventID
            };

            // Adicionar cookies se disponíveis
            if (cookies.fbp) eventData._fbp = cookies.fbp;
            if (cookies.fbc) eventData._fbc = cookies.fbc;

            // Adicionar test_event_code e disparar evento
            eventData = addTestEventCode(eventData);
            fbq('track', config.name, eventData);
            
            console.log(`🔥 ViewContent disparado com sucesso!`);
            console.log(`   - EventID: ${eventID}`);
            console.log(`   - FBP: ${cookies.fbp ? cookies.fbp.substring(0, 20) + '...' : 'não encontrado'}`);
            console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
            console.log(`   - Valor: R$ ${config.value}`);
            
            return { 
                success: true, 
                eventID: eventID,
                fbp: cookies.fbp,
                fbc: cookies.fbc
            };
            
        } catch (error) {
            console.error('❌ Erro ao disparar ViewContent:', error);
            return { success: false, error: error.message };
        }
    }

    // 🔥 FUNÇÃO PARA DISPARAR EVENTO INITIATE CHECKOUT
    function triggerInitiateCheckoutEvent(planValue = 19.90, planName = '1 mês') {
        const config = EVENT_CONFIG.INITIATE_CHECKOUT;
        const eventID = generateRobustEventID(config.name, config.prefix);
        const cookies = captureFacebookCookies();
        
        console.log(`🛒 Iniciando InitiateCheckout - EventID: ${eventID} - Plano: ${planName} - Valor: R$ ${planValue}`);
        
        if (!validateFacebookPixel()) {
            console.error('❌ InitiateCheckout cancelado - Pixel não disponível');
            return { success: false, error: 'Pixel não disponível' };
        }

        try {
            const eventData = {
                value: planValue,
                currency: config.currency,
                content_type: config.content_type,
                content_ids: [`privacy_plan_${planName.toLowerCase().replace(' ', '_')}`],
                content_name: `Privacy - ${planName}`,
                content_category: config.content_category,
                eventID: eventID,
                plan_name: planName,
                plan_value: planValue
            };

            // Adicionar cookies se disponíveis
            if (cookies.fbp) eventData._fbp = cookies.fbp;
            if (cookies.fbc) eventData._fbc = cookies.fbc;

            // Adicionar test_event_code e disparar evento
            eventData = addTestEventCode(eventData);
            fbq('track', config.name, eventData);
            
            // 🔥 ARMAZENAR EVENTID PARA USO POSTERIOR NO BACKEND
            localStorage.setItem('checkout_event_id', eventID);
            localStorage.setItem('checkout_plan_info', JSON.stringify({ planName, planValue, timestamp: Date.now() }));
            console.log(`💾 EventID armazenado em localStorage: ${eventID}`);
            
            console.log(`🛒 InitiateCheckout disparado com sucesso!`);
            console.log(`   - EventID: ${eventID}`);
            console.log(`   - Plano: ${planName}`);
            console.log(`   - Valor: R$ ${planValue}`);
            console.log(`   - FBP: ${cookies.fbp ? cookies.fbp.substring(0, 20) + '...' : 'não encontrado'}`);
            console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
            
            return { 
                success: true, 
                eventID: eventID,
                fbp: cookies.fbp,
                fbc: cookies.fbc,
                planName: planName,
                planValue: planValue
            };
            
        } catch (error) {
            console.error('❌ Erro ao disparar InitiateCheckout:', error);
            return { success: false, error: error.message };
        }
    }

    // 🔥 FUNÇÃO PARA DISPARAR EVENTO PURCHASE
    function triggerPurchaseEvent(planValue = 19.90, planName = '1 mês', transactionId = null) {
        const config = EVENT_CONFIG.PURCHASE;
        const eventID = generateRobustEventID(config.name, config.prefix);
        const cookies = captureFacebookCookies();
        
        // Usar valor customizado se fornecido, senão usar o padrão
        const finalValue = planValue !== null ? planValue : config.value;
        
        console.log(`💰 Iniciando Purchase - EventID: ${eventID} - Plano: ${planName} - Valor: R$ ${finalValue}`);
        
        if (!validateFacebookPixel()) {
            console.error('❌ Purchase cancelado - Pixel não disponível');
            return { success: false, error: 'Pixel não disponível' };
        }

        try {
            const eventData = {
                value: finalValue,
                currency: config.currency,
                content_type: config.content_type,
                content_ids: [`privacy_purchase_${planName.toLowerCase().replace(' ', '_')}`],
                content_name: `Privacy - ${planName}`,
                content_category: config.content_category,
                eventID: eventID,
                event_source_url: window.location.href,
                plan_name: planName,
                plan_value: finalValue
            };

            // Adicionar transaction_id se disponível
            if (transactionId) {
                eventData.transaction_id = transactionId;
            }

            // Adicionar cookies se disponíveis
            if (cookies.fbp) eventData._fbp = cookies.fbp;
            if (cookies.fbc) eventData._fbc = cookies.fbc;

            // Adicionar test_event_code e disparar evento
            eventData = addTestEventCode(eventData);
            fbq('track', config.name, eventData);
            
            // 🔥 ARMAZENAR EVENTID PARA USO POSTERIOR NO BACKEND
            localStorage.setItem('purchase_event_id', eventID);
            localStorage.setItem('purchase_sent_' + eventID, '1');
            localStorage.setItem('purchase_info', JSON.stringify({ 
                planName, 
                planValue: finalValue, 
                transactionId, 
                timestamp: Date.now() 
            }));
            console.log(`💾 EventID de Purchase armazenado em localStorage: ${eventID}`);
            
            console.log(`💰 Purchase disparado com sucesso!`);
            console.log(`   - EventID: ${eventID}`);
            console.log(`   - Plano: ${planName}`);
            console.log(`   - Valor: R$ ${finalValue}`);
            console.log(`   - Transaction ID: ${transactionId || 'não informado'}`);
            console.log(`   - FBP: ${cookies.fbp ? cookies.fbp.substring(0, 20) + '...' : 'não encontrado'}`);
            console.log(`   - FBC: ${cookies.fbc ? cookies.fbc.substring(0, 20) + '...' : 'não encontrado'}`);
            console.log(`   - URL: ${window.location.href}`);
            
            return { 
                success: true, 
                eventID: eventID,
                fbp: cookies.fbp,
                fbc: cookies.fbc,
                value: finalValue,
                planName: planName,
                transactionId: transactionId
            };
            
        } catch (error) {
            console.error('❌ Erro ao disparar Purchase:', error);
            return { success: false, error: error.message };
        }
    }

    // 🔥 FUNÇÃO PARA INTEGRAR COM OS BOTÕES DE PLANOS
    function setupFacebookPlanButtons() {
        console.log('🔧 Configurando botões de planos para eventos Facebook');
        
        const planButtons = {
            'btn-1-mes': { value: 19.90, name: '1 mês' },
            'btn-3-meses': { value: 59.70, name: '3 meses' },
            'btn-6-meses': { value: 119.40, name: '6 meses' }
        };
        
        Object.keys(planButtons).forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                const plan = planButtons[buttonId];
                
                // Adicionar evento de clique para InitiateCheckout
                button.addEventListener('click', function(e) {
                    console.log(`🖱️ Botão ${buttonId} clicado - disparando InitiateCheckout`);
                    triggerInitiateCheckoutEvent(plan.value, plan.name);
                });
                
                console.log(`✅ Botão ${buttonId} configurado para Facebook`);
            } else {
                console.log(`⚠️ Botão ${buttonId} não encontrado`);
            }
        });
    }

    // 🔥 FUNÇÃO PARA INTEGRAR COM WEBHOOKS DE PAGAMENTO
    function setupFacebookWebhookIntegration() {
        console.log('🔧 Configurando integração com webhooks para eventos Facebook');
        
        // Interceptar eventos de pagamento aprovado
        if (window.addEventListener) {
            window.addEventListener('payment-approved', function(event) {
                const { amount, plan, transactionId } = event.detail || {};
                console.log('🎉 Pagamento aprovado detectado - disparando Purchase', { amount, plan, transactionId });
                
                if (amount && plan) {
                    triggerPurchaseEvent(amount, plan, transactionId);
                }
            });
            
            console.log('✅ Listener de pagamento aprovado configurado');
        }
        
        // Interceptar eventos de PIX gerado
        window.addEventListener('pix-generated', function(event) {
            const { amount, plan } = event.detail || {};
            console.log('💳 PIX gerado detectado - disparando InitiateCheckout', { amount, plan });
            
            if (amount && plan) {
                triggerInitiateCheckoutEvent(amount, plan);
            }
        });
        
        console.log('✅ Listener de PIX gerado configurado');
    }

    // 🔥 NOVA FUNÇÃO: Verificar pagamentos aprovados via polling
    function setupPaymentApprovalPolling() {
        console.log('🔍 Configurando verificação de pagamentos aprovados via polling');
        
        // Verificar a cada 10 segundos se há pagamentos aprovados
        setInterval(async () => {
            try {
                // Verificar se há informações de pagamento aprovado no localStorage
                const purchaseInfo = localStorage.getItem('purchase_info');
                const checkoutInfo = localStorage.getItem('checkout_plan_info');
                
                if (purchaseInfo && checkoutInfo) {
                    const purchase = JSON.parse(purchaseInfo);
                    const checkout = JSON.parse(checkoutInfo);
                    
                    // Se o pagamento foi aprovado mas o evento Purchase ainda não foi disparado
                    if (purchase.timestamp > checkout.timestamp && !localStorage.getItem('purchase_sent_' + purchase.transactionId)) {
                        console.log('🎉 Pagamento aprovado detectado via polling - disparando Purchase');
                        
                        // Disparar evento Purchase
                        const result = triggerPurchaseEvent(purchase.planValue, purchase.planName, purchase.transactionId);
                        
                        if (result.success) {
                            console.log('✅ Purchase disparado com sucesso via polling');
                        } else {
                            console.error('❌ Falha ao disparar Purchase via polling:', result.error);
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro na verificação de pagamentos via polling:', error);
            }
        }, 10000); // 10 segundos
        
        console.log('✅ Sistema de polling configurado para verificar pagamentos aprovados');
    }

    // 🔥 NOVA FUNÇÃO: Verificar status de pagamento via API
    async function checkPaymentStatus(transactionId) {
        try {
            console.log(`🔍 Verificando status do pagamento: ${transactionId}`);
            
            // Fazer requisição para verificar status (implementar conforme sua API)
            const response = await fetch(`/api/payment/status/${transactionId}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.status === 'paid' || data.status === 'approved') {
                    console.log('🎉 Pagamento aprovado detectado via API - disparando Purchase');
                    
                    // Obter informações do plano
                    const checkoutInfo = localStorage.getItem('checkout_plan_info');
                    if (checkoutInfo) {
                        const checkout = JSON.parse(checkoutInfo);
                        
                        // Disparar evento Purchase
                        const result = triggerPurchaseEvent(checkout.planValue, checkout.planName, transactionId);
                        
                        if (result.success) {
                            console.log('✅ Purchase disparado com sucesso via API');
                        } else {
                            console.error('❌ Falha ao disparar Purchase via API:', result.error);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('⚠️ Erro ao verificar status do pagamento:', error);
        }
    }

    // 🔥 FUNÇÃO PARA OBTER DADOS PARA BACKEND
    function getEventDataForBackend() {
        const checkoutEventID = localStorage.getItem('checkout_event_id');
        const purchaseEventID = localStorage.getItem('purchase_event_id');
        const checkoutPlanInfo = localStorage.getItem('checkout_plan_info');
        const purchaseInfo = localStorage.getItem('purchase_info');
        const cookies = captureFacebookCookies();
        
        return {
            checkout_event_id: checkoutEventID,
            purchase_event_id: purchaseEventID,
            checkout_plan_info: checkoutPlanInfo ? JSON.parse(checkoutPlanInfo) : null,
            purchase_info: purchaseInfo ? JSON.parse(purchaseInfo) : null,
            fbp: cookies.fbp,
            fbc: cookies.fbc,
            timestamp: Date.now(),
            url: window.location.href,
            user_agent: navigator.userAgent
        };
    }

    // 🔥 FUNÇÃO PARA LIMPAR DADOS (útil para testes)
    function clearEventData() {
        localStorage.removeItem('checkout_event_id');
        localStorage.removeItem('purchase_event_id');
        localStorage.removeItem('checkout_plan_info');
        localStorage.removeItem('purchase_info');
        // Limpar todos os purchase_sent_*
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('purchase_sent_')) {
                localStorage.removeItem(key);
            }
        });
        sessionStorage.removeItem('privacy_flow_events_dispatched');
        sessionStorage.removeItem('session_id');
        console.log('🧹 Dados de eventos limpos');
    }

    // 🔥 EXPOSIÇÃO DAS FUNÇÕES GLOBALMENTE
    window.PrivacyEventTracking = {
        triggerContentViewEvent,
        triggerInitiateCheckoutEvent,
        triggerPurchaseEvent,
        getEventDataForBackend,
        clearEventData,
        generateRobustEventID,
        captureFacebookCookies,
        validateFacebookPixel,
        setupFacebookPlanButtons,
        setupFacebookWebhookIntegration,
        setupPaymentApprovalPolling,
        checkPaymentStatus
    };

    // 🔥 LOG INICIAL
    console.log('📊 Privacy Facebook Event Tracking System carregado');
    console.log('🔧 Funções disponíveis:');
    console.log('   - triggerContentViewEvent()');
    console.log('   - triggerInitiateCheckoutEvent()');
    console.log('   - triggerPurchaseEvent()');
    console.log('   - getEventDataForBackend()');
    console.log('   - clearEventData()');
    console.log('   - setupFacebookPlanButtons()');
    console.log('   - setupFacebookWebhookIntegration()');
    console.log('   - setupPaymentApprovalPolling()');
    console.log('   - checkPaymentStatus()');

    // 🔥 DISPARAR VIEWCONTENT AUTOMATICAMENTE AO CARREGAR A PÁGINA
    window.addEventListener('load', () => {
        setTimeout(() => {
            console.log('🎯 Disparando ViewContent automaticamente após 2 segundos...');
            triggerContentViewEvent();
        }, 2000); // Aguardar 2 segundos para garantir que tudo carregou
    });

    // 🔥 CONFIGURAR INTEGRAÇÕES QUANDO DOM ESTIVER PRONTO
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('🔧 Configurando integrações Facebook...');
            setupFacebookPlanButtons();
            setupFacebookWebhookIntegration();
            setupPaymentApprovalPolling();
        });
    } else {
        console.log('🔧 Configurando integrações Facebook...');
        setupFacebookPlanButtons();
        setupFacebookWebhookIntegration();
        setupPaymentApprovalPolling();
    }

})();
