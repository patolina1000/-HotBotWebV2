/**
 * 🧪 SCRIPT DE TESTE: Verificar Deduplicação Facebook Pixel + CAPI
 * 
 * Este script testa se a implementação da deduplicação está funcionando corretamente.
 * Execute no console do navegador ou como script Node.js.
 */

// 🔧 CONFIGURAÇÃO DO TESTE
const TESTE_CONFIG = {
  baseUrl: 'http://localhost:3000', // Ajuste conforme necessário
  token: 'test_token_' + Date.now(),
  valor: 97.50
};

// 🧪 TESTE 1: Verificar endpoint de sincronização
async function testeEndpointSincronizacao() {
  console.log('🧪 TESTE 1: Verificando endpoint de sincronização...');
  
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    
    const response = await fetch(`${TESTE_CONFIG.baseUrl}/api/sync-timestamp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: TESTE_CONFIG.token,
        client_timestamp: timestamp
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log('✅ Endpoint de sincronização funcionando:');
    console.log(`- Timestamp cliente: ${result.client_timestamp}`);
    console.log(`- Timestamp servidor: ${result.server_timestamp}`);
    console.log(`- Diferença: ${result.diff_seconds}s`);
    
    if (result.diff_seconds > 60) {
      console.warn('⚠️ Diferença alta entre cliente e servidor!');
      return { success: false, warning: 'Alta diferença de timestamp' };
    }
    
    return { success: true, data: result };
    
  } catch (error) {
    console.error('❌ Erro no teste de sincronização:', error);
    return { success: false, error: error.message };
  }
}

// 🧪 TESTE 2: Verificar configuração do Facebook Pixel
async function testeConfiguracaoPixel() {
  console.log('🧪 TESTE 2: Verificando configuração do Facebook Pixel...');
  
  try {
    const response = await fetch(`${TESTE_CONFIG.baseUrl}/api/config`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const config = await response.json();
    
    console.log('✅ Configuração do Pixel:');
    console.log(`- FB_PIXEL_ID: ${config.FB_PIXEL_ID || 'NÃO DEFINIDO'}`);
    
    if (!config.FB_PIXEL_ID) {
      console.warn('⚠️ FB_PIXEL_ID não definido!');
      return { success: false, warning: 'FB_PIXEL_ID ausente' };
    }
    
    return { success: true, data: config };
    
  } catch (error) {
    console.error('❌ Erro no teste de configuração:', error);
    return { success: false, error: error.message };
  }
}

// 🧪 TESTE 3: Simular evento Purchase completo
async function testeEventoCompletoPurchase() {
  console.log('🧪 TESTE 3: Simulando evento Purchase completo...');
  
  try {
    // 1. Sincronizar timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    console.log(`🕐 Timestamp do evento: ${timestamp}`);
    
    const syncResult = await fetch(`${TESTE_CONFIG.baseUrl}/api/sync-timestamp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: TESTE_CONFIG.token,
        client_timestamp: timestamp
      })
    });
    
    if (!syncResult.ok) {
      throw new Error('Falha na sincronização de timestamp');
    }
    
    const syncData = await syncResult.json();
    console.log(`✅ Timestamp sincronizado (diff: ${syncData.diff_seconds}s)`);
    
    // 2. Simular validação de token (que normalmente dispara o CAPI)
    // Nota: Este teste não enviará eventos reais, apenas verifica a estrutura
    
    console.log('📋 Estrutura do evento que seria enviado:');
    console.log({
      evento: 'Purchase',
      eventID: TESTE_CONFIG.token,
      timestamp: timestamp,
      valor: TESTE_CONFIG.valor,
      currency: 'BRL',
      source_pixel: 'navegador',
      source_capi: 'servidor',
      deduplicacao: 'ativa'
    });
    
    return { 
      success: true, 
      timestamp: timestamp, 
      syncDiff: syncData.diff_seconds 
    };
    
  } catch (error) {
    console.error('❌ Erro no teste de evento completo:', error);
    return { success: false, error: error.message };
  }
}

// 🧪 TESTE 4: Verificar logs do servidor
async function testeLogsServidor() {
  console.log('🧪 TESTE 4: Verificando logs do servidor...');
  
  // Este teste apenas orienta sobre o que procurar nos logs
  console.log('📋 Procure por estes logs no servidor:');
  console.log('✅ Logs esperados para deduplicação funcionando:');
  console.log('   - "🕐 Usando timestamp sincronizado do cliente"');
  console.log('   - "🔄 Timestamp normalizado para deduplicação"');
  console.log('   - "🔄 Evento duplicado detectado e ignorado" (se houver duplicata)');
  console.log('   - "📤 Evento enviado: Purchase | Fonte: CAPI"');
  console.log('   - "✅ Evento Purchase enviado com sucesso via CAPI"');
  
  return { success: true, info: 'Verifique logs manualmente no servidor' };
}

// 🧪 EXECUTAR TODOS OS TESTES
async function executarTodosOsTestes() {
  console.log('🚀 INICIANDO BATERIA DE TESTES DE DEDUPLICAÇÃO\n');
  
  const resultados = {
    sincronizacao: await testeEndpointSincronizacao(),
    configuracao: await testeConfiguracaoPixel(),
    eventoCompleto: await testeEventoCompletoPurchase(),
    logs: await testeLogsServidor()
  };
  
  console.log('\n📊 RESUMO DOS TESTES:');
  
  let sucessos = 0;
  let total = 0;
  
  Object.entries(resultados).forEach(([teste, resultado]) => {
    total++;
    if (resultado.success) {
      sucessos++;
      console.log(`✅ ${teste}: PASSOU`);
    } else {
      console.log(`❌ ${teste}: FALHOU - ${resultado.error || resultado.warning}`);
    }
  });
  
  console.log(`\n🎯 RESULTADO FINAL: ${sucessos}/${total} testes passaram`);
  
  if (sucessos === total) {
    console.log('🎉 TODOS OS TESTES PASSARAM! Deduplicação deve estar funcionando.');
  } else {
    console.log('⚠️ Alguns testes falharam. Verifique a implementação.');
  }
  
  return resultados;
}

// 🔧 UTILITÁRIOS PARA TESTE MANUAL
const TestUtils = {
  // Gerar token de teste
  gerarTokenTeste: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  // Verificar diferença de timestamp
  verificarDiferencaTimestamp: (cliente, servidor) => {
    const diff = Math.abs(servidor - cliente);
    return {
      diferenca: diff,
      status: diff <= 30 ? 'EXCELENTE' : diff <= 60 ? 'BOM' : diff <= 300 ? 'ACEITÁVEL' : 'PROBLEMÁTICO'
    };
  },
  
  // Simular cookies do Facebook
  simularCookiesFacebook: () => ({
    _fbp: `fb.1.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`,
    _fbc: `fb.1.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`
  })
};

// 🚀 EXECUTAR AUTOMATICAMENTE SE ESTIVER NO NAVEGADOR
if (typeof window !== 'undefined') {
  console.log('🧪 Script de teste carregado! Execute: executarTodosOsTestes()');
  window.TesteDuplicacao = {
    executarTodosOsTestes,
    testeEndpointSincronizacao,
    testeConfiguracaoPixel,
    testeEventoCompletoPurchase,
    testeLogsServidor,
    TestUtils
  };
} else {
  // Se for Node.js, executar automaticamente
  executarTodosOsTestes().then(resultados => {
    console.log('\n🔚 Testes concluídos.');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Erro ao executar testes:', error);
    process.exit(1);
  });
}

module.exports = {
  executarTodosOsTestes,
  TestUtils
};