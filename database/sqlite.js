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
        id_transacao TEXT PRIMARY KEY,
        token TEXT UNIQUE,
        telegram_id TEXT,
        valor INTEGER,
        bot_id TEXT,
        utm_source TEXT,
        utm_campaign TEXT,
        utm_medium TEXT,
        utm_term TEXT,
        utm_content TEXT,
        fbp TEXT,
        fbc TEXT,
        ip_criacao TEXT,
        user_agent_criacao TEXT,
        status TEXT DEFAULT 'pendente',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_time INTEGER
      )
    `).run();
    database.prepare(`
      CREATE TABLE IF NOT EXISTS tracking_data (
        telegram_id TEXT PRIMARY KEY,
        fbp TEXT,
        fbc TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare(`
      CREATE TABLE IF NOT EXISTS payload_tracking (
        payload_id TEXT PRIMARY KEY,
        telegram_id TEXT,
        fbp TEXT,
        fbc TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const cols = database.prepare('PRAGMA table_info(tokens)').all();
    const payloadCols = database.prepare('PRAGMA table_info(payload_tracking)').all();
    const checkCol = name => cols.some(c => c.name === name);
    const checkPayloadCol = name => payloadCols.some(c => c.name === name);

    if (!checkCol('id_transacao')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN id_transacao TEXT').run();
    }
    if (!checkCol('bot_id')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN bot_id TEXT').run();
    }
    if (!checkCol('utm_term')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN utm_term TEXT').run();
    }
    if (!checkCol('utm_content')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN utm_content TEXT').run();
    }
    if (!checkCol('fbp')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN fbp TEXT').run();
    }
    if (!checkCol('fbc')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN fbc TEXT').run();
    }
    if (!checkCol('ip_criacao')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN ip_criacao TEXT').run();
    }
    if (!checkCol('user_agent_criacao')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN user_agent_criacao TEXT').run();
    }
    if (!checkCol('event_time')) {
      database.prepare('ALTER TABLE tokens ADD COLUMN event_time INTEGER').run();
    }
    if (!checkPayloadCol('telegram_id')) {
      database.prepare('ALTER TABLE payload_tracking ADD COLUMN telegram_id TEXT').run();
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
