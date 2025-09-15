#!/usr/bin/env node

/**
 * Teste de Conectividade do Webhook Oasyfy
 * 
 * Este script verifica se a URL do webhook está acessível externamente
 * e testa o processamento de webhooks simulados.
 */

const axios = require('axios');
const crypto = require('crypto');

// Configurações
const WEBHOOK_URL = process.env.FRONTEND_URL || 'https://ohvips.xyz';
const WEBHOOK_ENDPOINT = `${WEBHOOK_URL}/webhook/unified`;

/**
 * Testa conectividade básica do webhook
 */
async function testWebhookConnectivity() {
  console.log('🔍 Testando conectividade do webhook...');
  console.log('📍 URL:', WEBHOOK_ENDPOINT);
  
  try {
    // Tentar fazer uma requisição HEAD para verificar se o endpoint responde
    const response = await axios.head(WEBHOOK_ENDPOINT, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Oasyfy-Webhook-Test/1.0'
      }
    });
    
    console.log('✅ Webhook acessível:', response.status);
    return true;
  } catch (error) {
    if (error.response) {
      console.log('⚠️ Webhook responde mas com erro:', error.response.status);
      // Erro 4xx ou 5xx ainda indica que o endpoint está acessível
      return error.response.status < 500;
    } else {
      console.error('❌ Webhook inacessível:', error.message);
      return false;
    }
  }
}

/**
 * Simula webhook de pagamento Oasyfy
 */
async function simulateOasyfyWebhook() {
  console.log('\n🧪 Simulando webhook Oasyfy...');
  
  const transactionId = `test_${Date.now()}`;
  const webhookPayload = {
    event: "TRANSACTION_PAID",
    token: "test123", // Token de teste
    client: {
      id: "test_client_123",
      name: "João Silva Teste",
      email: "joao.teste@example.com",
      phone: "(11) 99999-9999",
      cpf: "12345678900"
    },
    transaction: {
      id: transactionId,
      identifier: `checkout_web_${transactionId}`,
      status: "COMPLETED",
      paymentMethod: "PIX",
      originalCurrency: "BRL",
      originalAmount: 1,
      currency: "BRL",
      amount: 1,
      exchangeRate: 1,
      createdAt: new Date().toISOString(),
      payedAt: new Date().toISOString(),
      pixInformation: {
        qrCode: "00020101021226810014br.gov.bcb.pix2559qr.woovi.com/qr/v2/cob/test123",
        endToEndId: "E12345678901234567890123456789012345"
      },
      pixMetadata: {
        payerDocument: "12345678900",
        payerName: "João Silva Teste",
        payerBankName: "Banco Teste",
        receiverDocument: "98765432100",
        receiverName: "Recebedor Teste"
      }
    },
    orderItems: [
      {
        id: "item_test_123",
        price: 1,
        product: {
          id: "plano_padrao",
          name: "PUTA COMPORTADA",
          externalId: "plano_padrao"
        }
      }
    ],
    trackProps: {
      utm_source: "telegram",
      utm_campaign: "bot_principal",
      utm_medium: "telegram_bot"
    }
  };
  
  try {
    console.log('📤 Enviando webhook para:', WEBHOOK_ENDPOINT);
    console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2));
    
    const response = await axios.post(WEBHOOK_ENDPOINT, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Oasyfy-Webhook/1.0'
      },
      timeout: 30000
    });
    
    console.log('✅ Webhook processado com sucesso:');
    console.log('📊 Status:', response.status);
    console.log('📋 Resposta:', JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao processar webhook:');
    
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📋 Resposta:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('📋 Erro:', error.message);
    }
    
    return false;
  }
}

/**
 * Testa validação de token
 */
async function testTokenValidation() {
  console.log('\n🔐 Testando validação de tokens...');
  
  const testTokens = [
    'test123',      // 7 chars, alfanumérico
    '0kk619sp',     // 8 chars, alfanumérico (exemplo real do log)
    'tbdeizos8f',   // 10 chars, alfanumérico
    'abc_123',      // 7 chars, alfanumérico + underscore
    'TOKEN_123456', // 12 chars, alfanumérico + underscore
    'ab',           // 2 chars (muito curto)
    'token@123',    // Caractere especial inválido
    ''              // Vazio
  ];
  
  console.log('📋 Testando tokens:');
  
  for (const token of testTokens) {
    // Regex atual do sistema
    const isValid = /^[a-zA-Z0-9_]{6,20}$/.test(token);
    const status = isValid ? '✅' : '❌';
    
    console.log(`${status} "${token}" (${token.length} chars) - ${isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);
  }
}

/**
 * Verifica configuração do sistema
 */
async function checkSystemConfiguration() {
  console.log('\n⚙️ Verificando configuração do sistema...');
  
  const config = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    OASYFY_PUBLIC_KEY: process.env.OASYFY_PUBLIC_KEY ? '***' : 'NÃO CONFIGURADO',
    OASYFY_SECRET_KEY: process.env.OASYFY_SECRET_KEY ? '***' : 'NÃO CONFIGURADO',
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  console.log('📋 Configurações:');
  Object.entries(config).forEach(([key, value]) => {
    const status = value && value !== 'NÃO CONFIGURADO' ? '✅' : '❌';
    console.log(`${status} ${key}: ${value}`);
  });
  
  // Verificar se as credenciais Oasyfy estão configuradas
  const hasCredentials = process.env.OASYFY_PUBLIC_KEY && process.env.OASYFY_SECRET_KEY;
  console.log(`${hasCredentials ? '✅' : '❌'} Credenciais Oasyfy: ${hasCredentials ? 'CONFIGURADAS' : 'FALTANDO'}`);
  
  return hasCredentials;
}

/**
 * Função principal
 */
async function main() {
  console.log('🚀 Iniciando teste de conectividade do webhook Oasyfy\n');
  
  try {
    // 1. Verificar configuração
    const hasConfig = await checkSystemConfiguration();
    
    // 2. Testar conectividade
    const isConnected = await testWebhookConnectivity();
    
    // 3. Testar validação de tokens
    await testTokenValidation();
    
    // 4. Simular webhook (apenas se conectividade OK)
    if (isConnected) {
      await simulateOasyfyWebhook();
    }
    
    console.log('\n📊 RESUMO DOS TESTES:');
    console.log(`${hasConfig ? '✅' : '❌'} Configuração do sistema`);
    console.log(`${isConnected ? '✅' : '❌'} Conectividade do webhook`);
    
    if (!hasConfig) {
      console.log('\n⚠️ AÇÃO NECESSÁRIA: Configurar credenciais Oasyfy no .env');
    }
    
    if (!isConnected) {
      console.log('\n⚠️ AÇÃO NECESSÁRIA: Verificar se o servidor está rodando e acessível');
    }
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  testWebhookConnectivity,
  simulateOasyfyWebhook,
  testTokenValidation,
  checkSystemConfiguration
};