#!/usr/bin/env node

/**
 * Migration script to allow NULL values in purchase_event_dedup.value
 *
 * Usage: node make-purchase-dedup-value-nullable.js
 */

const { Pool } = require('pg');
require('dotenv').config();

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

async function makeValueColumnNullable(externalPool = null) {
  const pool = externalPool || createPool();
  console.log('🔄 Ajustando coluna value em purchase_event_dedup para aceitar NULL...');

  const checkQuery = `
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_name = 'purchase_event_dedup' AND column_name = 'value'
  `;

  try {
    const result = await pool.query(checkQuery);

    if (result.rowCount === 0) {
      console.log('ℹ️ Tabela purchase_event_dedup ou coluna value não encontrada. Nenhuma alteração realizada.');
      return;
    }

    const isNullable = result.rows[0].is_nullable === 'YES';
    if (isNullable) {
      console.log('✅ Coluna value já aceita NULL. Nada a fazer.');
      return;
    }

    await pool.query('ALTER TABLE purchase_event_dedup ALTER COLUMN value DROP NOT NULL;');
    console.log('✅ Coluna value agora aceita valores NULL.');
  } catch (error) {
    console.error('❌ Erro ao atualizar coluna value:', error);
    throw error;
  } finally {
    if (!externalPool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  makeValueColumnNullable()
    .then(() => {
      console.log('🎉 Migração concluída com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migração falhou:', error.message);
      process.exit(1);
    });
}

module.exports = { makeValueColumnNullable };
