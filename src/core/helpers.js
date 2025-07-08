const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');

function loadEnv(dir) {
  const envPath = path.join(dir, '.env');
  if (fs.existsSync(envPath)) {
    return dotenv.parse(fs.readFileSync(envPath));
  }
  return {};
}

function createDatabase(dir) {
  const dbPath = path.join(dir, 'pagamentos.db');
  const db = new Database(dbPath);
  db.prepare(`CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    telegram_id TEXT,
    valor INTEGER,
    utm_source TEXT,
    utm_campaign TEXT,
    utm_medium TEXT,
    status TEXT DEFAULT 'pendente',
    token_uuid TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    bot_id TEXT DEFAULT 'default'
  )`).run();
  return db;
}

module.exports = { loadEnv, createDatabase };
