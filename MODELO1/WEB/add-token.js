const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('tokens.db');

// Altere o token aqui
const token = 'abc123';

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      usado INTEGER DEFAULT 0,
      bot_id TEXT DEFAULT 'default'
    )
  `);

  db.all('PRAGMA table_info(tokens)', (err, cols) => {
    if (!err) {
      const hasBotId = cols.some(c => c.name === 'bot_id');
      if (!hasBotId) {
        db.run("ALTER TABLE tokens ADD COLUMN bot_id TEXT DEFAULT 'default'");
      }
    }
  });

  db.run('INSERT OR IGNORE INTO tokens (token, usado) VALUES (?, 0)', [token], function (err) {
    if (err) {
      return console.error('❌ Erro ao inserir token:', err.message);
    }
    console.log(`✅ Token "${token}" inserido com sucesso.`);
  });
});
