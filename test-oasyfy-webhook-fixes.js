#!/usr/bin/env node

/**
 * Script de teste para validar as correções implementadas para webhooks Oasyfy
 * 
 * Testa:
 * 1. Webhook recebido e processado corretamente
 * 2. Envio do link via Telegram após pagamento confirmado
 * 3. Mapeamento correto da transação
 * 4. Logs detalhados para debug
 */

const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Simular webhook Oasyfy
const simulateOasyfyWebhook = async () => {
  console.log('🧪 Testando webhook Oasyfy simulado...\n');
  
  const webhookPayload = {
    event: "TRANSACTION_PAID",
    token: "test_token_123",
    transaction: {
      id: "test_cmfljc6wz06qoyekd0q8upz6e",
      identifier: "test_checkout_web_1234567890",
      status: "COMPLETED",
      amount: 97.00,
      currency: "BRL",
      paymentMethod: "PIX",
      createdAt: "2025-01-15T10:30:00Z",
      payedAt: "2025-01-15T10:35:00Z",
      pixInformation: {
        endToEndId: "E12345678202501151035abcdef123456"
      }
    },
    client: {
      id: "client_123",
      name: "João Silva",
      email: "joao.silva@example.com",
      phone: "+5511987654321",
      cpf: "12345678901"
    },
    orderItems: [
      {
        id: "item_1",
        price: 97.00,
        product: {
          id: "plano_1_mes",
          externalId: "plano_1_mes",
          name: "Plano 1 Mês"
        }
      }
    ]
  };

  try {
    console.log('📤 Enviando webhook para:', `${SERVER_URL}/webhook/unified`);
    console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2));
    
    const response = await axios.post(`${SERVER_URL}/webhook/unified`, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Oasyfy-Webhook/1.0'
      },
      timeout: 10000
    });

    console.log('✅ Webhook enviado com sucesso!');
    console.log('📊 Status:', response.status);
    console.log('📋 Response:', response.data || 'Sem dados de resposta');
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar webhook:', error.message);
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📋 Response:', error.response.data);
    }
    return false;
  }
};

// Testar status do servidor
const testServerStatus = async () => {
  console.log('🔍 Testando status do servidor...\n');
  
  try {
    const response = await axios.get(`${SERVER_URL}/debug`, {
      timeout: 5000
    });
    
    console.log('✅ Servidor online!');
    console.log('📊 Status:', response.status);
    
    if (response.data) {
      console.log('🤖 Bots ativos:', Object.keys(response.data.bots_status || {}));
      console.log('🔧 Serviço PIX:', response.data.service_status?.active_gateway || 'N/A');
      console.log('💾 SQLite:', response.data.sqlite_status || 'N/A');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Servidor offline ou com erro:', error.message);
    return false;
  }
};

// Verificar logs após teste
const checkLogs = () => {
  console.log('\n📋 Para verificar os logs, execute:');
  console.log('tail -f logs/server.log | grep -E "(webhook|TRANSACTION_PAID|Pagamento confirmado|Link enviado)"');
  console.log('\n📋 Para verificar transações no banco:');
  console.log('sqlite3 pagamentos.db "SELECT id_transacao, telegram_id, bot_id, status FROM tokens WHERE id_transacao LIKE \'%test_%\' ORDER BY created_at DESC LIMIT 5;"');
  console.log('\n📋 Para verificar envio de mensagens:');
  console.log('tail -f logs/server.log | grep -E "(sendMessage|Link enviado|🎉 Pagamento aprovado)"');
};

// Executar testes
const runTests = async () => {
  console.log('🚀 TESTE DAS CORREÇÕES OASYFY WEBHOOK\n');
  console.log('=' .repeat(50));
  
  // Teste 1: Status do servidor
  console.log('\n📍 TESTE 1: Status do Servidor');
  const serverOnline = await testServerStatus();
  
  if (!serverOnline) {
    console.error('\n❌ Servidor offline - não é possível continuar os testes');
    process.exit(1);
  }
  
  // Teste 2: Webhook simulado
  console.log('\n📍 TESTE 2: Webhook Oasyfy Simulado');
  const webhookSuccess = await simulateOasyfyWebhook();
  
  // Aguardar processamento
  console.log('\n⏳ Aguardando 3 segundos para processamento...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Instruções para verificação manual
  console.log('\n📍 TESTE 3: Verificação Manual');
  checkLogs();
  
  // Resumo
  console.log('\n' + '=' .repeat(50));
  console.log('📊 RESUMO DOS TESTES');
  console.log('=' .repeat(50));
  console.log(`✅ Servidor Online: ${serverOnline ? 'SIM' : 'NÃO'}`);
  console.log(`✅ Webhook Enviado: ${webhookSuccess ? 'SIM' : 'NÃO'}`);
  
  if (webhookSuccess) {
    console.log('\n🎯 PRÓXIMOS PASSOS:');
    console.log('1. Verifique os logs para confirmar o processamento');
    console.log('2. Confirme se a transação foi encontrada no banco');
    console.log('3. Verifique se o link foi enviado via Telegram');
    console.log('4. Teste com uma transação real do Oasyfy');
  }
  
  console.log('\n✨ Teste concluído!');
};

// Executar se chamado diretamente
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Erro durante os testes:', error.message);
    process.exit(1);
  });
}

module.exports = {
  simulateOasyfyWebhook,
  testServerStatus,
  runTests
};