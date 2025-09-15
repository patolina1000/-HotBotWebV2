#!/usr/bin/env node

/**
 * Script de teste para verificar o fluxo de pagamento Oasyfy
 * Testa se o transactionId está sendo salvo corretamente no banco
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'https://ohvips.xyz';

async function testOasyfyPaymentFlow() {
  console.log('🧪 Testando fluxo de pagamento Oasyfy...\n');

  try {
    // 1. Criar PIX via Oasyfy
    console.log('1️⃣ Criando PIX via Oasyfy...');
    
    const pixData = {
      type: 'web',
      gateway: 'oasyfy', // Forçar Oasyfy
      plano_id: 'teste_plano',
      valor: 100,
      client_data: {
        name: 'Cliente Teste',
        email: 'teste@exemplo.com',
        plano_nome: 'Plano Teste'
      },
      tracking_data: {
        utm_source: 'teste',
        utm_medium: 'script',
        utm_campaign: 'oasyfy_test',
        fbp: 'fb.1.test.123456789',
        fbc: 'fb.1.test.987654321',
        kwai_click_id: 'kwai_test_123'
      }
    };

    const createResponse = await axios.post(`${BASE_URL}/api/pix/create`, pixData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!createResponse.data.success) {
      throw new Error(`Erro ao criar PIX: ${createResponse.data.error}`);
    }

    const { transaction_id, gateway, qr_code_base64 } = createResponse.data;
    console.log(`✅ PIX criado com sucesso!`);
    console.log(`   Transaction ID: ${transaction_id}`);
    console.log(`   Gateway: ${gateway}`);
    console.log(`   QR Code: ${qr_code_base64 ? 'Gerado' : 'Não gerado'}\n`);

    // 2. Verificar se transactionId foi salvo no banco
    console.log('2️⃣ Verificando se transactionId foi salvo no banco...');
    
    const statusResponse = await axios.get(`${BASE_URL}/api/payment-status/${transaction_id}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (statusResponse.status === 200) {
      console.log('✅ TransactionId encontrado no banco!');
      console.log(`   Status: ${statusResponse.data.status}`);
      console.log(`   Valor: R$ ${statusResponse.data.valor}`);
      console.log(`   Plano: ${statusResponse.data.plano}`);
      console.log(`   Criado em: ${statusResponse.data.created_at}\n`);
    } else {
      throw new Error(`TransactionId não encontrado no banco: ${statusResponse.status}`);
    }

    // 3. Testar polling múltiplas vezes
    console.log('3️⃣ Testando polling múltiplas vezes...');
    
    for (let i = 1; i <= 3; i++) {
      console.log(`   Tentativa ${i}/3...`);
      
      const pollResponse = await axios.get(`${BASE_URL}/api/payment-status/${transaction_id}`);
      
      if (pollResponse.status === 200) {
        console.log(`   ✅ Polling ${i} - OK (Status: ${pollResponse.data.status})`);
      } else {
        console.log(`   ❌ Polling ${i} - Erro: ${pollResponse.status}`);
      }
      
      // Aguardar 1 segundo entre tentativas
      if (i < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n🎉 Teste concluído com sucesso!');
    console.log('✅ O fluxo de pagamento Oasyfy está funcionando corretamente');
    console.log('✅ O transactionId está sendo salvo no banco de dados');
    console.log('✅ O endpoint /api/payment-status está respondendo corretamente');

  } catch (error) {
    console.error('\n❌ Erro no teste:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.error('\n🔍 Possíveis causas:');
    console.error('   - Oasyfy não está configurado (OASYFY_PUBLIC_KEY, OASYFY_SECRET_KEY)');
    console.error('   - Gateway padrão não é Oasyfy (DEFAULT_PIX_GATEWAY)');
    console.error('   - Problema de conectividade com a API');
    console.error('   - Erro no salvamento no banco de dados');
    
    process.exit(1);
  }
}

// Executar teste
if (require.main === module) {
  testOasyfyPaymentFlow();
}

module.exports = { testOasyfyPaymentFlow };
