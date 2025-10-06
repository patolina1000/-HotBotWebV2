#!/usr/bin/env node

/**
 * Script para executar correções de schema do Purchase CAPI
 * 
 * Este script:
 * 1. Conecta ao PostgreSQL
 * 2. Executa o SQL de correção de schema
 * 3. Valida as alterações
 * 4. Exibe relatório de status
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function main() {
  console.log('🚀 Iniciando correção de schema do Purchase CAPI...\n');

  try {
    // 1. Verificar conexão
    console.log('📡 Testando conexão com PostgreSQL...');
    const testResult = await pool.query('SELECT NOW()');
    console.log(`✅ Conectado com sucesso! Timestamp: ${testResult.rows[0].now}\n`);

    // 2. Ler arquivo SQL
    console.log('📄 Lendo arquivo de correção SQL...');
    const sqlPath = path.join(__dirname, 'fix-purchase-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`✅ Arquivo lido: ${sqlPath}\n`);

    // 3. Executar correções
    console.log('🔧 Executando correções de schema...\n');
    console.log('='.repeat(80));
    const result = await pool.query(sql);
    console.log('='.repeat(80));
    console.log('\n✅ Correções executadas com sucesso!\n');

    // 4. Validar estrutura da purchase_event_dedup
    console.log('🔍 Validando estrutura da tabela purchase_event_dedup...');
    const dedupColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'purchase_event_dedup'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Colunas da tabela purchase_event_dedup:');
    console.table(dedupColumns.rows);

    // Verificar colunas essenciais
    const requiredColumns = ['event_id', 'transaction_id', 'expires_at', 'created_at', 'source'];
    const existingColumns = dedupColumns.rows.map(row => row.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.warn(`⚠️  Colunas faltantes: ${missingColumns.join(', ')}`);
    } else {
      console.log('✅ Todas as colunas essenciais estão presentes!');
    }

    // 5. Validar índices
    console.log('\n🔍 Validando índices...');
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'purchase_event_dedup'
      ORDER BY indexname
    `);

    console.log('\n📋 Índices da tabela purchase_event_dedup:');
    console.table(indexes.rows);

    // 6. Validar estrutura da tabela tokens
    console.log('\n🔍 Validando colunas CAPI na tabela tokens...');
    const tokensColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tokens'
      AND column_name IN ('bot_id', 'capi_ready', 'capi_sent', 'pixel_sent', 'capi_processing', 'event_attempts', 'first_event_sent_at')
      ORDER BY column_name
    `);

    console.log('\n📋 Colunas CAPI da tabela tokens:');
    console.table(tokensColumns.rows);

    // Verificar colunas essenciais da tokens
    const requiredTokenColumns = ['bot_id', 'capi_ready', 'capi_sent'];
    const existingTokenColumns = tokensColumns.rows.map(row => row.column_name);
    const missingTokenColumns = requiredTokenColumns.filter(col => !existingTokenColumns.includes(col));

    if (missingTokenColumns.length > 0) {
      console.warn(`⚠️  Colunas faltantes na tokens: ${missingTokenColumns.join(', ')}`);
    } else {
      console.log('✅ Todas as colunas essenciais da tokens estão presentes!');
    }

    // 7. Estatísticas
    console.log('\n📊 Estatísticas da tabela purchase_event_dedup:');
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_records,
        COUNT(CASE WHEN expires_at >= NOW() THEN 1 END) as active_records,
        COUNT(DISTINCT source) as distinct_sources
      FROM purchase_event_dedup
    `);

    if (stats.rows.length > 0) {
      console.table(stats.rows);
    } else {
      console.log('ℹ️  Tabela vazia (esperado em primeira execução)');
    }

    // 8. Resumo final
    console.log('\n' + '='.repeat(80));
    console.log('✅ CORREÇÃO DE SCHEMA CONCLUÍDA COM SUCESSO!');
    console.log('='.repeat(80));
    console.log('\n📋 Próximos passos:');
    console.log('  1. Reiniciar a aplicação (npm restart ou pm2 restart)');
    console.log('  2. Realizar um teste de pagamento');
    console.log('  3. Verificar logs detalhados do Purchase CAPI');
    console.log('  4. Confirmar Purchase no Gerenciador de Eventos do Meta');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ ERRO AO EXECUTAR CORREÇÕES:');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
