#!/usr/bin/env node

/**
 * Teste do Sistema de Tracking de Cliques para Telegram
 * 
 * Este script testa o novo endpoint /go/telegram e verifica se os eventos
 * estão sendo registrados corretamente no sistema de funnel events.
 */

const http = require('http');

// Configuração
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PAYLOAD_ID = 'test_' + Date.now();

console.log('🧪 Testando Sistema de Tracking de Cliques para Telegram');
console.log('=' .repeat(60));
console.log(`📍 Base URL: ${BASE_URL}`);
console.log(`🔑 Test Payload ID: ${TEST_PAYLOAD_ID}`);
console.log('');

// Função para fazer requisições HTTP
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramTrackingTest/1.0'
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : null;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsed,
            raw: responseData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            raw: responseData,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Teste 1: Gerar payload
async function testGerarPayload() {
  console.log('📝 Teste 1: Gerando payload...');
  
  try {
    const response = await makeRequest('/api/gerar-payload', 'POST', {
      utm_source: 'teste',
      utm_medium: 'manual',
      utm_campaign: 'teste_telegram_tracking',
      utm_term: 'teste',
      utm_content: 'teste',
      fbp: 'fb.1.test.1234567890',
      fbc: 'fb.1.test.1234567890.1234567890',
      ip: '127.0.0.1',
      user_agent: 'TelegramTrackingTest/1.0'
    });

    if (response.statusCode === 200 && response.data?.payload_id) {
      console.log(`✅ Payload gerado com sucesso: ${response.data.payload_id}`);
      return response.data.payload_id;
    } else {
      console.log(`❌ Falha ao gerar payload:`, response);
      return null;
    }
  } catch (error) {
    console.log(`❌ Erro ao gerar payload:`, error.message);
    return null;
  }
}

// Teste 2: Testar endpoint /go/telegram com bot1
async function testGoTelegramBot1(payloadId) {
  console.log('\n🤖 Teste 2: Testando /go/telegram com bot1...');
  
  try {
    const response = await makeRequest(`/go/telegram?payload_id=${payloadId}&dest=bot1`);
    
    if (response.statusCode === 302) {
      const location = response.headers.location;
      console.log(`✅ Redirecionamento para bot1: ${location}`);
      
      if (location.includes('t.me/') && location.includes(payloadId)) {
        console.log('✅ URL do Telegram está correta');
      } else {
        console.log('⚠️ URL do Telegram pode estar incorreta');
      }
      
      return true;
    } else {
      console.log(`❌ Falha no redirecionamento:`, response);
      return false;
    }
  } catch (error) {
    console.log(`❌ Erro no teste /go/telegram:`, error.message);
    return false;
  }
}

// Teste 3: Testar endpoint /go/telegram com bot2
async function testGoTelegramBot2(payloadId) {
  console.log('\n🤖 Teste 3: Testando /go/telegram com bot2...');
  
  try {
    const response = await makeRequest(`/go/telegram?payload_id=${payloadId}&dest=bot2`);
    
    if (response.statusCode === 302) {
      const location = response.headers.location;
      console.log(`✅ Redirecionamento para bot2: ${location}`);
      
      if (location.includes('t.me/') && location.includes(payloadId)) {
        console.log('✅ URL do Telegram está correta');
      } else {
        console.log('⚠️ URL do Telegram pode estar incorreta');
      }
      
      return true;
    } else {
      console.log(`❌ Falha no redirecionamento:`, response);
      return false;
    }
  } catch (error) {
    console.log(`❌ Erro no teste /go/telegram:`, error.message);
    return false;
  }
}

// Teste 4: Verificar eventos registrados
async function testVerificarEventos(payloadId) {
  console.log('\n📊 Teste 4: Verificando eventos registrados...');
  
  try {
    // Aguardar um pouco para os eventos serem processados
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await makeRequest(`/api/funnel-events?payload_id=${payloadId}`);
    
    if (response.statusCode === 200 && response.data) {
      console.log(`✅ Eventos encontrados: ${response.data.length || 0}`);
      
      if (response.data.length > 0) {
        response.data.forEach((event, index) => {
          console.log(`  ${index + 1}. ${event.event_name} (${event.bot}) - ${event.occurred_at}`);
          if (event.meta) {
            console.log(`     Meta: ${JSON.stringify(event.meta)}`);
          }
        });
      }
      
      return true;
    } else {
      console.log(`❌ Falha ao buscar eventos:`, response);
      return false;
    }
  } catch (error) {
    console.log(`❌ Erro ao verificar eventos:`, error.message);
    return false;
  }
}

// Teste 5: Testar validação de parâmetros
async function testValidacaoParametros() {
  console.log('\n🔍 Teste 5: Testando validação de parâmetros...');
  
  const testCases = [
    { name: 'Sem payload_id', query: '?dest=bot1', expectedStatus: 400 },
    { name: 'Sem dest', query: `?payload_id=${TEST_PAYLOAD_ID}`, expectedStatus: 400 },
    { name: 'Dest inválido', query: `?payload_id=${TEST_PAYLOAD_ID}&dest=bot3`, expectedStatus: 400 },
    { name: 'Parâmetros válidos', query: `?payload_id=${TEST_PAYLOAD_ID}&dest=bot1`, expectedStatus: 302 }
  ];
  
  let passed = 0;
  
  for (const testCase of testCases) {
    try {
      const response = await makeRequest(`/go/telegram${testCase.query}`);
      
      if (response.statusCode === testCase.expectedStatus) {
        console.log(`✅ ${testCase.name}: Status ${response.statusCode} (esperado)`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}: Status ${response.statusCode} (esperava ${testCase.expectedStatus})`);
      }
    } catch (error) {
      console.log(`❌ ${testCase.name}: Erro - ${error.message}`);
    }
  }
  
  console.log(`\n📈 Validação: ${passed}/${testCases.length} testes passaram`);
  return passed === testCases.length;
}

// Função principal de teste
async function runTests() {
  console.log('🚀 Iniciando testes...\n');
  
  try {
    // Teste 1: Gerar payload
    const payloadId = await testGerarPayload();
    if (!payloadId) {
      console.log('\n❌ Teste falhou: não foi possível gerar payload');
      return;
    }
    
    // Teste 2: Testar bot1
    const bot1Success = await testGoTelegramBot1(payloadId);
    
    // Teste 3: Testar bot2
    const bot2Success = await testGoTelegramBot2(payloadId);
    
    // Teste 4: Verificar eventos
    const eventosSuccess = await testVerificarEventos(payloadId);
    
    // Teste 5: Validação de parâmetros
    const validacaoSuccess = await testValidacaoParametros();
    
    // Resumo dos testes
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMO DOS TESTES');
    console.log('='.repeat(60));
    console.log(`🔑 Payload ID: ${payloadId}`);
    console.log(`🤖 Bot1: ${bot1Success ? '✅' : '❌'}`);
    console.log(`🤖 Bot2: ${bot2Success ? '✅' : '❌'}`);
    console.log(`📊 Eventos: ${eventosSuccess ? '✅' : '❌'}`);
    console.log(`🔍 Validação: ${validacaoSuccess ? '✅' : '❌'}`);
    
    const totalTests = 4;
    const passedTests = [bot1Success, bot2Success, eventosSuccess, validacaoSuccess].filter(Boolean).length;
    
    console.log(`\n📈 Resultado: ${passedTests}/${totalTests} testes passaram`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 Todos os testes passaram! Sistema funcionando perfeitamente.');
    } else {
      console.log('\n⚠️ Alguns testes falharam. Verifique os logs acima.');
    }
    
  } catch (error) {
    console.log('\n💥 Erro durante os testes:', error.message);
  }
}

// Executar testes se o script for chamado diretamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  runTests,
  testGerarPayload,
  testGoTelegramBot1,
  testGoTelegramBot2,
  testVerificarEventos,
  testValidacaoParametros
};
