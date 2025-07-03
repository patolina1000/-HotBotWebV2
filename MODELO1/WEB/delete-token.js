const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('tokens.db');

// Altere aqui o token que você quer deletar
const token = 'abc123';

db.run('DELETE FROM tokens WHERE token = ?', [token], function (err) {
  if (err) {
    return console.error('❌ Erro ao deletar token:', err.message);
  }

  if (this.changes > 0) {
    console.log(`✅ Token "${token}" deletado com sucesso.`);
  } else {
    console.log(`⚠️ Token "${token}" não encontrado.`);
  }
});
