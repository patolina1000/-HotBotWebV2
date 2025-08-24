const postgres = require('./database/postgres');

async function addColumns() {
  try {
    console.log('Adicionando colunas temporárias para bot especial...');
    
    const pool = postgres.createPool();
    
    await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS payer_name_temp TEXT');
    console.log('✅ Coluna payer_name_temp adicionada');
    
    await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS payer_cpf_temp TEXT');
    console.log('✅ Coluna payer_cpf_temp adicionada');
    
    await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS end_to_end_id_temp TEXT');
    console.log('✅ Coluna end_to_end_id_temp adicionada');
    
    await pool.end();
    console.log('✅ Colunas adicionadas com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao adicionar colunas:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

addColumns();