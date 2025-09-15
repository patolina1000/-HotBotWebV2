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
  
  // Garantir que a variável global db seja definida
  db = database;
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
        event_time INTEGER,
        fn_hash TEXT,
        ln_hash TEXT,
        external_id_hash TEXT,
        nome_oferta TEXT
      )
    `).run();
    database.prepare(`
      CREATE TABLE IF NOT EXISTS tracking_data (
        telegram_id TEXT PRIMARY KEY,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_term TEXT,
        utm_content TEXT,
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
    database.prepare(`
      CREATE TABLE IF NOT EXISTS payloads (
        payload_id TEXT PRIMARY KEY,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_term TEXT,
        utm_content TEXT,
        fbp TEXT,
        fbc TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const cols = database.prepare('PRAGMA table_info(tokens)').all();
    const payloadCols = database.prepare('PRAGMA table_info(payload_tracking)').all();
    const trackingCols = database.prepare('PRAGMA table_info(tracking_data)').all();
    const checkCol = name => cols.some(c => c.name === name);
    const checkPayloadCol = name => payloadCols.some(c => c.name === name);
    const checkTrackingCol = name => trackingCols.some(c => c.name === name);

    // Adicionar colunas com tratamento de erro para evitar "duplicate column"
    const addColumnSafely = (table, column, type) => {
      try {
        database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      } catch (err) {
        if (!err.message.includes('duplicate column')) {
          throw err; // Re-throw se não for erro de coluna duplicada
        }
        // Ignorar erro de coluna duplicada (já existe)
      }
    };

    if (!checkCol('id_transacao')) {
      addColumnSafely('tokens', 'id_transacao', 'TEXT');
    }
    if (!checkCol('bot_id')) {
      addColumnSafely('tokens', 'bot_id', 'TEXT');
    }
    if (!checkCol('utm_term')) {
      addColumnSafely('tokens', 'utm_term', 'TEXT');
    }
    if (!checkCol('utm_content')) {
      addColumnSafely('tokens', 'utm_content', 'TEXT');
    }
    if (!checkCol('fbp')) {
      addColumnSafely('tokens', 'fbp', 'TEXT');
    }
    if (!checkCol('fbc')) {
      addColumnSafely('tokens', 'fbc', 'TEXT');
    }
    if (!checkCol('ip_criacao')) {
      addColumnSafely('tokens', 'ip_criacao', 'TEXT');
    }
    if (!checkCol('user_agent_criacao')) {
      addColumnSafely('tokens', 'user_agent_criacao', 'TEXT');
    }
    if (!checkCol('event_time')) {
      addColumnSafely('tokens', 'event_time', 'INTEGER');
    }
    if (!checkCol('fn_hash')) {
      addColumnSafely('tokens', 'fn_hash', 'TEXT');
    }
    if (!checkCol('ln_hash')) {
      addColumnSafely('tokens', 'ln_hash', 'TEXT');
    }
    if (!checkCol('external_id_hash')) {
      addColumnSafely('tokens', 'external_id_hash', 'TEXT');
    }
    if (!checkCol('is_paid')) {
      addColumnSafely('tokens', 'is_paid', 'INTEGER DEFAULT 0');
    }
    if (!checkCol('paid_at')) {
      addColumnSafely('tokens', 'paid_at', 'TEXT');
    }
    if (!checkCol('end_to_end_id')) {
      addColumnSafely('tokens', 'end_to_end_id', 'TEXT');
    }
    if (!checkCol('payer_name')) {
      addColumnSafely('tokens', 'payer_name', 'TEXT');
    }
    if (!checkCol('payer_national_registration')) {
      addColumnSafely('tokens', 'payer_national_registration', 'TEXT');
    }
    if (!checkCol('usado')) {
      addColumnSafely('tokens', 'usado', 'INTEGER DEFAULT 0');
    }
    if (!checkPayloadCol('telegram_id')) {
      addColumnSafely('payload_tracking', 'telegram_id', 'TEXT');
    }
    if (!checkTrackingCol('utm_source')) {
      addColumnSafely('tracking_data', 'utm_source', 'TEXT');
    }
    if (!checkTrackingCol('utm_medium')) {
      addColumnSafely('tracking_data', 'utm_medium', 'TEXT');
    }
    if (!checkTrackingCol('utm_campaign')) {
      addColumnSafely('tracking_data', 'utm_campaign', 'TEXT');
    }
    if (!checkTrackingCol('utm_term')) {
      addColumnSafely('tracking_data', 'utm_term', 'TEXT');
    }
    if (!checkTrackingCol('utm_content')) {
      addColumnSafely('tracking_data', 'utm_content', 'TEXT');
    }
    if (!checkTrackingCol('kwai_click_id')) {
      addColumnSafely('tracking_data', 'kwai_click_id', 'TEXT');
    }
    if (!checkPayloadCol('kwai_click_id')) {
      addColumnSafely('payloads', 'kwai_click_id', 'TEXT');
    }
    console.log('✅ SQLite inicializado');
  } catch (err) {
    console.error('❌ Erro ao inicializar SQLite:', err.message);
    // IMPORTANTE: Mesmo com erro, retornar a instância do banco
    // pois as tabelas básicas já foram criadas
  }
  return database;
}

function get() {
  return db;
}

module.exports = { createDatabase, initialize, get };
