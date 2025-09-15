const axios = require('axios');

// Simular webhook da Oasyfy quando PIX é pago
async function testOasyfyWebhook() {
  console.log('🧪 Testando webhook Oasyfy...');
  
  // Payload baseado na documentação oficial da Oasyfy
  const webhookPayload = {
    "event": "TRANSACTION_PAID",
    "token": "tbdeizos8f",
    "client": {
      "id": "eep4xpu60s",
      "name": "João da Silva",
      "email": "joao@teste.com",
      "phone": "(11) 9 8888-7777",
      "cpf": "123.456.789-10"
    },
    "transaction": {
      "id": "test_transaction_123",
      "identifier": "test_client_identifier_456",
      "status": "COMPLETED",
      "paymentMethod": "PIX",
      "amount": 100.50,
      "createdAt": "2025-09-15T01:30:27.944Z",
      "payedAt": "2025-09-15T01:31:27.944Z",
      "pixInformation": {
        "qrCode": "00020101br.gov.bcb.pix2563pix-h.exemplo.com/pix...",
        "endToEndId": "E123456789012345678901234567890123456789012345"
      },
      "pixMetadata": {
        "payerDocument": "123.456.789-00",
        "payerName": "João da Silva",
        "payerBankName": "Caixa Economica Federal"
      }
    },
    "orderItems": [
      {
        "id": "l405zg7e37",
        "price": 100.50,
        "product": {
          "id": "owmlnpmegt",
          "name": "Plano Premium",
          "externalId": "PLANO001"
        }
      }
    ],
    "trackProps": {
      "utm_source": "facebook",
      "utm_medium": "cpc",
      "utm_campaign": "teste",
      "fbp": "fb.1.0987654321.1234567890",
      "fbc": "fb.1.1234567890.0987654321",
      "ip": "179.241.195.127"
    }
  };

  try {
    // Primeiro, criar uma transação fake na tabela tokens para testar
    console.log('📝 Criando transação de teste na tabela tokens...');
    
    const sqlite = require('./database/sqlite');
    const db = sqlite.get();
    
    if (!db) {
      console.error('❌ Banco SQLite não inicializado');
      return;
    }

    // Inserir transação de teste
    try {
      db.prepare(`
        INSERT OR REPLACE INTO tokens (
          id_transacao, token, telegram_id, valor, status, usado, bot_id,
          utm_source, utm_medium, utm_campaign, fbp, fbc, 
          ip_criacao, nome_oferta, event_time, external_id_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'test_transaction_123', // id_transacao
        'test_transaction_123', // token
        'test_user', // telegram_id
        10050, // valor em centavos
        'pendente', // status
        0, // usado
        'oasyfy_test', // bot_id
        'facebook', // utm_source
        'cpc', // utm_medium
        'teste', // utm_campaign
        'fb.1.0987654321.1234567890', // fbp
        'fb.1.1234567890.0987654321', // fbc
        '179.241.195.127', // ip_criacao
        'Plano Premium', // nome_oferta
        Date.now(), // event_time
        'test_client_identifier_456' // external_id_hash
      );
      
      console.log('✅ Transação de teste criada');
    } catch (dbError) {
      console.error('❌ Erro ao criar transação de teste:', dbError.message);
    }

    // Testar webhook específico da Oasyfy
    console.log('📡 Enviando webhook para endpoint Oasyfy...');
    
    const oasyfyResponse = await axios.post(
      'http://localhost:3000/api/v1/gateway/webhook/oasyfy/tbdeizos8f/route',
      webhookPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Oasyfy-Webhook/1.0'
        }
      }
    );

    console.log('✅ Webhook Oasyfy processado:', oasyfyResponse.status);

    // Testar webhook unificado
    console.log('📡 Enviando webhook para endpoint unificado...');
    
    const unifiedResponse = await axios.post(
      'http://localhost:3000/webhook/unified',
      webhookPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Oasyfy-Webhook/1.0',
          'X-Gateway': 'oasyfy'
        }
      }
    );

    console.log('✅ Webhook unificado processado:', unifiedResponse.status);

    // Verificar se a transação foi atualizada no banco
    console.log('🔍 Verificando atualização no banco...');
    
    const updatedTransaction = db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get('test_transaction_123');
    
    if (updatedTransaction) {
      console.log('📊 Status da transação após webhook:');
      console.log('  - ID:', updatedTransaction.id_transacao);
      console.log('  - Status:', updatedTransaction.status);
      console.log('  - Is Paid:', updatedTransaction.is_paid);
      console.log('  - Paid At:', updatedTransaction.paid_at);
      console.log('  - End to End ID:', updatedTransaction.end_to_end_id);
      console.log('  - Payer Name:', updatedTransaction.payer_name);
      console.log('  - Usado:', updatedTransaction.usado);
      
      if (updatedTransaction.status === 'pago' && updatedTransaction.is_paid === 1) {
        console.log('✅ Webhook funcionando corretamente! Transação marcada como paga.');
      } else {
        console.log('❌ Webhook não atualizou corretamente a transação.');
      }
    } else {
      console.log('❌ Transação não encontrada após webhook.');
    }

  } catch (error) {
    console.error('❌ Erro no teste do webhook:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Executar teste
testOasyfyWebhook();
