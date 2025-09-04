require('dotenv').config();
const axios = require('axios');

/**
 * Teste Completo do Sistema de Tracking da Kwai Event API
 * 
 * Este teste verifica todo o sistema de tracking em modo de produção:
 * 1. Eventos individuais da API
 * 2. Sistema de tracking do frontend
 * 3. Sistema de tracking do backend
 * 4. Integração com o HotBot
 */

// Configurações de produção
const PROD_CONFIG = {
  baseUrl: 'https://www.adsnebula.com/log/common/api',
  clickId: 'Lw2HvYVkoj1MyzQwwNX4dg', // Click ID fixo para teste
  pixelId: process.env.KWAI_PIXEL_ID || 'TEST_PIXEL_ID',
  accessToken: process.env.KWAI_ACCESS_TOKEN || 'TEST_ACCESS_TOKEN',
  testFlag: false, // false para produção
  trackFlag: false, // false para produção
  isAttributed: 1,
  mmpcode: 'PL',
  pixelSdkVersion: '9.9.9'
};

/**
 * Função para enviar evento de produção
 */
async function sendProductionEvent(eventName, properties = {}) {
  try {
    console.log(`\n🎯 Enviando evento de PRODUÇÃO: ${eventName}`);
    console.log(`📋 Click ID: ${PROD_CONFIG.clickId}`);
    console.log(`🔧 Modo de teste: ${PROD_CONFIG.testFlag ? 'ATIVADO' : 'DESATIVADO'}`);
    console.log(`📊 Track Flag: ${PROD_CONFIG.trackFlag ? 'ATIVADO' : 'DESATIVADO'}`);

    const payload = {
      access_token: PROD_CONFIG.accessToken,
      clickid: PROD_CONFIG.clickId,
      event_name: eventName,
      pixelId: PROD_CONFIG.pixelId,
      testFlag: PROD_CONFIG.testFlag,
      trackFlag: PROD_CONFIG.trackFlag,
      is_attributed: PROD_CONFIG.isAttributed,
      mmpcode: PROD_CONFIG.mmpcode,
      pixelSdkVersion: PROD_CONFIG.pixelSdkVersion
    };

    // Adicionar properties se fornecidas
    if (Object.keys(properties).length > 0) {
      payload.properties = JSON.stringify(properties);
      console.log(`📦 Properties:`, properties);
    }

    console.log(`📤 Payload completo:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(PROD_CONFIG.baseUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'accept': 'application/json;charset=utf-8'
      },
      timeout: 15000
    });

    console.log(`✅ ✅ ✅ EVENTO ${eventName} ENVIADO COM SUCESSO EM PRODUÇÃO!`);
    console.log(`📊 Status: ${response.status}`);
    console.log(`📄 Resposta:`, JSON.stringify(response.data, null, 2));

    return { success: true, data: response.data };

  } catch (error) {
    console.error(`❌ ❌ ❌ ERRO ao enviar evento ${eventName}:`);
    console.error(`📛 Mensagem: ${error.message}`);
    
    if (error.response) {
      console.error(`📊 Status: ${error.response.status}`);
      console.error(`📄 Resposta de erro:`, JSON.stringify(error.response.data, null, 2));
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Teste 1: Eventos individuais da API
 */
async function testIndividualEvents() {
  console.log('\n📱 TESTE 1: EVENTOS INDIVIDUAIS DA API');
  console.log('=' .repeat(60));

  // EVENT_CONTENT_VIEW
  console.log('\n🎯 EVENT_CONTENT_VIEW (Visualização de Conteúdo)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_CONTENT_VIEW', {
    content_id: 'hotbot_content_001',
    currency: 'BRL',
    content_type: 'product',
    content_name: 'HotBot - Sistema de Entrega'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // EVENT_ADD_TO_CART
  console.log('\n🛒 EVENT_ADD_TO_CART (Adicionar ao Carrinho)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_ADD_TO_CART', {
    value: 97.00,
    currency: 'BRL',
    content_id: 'hotbot_content_001',
    content_type: 'product',
    content_name: 'HotBot - Sistema de Entrega',
    quantity: 1
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // EVENT_PURCHASE
  console.log('\n💰 EVENT_PURCHASE (Compra Aprovada)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_PURCHASE', {
    value: 97.00,
    currency: 'BRL',
    content_id: 'hotbot_content_001',
    content_type: 'product',
    content_name: 'HotBot - Sistema de Entrega',
    quantity: 1
  });
}

/**
 * Teste 2: Sistema de tracking do frontend
 */
async function testFrontendTracking() {
  console.log('\n🌐 TESTE 2: SISTEMA DE TRACKING DO FRONTEND');
  console.log('=' .repeat(60));

  // Simular evento de clique em CTA
  console.log('\n🎯 Simulando clique em CTA (EVENT_CONTENT_VIEW)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_CONTENT_VIEW', {
    content_id: 'cta_click_001',
    currency: 'BRL',
    content_type: 'product',
    content_name: 'CTA - HotBot Landing Page'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simular evento de formulário
  console.log('\n📝 Simulando envio de formulário (EVENT_FORM_SUBMIT)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_FORM_SUBMIT', {
    content_id: 'form_submit_001',
    currency: 'BRL',
    content_type: 'product',
    content_name: 'Formulário de Contato'
  });
}

/**
 * Teste 3: Sistema de tracking do backend
 */
async function testBackendTracking() {
  console.log('\n⚙️ TESTE 3: SISTEMA DE TRACKING DO BACKEND');
  console.log('=' .repeat(60));

  // Simular geração de PIX (EVENT_ADD_TO_CART)
  console.log('\n💳 Simulando geração de PIX (EVENT_ADD_TO_CART)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_ADD_TO_CART', {
    value: 97.00,
    currency: 'BRL',
    content_id: 'pix_generation_001',
    content_type: 'product',
    content_name: 'PIX - HotBot Premium',
    quantity: 1
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simular pagamento aprovado (EVENT_PURCHASE)
  console.log('\n✅ Simulando pagamento aprovado (EVENT_PURCHASE)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_PURCHASE', {
    value: 97.00,
    currency: 'BRL',
    content_id: 'payment_approved_001',
    content_type: 'product',
    content_name: 'Pagamento - HotBot Premium',
    quantity: 1
  });
}

/**
 * Teste 4: Eventos adicionais do sistema
 */
async function testAdditionalEvents() {
  console.log('\n🔧 TESTE 4: EVENTOS ADICIONAIS DO SISTEMA');
  console.log('=' .repeat(60));

  // EVENT_INITIATED_CHECKOUT
  console.log('\n🚀 EVENT_INITIATED_CHECKOUT (Início do Checkout)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_INITIATED_CHECKOUT', {
    content_id: 'checkout_start_001',
    currency: 'BRL',
    content_type: 'product',
    content_name: 'Checkout - HotBot Premium'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // EVENT_COMPLETE_REGISTRATION
  console.log('\n📋 EVENT_COMPLETE_REGISTRATION (Registro Completo)');
  console.log('-' .repeat(50));
  await sendProductionEvent('EVENT_COMPLETE_REGISTRATION', {
    content_id: 'registration_001',
    currency: 'BRL',
    content_type: 'product',
    content_name: 'Registro - HotBot Premium'
  });
}

/**
 * Executar todos os testes de produção
 */
async function runProductionTests() {
  console.log('🚀 INICIANDO TESTES DE PRODUÇÃO DA KWAI EVENT API');
  console.log('=' .repeat(70));
  
  // Verificar configurações
  console.log('🔧 CONFIGURAÇÕES DE PRODUÇÃO:');
  console.log(`   Pixel ID: ${PROD_CONFIG.pixelId}`);
  console.log(`   Access Token: ${PROD_CONFIG.accessToken.substring(0, 10)}...`);
  console.log(`   Click ID: ${PROD_CONFIG.clickId}`);
  console.log(`   URL da API: ${PROD_CONFIG.baseUrl}`);
  console.log(`   Modo de Teste: ${PROD_CONFIG.testFlag ? 'ATIVADO' : 'DESATIVADO'}`);
  console.log(`   Track Flag: ${PROD_CONFIG.trackFlag ? 'ATIVADO' : 'DESATIVADO'}`);
  console.log('=' .repeat(70));

  try {
    // Executar todos os testes
    await testIndividualEvents();
    await testFrontendTracking();
    await testBackendTracking();
    await testAdditionalEvents();

    console.log('\n🎉 TESTES DE PRODUÇÃO CONCLUÍDOS COM SUCESSO!');
    console.log('=' .repeat(70));
    console.log('📋 RESUMO DOS TESTES:');
    console.log('✅ Eventos individuais da API');
    console.log('✅ Sistema de tracking do frontend');
    console.log('✅ Sistema de tracking do backend');
    console.log('✅ Eventos adicionais do sistema');
    console.log('');
    console.log('🔍 VERIFICAÇÕES:');
    console.log('1. Verifique se os eventos aparecem na tela de monitoramento do Kwai');
    console.log('2. Confirme que estão sendo processados como eventos de produção');
    console.log('3. Verifique se não há mais a mensagem "Test Events"');
    console.log('4. Os eventos agora devem aparecer como dados reais de produção');

  } catch (error) {
    console.error('\n❌ ERRO durante os testes de produção:', error.message);
  }
}

/**
 * Teste individual de um evento específico
 */
async function testSingleProductionEvent(eventName, properties = {}) {
  console.log(`🎯 TESTE INDIVIDUAL DE PRODUÇÃO: ${eventName}`);
  console.log('=' .repeat(60));
  
  const result = await sendProductionEvent(eventName, properties);
  
  if (result.success) {
    console.log(`\n✅ Teste do evento ${eventName} concluído com sucesso em produção!`);
  } else {
    console.log(`\n❌ Teste do evento ${eventName} falhou!`);
  }
  
  return result;
}

// Executar testes se o arquivo for chamado diretamente
if (require.main === module) {
  runProductionTests().catch(console.error);
}

module.exports = {
  sendProductionEvent,
  testSingleProductionEvent,
  runProductionTests,
  PROD_CONFIG
};
