const { createPool } = require('./database/postgres');

async function initPostgres() {
  const pool = createPool();
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
      kwai_click_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracking_data (
      telegram_id BIGINT PRIMARY KEY,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_term TEXT,
      utm_content TEXT,
      fbp TEXT,
      fbc TEXT,
      ip TEXT,
      user_agent TEXT,
      kwai_click_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    ALTER TABLE payload_tracking
    ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
  `);
  await pool.query(`
    ALTER TABLE payloads
    ADD COLUMN IF NOT EXISTS kwai_click_id TEXT;
  `);
  await pool.query(`
    ALTER TABLE tracking_data
    ADD COLUMN IF NOT EXISTS kwai_click_id TEXT;
  `);
  console.log('✅ Tabela payloads verificada no PostgreSQL');
  console.log('✅ Tabela payload_tracking verificada no PostgreSQL');
  console.log('✅ Tabela tracking_data verificada no PostgreSQL');
}

module.exports = initPostgres;
