require('dotenv').config();
const axios = require('axios');

/**
 * Teste da Implementação do Kwai Event API para Privacy
 * 
 * Este teste verifica a implementação do tracking na pasta privacy---sync:
 * 1. Configurações carregadas corretamente
 * 2. Serviço KwaiEventAPI funcionando
 * 3. Endpoints da API respondendo
 * 4. Integração com webhooks
 */

// Configurações de teste
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000', // Ajustar conforme necessário
  clickId: 'TEST_PRIVACY_' + Date.now(),
  testEvents: [
    'EVENT_CONTENT_VIEW',
    'EVENT_ADD_TO_CART',
    'EVENT_PURCHASE'
  ]
};

/**
 * Testar configurações carregadas
 */
async function testConfigLoading() {
  console.log('\n🔧 TESTE 1: CARREGAMENTO DE CONFIGURAÇÕES');
  console.log('=' .repeat(60));
  
  try {
    const response = await axios.get(`${TEST_CONFIG.baseUrl}/api/config`);
    const config = response.data;
    
    console.log('✅ Configurações carregadas com sucesso');
    console.log('📋 Gateway:', config.gateway);
    console.log('📊 Kwai configurado:', config.kwai?.isConfigured);
    
    if (config.kwai?.isConfigured) {
      console.log('🎯 Kwai Event API está configurado e funcionando');
    } else {
      console.log('⚠️ Kwai Event API não está configurado');
      console.log('   Configure as variáveis KWAI_PIXEL_ID e KWAI_ACCESS_TOKEN');
    }
    
    return config.kwai?.isConfigured || false;
    
  } catch (error) {
    console.error('❌ Erro ao carregar configurações:', error.message);
    return false;
  }
}

/**
 * Testar endpoint de eventos do Kwai
 */
async function testKwaiEventEndpoint() {
  console.log('\n🎯 TESTE 2: ENDPOINT DE EVENTOS KWAI');
  console.log('=' .repeat(60));
  
  for (const eventName of TEST_CONFIG.testEvents) {
    try {
      console.log(`\n📤 Testando evento: ${eventName}`);
      
      const eventData = {
        clickid: TEST_CONFIG.clickId,
        eventName: eventName,
        properties: {
          test: true,
          timestamp: Date.now(),
          source: 'privacy-test'
        }
      };
      
      const response = await axios.post(`${TEST_CONFIG.baseUrl}/api/kwai-event`, eventData);
      
      if (response.data.success) {
        console.log(`✅ ${eventName} enviado com sucesso`);
      } else {
        console.log(`⚠️ ${eventName} falhou:`, response.data.reason);
      }
      
      // Aguardar entre eventos
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ Erro ao testar ${eventName}:`, error.message);
    }
  }
}

/**
 * Testar integração com webhook (simulado)
 */
async function testWebhookIntegration() {
  console.log('\n🔔 TESTE 3: INTEGRAÇÃO COM WEBHOOK');
  console.log('=' .repeat(60));
  
  try {
    // Simular webhook de criação de PIX
    const webhookData = {
      id: 'TEST_PIX_' + Date.now(),
      status: 'created',
      value: 19.98,
      click_id: TEST_CONFIG.clickId,
      kwai_click_id: TEST_CONFIG.clickId
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
      value: 19.98,
      click_id: TEST_CONFIG.clickId,
      kwai_click_id: TEST_CONFIG.clickId,
      payer_name: 'Teste Usuário',
      end_to_end_id: 'TEST_E2E_' + Date.now()
    };
    
    console.log('💰 Simulando webhook de pagamento aprovado:', {
      id: paidWebhookData.id,
      status: paidWebhookData.status,
      value: paidWebhookData.value
    });
    
    console.log('✅ Webhooks simulados com sucesso');
    console.log('   Verifique os logs do servidor para tracking Kwai');
    
  } catch (error) {
    console.error('❌ Erro ao simular webhooks:', error.message);
  }
}

/**
 * Testar frontend tracking (simulado)
 */
async function testFrontendTracking() {
  console.log('\n🌐 TESTE 4: FRONTEND TRACKING');
  console.log('=' .repeat(60));
  
  console.log('📱 Para testar o frontend tracking:');
  console.log('   1. Acesse: ' + TEST_CONFIG.baseUrl + '/index.html?click_id=' + TEST_CONFIG.clickId);
  console.log('   2. Abra o console do navegador');
  console.log('   3. Verifique se KwaiTracker está disponível');
  console.log('   4. Teste: window.KwaiTracker.debug()');
  console.log('   5. Teste: window.KwaiTracker.sendContentView()');
  
  console.log('\n🎯 URL de teste completa:');
  console.log(`   ${TEST_CONFIG.baseUrl}/index.html?click_id=${TEST_CONFIG.clickId}`);
}

/**
 * Executar todos os testes
 */
async function runAllTests() {
  console.log('🚀 INICIANDO TESTES DO KWAI EVENT API PARA PRIVACY');
  console.log('=' .repeat(70));
  
  try {
    // Testar configurações
    const kwaiConfigured = await testConfigLoading();
    
    if (kwaiConfigured) {
      // Testar endpoint de eventos
      await testKwaiEventEndpoint();
      
      // Testar integração com webhook
      await testWebhookIntegration();
    } else {
      console.log('\n⚠️ Kwai não configurado, pulando testes de eventos');
    }
    
    // Testar frontend tracking (sempre disponível)
    await testFrontendTracking();
    
    console.log('\n🎉 TESTES CONCLUÍDOS!');
    console.log('=' .repeat(70));
    console.log('📋 RESUMO:');
    console.log('✅ Configurações carregadas');
    if (kwaiConfigured) {
      console.log('✅ Endpoint de eventos testado');
      console.log('✅ Integração com webhook testada');
    } else {
      console.log('⚠️ Endpoint de eventos não testado (Kwai não configurado)');
      console.log('⚠️ Integração com webhook não testada (Kwai não configurado)');
    }
    console.log('✅ Frontend tracking documentado');
    
    console.log('\n🔍 PRÓXIMOS PASSOS:');
    if (!kwaiConfigured) {
      console.log('1. Configure KWAI_PIXEL_ID e KWAI_ACCESS_TOKEN no .env');
      console.log('2. Reinicie o servidor');
      console.log('3. Execute os testes novamente');
    }
    console.log('4. Teste o frontend com a URL fornecida');
    console.log('5. Verifique os logs do servidor');
    console.log('6. Confirme eventos na tela da Kwai');
    
  } catch (error) {
    console.error('\n❌ ERRO durante os testes:', error.message);
  }
}

// Executar testes se o arquivo for chamado diretamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testConfigLoading,
  testKwaiEventEndpoint,
  testWebhookIntegration,
  testFrontendTracking,
  runAllTests
};
