const Database = require('better-sqlite3');

try {
  const db = new Database('./pagamentos.db');

  const deleted = db.prepare('DELETE FROM downsell_progress').run();

  console.log(`✅ Reset realizado com sucesso. ${deleted.changes} registros removidos da tabela downsell_progress.`);
} catch (err) {
  console.error('❌ Erro ao resetar os downsells:', err.message);
}

