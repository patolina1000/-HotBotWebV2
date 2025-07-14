const { createPool } = require('./database/postgres');

async function initPostgres() {
  const pool = createPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payload_tracking (
      payload_id TEXT PRIMARY KEY,
      fbp TEXT,
      fbc TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Tabela payload_tracking verificada no PostgreSQL');
}

module.exports = initPostgres;
