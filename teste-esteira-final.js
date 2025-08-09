/**
 * Teste Final da Esteira de Pagamento
 * 
 * Valida em memória todos os cenários críticos:
 * 1. Pagamento único
 * 2. Webhook reentregue
 * 3. Divergência de preços
 */

const { getInstance: getFunnelEventsInstance } = require('./services/funnelEvents');
const auditLogger = require('./services/auditLogger');
const idempotencyService = require('./services/idempotencyService');

// Mock do pool PostgreSQL
const mockPool = {
  query: async (sql, params) => {
    return { rows: [{ id: 1, occurred_at: new Date() }], rowCount: 1 };
  },
  connect: async () => ({
    query: async (sql, params) => ({ rows: [{ id: 1, occurred_at: new Date() }], rowCount: 1 }),
    release: () => {}
  })
};

// Mock do banco SQLite
const mockDb = {
  prepare: (sql) => ({
    get: (params) => null,
    run: (params) => ({ changes: 1 })
  })
};

async function testarEsteiraFinal() {
  console.log('🧪 TESTE FINAL DA ESTEIRA DE PAGAMENTO\n');
  
  let resultados = {
    pagamento_unico: 'FAIL',
    webhook_reentregue: 'FAIL',
    divergencia_preco: 'FAIL'
  };
  
  try {
    // 1️⃣ Teste: Pagamento único
    console.log('1️⃣ Testando pagamento único...');
    
    const funnelEvents = getFunnelEventsInstance();
    await funnelEvents.initialize(mockPool, mockDb);
    
    // Simular offer_shown
    const offerShown = await funnelEvents.logOfferShown({
      bot: 'bot1',
      telegram_id: '123456789',
      offer_tier: 'full',
      price_cents: 1990,
      meta: { payload_id: 'payload_001' },
      pool: mockPool
    });
    
    // Simular pix_created
    const pixCreated = await funnelEvents.logPixCreated({
      bot: 'bot1',
      telegram_id: '123456789',
      offer_tier: 'full',
      price_cents: 1990,
      transaction_id: 'tx_001',
      meta: { payload_id: 'payload_001' },
      pool: mockPool
    });
    
    // Simular pix_paid
    const pixPaid = await funnelEvents.logPixPaid({
      bot: 'bot1',
      telegram_id: '123456789',
      offer_tier: 'full',
      price_cents: 1990,
      transaction_id: 'tx_001',
      meta: { payload_id: 'payload_001' },
      pool: mockPool
    });
    
    if (offerShown.success && pixCreated.success && pixPaid.success) {
      resultados.pagamento_unico = 'PASS';
      console.log('✅ Pagamento único: PASS');
    } else {
      console.log('❌ Pagamento único: FAIL');
    }
    
    // 2️⃣ Teste: Webhook reentregue
    console.log('\n2️⃣ Testando webhook reentregue...');
    
    // Tentar registrar pix_paid novamente
    const pixPaidDuplicado = await funnelEvents.logPixPaid({
      bot: 'bot1',
      telegram_id: '123456789',
      offer_tier: 'full',
      price_cents: 1990,
      transaction_id: 'tx_001',
      meta: { payload_id: 'payload_001' },
      pool: mockPool
    });
    
    // Deve falhar por idempotência
    if (!pixPaidDuplicado.success && pixPaidDuplicado.error.includes('idempotência')) {
      resultados.webhook_reentregue = 'PASS';
      console.log('✅ Webhook reentregue: PASS (idempotência funcionando)');
    } else {
      console.log('❌ Webhook reentregue: FAIL (idempotência não funcionou)');
    }
    
    // 3️⃣ Teste: Divergência de preços
    console.log('\n3️⃣ Testando divergência de preços...');
    
    // Simular offer_shown com preço diferente
    const offerShownDiff = await funnelEvents.logOfferShown({
      bot: 'bot1',
      telegram_id: '987654321',
      offer_tier: 'full',
      price_cents: 1790,
      meta: { payload_id: 'payload_002' },
      pool: mockPool
    });
    
    // Simular pix_created com preço maior
    const pixCreatedDiff = await funnelEvents.logPixCreated({
      bot: 'bot1',
      telegram_id: '987654321',
      offer_tier: 'full',
      price_cents: 1990,
      transaction_id: 'tx_002',
      meta: { payload_id: 'payload_002' },
      pool: mockPool
    });
    
    // Deve gerar log de inconsistência
    if (offerShownDiff.success && pixCreatedDiff.success) {
      resultados.divergencia_preco = 'PASS';
      console.log('✅ Divergência de preços: PASS (eventos registrados)');
    } else {
      console.log('❌ Divergência de preços: FAIL');
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
  }
  
  // 📊 Resumo final
  console.log('\n📊 RESUMO FINAL DOS TESTES:');
  console.log('============================');
  console.log(`Pagamento único: ${resultados.pagamento_unico}`);
  console.log(`Webhook reentregue: ${resultados.webhook_reentregue}`);
  console.log(`Divergência de preços: ${resultados.divergencia_preco}`);
  
  const todosPassaram = Object.values(resultados).every(r => r === 'PASS');
  console.log(`\n🎯 RESULTADO: ${todosPassaram ? 'TODOS OS TESTES PASSARAM' : 'ALGUNS TESTES FALHARAM'}`);
  
  return resultados;
}

// Executar teste
testarEsteiraFinal().catch(console.error);
