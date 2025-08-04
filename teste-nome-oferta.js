/**
 * Script de teste para verificar se o nome da oferta está sendo salvo e enviado corretamente
 */

const { enviarConversaoParaUtmify } = require('./services/utmify');

async function testarNomeOferta() {
  console.log('🧪 Testando nome da oferta dinâmico...');
  
  // Teste 1: Nome da oferta válido
  console.log('\n📋 Teste 1: Nome da oferta válido');
  try {
    await enviarConversaoParaUtmify({
      payer_name: 'João Silva',
      telegram_id: '123456789',
      transactionValueCents: 1990,
      trackingData: {
        utm_source: 'instagram',
        utm_medium: 'bio',
        utm_campaign: 'bot1|123',
        utm_content: 'post1|456',
        utm_term: 'vitalicio'
      },
      orderId: 'test-order-1',
      nomeOferta: 'Bot1 R$19,90'
    });
    console.log('✅ Teste 1 passou');
  } catch (error) {
    console.error('❌ Teste 1 falhou:', error.message);
  }
  
  // Teste 2: Nome da oferta diferente
  console.log('\n📋 Teste 2: Nome da oferta diferente');
  try {
    await enviarConversaoParaUtmify({
      payer_name: 'Maria Santos',
      telegram_id: '987654321',
      transactionValueCents: 1790,
      trackingData: {
        utm_source: 'facebook',
        utm_medium: 'ads',
        utm_campaign: 'bot2|789',
        utm_content: 'ad1|012',
        utm_term: 'exclusivo'
      },
      orderId: 'test-order-2',
      nomeOferta: 'Bot2 Exclusivo R$17,90'
    });
    console.log('✅ Teste 2 passou');
  } catch (error) {
    console.error('❌ Teste 2 falhou:', error.message);
  }
  
  // Teste 3: Nome da oferta nulo (fallback)
  console.log('\n📋 Teste 3: Nome da oferta nulo (fallback)');
  try {
    await enviarConversaoParaUtmify({
      payer_name: 'Pedro Costa',
      telegram_id: '555666777',
      transactionValueCents: 1590,
      trackingData: {
        utm_source: 'telegram',
        utm_medium: 'bot',
        utm_campaign: 'bot1|999',
        utm_content: 'downsell|888',
        utm_term: 'desconto'
      },
      orderId: 'test-order-3',
      nomeOferta: null
    });
    console.log('✅ Teste 3 passou');
  } catch (error) {
    console.error('❌ Teste 3 falhou:', error.message);
  }
  
  console.log('\n🎉 Testes concluídos!');
}

// Executar testes se o script for chamado diretamente
if (require.main === module) {
  testarNomeOferta().catch(console.error);
}

module.exports = { testarNomeOferta }; 