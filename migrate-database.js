const sqlite = require('./database/sqlite');

console.log('🔄 Iniciando migração do banco de dados...');

// Inicializar o banco
const db = sqlite.initialize('./pagamentos.db');

if (!db) {
  console.error('❌ Erro ao inicializar banco de dados');
  process.exit(1);
}

console.log('✅ Banco de dados inicializado');

// Verificar se as colunas existem
const cols = db.prepare('PRAGMA table_info(tokens)').all();
const checkCol = name => cols.some(c => c.name === name);

console.log('📋 Colunas existentes:', cols.map(c => c.name));

// Adicionar colunas necessárias
const columnsToAdd = [
  { name: 'is_paid', type: 'INTEGER DEFAULT 0' },
  { name: 'paid_at', type: 'TEXT' },
  { name: 'end_to_end_id', type: 'TEXT' },
  { name: 'payer_name', type: 'TEXT' },
  { name: 'payer_national_registration', type: 'TEXT' },
  { name: 'usado', type: 'INTEGER DEFAULT 0' }
];

let addedCount = 0;

for (const col of columnsToAdd) {
  if (!checkCol(col.name)) {
    try {
      db.prepare(`ALTER TABLE tokens ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`✅ Coluna ${col.name} adicionada`);
      addedCount++;
    } catch (error) {
      console.error(`❌ Erro ao adicionar coluna ${col.name}:`, error.message);
    }
  } else {
    console.log(`ℹ️ Coluna ${col.name} já existe`);
  }
}

console.log(`🎯 Migração concluída: ${addedCount} colunas adicionadas`);

// Verificar estrutura final
const finalCols = db.prepare('PRAGMA table_info(tokens)').all();
console.log('📋 Estrutura final da tabela tokens:');
finalCols.forEach(col => {
  console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
});

process.exit(0);
