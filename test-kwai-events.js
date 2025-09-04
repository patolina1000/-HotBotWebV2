const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const axios = require('axios');

/**
 * Teste da API de Eventos do Kwai
 * 
 * Este teste verifica se os eventos estão sendo enviados corretamente para a Kwai Event API
 * usando o click_id fornecido: Lw2HvYVkoj1MyzQwwNX4dg
 */

// Carregar variáveis de ambiente
require('dotenv').config();

// Debug das variáveis de ambiente
console.log('🔍 DEBUG - Variáveis de ambiente:');
console.log('   KWAI_PIXEL_ID:', process.env.KWAI_PIXEL_ID);
console.log('   KWAI_ACCESS_TOKEN:', process.env.KWAI_ACCESS_TOKEN ? process.env.KWAI_ACCESS_TOKEN.substring(0, 10) + '...' : 'undefined');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('');

// Configurações de teste
const TEST_CONFIG = {
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
 * Função para enviar evento de teste
 */
async function sendTestEvent(eventName, properties = {}) {
  try {
    console.log(`\n🎯 Enviando evento de teste: ${eventName}`);
    console.log(`📋 Click ID: ${TEST_CONFIG.clickId}`);
    console.log(`🔧 Modo de teste: ${TEST_CONFIG.testFlag ? 'ATIVADO' : 'DESATIVADO'}`);
    console.log(`📊 Track Flag: ${TEST_CONFIG.trackFlag ? 'ATIVADO' : 'DESATIVADO'}`);

    const payload = {
      access_token: TEST_CONFIG.accessToken,
      clickid: TEST_CONFIG.clickId,
      event_name: eventName,
      pixelId: TEST_CONFIG.pixelId,
      testFlag: TEST_CONFIG.testFlag,
      trackFlag: TEST_CONFIG.trackFlag,
      is_attributed: TEST_CONFIG.isAttributed,
      mmpcode: TEST_CONFIG.mmpcode,
      pixelSdkVersion: TEST_CONFIG.pixelSdkVersion
    };

    // Adicionar properties se fornecidas
    if (Object.keys(properties).length > 0) {
      payload.properties = JSON.stringify(properties);
      console.log(`📦 Properties:`, properties);
    }

    console.log(`📤 Payload completo:`, JSON.stringify(payload, null, 2));

          const response = await axios.post(TEST_CONFIG.baseUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json;charset=utf-8'
        },
        timeout: 15000
      });

    console.log(`✅ ✅ ✅ EVENTO ${eventName} ENVIADO COM SUCESSO!`);
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
 * Executar todos os testes
 */
async function runAllTests() {
  console.log('🚀 INICIANDO TESTES DA KWAI EVENT API');
  console.log('=' .repeat(60));
  
  // Verificar configurações
  console.log('🔧 CONFIGURAÇÕES DE TESTE:');
  console.log(`   Pixel ID: ${TEST_CONFIG.pixelId}`);
  console.log(`   Access Token: ${TEST_CONFIG.accessToken.substring(0, 10)}...`);
  console.log(`   Click ID: ${TEST_CONFIG.clickId}`);
  console.log(`   URL da API: ${TEST_CONFIG.baseUrl}`);
  console.log('=' .repeat(60));

  // Teste 1: EVENT_CONTENT_VIEW
  console.log('\n📱 TESTE 1: EVENT_CONTENT_VIEW');
  console.log('-' .repeat(40));
  await sendTestEvent('EVENT_CONTENT_VIEW', {
    content_id: 'test_content_001',
    currency: 'BRL'
  });

  // Aguardar 2 segundos entre testes
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Teste 2: EVENT_ADD_TO_CART
  console.log('\n🛒 TESTE 2: EVENT_ADD_TO_CART');
  console.log('-' .repeat(40));
  await sendTestEvent('EVENT_ADD_TO_CART', {
    value: 97.00,
    currency: 'BRL',
    content_id: 'test_content_001'
  });

  // Aguardar 2 segundos entre testes
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Teste 3: EVENT_PURCHASE
  console.log('\n💰 TESTE 3: EVENT_PURCHASE');
  console.log('-' .repeat(40));
  await sendTestEvent('EVENT_PURCHASE', {
    value: 97.00,
    currency: 'BRL',
    content_id: 'test_content_001'
  });

  console.log('\n🎉 TESTES CONCLUÍDOS!');
  console.log('=' .repeat(60));
  console.log('📋 INSTRUÇÕES:');
  console.log('1. Verifique se os eventos aparecem na tela de monitoramento do Kwai');
  console.log('2. Se houver erros, verifique as configurações de ambiente');
  console.log('3. Para produção, altere testFlag e trackFlag para false');
  console.log('4. O click_id mudará a cada refresh da página');
}

/**
 * Teste individual de um evento específico
 */
async function testSingleEvent(eventName, properties = {}) {
  console.log(`🎯 TESTE INDIVIDUAL: ${eventName}`);
  console.log('=' .repeat(50));
  
  const result = await sendTestEvent(eventName, properties);
  
  if (result.success) {
    console.log(`\n✅ Teste do evento ${eventName} concluído com sucesso!`);
  } else {
    console.log(`\n❌ Teste do evento ${eventName} falhou!`);
  }
  
  return result;
}

// Executar testes se o arquivo for chamado diretamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  sendTestEvent,
  testSingleEvent,
  runAllTests,
  TEST_CONFIG
};
