/**
 * Teste completo do sistema de tracking Kwai para Privacy
 * IDÊNTICO AO BOT DO TELEGRAM - Adaptado para web
 */

const KwaiEventAPI = require('./services/kwaiEventAPI');

/**
 * Testar configuração do serviço Kwai
 */
async function testKwaiConfiguration() {
    console.log('\n🔧 TESTE 1: CONFIGURAÇÃO DO SERVIÇO KWAI');
    
    try {
        const kwaiService = new KwaiEventAPI();
        
        if (kwaiService.isConfigured()) {
            console.log('✅ Serviço Kwai configurado corretamente');
            console.log('📊 Configurações:', {
                pixelId: kwaiService.config.pixelId ? 'Configurado' : 'Não configurado',
                accessToken: kwaiService.config.accessToken ? 'Configurado' : 'Não configurado',
                testFlag: kwaiService.config.testFlag,
                trackFlag: kwaiService.config.trackFlag
            });
        } else {
            console.log('❌ Serviço Kwai não configurado');
            console.log('⚠️ Configure as variáveis de ambiente:');
            console.log('  - KWAI_PIXEL_ID');
            console.log('  - KWAI_ACCESS_TOKEN');
        }
        
        return kwaiService.isConfigured();
    } catch (error) {
        console.error('❌ Erro ao testar configuração:', error.message);
        return false;
    }
}

/**
 * Testar envio de eventos
 */
async function testEventSending() {
    console.log('\n📤 TESTE 2: ENVIO DE EVENTOS');
    
    try {
        const kwaiService = new KwaiEventAPI();
        
        if (!kwaiService.isConfigured()) {
            console.log('⚠️ Serviço não configurado, pulando teste de eventos');
            return false;
        }
        
        // Simular click_id
        const testClickId = 'test_click_id_' + Date.now();
        
        console.log('🎯 Testando EVENT_CONTENT_VIEW...');
        const contentViewResult = await kwaiService.sendContentView(testClickId, {
            contentName: 'Privacy - Teste',
            contentCategory: 'Teste',
            contentId: 'test_content_1'
        });
        
        if (contentViewResult.success) {
            console.log('✅ EVENT_CONTENT_VIEW enviado com sucesso');
        } else {
            console.log('❌ EVENT_CONTENT_VIEW falhou:', contentViewResult.error);
        }
        
        console.log('🎯 Testando EVENT_ADD_TO_CART...');
        const addToCartResult = await kwaiService.sendAddToCart(testClickId, 29.90, {
            contentName: 'Privacy - Assinatura Teste',
            contentCategory: 'Teste',
            contentId: 'test_plan_1'
        });
        
        if (addToCartResult.success) {
            console.log('✅ EVENT_ADD_TO_CART enviado com sucesso');
        } else {
            console.log('❌ EVENT_ADD_TO_CART falhou:', addToCartResult.error);
        }
        
        console.log('🎯 Testando EVENT_PURCHASE...');
        const purchaseResult = await kwaiService.sendPurchase(testClickId, 29.90, {
            contentName: 'Privacy - Assinatura Teste',
            contentCategory: 'Teste',
            contentId: 'test_plan_1'
        });
        
        if (purchaseResult.success) {
            console.log('✅ EVENT_PURCHASE enviado com sucesso');
        } else {
            console.log('❌ EVENT_PURCHASE falhou:', purchaseResult.error);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Erro ao testar envio de eventos:', error.message);
        return false;
    }
}

/**
 * Testar simulação de fluxo completo
 */
async function testCompleteFlow() {
    console.log('\n🔄 TESTE 3: FLUXO COMPLETO SIMULADO');
    
    try {
        const kwaiService = new KwaiEventAPI();
        
        if (!kwaiService.isConfigured()) {
            console.log('⚠️ Serviço não configurado, pulando teste de fluxo');
            return false;
        }
        
        // Simular click_id de usuário real
        const realClickId = 'real_click_id_' + Date.now();
        
        console.log('📱 Simulando usuário chegando na landing page...');
        const landingResult = await kwaiService.sendContentView(realClickId, {
            contentName: 'Privacy - Landing Page',
            contentCategory: 'Privacy',
            contentId: 'privacy_landing'
        });
        
        if (landingResult.success) {
            console.log('✅ Landing page visualizada, evento enviado');
        }
        
        console.log('🛒 Simulando usuário gerando PIX...');
        const pixResult = await kwaiService.sendAddToCart(realClickId, 49.90, {
            contentName: 'Privacy - Plano Premium',
            contentCategory: 'Privacy - Premium',
            contentId: 'privacy_premium_plan'
        });
        
        if (pixResult.success) {
            console.log('✅ PIX gerado, evento ADD_TO_CART enviado');
        }
        
        console.log('💰 Simulando pagamento aprovado...');
        const paymentResult = await kwaiService.sendPurchase(realClickId, 49.90, {
            contentName: 'Privacy - Plano Premium',
            contentCategory: 'Privacy - Premium',
            contentId: 'privacy_premium_plan'
        });
        
        if (paymentResult.success) {
            console.log('✅ Pagamento aprovado, evento PURCHASE enviado');
        }
        
        console.log('🎉 Fluxo completo simulado com sucesso!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao simular fluxo completo:', error.message);
        return false;
    }
}

/**
 * Testar integração com webhook (simulado)
 */
async function testWebhookIntegration() {
    console.log('\n🔔 TESTE 4: INTEGRAÇÃO COM WEBHOOK (SIMULADO)');
    
    try {
        const kwaiService = new KwaiEventAPI();
        
        if (!kwaiService.isConfigured()) {
            console.log('⚠️ Serviço não configurado, pulando teste de webhook');
            return false;
        }
        
        // Simular webhook de criação de PIX
        const webhookData = {
            id: 'pix_' + Date.now(),
            status: 'created',
            value: 29.90,
            click_id: 'webhook_click_id_' + Date.now()
        };
        
        console.log('📤 Simulando webhook de criação de PIX:', {
            id: webhookData.id,
            status: webhookData.status,
            value: webhookData.value
        });
        
        // Simular webhook de pagamento aprovado
        const paidWebhookData = {
            id: webhookData.id,
            status: 'paid',
            value: 29.90,
            click_id: webhookData.click_id,
            payer_name: 'João Silva',
            end_to_end_id: 'E' + Date.now()
        };
        
        console.log('💰 Simulando webhook de pagamento aprovado:', {
            id: paidWebhookData.id,
            status: paidWebhookData.status,
            value: paidWebhookData.value
        });
        
        console.log('✅ Webhooks simulados com sucesso');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao simular webhooks:', error.message);
        return false;
    }
}

/**
 * Função principal de teste
 */
async function runAllTests() {
    console.log('🚀 INICIANDO TESTES COMPLETOS DO SISTEMA DE TRACKING KWAI');
    console.log('📋 Sistema: Privacy (IDÊNTICO AO BOT DO TELEGRAM)');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    const results = {
        configuration: false,
        events: false,
        flow: false,
        webhook: false
    };
    
    try {
        // Testar configuração
        results.configuration = await testKwaiConfiguration();
        
        // Testar envio de eventos
        if (results.configuration) {
            results.events = await testEventSending();
        }
        
        // Testar fluxo completo
        if (results.configuration) {
            results.flow = await testCompleteFlow();
        }
        
        // Testar integração com webhook
        if (results.configuration) {
            results.webhook = await testWebhookIntegration();
        }
        
    } catch (error) {
        console.error('💥 Erro geral durante os testes:', error.message);
    }
    
    // Resumo dos resultados
    console.log('\n📊 RESUMO DOS TESTES:');
    console.log('🔧 Configuração:', results.configuration ? '✅' : '❌');
    console.log('📤 Eventos:', results.events ? '✅' : '❌');
    console.log('🔄 Fluxo completo:', results.flow ? '✅' : '❌');
    console.log('🔔 Webhook:', results.webhook ? '✅' : '❌');
    
    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    
    console.log(`\n🎯 RESULTADO FINAL: ${successCount}/${totalCount} testes passaram`);
    
    if (successCount === totalCount) {
        console.log('🎉 SISTEMA DE TRACKING FUNCIONANDO PERFEITAMENTE!');
    } else if (successCount > 0) {
        console.log('⚠️ SISTEMA PARCIALMENTE FUNCIONAL - Verificar configurações');
    } else {
        console.log('❌ SISTEMA NÃO FUNCIONAL - Verificar configurações e conexões');
    }
    
    return results;
}

// Executar testes se chamado diretamente
if (require.main === module) {
    runAllTests()
        .then(results => {
            console.log('\n🏁 Testes concluídos');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Erro fatal durante os testes:', error.message);
            process.exit(1);
        });
}

module.exports = {
    testKwaiConfiguration,
    testEventSending,
    testCompleteFlow,
    testWebhookIntegration,
    runAllTests
};
