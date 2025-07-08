const Database = require('better-sqlite3');
let db = null;

function createDatabase(path = './pagamentos.db') {
  if (db) return db;
  try {
    db = new Database(path);
  } catch (err) {
    console.error('❌ Erro ao abrir SQLite:', err.message);
    db = null;
  }
  return db;
}

function initialize(path = './pagamentos.db') {
  const database = createDatabase(path);
  if (!database) return null;
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        telegram_id TEXT,
        valor INTEGER,
        utm_source TEXT,
        utm_campaign TEXT,
        utm_medium TEXT,
        status TEXT DEFAULT 'pendente',
        token_uuid TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const cols = database.prepare('PRAGMA table_info(tokens)').all();
    const hasUuid = cols.some(c => c.name === 'token_uuid');
    if (!hasUuid) {
      database.prepare('ALTER TABLE tokens ADD COLUMN token_uuid TEXT').run();
    }
    console.log('✅ SQLite inicializado');
  } catch (err) {
    console.error('❌ Erro ao inicializar SQLite:', err.message);
  }
  return database;
}

function get() {
  return db;
}

module.exports = { createDatabase, initialize, get };
