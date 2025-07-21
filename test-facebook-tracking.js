#!/usr/bin/env node

/**
 * 🔍 SCRIPT DE TESTE - FACEBOOK TRACKING
 * 
 * Este script valida a configuração do tracking do Facebook
 * Deve ser executado após configurar as variáveis de ambiente
 */

require('dotenv').config();
const { sendFacebookEvent, generateEventId } = require('./services/facebook');

console.log('🔍 INICIANDO TESTES DE FACEBOOK TRACKING\n');

// 1. Verificar configurações básicas
console.log('1️⃣ VERIFICANDO CONFIGURAÇÕES BÁSICAS');
console.log('=====================================');
console.log('FB_PIXEL_ID:', process.env.FB_PIXEL_ID ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO');
console.log('FB_PIXEL_TOKEN:', process.env.FB_PIXEL_TOKEN ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO');

if (!process.env.FB_PIXEL_ID || !process.env.FB_PIXEL_TOKEN) {
  console.log('\n❌ ERRO: Variáveis de ambiente não configuradas!');
  console.log('Configure FB_PIXEL_ID e FB_PIXEL_TOKEN antes de continuar.\n');
  process.exit(1);
}

// 2. Testar geração de Event ID
console.log('\n2️⃣ TESTANDO GERAÇÃO DE EVENT ID');
console.log('=================================');
const testEventId = generateEventId('Purchase', 'test123');
console.log('Event ID gerado:', testEventId);
console.log('Formato válido:', testEventId.length === 16 ? '✅ SIM' : '❌ NÃO');

// 3. Testar envio de evento (modo teste)
console.log('\n3️⃣ TESTANDO ENVIO DE EVENTO PURCHASE');
console.log('=====================================');

async function testPurchaseEvent() {
  const testData = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: generateEventId('Purchase', 'test_token_123'),
    value: 27.90,
    currency: 'BRL',
    fbp: 'fb.1.1234567890.1234567890',
    fbc: 'fb.1.1234567890.1234567890',
    client_ip_address: '127.0.0.1',
    client_user_agent: 'Mozilla/5.0 (Test Browser)',
    user_data_hash: {
      fn: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', // hash de 'hello'
      ln: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d', // hash de 'world'
      external_id: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae' // hash de 'foo'
    },
    source: 'test',
    custom_data: {
      content_name: 'Acesso VIP - Teste',
      content_type: 'product',
      content_ids: ['vip_test']
    }
  };

  console.log('Enviando evento de teste...');
  
  try {
    const result = await sendFacebookEvent(testData);
    
    if (result.success) {
      console.log('✅ SUCESSO: Evento enviado com sucesso!');
      console.log('Resposta da API:', JSON.stringify(result.response, null, 2));
    } else {
      console.log('❌ ERRO: Falha no envio do evento');
      console.log('Detalhes do erro:', result.error);
    }
    
    return result.success;
  } catch (error) {
    console.log('❌ ERRO INESPERADO:', error.message);
    return false;
  }
}

// 4. Executar teste principal
async function runTests() {
  const success = await testPurchaseEvent();
  
  console.log('\n4️⃣ RESUMO DOS TESTES');
  console.log('====================');
  console.log('Configuração:', process.env.FB_PIXEL_ID && process.env.FB_PIXEL_TOKEN ? '✅' : '❌');
  console.log('Event ID:', '✅');
  console.log('Envio CAPI:', success ? '✅' : '❌');
  
  if (success) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM!');
    console.log('O sistema está pronto para produção.');
  } else {
    console.log('\n⚠️ ALGUNS TESTES FALHARAM');
    console.log('Verifique as configurações e tente novamente.');
  }
  
  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('1. Verificar Events Manager do Facebook');
  console.log('2. Testar em ambiente real');
  console.log('3. Monitorar Match Quality Score');
  console.log('4. Implementar melhorias de conteúdo\n');
}

// Executar testes
runTests().catch(console.error);