/**
 * 🧪 Script de Teste para Eventos Kwai
 * 
 * Este script permite testar os eventos Kwai diretamente no seu funil real
 * usando o click_id de teste fornecido pela Kwai.
 * 
 * Como usar:
 * 1. Execute: node test-kwai-events.js
 * 2. Os eventos serão enviados com trackFlag=true
 * 3. Verifique no painel da Kwai se os eventos apareceram
 */

const axios = require('axios');

// Configuração
const BASE_URL = 'http://localhost:3000'; // Ajuste se necessário
const TEST_CLICK_ID = 'Z8bBwHufPMow60mxkUiEkA';

// Cores para console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEvent(endpoint, eventName, data = {}) {
  try {
    log(`\n🧪 Testando ${eventName}...`, 'blue');
    
    const response = await axios.post(`${BASE_URL}${endpoint}`, data, {
      timeout: 10000
    });
    
    if (response.data.success) {
      log(`✅ ${eventName} - SUCESSO`, 'green');
      log(`   Resposta: ${JSON.stringify(response.data.result, null, 2)}`, 'green');
      return true;
    } else {
      log(`❌ ${eventName} - FALHOU`, 'red');
      log(`   Erro: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ ${eventName} - ERRO`, 'red');
    log(`   Erro: ${error.message}`, 'red');
    if (error.response?.data) {
      log(`   Resposta: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    return false;
  }
}

async function testAllEvents() {
  log('🚀 Iniciando testes dos eventos Kwai...', 'bold');
  log(`📡 URL Base: ${BASE_URL}`, 'yellow');
  log(`🎯 Click ID de Teste: ${TEST_CLICK_ID}`, 'yellow');
  
  const results = {
    contentView: false,
    addToCart: false,
    purchase: false
  };
  
  // Teste 1: Content View
  results.contentView = await testEvent('/api/kwai-test/content-view', 'EVENT_CONTENT_VIEW', {
    content_id: 'test_page_' + Date.now(),
    content_name: 'Página de Teste - Funil Real',
    content_category: 'checkout'
  });
  
  // Aguardar 2 segundos
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Teste 2: Add to Cart
  results.addToCart = await testEvent('/api/kwai-test/add-to-cart', 'EVENT_ADD_TO_CART', {
    content_id: 'test_product_' + Date.now(),
    content_name: 'Produto de Teste - Funil Real',
    value: 29.90,
    quantity: 1
  });
  
  // Aguardar 2 segundos
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Teste 3: Purchase
  results.purchase = await testEvent('/api/kwai-test/purchase', 'EVENT_PURCHASE', {
    content_id: 'test_purchase_' + Date.now(),
    content_name: 'Compra de Teste - Funil Real',
    value: 29.90,
    quantity: 1
  });
  
  // Resumo
  log('\n📊 RESUMO DOS TESTES:', 'bold');
  log(`EVENT_CONTENT_VIEW: ${results.contentView ? '✅ SUCESSO' : '❌ FALHOU'}`, results.contentView ? 'green' : 'red');
  log(`EVENT_ADD_TO_CART: ${results.addToCart ? '✅ SUCESSO' : '❌ FALHOU'}`, results.addToCart ? 'green' : 'red');
  log(`EVENT_PURCHASE: ${results.purchase ? '✅ SUCESSO' : '❌ FALHOU'}`, results.purchase ? 'green' : 'red');
  
  const successCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  log(`\n🎯 Resultado Final: ${successCount}/${totalCount} eventos enviados com sucesso`, 
      successCount === totalCount ? 'green' : 'yellow');
  
  if (successCount === totalCount) {
    log('\n🎉 Todos os eventos foram enviados! Verifique no painel da Kwai se apareceram.', 'green');
    log('📋 Lembre-se: Os eventos aparecem com trackFlag=true (modo de teste)', 'yellow');
  } else {
    log('\n⚠️ Alguns eventos falharam. Verifique os logs acima para mais detalhes.', 'red');
  }
}

// Executar testes
if (require.main === module) {
  testAllEvents().catch(error => {
    log(`\n💥 Erro fatal: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { testAllEvents, testEvent };
