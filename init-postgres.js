const { initializeDatabase } = require('./database/postgres');
const { makeValueColumnNullable } = require('./make-purchase-dedup-value-nullable');

async function initPostgres() {
  const pool = await initializeDatabase();
  await makeValueColumnNullable(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payload_tracking (
      payload_id TEXT PRIMARY KEY,
      telegram_id BIGINT,
      fbp TEXT,
      fbc TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    ALTER TABLE payload_tracking
    ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
  `);
  console.log('✅ Tabela payloads verificada no PostgreSQL');
  console.log('✅ Tabela payload_tracking verificada no PostgreSQL');
  return pool;
}

module.exports = initPostgres;
