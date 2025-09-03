#!/usr/bin/env node

// Script de teste para o endpoint PIX
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testPixEndpoint() {
  console.log('🧪 Testando endpoint PIX...');
  console.log('📍 URL:', `${BASE_URL}/api/payments/pix/create`);
  
  const testData = {
    amount: 19.90,
    description: 'Teste de pagamento PIX',
    customer_name: 'Cliente Teste',
    customer_email: 'teste@exemplo.com',
    customer_document: '12345678901',
    customer_phone: '11999999999'
  };
  
  console.log('📤 Dados enviados:', JSON.stringify(testData, null, 2));
  
  try {
    const response = await axios.post(
      `${BASE_URL}/api/payments/pix/create`,
      testData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    console.log('✅ Resposta recebida:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('✅ PIX criado com sucesso!');
      console.log('Gateway usado:', response.data.gateway);
      console.log('ID da transação:', response.data.data.id);
      console.log('QR Code disponível:', !!response.data.data.qr_code);
    }
  } catch (error) {
    console.error('❌ Erro ao testar endpoint:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Erro:', error.message);
    }
  }
}

// Executar teste
testPixEndpoint();