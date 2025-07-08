const path = require('path');
const fs = require('fs');
const sqlite3 = require('better-sqlite3');
const { Client } = require('pg');
require('dotenv').config();

function migrateSqlite() {
  const dbPath = path.join(__dirname, 'MODELO1', 'WEB', 'tokens.db');
  if (!fs.existsSync(dbPath)) {
    console.log('SQLite: arquivo tokens.db não encontrado, pulando.');
    return;
  }
  const db = new sqlite3(dbPath);
  const cols = db.prepare('PRAGMA table_info(tokens)').all();
  const hasBotId = cols.some(c => c.name === 'bot_id');
  if (!hasBotId) {
    db.prepare("ALTER TABLE tokens ADD COLUMN bot_id TEXT DEFAULT 'default'").run();
    console.log('SQLite: coluna bot_id adicionada.');
  } else {
    console.log('SQLite: coluna bot_id já existe.');
  }
  db.close();
}

async function migratePostgres() {
  if (!process.env.DATABASE_URL) {
    console.log('PostgreSQL: DATABASE_URL não definida, pulando.');
    return;
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  await client.query("ALTER TABLE tokens ADD COLUMN IF NOT EXISTS bot_id TEXT DEFAULT 'default'");
  await client.query("ALTER TABLE downsell_progress ADD COLUMN IF NOT EXISTS bot_id TEXT DEFAULT 'default'");
  await client.end();
  console.log('PostgreSQL: migração concluída.');
}

async function main() {
  migrateSqlite();
  try {
    await migratePostgres();
  } catch (err) {
    console.error('Erro na migração PostgreSQL:', err.message);
  }
}

if (require.main === module) {
  main();
}