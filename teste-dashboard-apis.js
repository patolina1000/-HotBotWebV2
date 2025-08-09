const axios = require('axios');

/**
 * Teste das APIs do Dashboard
 * Verifica se todas as rotas estão funcionando corretamente
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_DATE_FROM = '2024-01-01';
const TEST_DATE_TO = '2024-01-31';

// Configuração do axios
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Testa a API de saúde do dashboard
 */
async function testDashboardHealth() {
  try {
    console.log('🏥 Testando /api/dashboard/health...');
    
    const response = await api.get('/api/dashboard/health');
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Dashboard health OK');
      console.log('   Timezone:', response.data.data.timezone);
      console.log('   FunnelQueriesService:', response.data.data.funnel_queries_service.initialized ? 'OK' : 'ERRO');
    } else {
      console.log('❌ Dashboard health falhou');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro ao testar dashboard health:', error.message);
  }
}

/**
 * Testa a API de métricas disponíveis
 */
async function testAvailableMetrics() {
  try {
    console.log('\n📊 Testando /api/dashboard/available-metrics...');
    
    const response = await api.get('/api/dashboard/available-metrics');
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Available metrics OK');
      console.log('   Métricas:', response.data.data.metrics.length);
      console.log('   Agrupamentos:', response.data.data.groups.length);
      console.log('   Bots:', response.data.data.bots.length);
      console.log('   Timezone:', response.data.data.timezone);
    } else {
      console.log('❌ Available metrics falhou');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro ao testar available metrics:', error.message);
  }
}

/**
 * Testa a API de resumo do dashboard
 */
async function testDashboardSummary() {
  try {
    console.log('\n📈 Testando /api/dashboard/summary...');
    
    const response = await api.get('/api/dashboard/summary', {
      params: {
        from: TEST_DATE_FROM,
        to: TEST_DATE_TO
      }
    });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Dashboard summary OK');
      console.log('   Welcome clicks:', response.data.data.welcome_clicks);
      console.log('   Bot enters:', response.data.data.bot_enters);
      console.log('   PIX created:', response.data.data.pix_created);
      console.log('   PIX paid:', response.data.data.pix_paid);
      console.log('   Paid by tier (Bot1):', response.data.data.paid_by_tier_bot1);
      console.log('   Meta:', response.data.data.meta);
    } else {
      console.log('❌ Dashboard summary falhou');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro ao testar dashboard summary:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
  }
}

/**
 * Testa a API de série temporal
 */
async function testTimeSeries() {
  try {
    console.log('\n⏰ Testando /api/dashboard/timeseries...');
    
    const response = await api.get('/api/dashboard/timeseries', {
      params: {
        metric: 'welcome_click',
        group: 'day',
        from: TEST_DATE_FROM,
        to: TEST_DATE_TO,
        bot: 'all'
      }
    });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Time series OK');
      console.log('   Métrica:', response.data.data.metric);
      console.log('   Agrupamento:', response.data.data.group);
      console.log('   Bot:', response.data.data.bot);
      console.log('   Dados:', response.data.data.data.length, 'períodos');
      console.log('   Meta:', response.data.data.meta);
    } else {
      console.log('❌ Time series falhou');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro ao testar time series:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
  }
}

/**
 * Testa a API de distribuição
 */
async function testDistribution() {
  try {
    console.log('\n📊 Testando /api/dashboard/distribution...');
    
    const response = await api.get('/api/dashboard/distribution', {
      params: {
        t: 'bot_paid_tiers',
        from: TEST_DATE_FROM,
        to: TEST_DATE_TO
      }
    });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Distribution OK');
      console.log('   Distribuição:', response.data.data.distribution.length, 'tiers');
      console.log('   Total count:', response.data.data.totals.total_count);
      console.log('   Total revenue:', response.data.data.totals.total_revenue_cents, 'centavos');
      console.log('   Meta:', response.data.data.meta);
    } else {
      console.log('❌ Distribution falhou');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro ao testar distribution:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
  }
}

/**
 * Testa a API de estatísticas de conversão
 */
async function testConversionStats() {
  try {
    console.log('\n🔄 Testando /api/dashboard/conversion-stats...');
    
    const response = await api.get('/api/dashboard/conversion-stats', {
      params: {
        from: TEST_DATE_FROM,
        to: TEST_DATE_TO
      }
    });
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Conversion stats OK');
      console.log('   Estatísticas:', response.data.data.conversion_stats.length, 'bots');
      console.log('   Meta:', response.data.data.meta);
      
      // Mostrar detalhes das estatísticas
      response.data.data.conversion_stats.forEach(stat => {
        console.log(`   Bot ${stat.bot}:`);
        console.log(`     Welcome to bot rate: ${stat.welcome_to_bot_rate}%`);
        console.log(`     Bot to PIX rate: ${stat.bot_to_pix_rate}%`);
        console.log(`     PIX created to paid rate: ${stat.pix_created_to_paid_rate}%`);
      });
    } else {
      console.log('❌ Conversion stats falhou');
      console.log('   Status:', response.status);
      console.log('   Response:', response.data);
    }
  } catch (error) {
    console.error('❌ Erro ao testar conversion stats:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
  }
}

/**
 * Testa validações de parâmetros
 */
async function testParameterValidation() {
  try {
    console.log('\n🔍 Testando validações de parâmetros...');
    
    // Teste sem parâmetros obrigatórios
    try {
      await api.get('/api/dashboard/summary');
      console.log('❌ Falha: API aceitou requisição sem parâmetros');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Validação de parâmetros obrigatórios OK');
      } else {
        console.log('❌ Validação inesperada:', error.response?.status);
      }
    }
    
    // Teste com formato de data inválido
    try {
      await api.get('/api/dashboard/summary', {
        params: { from: '2024-13-01', to: '2024-01-31' }
      });
      console.log('❌ Falha: API aceitou data inválida');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Validação de formato de data OK');
      } else {
        console.log('❌ Validação inesperada:', error.response?.status);
      }
    }
    
    // Teste com período inválido (from > to)
    try {
      await api.get('/api/dashboard/summary', {
        params: { from: '2024-01-31', to: '2024-01-01' }
      });
      console.log('❌ Falha: API aceitou período inválido');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Validação de período OK');
      } else {
        console.log('❌ Validação inesperada:', error.response?.status);
      }
    }
    
    // Teste com métrica inválida
    try {
      await api.get('/api/dashboard/timeseries', {
        params: {
          metric: 'invalid_metric',
          group: 'day',
          from: TEST_DATE_FROM,
          to: TEST_DATE_TO
        }
      });
      console.log('❌ Falha: API aceitou métrica inválida');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Validação de métrica OK');
      } else {
        console.log('❌ Validação inesperada:', error.response?.status);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar validações:', error.message);
  }
}

/**
 * Executa todos os testes
 */
async function runAllTests() {
  console.log('🚀 Iniciando testes das APIs do Dashboard');
  console.log('📍 URL base:', BASE_URL);
  console.log('📅 Período de teste:', `${TEST_DATE_FROM} a ${TEST_DATE_TO}`);
  console.log('=' .repeat(60));
  
  try {
    await testDashboardHealth();
    await testAvailableMetrics();
    await testDashboardSummary();
    await testTimeSeries();
    await testDistribution();
    await testConversionStats();
    await testParameterValidation();
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Todos os testes concluídos!');
    
  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error.message);
  }
}

// Executar testes se o arquivo for chamado diretamente
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testDashboardHealth,
  testAvailableMetrics,
  testDashboardSummary,
  testTimeSeries,
  testDistribution,
  testConversionStats,
  testParameterValidation,
  runAllTests
};
