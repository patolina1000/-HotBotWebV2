#!/usr/bin/env node

require('dotenv').config();
const sqlite = require('./database/sqlite');
const postgres = require('./database/postgres');
const readline = require('readline');

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

async function limparTabelaTokens() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await new Promise(resolve => {
    rl.question('Tem certeza que deseja apagar TODOS os registros da tabela tokens? Digite "SIM" para confirmar: ', answer => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (resposta !== 'SIM') {
    console.log('❌ Operação cancelada pelo usuário.');
    process.exit(1);
  }

  console.log('🧹 Apagando tokens em SQLite e PostgreSQL...');

  let totalSqlite = 0;
  let totalPostgres = 0;

  try {
    const db = sqlite.createDatabase();
    const stmt = db.prepare('DELETE FROM tokens');
    const info = stmt.run();
    totalSqlite = info.changes;
    console.log(`✅ SQLite: ${totalSqlite} tokens removidos`);
  } catch (err) {
    console.error('❌ Erro SQLite:', err.message);
  }

  let pool;
  try {
    pool = postgres.createPool();
    const result = await pool.query('DELETE FROM tokens');
    totalPostgres = result.rowCount;
    console.log(`✅ PostgreSQL: ${totalPostgres} tokens removidos`);
  } catch (err) {
    console.error('❌ Erro PostgreSQL:', err.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }

  console.log(`✅ Operação concluída. SQLite: ${totalSqlite}, PostgreSQL: ${totalPostgres}`);
  process.exit(0);
}

async function main() {
  const command = process.argv[2];
  if (command === 'limpar-tokens') {
    await limparTokens();
    process.exit(0);
  } else if (command === 'tokens:limpar') {
    await limparTabelaTokens();
  } else {
    console.log('Comando inválido. Use: node admin.js limpar-tokens ou tokens:limpar');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
}
