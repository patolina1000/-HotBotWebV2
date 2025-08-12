const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

// Função para testar endpoint
async function testEndpoint(method, endpoint, data = null) {
  try {
    console.log(`\n🧪 Testando ${method} ${endpoint}...`);
    
    let response;
    if (method === 'GET') {
      response = await axios.get(`${BASE_URL}${endpoint}`);
    } else if (method === 'POST') {
      response = await axios.post(`${BASE_URL}${endpoint}`, data);
    }
    
    console.log(`✅ Sucesso:`, response.data);
    return true;
  } catch (error) {
    console.log(`❌ Erro:`, error.response?.data || error.message);
    return false;
  }
}

// Função para aguardar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Testes principais
async function runTests() {
  console.log('🚀 Iniciando testes do Google Sheets Tracker...\n');
  
  // Teste 1: Status do sistema
  await testEndpoint('GET', '/status');
  
  // Teste 2: Ajuda
  await testEndpoint('GET', '/');
  
  // Teste 3: Registrar evento welcome
  await testEndpoint('POST', '/registrar-evento', { evento: 'welcome' });
  
  // Teste 4: Registrar evento cta_click
  await testEndpoint('POST', '/registrar-evento', { evento: 'cta_click' });
  
  // Teste 5: Registrar evento botstart
  await testEndpoint('POST', '/registrar-evento', { evento: 'botstart' });
  
  // Teste 6: Registrar evento pixgerado
  await testEndpoint('POST', '/registrar-evento', { evento: 'pixgerado' });
  
  // Teste 7: Registrar purchase
  await testEndpoint('POST', '/registrar-purchase', { oferta: 'Principal' });
  
  // Teste 8: Registrar purchase com oferta diferente
  await testEndpoint('POST', '/registrar-purchase', { oferta: 'DS1' });
  
  // Teste 9: Testar evento inválido
  await testEndpoint('POST', '/registrar-evento', { evento: 'evento_invalido' });
  
  // Teste 10: Testar sem campo obrigatório
  await testEndpoint('POST', '/registrar-evento', {});
  
  // Teste 11: Testar purchase sem oferta
  await testEndpoint('POST', '/registrar-purchase', {});
  
  console.log('\n🎯 Testes concluídos!');
  console.log('\n📊 Verifique sua planilha do Google Sheets para confirmar os registros.');
  console.log('🔗 URL da planilha: https://docs.google.com/spreadsheets/d/1SY_wan3SxwIs4Q58chDPp1HMmCCz4wEG3vIklv0QBXc');
}

// Executar testes se o arquivo for chamado diretamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testEndpoint };