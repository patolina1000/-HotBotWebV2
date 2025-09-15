const axios = require('axios');
const sqlite = require('./database/sqlite');

console.log('🧪 TESTE DE WEBHOOK OASYFY - SIMULAÇÃO COMPLETA');
console.log('==============================================\n');

// Configurações
const SERVER_URL = 'http://localhost:3000';
const WEBHOOK_ENDPOINTS = [
  '/api/v1/gateway/webhook/oasyfy/test_token_123/route',
  '/webhook/unified'
];

async function testWebhookSimulation() {
  // 1. VERIFICAR SE SERVIDOR ESTÁ RODANDO
  console.log('1️⃣ VERIFICANDO SERVIDOR...');
  try {
    await axios.get(`${SERVER_URL}/api/ping`, { timeout: 5000 });
    console.log('✅ Servidor está rodando\n');
  } catch (error) {
    console.error('❌ Servidor não está rodando. Inicie com: npm start');
    console.error('   Testando apenas SQL local...\n');
    await testSQLOnly();
    return;
  }

  // 2. CRIAR TRANSAÇÃO DE TESTE NO BANCO
  console.log('2️⃣ CRIANDO TRANSAÇÃO DE TESTE...');
  const fakeTransactionId = `webhook_test_${Date.now()}`;
  const fakeClientId = `client_test_${Date.now()}`;
  
  try {
    const response = await axios.post(`${SERVER_URL}/api/pix/create`, {
      identifier: fakeTransactionId,
      amount: 29.90,
      client_data: {
        name: 'João Teste Webhook',
        email: 'joao@teste.com',
        phone: '11999887766',
        telegram_id: 'webhook_test_user'
      },
      plano_nome: 'Plano Teste Webhook',
      bot_id: 'webhook_test'
    });
    
    if (response.data.success) {
      console.log('✅ Transação criada:', response.data.transaction_id);
    } else {
      console.error('❌ Erro ao criar transação:', response.data.error);
      return;
    }
  } catch (error) {
    console.error('❌ Erro na requisição:', error.message);
    return;
  }

  // 3. VERIFICAR STATUS ANTES DO WEBHOOK
  console.log('\n3️⃣ VERIFICANDO STATUS ANTES DO WEBHOOK...');
  try {
    const statusResponse = await axios.get(`${SERVER_URL}/api/payment-status/${fakeTransactionId}`);
    const statusData = statusResponse.data;
    
    console.log('📊 Status antes do webhook:');
    console.log('   - success:', statusData.success);
    console.log('   - is_paid:', statusData.is_paid);
    console.log('   - status:', statusData.status);
    console.log('   - valor:', statusData.valor);
    
    if (statusData.is_paid) {
      console.error('❌ Transação já está paga! Algo está errado...');
      return;
    } else {
      console.log('✅ Transação pendente como esperado');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error.message);
    return;
  }

  // 4. SIMULAR WEBHOOK DA OASYFY
  console.log('\n4️⃣ ENVIANDO WEBHOOK SIMULADO...');
  
  const webhookPayload = {
    "event": "TRANSACTION_PAID",
    "token": "test_token_123",
    "client": {
      "id": "test_client_id",
      "name": "João Teste Webhook",
      "email": "joao@teste.com",
      "phone": "(11) 99988-7766",
      "cpf": "123.456.789-10"
    },
    "transaction": {
      "id": fakeTransactionId,
      "identifier": fakeClientId,
      "status": "COMPLETED",
      "paymentMethod": "PIX",
      "amount": 29.90,
      "createdAt": "2025-09-15T10:30:00.000Z",
      "payedAt": new Date().toISOString(),
      "pixInformation": {
        "qrCode": "00020101br.gov.bcb.pix...",
        "endToEndId": "E12345678901234567890123456789012345678901234"
      },
      "pixMetadata": {
        "payerDocument": "123.456.789-00",
        "payerName": "João Teste Webhook",
        "payerBankName": "Banco Teste"
      }
    },
    "orderItems": [
      {
        "id": "item_test_123",
        "price": 29.90,
        "product": {
          "id": "product_test",
          "name": "Plano Teste Webhook",
          "externalId": "WEBHOOK_TEST_001"
        }
      }
    ],
    "trackProps": {
      "utm_source": "webhook_test",
      "utm_medium": "test",
      "utm_campaign": "sql_validation",
      "fbp": "fb.1.test.webhook",
      "fbc": "fb.1.webhook.test"
    }
  };

  // Testar ambos os endpoints
  for (const endpoint of WEBHOOK_ENDPOINTS) {
    console.log(`\n   📡 Testando endpoint: ${endpoint}`);
    try {
      const webhookResponse = await axios.post(`${SERVER_URL}${endpoint}`, webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Oasyfy-Webhook-Test/1.0'
        }
      });
      
      console.log(`   ✅ Webhook ${endpoint}: Status ${webhookResponse.status}`);
    } catch (error) {
      console.error(`   ❌ Erro no webhook ${endpoint}:`, error.response?.status || error.message);
    }
  }

  // 5. AGUARDAR UM POUCO E VERIFICAR STATUS APÓS WEBHOOK
  console.log('\n5️⃣ AGUARDANDO E VERIFICANDO STATUS APÓS WEBHOOK...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2 segundos

  try {
    const finalStatusResponse = await axios.get(`${SERVER_URL}/api/payment-status/${fakeTransactionId}`);
    const finalStatusData = finalStatusResponse.data;
    
    console.log('📊 Status após webhook:');
    console.log('   - success:', finalStatusData.success);
    console.log('   - is_paid:', finalStatusData.is_paid);
    console.log('   - status:', finalStatusData.status);
    console.log('   - paid_at:', finalStatusData.paid_at);
    console.log('   - end_to_end_id:', finalStatusData.end_to_end_id);
    console.log('   - payer_name:', finalStatusData.payer_name);
    
    if (finalStatusData.is_paid) {
      console.log('🎉 SUCESSO! Webhook processou corretamente!');
      console.log('🔄 Frontend redirecionaria automaticamente agora!');
    } else {
      console.error('❌ FALHA! Webhook não atualizou o status corretamente');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar status final:', error.message);
  }

  console.log('\n6️⃣ TESTE CONCLUÍDO!');
}

async function testSQLOnly() {
  console.log('🔧 TESTE APENAS SQL (SEM SERVIDOR)...\n');
  
  // Usar o teste SQL independente
  const { execSync } = require('child_process');
  try {
    execSync('node test-sql-oasyfy.js', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Erro no teste SQL:', error.message);
  }
}

// Executar teste
testWebhookSimulation().catch(console.error);
