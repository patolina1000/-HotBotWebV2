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

            const plans = window.SYNCPAY_CONFIG.plans;
            const plan = plans && plans[planKey];
            
            console.log('🔍 [DEBUG] Procurando plano:', planKey);
            console.log('📋 [DEBUG] Planos disponíveis:', plans);
            console.log('✅ [DEBUG] Plano encontrado:', plan);
            
            if (!plan) {
                alert(`Plano '${planKey}' não encontrado. Planos disponíveis: ${Object.keys(plans || {}).join(', ')}`);
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
                
                // Validar se o amount está definido
                if (!plan.price || plan.price <= 0) {
                    throw new Error(`Valor do plano '${planKey}' não definido ou inválido: ${plan.price}`);
                }
                
                console.log('💰 [DEBUG] Criando transação PIX:', {
                    amount: plan.price,
                    description: plan.description,
                    planKey: planKey
                });
                
                const transaction = await paymentService.createPixTransaction(plan.price, plan.description, clientData);
                $(this).data('pixTransaction', transaction);
                
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
            if (window.SYNCPAY_CONFIG && window.SYNCPAY_CONFIG.plans && Object.keys(window.SYNCPAY_CONFIG.plans).length > 0) {
                attachPlanHandler('#btn-1-mes', 'monthly');
                attachPlanHandler('#btn-3-meses', 'quarterly');
                attachPlanHandler('#btn-6-meses', 'semestrial');
                console.log('🔧 Handlers dos botões PIX configurados com integração universal');
                console.log('📋 Planos disponíveis:', Object.keys(window.SYNCPAY_CONFIG.plans));
            } else {
                console.log('⏳ Aguardando configurações carregar...');
                setTimeout(waitForConfigAndAttach, 200);
            }
        }
        
        waitForConfigAndAttach();
    });
})(jQuery);
