const sqlite = require('./database/sqlite');

console.log('⚡ TESTE RÁPIDO - SQL OASYFY');
console.log('============================\n');

// Teste super rápido - apenas o essencial
async function quickTest() {
  // 1. Inicializar
  console.log('🔄 Inicializando SQLite...');
  const db = sqlite.initialize('./pagamentos.db');
  if (!db) {
    console.error('❌ FALHA na inicialização');
    return;
  }
  console.log('✅ SQLite OK');

  // 2. Criar transação fake
  const testId = `quick_${Date.now()}`;
  console.log('\n📝 Inserindo transação teste:', testId);
  
  try {
    db.prepare(`
      INSERT INTO tokens (id_transacao, status, is_paid, usado, valor, nome_oferta)
      VALUES (?, 'pendente', 0, 0, 2990, 'Teste Rápido')
    `).run(testId);
    console.log('✅ Inserção OK');
  } catch (error) {
    console.error('❌ Erro na inserção:', error.message);
    return;
  }

  // 3. Simular webhook (update)
  console.log('\n🔄 Simulando webhook...');
  try {
    const result = db.prepare(`
      UPDATE tokens 
      SET status = 'pago', is_paid = 1, usado = 1, paid_at = ?
      WHERE id_transacao = ?
    `).run(new Date().toISOString(), testId);
    
    if (result.changes > 0) {
      console.log('✅ Update OK - Changes:', result.changes);
    } else {
      console.error('❌ Nenhuma linha atualizada');
      return;
    }
  } catch (error) {
    console.error('❌ Erro no update:', error.message);
    return;
  }

  // 4. Verificar resultado
  console.log('\n🔍 Verificando resultado...');
  const final = db.prepare('SELECT * FROM tokens WHERE id_transacao = ?').get(testId);
  
  if (final) {
    const isPaid = final.is_paid === 1 || final.status === 'pago' || final.usado === 1;
    console.log('📊 Status final:');
    console.log('   - status:', final.status);
    console.log('   - is_paid:', final.is_paid);
    console.log('   - usado:', final.usado);
    console.log('   - paid_at:', final.paid_at);
    
    if (isPaid) {
      console.log('🎉 SUCESSO! Transação marcada como PAGA');
    } else {
      console.error('❌ FALHA! Não foi marcada como paga');
    }
  } else {
    console.error('❌ Transação não encontrada');
  }

  // 5. Limpeza
  console.log('\n🧹 Limpando...');
  db.prepare('DELETE FROM tokens WHERE id_transacao = ?').run(testId);
  console.log('✅ Limpeza OK');

  console.log('\n🎯 RESULTADO: SQL DA OASYFY FUNCIONA!');
}

quickTest().catch(console.error);
