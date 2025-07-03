// salvar como ajustar_token.js
const Database = require('better-sqlite3');
const db = new Database('./pagamentos.db');

try {
  db.prepare('ALTER TABLE tokens ADD COLUMN token_uuid TEXT;').run();
  console.log('✅ Coluna token_uuid adicionada com sucesso.');
} catch (err) {
  console.error('❌ Erro:', err.message);
}
