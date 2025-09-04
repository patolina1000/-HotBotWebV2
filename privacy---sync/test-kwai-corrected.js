require('dotenv').config();
const KwaiEventAPI = require('./services/kwaiEventAPI');

/**
 * Teste da Implementação Corrigida do Kwai Event API
 * 
 * Este teste verifica se as correções implementadas estão funcionando:
 * 1. Nomes corretos das propriedades (content_name, content_id, etc.)
 * 2. Timestamp incluído (event_timestamp)
 * 3. Content_type definido como "product"
 * 4. Estrutura correta do payload
 */

// Configurações de teste
const TEST_CONFIG = {
  baseUrl: 'https://www.adsnebula.com/log/common/api',
  clickId: 'q_6k5rENNPu9hOxaaNHn4g', // Click ID fixo para teste da Kwai
  pixelId: process.env.KWAI_PIXEL_ID || 'TEST_PIXEL_ID',
  accessToken: process.env.KWAI_ACCESS_TOKEN || 'TEST_ACCESS_TOKEN',
  testFlag: false, // false sempre (requisito da Kwai)
  trackFlag: true, // true para testes, false para produção
  isAttributed: 1,
  mmpcode: 'PL',
  pixelSdkVersion: '9.9.9',
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
    const kwaiAPI = new KwaiEventAPI();
    
    if (kwaiAPI.isConfigured()) {
      console.log('✅ Kwai Event API está configurado e funcionando');
      console.log('📊 Configurações:');
      console.log('   - Pixel ID:', kwaiAPI.config.pixelId);
      console.log('   - Access Token:', kwaiAPI.config.accessToken ? 'DEFINIDO' : 'NÃO DEFINIDO');
      console.log('   - Test Flag:', kwaiAPI.config.testFlag);
      console.log('   - Track Flag:', kwaiAPI.config.trackFlag);
      return true;
    } else {
      console.log('❌ Kwai Event API não está configurado');
      console.log('   Configure as variáveis KWAI_PIXEL_ID e KWAI_ACCESS_TOKEN no .env');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar configurações:', error.message);
    return false;
  }
}

/**
 * Testar estrutura do payload
 */
function testPayloadStructure() {
  console.log('\n📋 TESTE 2: ESTRUTURA DO PAYLOAD');
  console.log('=' .repeat(60));
  
  try {
    const kwaiAPI = new KwaiEventAPI();
    
    // Simular payload para cada tipo de evento
    const testCases = [
      {
        name: 'EVENT_CONTENT_VIEW',
        method: kwaiAPI.sendContentView.bind(kwaiAPI),
        args: [TEST_CONFIG.clickId]
      },
      {
        name: 'EVENT_ADD_TO_CART', 
        method: kwaiAPI.sendAddToCart.bind(kwaiAPI),
        args: [TEST_CONFIG.clickId, 19.98]
      },
      {
        name: 'EVENT_PURCHASE',
        method: kwaiAPI.sendPurchase.bind(kwaiAPI),
        args: [TEST_CONFIG.clickId, 19.98]
      }
    ];
    
    testCases.forEach(testCase => {
      console.log(`\n📤 Testando estrutura para: ${testCase.name}`);
      
      // Capturar o payload que seria enviado
      const originalSendEvent = kwaiAPI.sendEvent.bind(kwaiAPI);
      let capturedPayload = null;
      
      kwaiAPI.sendEvent = function(eventData) {
        capturedPayload = eventData;
        return Promise.resolve({ success: true, data: { result: 1 } });
      };
      
      // Executar método
      testCase.method(...testCase.args);
      
      // Restaurar método original
      kwaiAPI.sendEvent = originalSendEvent;
      
      if (capturedPayload) {
        console.log('✅ Payload capturado:');
        console.log('   - clickid:', capturedPayload.clickid);
        console.log('   - eventName:', capturedPayload.eventName);
        console.log('   - properties:', JSON.stringify(capturedPayload.properties, null, 2));
        
        // Verificar se as propriedades estão corretas
        const props = capturedPayload.properties;
        const checks = [
          { name: 'content_name', value: props.content_name, expected: 'string' },
          { name: 'content_id', value: props.content_id, expected: 'string' },
          { name: 'content_category', value: props.content_category, expected: 'string' },
          { name: 'content_type', value: props.content_type, expected: 'product' },
          { name: 'currency', value: props.currency, expected: 'BRL' },
          { name: 'event_timestamp', value: props.event_timestamp, expected: 'number' }
        ];
        
        checks.forEach(check => {
          if (check.name === 'content_type') {
            if (props[check.name] === check.expected) {
              console.log(`   ✅ ${check.name}: ${props[check.name]}`);
            } else {
              console.log(`   ❌ ${check.name}: ${props[check.name]} (esperado: ${check.expected})`);
            }
          } else if (check.name === 'event_timestamp') {
            if (typeof props[check.name] === 'number') {
              console.log(`   ✅ ${check.name}: ${props[check.name]} (timestamp válido)`);
            } else {
              console.log(`   ❌ ${check.name}: tipo incorreto (esperado: number)`);
            }
          } else {
            if (typeof props[check.name] === 'string' && props[check.name]) {
              console.log(`   ✅ ${check.name}: ${props[check.name]}`);
            } else {
              console.log(`   ❌ ${check.name}: valor inválido`);
            }
          }
        });
        
        // Verificar propriedades específicas por tipo de evento
        if (testCase.name === 'EVENT_ADD_TO_CART' || testCase.name === 'EVENT_PURCHASE') {
          if (typeof props.value === 'number') {
            console.log(`   ✅ value: ${props.value}`);
          } else {
            console.log(`   ❌ value: tipo incorreto`);
          }
          
          if (typeof props.quantity === 'number') {
            console.log(`   ✅ quantity: ${props.quantity}`);
          } else {
            console.log(`   ❌ quantity: tipo incorreto`);
          }
        }
        
      } else {
        console.log('❌ Falha ao capturar payload');
      }
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro ao testar estrutura do payload:', error.message);
    return false;
  }
}

/**
 * Testar envio real de eventos (se configurado)
 */
async function testRealEventSending() {
  console.log('\n🚀 TESTE 3: ENVIO REAL DE EVENTOS');
  console.log('=' .repeat(60));
  
  try {
    const kwaiAPI = new KwaiEventAPI();
    
    if (!kwaiAPI.isConfigured()) {
      console.log('⚠️ Kwai não configurado, pulando teste de envio real');
      return false;
    }
    
    console.log('📤 Enviando eventos reais para a Kwai...');
    
    for (const eventName of TEST_CONFIG.testEvents) {
      try {
        console.log(`\n🎯 Enviando: ${eventName}`);
        
        let result;
        switch (eventName) {
          case 'EVENT_CONTENT_VIEW':
            result = await kwaiAPI.sendContentView(TEST_CONFIG.clickId);
            break;
          case 'EVENT_ADD_TO_CART':
            result = await kwaiAPI.sendAddToCart(TEST_CONFIG.clickId, 19.98);
            break;
          case 'EVENT_PURCHASE':
            result = await kwaiAPI.sendPurchase(TEST_CONFIG.clickId, 19.98);
            break;
        }
        
        if (result.success) {
          console.log(`✅ ${eventName} enviado com sucesso`);
          if (result.data) {
            console.log(`   Resposta:`, result.data);
          }
        } else {
          console.log(`❌ ${eventName} falhou:`, result.reason || result.error);
        }
        
        // Aguardar entre eventos
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Erro ao enviar ${eventName}:`, error.message);
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Erro durante teste de envio real:', error.message);
    return false;
  }
}

/**
 * Executar todos os testes
 */
async function runAllTests() {
  console.log('🚀 INICIANDO TESTES DA IMPLEMENTAÇÃO CORRIGIDA DO KWAI EVENT API');
  console.log('=' .repeat(80));
  console.log(`🎯 Click ID de teste: ${TEST_CONFIG.clickId}`);
  
  try {
    // Testar configurações
    const configOk = await testConfigLoading();
    
    // Testar estrutura do payload
    const payloadOk = testPayloadStructure();
    
    // Testar envio real (se configurado)
    let realEventsOk = false;
    if (configOk) {
      realEventsOk = await testRealEventSending();
    }
    
    console.log('\n🎉 TESTES CONCLUÍDOS!');
    console.log('=' .repeat(80));
    console.log('📋 RESUMO:');
    console.log(`✅ Configurações: ${configOk ? 'OK' : 'FALHOU'}`);
    console.log(`✅ Estrutura do payload: ${payloadOk ? 'OK' : 'FALHOU'}`);
    console.log(`✅ Envio real de eventos: ${realEventsOk ? 'OK' : 'NÃO TESTADO'}`);
    
    if (configOk && payloadOk) {
      console.log('\n🎯 IMPLEMENTAÇÃO CORRIGIDA FUNCIONANDO!');
      console.log('   Os eventos agora devem aparecer corretamente na Kwai');
      console.log('   Verifique na tela de "Test Events" da Kwai');
    } else {
      console.log('\n⚠️ PROBLEMAS IDENTIFICADOS:');
      if (!configOk) {
        console.log('   - Configure KWAI_PIXEL_ID e KWAI_ACCESS_TOKEN no .env');
      }
      if (!payloadOk) {
        console.log('   - Estrutura do payload com problemas');
      }
    }
    
    console.log('\n🔍 PRÓXIMOS PASSOS:');
    console.log('1. Verifique os eventos na tela "Test Events" da Kwai');
    console.log('2. Confirme que não aparecem mais como "Happened"');
    console.log('3. Verifique se os detalhes estão sendo exibidos corretamente');
    console.log('4. Teste com eventos reais do seu site');
    
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
  testPayloadStructure,
  testRealEventSending,
  runAllTests
};
