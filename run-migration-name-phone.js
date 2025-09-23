// Script para executar migração das colunas first_name, last_name e phone
require('dotenv').config();

const postgres = require('./database/postgres');
const sqlite = require('./database/sqlite');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Iniciando migração para adicionar colunas first_name, last_name e phone...');
  
  try {
    // Migração PostgreSQL
    const pool = postgres.getPool();
    if (pool) {
      console.log('📊 Executando migração no PostgreSQL...');
      const migrationSQL = fs.readFileSync(
        path.join(__dirname, 'migrations', '20250923_add_name_phone_columns.sql'),
        'utf8'
      );
      
      await pool.query(migrationSQL);
      console.log('✅ Migração PostgreSQL concluída com sucesso');
    } else {
      console.log('⚠️ PostgreSQL não disponível, pulando migração');
    }
    
    // Migração SQLite
    const db = sqlite.get();
    if (db) {
      console.log('💾 Executando migração no SQLite...');
      
      // Verificar se as colunas já existem
      const cols = db.prepare('PRAGMA table_info(tokens)').all();
      const hasFirstName = cols.some(c => c.name === 'first_name');
      const hasLastName = cols.some(c => c.name === 'last_name');
      const hasPhone = cols.some(c => c.name === 'phone');
      
      if (!hasFirstName) {
        db.prepare('ALTER TABLE tokens ADD COLUMN first_name TEXT').run();
        console.log('✅ Coluna first_name adicionada ao SQLite');
      } else {
        console.log('ℹ️ Coluna first_name já existe no SQLite');
      }
      
      if (!hasLastName) {
        db.prepare('ALTER TABLE tokens ADD COLUMN last_name TEXT').run();
        console.log('✅ Coluna last_name adicionada ao SQLite');
      } else {
        console.log('ℹ️ Coluna last_name já existe no SQLite');
      }
      
      if (!hasPhone) {
        db.prepare('ALTER TABLE tokens ADD COLUMN phone TEXT').run();
        console.log('✅ Coluna phone adicionada ao SQLite');
      } else {
        console.log('ℹ️ Coluna phone já existe no SQLite');
      }
    } else {
      console.log('⚠️ SQLite não disponível, pulando migração');
    }
    
    console.log('🎉 Migração concluída com sucesso!');
    console.log('');
    console.log('📋 Resumo das modificações:');
    console.log('- Adicionadas colunas first_name, last_name e phone na tabela tokens');
    console.log('- Implementadas funções splitFullName() e normalizePhone()');
    console.log('- Modificados endpoints para processar nome e telefone automaticamente');
    console.log('- Endpoint /api/whatsapp/gerar-token já processa nome e telefone');
    console.log('- Outros endpoints salvam null quando nome/telefone não disponíveis');
    
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Executar migração se chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
