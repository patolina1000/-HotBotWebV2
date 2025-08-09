const { Pool } = require('pg');
const config = require('../config');

let pool;

function getDatabasePool() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
    max: Number(config.DB_POOL_MAX),
    min: Number(config.DB_POOL_MIN),
    connectionTimeoutMillis: Number(config.DB_CONN_TIMEOUT_MS),
    idleTimeoutMillis: Number(config.DB_CONN_TIMEOUT_MS),
    statement_timeout: Number(config.DB_CONN_TIMEOUT_MS),
    query_timeout: Number(config.DB_CONN_TIMEOUT_MS),
    application_name: 'HotBot-Web',
    options: '-c timezone=America/Recife'
  });

  pool.on('connect', client => {
    client.query("SET timezone = 'America/Recife'").catch(err => {
      console.warn('⚠️ Erro ao configurar timezone:', err.message);
    });
  });

  pool.on('error', err => {
    console.error('❌ Erro no pool PostgreSQL:', err);
  });

  pool.on('remove', () => {
    console.log('🔌 Conexão PostgreSQL removida do pool');
  });

  return pool;
}

module.exports = { getDatabasePool };
