// Script de teste para as APIs de logs
// Execute este script para verificar se tudo está funcionando

const fetch = require('node-fetch');

// Configuração
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = 'test-token-123';

// Cores para console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Função para testar endpoint
async function testEndpoint(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  
  // Adicionar parâmetros
  Object.keys(params).forEach(key => {
    url.searchParams.append(key, params[key]);
  });
  
  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      data: data
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      error: error.message
    };
  }
}

// Teste 1: API de logs sem token
async function testLogsWithoutToken() {
  log('\n🔍 Teste 1: API de logs sem token', 'blue');
  
  const result = await testEndpoint('/api/logs');
  
  if (!result.success && result.status === 401) {
    log('✅ Teste passou: API rejeitou requisição sem token', 'green');
  } else {
    log('❌ Teste falhou: API deveria rejeitar requisição sem token', 'red');
  }
  
  return result;
}

// Teste 2: API de logs com token
async function testLogsWithToken() {
  log('\n🔍 Teste 2: API de logs com token', 'blue');
  
  const result = await testEndpoint('/api/logs', {
    token: TEST_TOKEN,
    limit: 10,
    offset: 0
  });
  
  if (result.success) {
    log('✅ Teste passou: API retornou dados com token válido', 'green');
    log(`   Total de logs: ${result.data.total || 0}`, 'yellow');
    log(`   Logs retornados: ${result.data.logs?.length || 0}`, 'yellow');
  } else {
    log('❌ Teste falhou: API deveria retornar dados com token válido', 'red');
    log(`   Status: ${result.status}`, 'red');
    log(`   Erro: ${result.data?.error || result.error}`, 'red');
  }
  
  return result;
}

// Teste 3: API de estatísticas
async function testLogsStats() {
  log('\n🔍 Teste 3: API de estatísticas', 'blue');
  
  const result = await testEndpoint('/api/logs/stats', {
    token: TEST_TOKEN
  });
  
  if (result.success) {
    log('✅ Teste passou: API de estatísticas funcionando', 'green');
    log(`   Total de logs: ${result.data.totalLogs || 0}`, 'yellow');
    log(`   Erros: ${result.data.errorCount || 0}`, 'yellow');
    log(`   Warnings: ${result.data.warningCount || 0}`, 'yellow');
    log(`   Serviços ativos: ${result.data.activeServices || 0}`, 'yellow');
  } else {
    log('❌ Teste falhou: API de estatísticas não funcionou', 'red');
    log(`   Status: ${result.status}`, 'red');
    log(`   Erro: ${result.data?.error || result.error}`, 'red');
  }
  
  return result;
}

// Teste 4: API de exportação
async function testLogsExport() {
  log('\n🔍 Teste 4: API de exportação', 'blue');
  
  const result = await testEndpoint('/api/logs/export', {
    token: TEST_TOKEN,
    format: 'json'
  });
  
  if (result.success) {
    log('✅ Teste passou: API de exportação funcionando', 'green');
  } else {
    log('❌ Teste falhou: API de exportação não funcionou', 'red');
    log(`   Status: ${result.status}`, 'red');
    log(`   Erro: ${result.data?.error || result.error}`, 'red');
  }
  
  return result;
}

// Teste 5: Filtros de logs
async function testLogsFilters() {
  log('\n🔍 Teste 5: Filtros de logs', 'blue');
  
  const filters = {
    token: TEST_TOKEN,
    level: 'ERROR',
    limit: 5
  };
  
  const result = await testEndpoint('/api/logs', filters);
  
  if (result.success) {
    log('✅ Teste passou: Filtros funcionando', 'green');
    log(`   Logs filtrados: ${result.data.logs?.length || 0}`, 'yellow');
    
    // Verificar se todos os logs são do nível ERROR
    const allErrors = result.data.logs?.every(log => log.level === 'ERROR');
    if (allErrors) {
      log('✅ Filtro por nível funcionando corretamente', 'green');
    } else {
      log('⚠️ Filtro por nível pode ter problemas', 'yellow');
    }
  } else {
    log('❌ Teste falhou: Filtros não funcionaram', 'red');
  }
  
  return result;
}

// Teste 6: Paginação
async function testLogsPagination() {
  log('\n🔍 Teste 6: Paginação', 'blue');
  
  const page1 = await testEndpoint('/api/logs', {
    token: TEST_TOKEN,
    limit: 2,
    offset: 0
  });
  
  const page2 = await testEndpoint('/api/logs', {
    token: TEST_TOKEN,
    limit: 2,
    offset: 2
  });
  
  if (page1.success && page2.success) {
    log('✅ Teste passou: Paginação funcionando', 'green');
    log(`   Página 1: ${page1.data.logs?.length || 0} logs`, 'yellow');
    log(`   Página 2: ${page2.data.logs?.length || 0} logs`, 'yellow');
    
    // Verificar se os logs são diferentes
    const page1Ids = page1.data.logs?.map(log => log.id) || [];
    const page2Ids = page2.data.logs?.map(log => log.id) || [];
    const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
    
    if (!hasOverlap) {
      log('✅ Paginação sem sobreposição', 'green');
    } else {
      log('⚠️ Possível sobreposição na paginação', 'yellow');
    }
  } else {
    log('❌ Teste falhou: Paginação não funcionou', 'red');
  }
  
  return { page1, page2 };
}

// Teste 7: Performance
async function testPerformance() {
  log('\n🔍 Teste 7: Performance', 'blue');
  
  const startTime = Date.now();
  const result = await testEndpoint('/api/logs', {
    token: TEST_TOKEN,
    limit: 50
  });
  const endTime = Date.now();
  
  const responseTime = endTime - startTime;
  
  if (result.success) {
    log('✅ Teste passou: API respondendo', 'green');
    log(`   Tempo de resposta: ${responseTime}ms`, 'yellow');
    
    if (responseTime < 1000) {
      log('✅ Performance boa (< 1s)', 'green');
    } else if (responseTime < 3000) {
      log('⚠️ Performance aceitável (< 3s)', 'yellow');
    } else {
      log('❌ Performance ruim (> 3s)', 'red');
    }
  } else {
    log('❌ Teste falhou: API não respondeu', 'red');
  }
  
  return { result, responseTime };
}

// Executar todos os testes
async function runAllTests() {
  log('🚀 Iniciando testes das APIs de logs...', 'blue');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  
  const results = {
    withoutToken: await testLogsWithoutToken(),
    withToken: await testLogsWithToken(),
    stats: await testLogsStats(),
    export: await testLogsExport(),
    filters: await testLogsFilters(),
    pagination: await testLogsPagination(),
    performance: await testPerformance()
  };
  
  // Resumo
  log('\n📊 Resumo dos Testes:', 'blue');
  
  const passedTests = Object.values(results).filter(r => 
    r.success || (r.page1 && r.page1.success) || (r.result && r.result.success)
  ).length;
  
  const totalTests = Object.keys(results).length;
  
  log(`Testes passaram: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');
  
  if (passedTests === totalTests) {
    log('\n🎉 Todos os testes passaram! O painel de logs está funcionando corretamente.', 'green');
  } else {
    log('\n⚠️ Alguns testes falharam. Verifique a configuração do servidor e banco de dados.', 'yellow');
  }
  
  return results;
}

// Executar se chamado diretamente
if (require.main === module) {
  runAllTests().catch(error => {
    log(`❌ Erro durante os testes: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  testEndpoint
};