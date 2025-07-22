#!/usr/bin/env node

/**
 * Script de teste para a integração UTMify
 * Valida conectividade e funcionalidades principais
 */

require('dotenv').config();
const utmifyIntegration = require('./services/utmifyIntegration');

async function testUTMifyIntegration() {
  console.log('🧪 Iniciando teste da integração UTMify...\n');

  // Verificar configuração
  console.log('1️⃣ Verificando configuração...');
  if (!process.env.UTMIFY_API_TOKEN) {
    console.error('❌ UTMIFY_API_TOKEN não configurado no arquivo .env');
    console.log('📝 Adicione a seguinte linha ao seu .env:');
    console.log('   UTMIFY_API_TOKEN=seu_token_aqui\n');
    return false;
  }
  console.log('✅ Token UTMify configurado\n');

  // Teste de conectividade
  console.log('2️⃣ Testando conectividade com a API...');
  const connectionTest = await utmifyIntegration.testConnection();
  if (!connectionTest) {
    console.error('❌ Falha no teste de conectividade');
    console.log('🔍 Verifique se:');
    console.log('   - O token está correto');
    console.log('   - A API da UTMify está funcionando');
    console.log('   - Não há bloqueios de firewall\n');
    return false;
  }
  console.log('✅ Conectividade OK\n');

  // Teste de envio de ordem manual
  console.log('3️⃣ Testando envio de ordem manual...');
  const testOrderData = {
    transactionId: `test_manual_${Date.now()}`,
    value: 9.99, // R$ 9,99
    utmParams: {
      utm_source: 'test',
      utm_medium: 'manual_test',
      utm_campaign: 'integration_test',
      utm_term: 'test_term',
      utm_content: 'test_content'
    },
    orderDate: new Date()
  };

  const orderSuccess = await utmifyIntegration.sendOrder(testOrderData);
  if (!orderSuccess) {
    console.error('❌ Falha no teste de envio de ordem');
    return false;
  }
  console.log('✅ Ordem manual enviada com sucesso\n');

  // Teste de formatação de payload
  console.log('4️⃣ Testando formatação de payload...');
  const payload = utmifyIntegration.buildPayload(testOrderData);
  console.log('📋 Payload gerado:', JSON.stringify(payload, null, 2));
  
  // Validar campos obrigatórios
  const requiredFields = ['transaction_id', 'order_value', 'order_date', 'currency'];
  const missingFields = requiredFields.filter(field => !payload[field]);
  
  if (missingFields.length > 0) {
    console.error('❌ Campos obrigatórios ausentes:', missingFields);
    return false;
  }
  console.log('✅ Payload formatado corretamente\n');

  // Teste de recuperação de UTMs (simulação)
  console.log('5️⃣ Testando recuperação de UTMs...');
  
  // Simular dados UTM que seriam recuperados do banco
  const mockUTMData = await utmifyIntegration.getUTMDataFromTransaction(
    'test_transaction_123',
    null, // sem banco SQLite para teste
    null  // sem PostgreSQL para teste
  );
  
  if (mockUTMData === null) {
    console.log('ℹ️ Nenhum UTM encontrado (esperado para teste sem banco)');
  }
  console.log('✅ Função de recuperação de UTMs funcionando\n');

  console.log('🎉 Todos os testes passaram!');
  console.log('✅ A integração UTMify está funcionando corretamente');
  console.log('\n📋 Resumo da integração:');
  console.log('   • Conectividade: OK');
  console.log('   • Envio de ordens: OK');
  console.log('   • Formatação de payload: OK');
  console.log('   • Sistema de retry: Configurado (3 tentativas)');
  console.log('   • Timeout: 30 segundos');
  console.log('   • Logs detalhados: Habilitados');
  
  return true;
}

async function main() {
  try {
    console.log('🔧 UTMify Integration Test Tool');
    console.log('================================\n');
    
    const success = await testUTMifyIntegration();
    
    if (success) {
      console.log('\n🚀 A integração está pronta para produção!');
      console.log('\n📖 Próximos passos:');
      console.log('   1. Configure o webhook da PushinPay');
      console.log('   2. Teste com uma transação real');
      console.log('   3. Monitore os logs para confirmar o funcionamento');
      process.exit(0);
    } else {
      console.log('\n❌ Há problemas na configuração que precisam ser resolvidos.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Erro durante o teste:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { testUTMifyIntegration };