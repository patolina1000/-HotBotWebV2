/**
 * Script para adicionar coluna kwai_click_id na tabela tokens
 * Execute: node add-kwai-click-id-column.js
 */

const sqlite = require('./database/sqlite');

async function addKwaiClickIdColumn() {
  try {
    console.log('🔧 Adicionando coluna kwai_click_id na tabela tokens...');
    
    const db = sqlite.get();
    if (!db) {
      console.error('❌ Banco de dados SQLite não disponível');
      return;
    }

    // Verificar se a coluna já existe
    const columns = db.prepare('PRAGMA table_info(tokens)').all();
    const hasKwaiClickId = columns.some(col => col.name === 'kwai_click_id');
    
    if (hasKwaiClickId) {
      console.log('✅ Coluna kwai_click_id já existe na tabela tokens');
      return;
    }

    // Adicionar a coluna
    db.prepare('ALTER TABLE tokens ADD COLUMN kwai_click_id TEXT').run();
    
    console.log('✅ Coluna kwai_click_id adicionada com sucesso na tabela tokens');
    
    // Verificar se foi criada
    const newColumns = db.prepare('PRAGMA table_info(tokens)').all();
    const kwaiClickIdColumn = newColumns.find(col => col.name === 'kwai_click_id');
    
    if (kwaiClickIdColumn) {
      console.log('✅ Verificação: Coluna kwai_click_id criada com sucesso');
      console.log('📋 Detalhes da coluna:', kwaiClickIdColumn);
    } else {
      console.error('❌ Erro: Coluna kwai_click_id não foi criada');
    }

  } catch (error) {
    console.error('❌ Erro ao adicionar coluna kwai_click_id:', error.message);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  addKwaiClickIdColumn().then(() => {
    console.log('🎉 Script executado com sucesso!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { addKwaiClickIdColumn };
