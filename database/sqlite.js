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
        price_cents INTEGER,
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
        tipo TEXT DEFAULT 'principal',
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
        geo_country TEXT,
        geo_country_code TEXT,
        geo_region TEXT,
        geo_region_name TEXT,
        geo_city TEXT,
        geo_postal_code TEXT,
        geo_ip_query TEXT,
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
        geo_country TEXT,
        geo_country_code TEXT,
        geo_region TEXT,
        geo_region_name TEXT,
        geo_city TEXT,
        geo_postal_code TEXT,
        geo_ip_query TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare(`
      CREATE TABLE IF NOT EXISTS zap_controle (
        id INTEGER PRIMARY KEY,
        ultimo_zap_usado TEXT DEFAULT 'zap1',
        leads_zap1 INTEGER DEFAULT 0,
        leads_zap2 INTEGER DEFAULT 0,
        zap1_numero TEXT DEFAULT '5511999999999',
        zap2_numero TEXT DEFAULT '5511888888888',
        historico TEXT DEFAULT '[]',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const cols = database.prepare('PRAGMA table_info(tokens)').all();
    const payloadCols = database.prepare('PRAGMA table_info(payload_tracking)').all();
    const payloadsCols = database.prepare('PRAGMA table_info(payloads)').all();
    const trackingCols = database.prepare('PRAGMA table_info(tracking_data)').all();
    const zapControleCols = database.prepare('PRAGMA table_info(zap_controle)').all();
    const checkCol = name => cols.some(c => c.name === name);
    const checkPayloadCol = name => payloadCols.some(c => c.name === name);
    const checkPayloadsCol = name => payloadsCols.some(c => c.name === name);
    const checkTrackingCol = name => trackingCols.some(c => c.name === name);
    const checkZapControleCol = name => zapControleCols.some(c => c.name === name);

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
    if (!checkCol('tipo')) {
      addColumnSafely('tokens', 'tipo', "TEXT DEFAULT 'principal'");
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
    if (!checkCol('price_cents')) {
      addColumnSafely('tokens', 'price_cents', 'INTEGER');
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
    if (!checkCol('payer_cpf')) {
      addColumnSafely('tokens', 'payer_cpf', 'TEXT');
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
    if (!checkPayloadCol('geo_country')) {
      addColumnSafely('payload_tracking', 'geo_country', 'TEXT');
    }
    if (!checkPayloadCol('geo_country_code')) {
      addColumnSafely('payload_tracking', 'geo_country_code', 'TEXT');
    }
    if (!checkPayloadCol('geo_region')) {
      addColumnSafely('payload_tracking', 'geo_region', 'TEXT');
    }
    if (!checkPayloadCol('geo_region_name')) {
      addColumnSafely('payload_tracking', 'geo_region_name', 'TEXT');
    }
    if (!checkPayloadCol('geo_city')) {
      addColumnSafely('payload_tracking', 'geo_city', 'TEXT');
    }
    if (!checkPayloadCol('geo_postal_code')) {
      addColumnSafely('payload_tracking', 'geo_postal_code', 'TEXT');
    }
    if (!checkPayloadCol('geo_ip_query')) {
      addColumnSafely('payload_tracking', 'geo_ip_query', 'TEXT');
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
    if (!checkPayloadsCol('geo_country')) {
      addColumnSafely('payloads', 'geo_country', 'TEXT');
    }
    if (!checkPayloadsCol('geo_country_code')) {
      addColumnSafely('payloads', 'geo_country_code', 'TEXT');
    }
    if (!checkPayloadsCol('geo_region')) {
      addColumnSafely('payloads', 'geo_region', 'TEXT');
    }
    if (!checkPayloadsCol('geo_region_name')) {
      addColumnSafely('payloads', 'geo_region_name', 'TEXT');
    }
    if (!checkPayloadsCol('geo_city')) {
      addColumnSafely('payloads', 'geo_city', 'TEXT');
    }
    if (!checkPayloadsCol('geo_postal_code')) {
      addColumnSafely('payloads', 'geo_postal_code', 'TEXT');
    }
    if (!checkPayloadsCol('geo_ip_query')) {
      addColumnSafely('payloads', 'geo_ip_query', 'TEXT');
    }
    if (!checkCol('qr_code_base64')) {
      addColumnSafely('tokens', 'qr_code_base64', 'TEXT');
    }
    if (!checkCol('pix_copia_cola')) {
      addColumnSafely('tokens', 'pix_copia_cola', 'TEXT');
    }
    if (!checkCol('gateway')) {
      addColumnSafely('tokens', 'gateway', 'TEXT DEFAULT "oasyfy"');
    }
    if (!checkCol('payer_name_temp')) {
      addColumnSafely('tokens', 'payer_name_temp', 'TEXT');
    }
    if (!checkCol('payer_cpf_temp')) {
      addColumnSafely('tokens', 'payer_cpf_temp', 'TEXT');
    }
    if (!checkCol('end_to_end_id_temp')) {
      addColumnSafely('tokens', 'end_to_end_id_temp', 'TEXT');
    }
    if (!checkCol('identifier')) {
      addColumnSafely('tokens', 'identifier', 'TEXT');
    }
    if (!checkCol('first_name')) {
      addColumnSafely('tokens', 'first_name', 'TEXT');
    }
    if (!checkCol('last_name')) {
      addColumnSafely('tokens', 'last_name', 'TEXT');
    }
    if (!checkCol('phone')) {
      addColumnSafely('tokens', 'phone', 'TEXT');
    }
    if (!checkZapControleCol('historico')) {
      addColumnSafely('zap_controle', 'historico', 'TEXT DEFAULT "[]"');
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
