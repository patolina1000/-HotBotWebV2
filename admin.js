#!/usr/bin/env node

require('dotenv').config();
const sqlite = require('./database/sqlite');
const postgres = require('./database/postgres');

async function limparTokens() {
  // SQLite delete
  try {
    const db = sqlite.createDatabase();
    const stmt = db.prepare(`
      DELETE FROM access_links
      WHERE (status IS NULL OR status = 'canceled')
        AND (enviado_pixel IS NULL OR enviado_pixel = 0)
        AND (acesso_usado IS NULL OR acesso_usado = 0)
    `);
    const info = stmt.run();
    console.log(`✅ SQLite: ${info.changes} tokens removidos`);
  } catch (err) {
    console.error('❌ Erro SQLite:', err.message);
  }

  // PostgreSQL delete
  let pool;
  try {
    pool = postgres.createPool();
    const result = await pool.query(`
      DELETE FROM access_links
      WHERE (status IS NULL OR status = 'canceled')
        AND (enviado_pixel IS NULL OR enviado_pixel = false)
        AND (acesso_usado IS NULL OR acesso_usado = false)
    `);
    console.log(`✅ PostgreSQL: ${result.rowCount} tokens removidos`);
  } catch (err) {
    console.error('❌ Erro PostgreSQL:', err.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'limpar-tokens') {
    await limparTokens();
  } else {
    console.log('Comando inválido. Use: node admin.js limpar-tokens');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
}
