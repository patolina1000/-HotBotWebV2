/**
 * DEBUG HELPER - Ferramenta de diagnóstico para problemas de pagamento PIX
 * Execute window.debugPIX() no console do navegador para diagnosticar problemas
 */

window.debugPIX = function() {
    console.log('🔧 =================================');
    console.log('🔧 PIX DEBUG HELPER - DIAGNÓSTICO');
    console.log('🔧 =================================');
    
    // 1. Verificar configurações carregadas
    console.log('\n📋 1. CONFIGURAÇÕES:');
    console.log('✅ window.SYNCPAY_CONFIG:', !!window.SYNCPAY_CONFIG);
    if (window.SYNCPAY_CONFIG) {
        console.log('  - client_id:', window.SYNCPAY_CONFIG.client_id || 'undefined');
        console.log('  - client_secret:', window.SYNCPAY_CONFIG.client_secret ? 'DEFINIDO' : 'undefined');
        console.log('  - plans:', Object.keys(window.SYNCPAY_CONFIG.plans || {}));
        
        // Verificar valores dos planos
        if (window.SYNCPAY_CONFIG.plans) {
            Object.keys(window.SYNCPAY_CONFIG.plans).forEach(key => {
                const plan = window.SYNCPAY_CONFIG.plans[key];
                console.log(`  - ${key}:`, {
                    price: plan.price,
                    price_type: typeof plan.price,
                    description: plan.description
                });
            });
        }
    }
    
    // 2. Verificar dependências JavaScript
    console.log('\n🔗 2. DEPENDÊNCIAS:');
    console.log('✅ jQuery:', typeof $ !== 'undefined');
    console.log('✅ SweetAlert:', typeof swal !== 'undefined');
    console.log('✅ UniversalPayment:', !!window.universalPayment);
    console.log('✅ SyncPay:', !!window.syncPay);
    
    // 3. Testar conectividade com API
    console.log('\n🌐 3. TESTANDO CONECTIVIDADE:');
    fetch('/api/config')
        .then(response => {
            console.log('✅ /api/config:', response.status, response.ok ? 'OK' : 'ERRO');
            return response.json();
        })
        .then(config => {
            console.log('📋 Configurações do servidor:', {
                gateway: config.gateway,
                syncpay_configured: !!(config.syncpay?.clientId && config.syncpay?.clientSecret),
                plans_count: Object.keys(config.plans || {}).length
            });
        })
        .catch(err => {
            console.error('❌ Erro ao testar /api/config:', err);
        });
        
    // 4. Verificar gateway de pagamento
    fetch('/api/gateways/current')
        .then(response => response.json())
        .then(data => {
            console.log('🏦 Gateway atual:', data.gateway);
        })
        .catch(err => {
            console.error('❌ Erro ao verificar gateway:', err);
        });
        
    console.log('\n🔧 =================================');
    console.log('🔧 Para testar um pagamento PIX:');
    console.log('🔧 window.testPIX()');
    console.log('🔧 =================================');
};

window.testPIX = function(planKey = 'monthly') {
    console.log(`🧪 Testando pagamento PIX para plano: ${planKey}`);
    
    if (!window.SYNCPAY_CONFIG || !window.SYNCPAY_CONFIG.plans) {
        console.error('❌ Configurações não carregadas');
        return;
    }
    
    const plan = window.SYNCPAY_CONFIG.plans[planKey];
    if (!plan) {
        console.error(`❌ Plano '${planKey}' não encontrado`);
        console.log('Planos disponíveis:', Object.keys(window.SYNCPAY_CONFIG.plans));
        return;
    }
    
    console.log('📋 Dados do plano:', plan);
    
    // Simular criação de pagamento
    if (window.universalPayment || window.syncPay) {
        const paymentService = window.universalPayment || window.syncPay;
        
        const clientData = {
            name: 'Cliente Teste',
            cpf: '12345678901',
            email: 'teste@exemplo.com',
            phone: '11999999999'
        };
        
        console.log('🚀 Iniciando teste de pagamento...');
        paymentService.createPixTransaction(plan.price, plan.description, clientData)
            .then(transaction => {
                console.log('✅ Pagamento teste criado:', transaction);
            })
            .catch(error => {
                console.error('❌ Erro no teste de pagamento:', error);
            });
    } else {
        console.error('❌ Serviço de pagamento não disponível');
    }
};

// Auto-executar diagnóstico básico quando o arquivo for carregado
setTimeout(() => {
    console.log('🔧 Debug Helper carregado. Execute window.debugPIX() para diagnóstico completo.');
}, 1000);
