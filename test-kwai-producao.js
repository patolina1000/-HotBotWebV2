#!/usr/bin/env node

/**
 * 🎯 TESTE DO FLUXO REAL DA KWAI EVENT API EM PRODUÇÃO
 * 
 * Este script testa o fluxo completo de eventos da Kwai:
 * 1. EVENT_CONTENT_VIEW - Visualização da página
 * 2. EVENT_ADD_TO_CART - Adição ao carrinho (geração PIX)
 * 3. EVENT_PURCHASE - Compra aprovada
 * 
 * IMPORTANTE: Configure KWAI_TEST_MODE=true no .env para testes
 */

require('dotenv').config();

// Verificar configurações
console.log('🔧 Verificando configurações...');
console.log('- KWAI_PIXEL_ID:', process.env.KWAI_PIXEL_ID ? '✅ Configurado' : '❌ Não configurado');
console.log('- KWAI_ACCESS_TOKEN:', process.env.KWAI_ACCESS_TOKEN ? '✅ Configurado' : '❌ Não configurado');
console.log('- KWAI_TEST_MODE:', process.env.KWAI_TEST_MODE);
console.log('- NODE_ENV:', process.env.NODE_ENV);

if (!process.env.KWAI_PIXEL_ID || !process.env.KWAI_ACCESS_TOKEN) {
  console.error('❌ Configure KWAI_PIXEL_ID e KWAI_ACCESS_TOKEN no arquivo .env');
  process.exit(1);
}

// Simular click_id real (você deve pegar um da interface da Kwai)
const CLICK_ID_TESTE = process.env.KWAI_CLICK_ID_TESTE || 'click_id_de_teste_aqui';

if (CLICK_ID_TESTE === 'click_id_de_teste_aqui') {
  console.log('\n⚠️  IMPORTANTE: Para testar com dados reais:');
  console.log('1. Acesse: https://business.kwai.com/');
  console.log('2. Vá em "Test Events" do seu pixel');
  console.log('3. Copie um click_id válido');
  console.log('4. Configure KWAI_CLICK_ID_TESTE no .env');
  console.log('\nContinuando com click_id de teste...\n');
}

// Importar serviço Kwai
const KwaiEventAPI = require('./services/kwaiEventAPI');

async function testarFluxoCompleto() {
  console.log('🎯 Iniciando teste do fluxo completo...\n');
  
  try {
    // 1. EVENT_CONTENT_VIEW - Usuário visualiza a página
    console.log('📱 1. Testando EVENT_CONTENT_VIEW...');
    const viewResult = await KwaiEventAPI.sendContentView(CLICK_ID_TESTE, {
      content_name: 'Landing Page de Teste',
      content_category: 'Bot Telegram',
      content_id: 'teste_producao'
    });
    
    if (viewResult.success) {
      console.log('✅ EVENT_CONTENT_VIEW enviado com sucesso');
      console.log('   Resposta:', viewResult.data);
    } else {
      console.log('❌ EVENT_CONTENT_VIEW falhou:', viewResult.error || viewResult.reason);
    }
    
    console.log('');
    
    // 2. EVENT_ADD_TO_CART - Usuário gera PIX
    console.log('🛒 2. Testando EVENT_ADD_TO_CART...');
    const cartResult = await KwaiEventAPI.sendAddToCart(CLICK_ID_TESTE, {
      content_name: 'Acesso ao Bot Telegram',
      content_category: 'Bot Telegram',
      content_id: 'telegram_bot_access',
      value: 19.90,
      currency: 'BRL'
    });
    
    if (cartResult.success) {
      console.log('✅ EVENT_ADD_TO_CART enviado com sucesso');
      console.log('   Resposta:', cartResult.data);
    } else {
      console.log('❌ EVENT_ADD_TO_CART falhou:', cartResult.error || cartResult.reason);
    }
    
    console.log('');
    
    // 3. EVENT_PURCHASE - Pagamento aprovado
    console.log('💰 3. Testando EVENT_PURCHASE...');
    const purchaseResult = await KwaiEventAPI.sendPurchase(CLICK_ID_TESTE, {
      content_name: 'Acesso ao Bot Telegram',
      content_category: 'Bot Telegram',
      content_id: 'telegram_bot_access',
      value: 19.90,
      currency: 'BRL'
    });
    
    if (purchaseResult.success) {
      console.log('✅ EVENT_PURCHASE enviado com sucesso');
      console.log('   Resposta:', purchaseResult.data);
    } else {
      console.log('❌ EVENT_PURCHASE falhou:', purchaseResult.error || purchaseResult.reason);
    }
    
    console.log('\n🎉 Teste do fluxo completo concluído!');
    
    // Resumo
    console.log('\n📊 RESUMO:');
    console.log('- EVENT_CONTENT_VIEW:', viewResult.success ? '✅' : '❌');
    console.log('- EVENT_ADD_TO_CART:', cartResult.success ? '✅' : '❌');
    console.log('- EVENT_PURCHASE:', purchaseResult.success ? '✅' : '❌');
    
    // Próximos passos
    console.log('\n🔍 PRÓXIMOS PASSOS:');
    console.log('1. Acesse: https://business.kwai.com/');
    console.log('2. Vá em "Test Events" do seu pixel');
    console.log('3. Verifique se os eventos aparecem com "happened..."');
    console.log('4. Se aparecerem, seu fluxo está funcionando!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
  }
}

// Executar teste
testarFluxoCompleto();
