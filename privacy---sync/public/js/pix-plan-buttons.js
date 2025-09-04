(function($){
    function attachPlanHandler(buttonId, planKey){
        $(buttonId).on('click', async function(){
            // Verificar se a integração universal está disponível
            if (!window.syncPay && !window.universalPayment) {
                alert('Serviço de pagamento indisponível.');
                return;
            }

            // Verificar se as configurações foram carregadas
            if (!window.SYNCPAY_CONFIG) {
                alert('Configurações não carregadas. Aguarde...');
                console.error('SYNCPAY_CONFIG não definido');
                return;
            }

            // 🔥 LÓGICA HÍBRIDA IGUAL AO BOT: Buscar tanto em planos quanto em plans
            let plan = null;
            
            // Primeiro tentar na estrutura nova (planos - igual ao bot)
            if (window.SYNCPAY_CONFIG.planos && window.SYNCPAY_CONFIG.planos.length > 0) {
                plan = window.obterPlanoPorId ? window.obterPlanoPorId(planKey) : 
                       window.SYNCPAY_CONFIG.planos.find(p => p.id === planKey || p.buttonId === planKey);
            }
            
            // Fallback para estrutura antiga (plans)
            if (!plan && window.SYNCPAY_CONFIG.plans) {
                plan = window.SYNCPAY_CONFIG.plans[planKey];
            }
            
            console.log('🔍 [DEBUG] Procurando plano:', planKey);
            console.log('📋 [DEBUG] Planos (bot) disponíveis:', window.SYNCPAY_CONFIG.planos);
            console.log('📋 [DEBUG] Plans (privacy) disponíveis:', window.SYNCPAY_CONFIG.plans);
            console.log('✅ [DEBUG] Plano encontrado:', plan);
            
            if (!plan) {
                const availablePlans = [
                    ...Object.keys(window.SYNCPAY_CONFIG.plans || {}),
                    ...(window.SYNCPAY_CONFIG.planos || []).map(p => p.id)
                ];
                alert(`Plano '${planKey}' não encontrado. Planos disponíveis: ${availablePlans.join(', ')}`);
                return;
            }

            try {
                // Usar a integração universal que detecta o gateway automaticamente
                const paymentService = window.universalPayment || window.syncPay;
                
                // Mostrar loading com informação do gateway atual
                if (paymentService.showLoading) {
                    paymentService.showLoading();
                }
                
                // Dados do cliente padrão (pode ser expandido para coletar dados reais)
                const clientData = {
                    name: 'Cliente',
                    cpf: '12345678901',
                    email: 'cliente@exemplo.com',
                    phone: '11999999999'
                };
                
                // 🔥 USAR VALOR CORRETO BASEADO NA ESTRUTURA (BOT vs PRIVACY)
                const amount = plan.valor || plan.price || plan.amount; // valor (bot) ou price/amount (privacy)
                const description = plan.descricao || plan.description || plan.nome || plan.label;
                
                console.log('💰 [DEBUG] Valor do plano:', amount, 'tipo:', typeof amount);
                console.log('📝 [DEBUG] Descrição:', description);
                
                // Validar se o amount está definido
                if (!amount || amount <= 0) {
                    throw new Error(`Valor do plano '${planKey}' não definido ou inválido: ${amount}`);
                }
                
                // Garantir que o amount seja um número válido
                const finalAmount = parseFloat(amount);
                if (isNaN(finalAmount)) {
                    throw new Error(`Valor do plano '${planKey}' não é um número válido: ${amount}`);
                }
                
                console.log('💰 [DEBUG] Criando transação PIX:', {
                    amount: finalAmount,
                    amount_type: typeof finalAmount,
                    description: description,
                    planKey: planKey,
                    plan_original_price: plan.price
                });
                
                const transaction = await paymentService.createPixTransaction(finalAmount, description, clientData);
                $(this).data('pixTransaction', transaction);
                
                // 🔥 NOVO: DISPARAR EVENTO KWAI ADD_TO_CART
                if (window.KwaiEvents && window.KwaiEvents.triggerAddToCart) {
                    try {
                        console.log('🎯 [KWAI] Disparando ADD_TO_CART após geração do PIX');
                        
                        // Determinar nome do plano baseado no planKey
                        const planNames = {
                            'monthly': '1 mês',
                            'quarterly': '3 meses', 
                            'semestrial': '6 meses'
                        };
                        
                        const planName = planNames[planKey] || description;
                        
                        // Disparar evento Kwai
                        window.KwaiEvents.triggerAddToCart(finalAmount, planName);
                        
                        // 🔥 DISPARAR EVENTO CUSTOMIZADO PARA INTEGRAÇÃO
                        const pixGeneratedEvent = new CustomEvent('pix-generated', {
                            detail: {
                                amount: finalAmount,
                                plan: planName,
                                planKey: planKey,
                                transaction: transaction,
                                gateway: transaction.gateway || 'unknown'
                            }
                        });
                        window.dispatchEvent(pixGeneratedEvent);
                        
                        console.log('✅ [KWAI] Evento ADD_TO_CART disparado com sucesso');
                        
                    } catch (kwaiError) {
                        console.warn('⚠️ [KWAI] Erro ao disparar ADD_TO_CART:', kwaiError);
                    }
                } else {
                    console.log('ℹ️ [KWAI] Sistema Kwai não disponível, evento ADD_TO_CART não disparado');
                }

                // 🔥 NOVO: DISPARAR EVENTO FACEBOOK INITIATE CHECKOUT
                if (window.PrivacyEventTracking && window.PrivacyEventTracking.triggerInitiateCheckoutEvent) {
                    try {
                        console.log('🎯 [FACEBOOK] Disparando InitiateCheckout após geração do PIX');
                        
                        // Determinar nome do plano baseado no planKey
                        const planNames = {
                            'monthly': '1 mês',
                            'quarterly': '3 meses', 
                            'semestrial': '6 meses'
                        };
                        
                        const planName = planNames[planKey] || description;
                        
                        // Disparar evento Facebook
                        window.PrivacyEventTracking.triggerInitiateCheckoutEvent(finalAmount, planName);
                        
                        console.log('✅ [FACEBOOK] Evento InitiateCheckout disparado com sucesso');
                        
                    } catch (facebookError) {
                        console.warn('⚠️ [FACEBOOK] Erro ao disparar InitiateCheckout:', facebookError);
                    }
                } else {
                    console.log('ℹ️ [FACEBOOK] Sistema Facebook não disponível, evento InitiateCheckout não disparado');
                }
                
                // Mostrar modal com o PIX gerado
                if (paymentService.showPixModal && transaction.pix_code) {
                    paymentService.showPixModal(transaction);
                } else {
                    alert(`PIX gerado com sucesso via ${transaction.gateway?.toUpperCase() || 'Gateway'}!`);
                }
                
            } catch (err) {
                console.error('Erro ao gerar PIX:', err);
                alert(`Erro ao gerar PIX: ${err.message}`);
            } finally {
                // Fechar loading
                if (typeof swal !== 'undefined') {
                    try {
                        swal.close();
                    } catch (error) {
                        console.warn('Erro ao fechar SweetAlert:', error);
                    }
                } else {
                    $('#nativeLoading').remove();
                }
            }
        });
    }

    $(function(){
        // Aguardar configurações carregarem antes de anexar handlers
        function waitForConfigAndAttach() {
            // Verificar se SYNCPAY_CONFIG está disponível e tem planos ou plans
            const hasPlans = window.SYNCPAY_CONFIG && window.SYNCPAY_CONFIG.plans && Object.keys(window.SYNCPAY_CONFIG.plans).length > 0;
            const hasPlanos = window.SYNCPAY_CONFIG && window.SYNCPAY_CONFIG.planos && window.SYNCPAY_CONFIG.planos.length > 0;
            
            if (hasPlans || hasPlanos) {
                attachPlanHandler('#btn-1-mes', 'monthly');
                attachPlanHandler('#btn-3-meses', 'quarterly');
                attachPlanHandler('#btn-6-meses', 'semestrial');
                console.log('🔧 Handlers dos botões PIX configurados com integração universal');
                console.log('📋 Plans disponíveis:', hasPlans ? Object.keys(window.SYNCPAY_CONFIG.plans) : 'Nenhum');
                console.log('📋 Planos disponíveis:', hasPlanos ? window.SYNCPAY_CONFIG.planos.map(p => p.id) : 'Nenhum');
                
                // Verificar se os botões realmente existem no DOM
                const buttons = ['#btn-1-mes', '#btn-3-meses', '#btn-6-meses'];
                buttons.forEach(btnId => {
                    const btn = document.querySelector(btnId);
                    if (btn) {
                        console.log(`✅ Botão ${btnId} encontrado no DOM`);
                    } else {
                        console.warn(`⚠️ Botão ${btnId} NÃO encontrado no DOM`);
                    }
                });
            } else {
                console.log('⏳ Aguardando configurações carregar...');
                console.log('📊 Estado atual:', {
                    SYNCPAY_CONFIG: !!window.SYNCPAY_CONFIG,
                    plans: window.SYNCPAY_CONFIG ? !!window.SYNCPAY_CONFIG.plans : false,
                    planos: window.SYNCPAY_CONFIG ? !!window.SYNCPAY_CONFIG.planos : false,
                    plans_keys: window.SYNCPAY_CONFIG && window.SYNCPAY_CONFIG.plans ? Object.keys(window.SYNCPAY_CONFIG.plans).length : 0,
                    planos_length: window.SYNCPAY_CONFIG && window.SYNCPAY_CONFIG.planos ? window.SYNCPAY_CONFIG.planos.length : 0
                });
                setTimeout(waitForConfigAndAttach, 200);
            }
        }
        
        waitForConfigAndAttach();
    });
})(jQuery);
