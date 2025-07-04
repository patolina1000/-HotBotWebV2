#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para formatear data
function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString('pt-BR');
}

// Função para truncar token para exibição
function truncateToken(token) {
  if (!token) return 'N/A';
  return token.substring(0, 12) + '...';
}

// Listar todos os tokens
async function listTokens() {
  try {
    const result = await pool.query(`
      SELECT 
        token, 
        usado, 
        valor, 
        data_criacao, 
        data_uso, 
        ip_uso 
      FROM tokens 
      ORDER BY data_criacao DESC
    `);
    
    console.log('\n📋 LISTA DE TOKENS:');
    console.log('═'.repeat(120));
    console.log('TOKEN          | USADO | VALOR  | CRIADO EM          | USADO EM           | IP');
    console.log('═'.repeat(120));
    
    if (result.rows.length === 0) {
      console.log('Nenhum token encontrado.');
      return;
    }
    
    result.rows.forEach(row => {
      const usado = row.usado ? '✅' : '❌';
      const valor = `R$ ${parseFloat(row.valor).toFixed(2)}`;
      const criado = formatDate(row.data_criacao);
      const usadoEm = formatDate(row.data_uso);
      const ip = row.ip_uso || 'N/A';
      
      console.log(`${truncateToken(row.token).padEnd(14)} | ${usado.padEnd(5)} | ${valor.padEnd(6)} | ${criado.padEnd(18)} | ${usadoEm.padEnd(18)} | ${ip}`);
    });
    
    console.log('═'.repeat(120));
    console.log(`Total: ${result.rows.length} tokens`);
    
  } catch (error) {
    console.error('❌ Erro ao listar tokens:', error.message);
  }
}

// Listar apenas tokens usados
async function listUsedTokens() {
  try {
    const result = await pool.query(`
      SELECT 
        token, 
        valor, 
        data_criacao, 
        data_uso, 
        ip_uso 
      FROM tokens 
      WHERE usado = TRUE 
      ORDER BY data_uso DESC
    `);
    
    console.log('\n✅ TOKENS USADOS:');
    console.log('═'.repeat(120));
    console.log('TOKEN          | VALOR  | CRIADO EM          | USADO EM           | IP');
    console.log('═'.repeat(120));
    
    if (result.rows.length === 0) {
      console.log('Nenhum token usado encontrado.');
      return;
    }
    
    result.rows.forEach(row => {
      const valor = `R$ ${parseFloat(row.valor).toFixed(2)}`;
      const criado = formatDate(row.data_criacao);
      const usadoEm = formatDate(row.data_uso);
      const ip = row.ip_uso || 'N/A';
      
      console.log(`${truncateToken(row.token).padEnd(14)} | ${valor.padEnd(6)} | ${criado.padEnd(18)} | ${usadoEm.padEnd(18)} | ${ip}`);
    });
    
    console.log('═'.repeat(120));
    console.log(`Total: ${result.rows.length} tokens usados`);
    
  } catch (error) {
    console.error('❌ Erro ao listar tokens usados:', error.message);
  }
}

// Apagar tokens usados
async function deleteUsedTokens() {
  try {
    const result = await pool.query('DELETE FROM tokens WHERE usado = TRUE');
    console.log(`✅ ${result.rowCount} tokens usados foram deletados com sucesso!`);
  } catch (error) {
    console.error('❌ Erro ao deletar tokens usados:', error.message);
  }
}

// Apagar TODOS os tokens
async function deleteAllTokens() {
  try {
    const result = await pool.query('DELETE FROM tokens');
    console.log(`✅ ${result.rowCount} tokens foram deletados com sucesso!`);
  } catch (error) {
    console.error('❌ Erro ao deletar todos os tokens:', error.message);
  }
}

// Estatísticas
async function showStats() {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN usado = TRUE THEN 1 END) as tokens_usados,
        COUNT(CASE WHEN usado = FALSE THEN 1 END) as tokens_disponiveis,
        SUM(CASE WHEN usado = TRUE THEN valor ELSE 0 END) as valor_total_usado,
        SUM(valor) as valor_total_criado,
        COUNT(CASE WHEN DATE(data_criacao) = CURRENT_DATE THEN 1 END) as tokens_hoje
      FROM tokens
    `);
    
    const stats = result.rows[0];
    
    console.log('\n📊 ESTATÍSTICAS:');
    console.log('═'.repeat(50));
    console.log(`📝 Total de tokens: ${stats.total_tokens}`);
    console.log(`✅ Tokens usados: ${stats.tokens_usados}`);
    console.log(`⏳ Tokens disponíveis: ${stats.tokens_disponiveis}`);
    console.log(`💰 Valor total usado: R$ ${parseFloat(stats.valor_total_usado || 0).toFixed(2)}`);
    console.log(`💵 Valor total criado: R$ ${parseFloat(stats.valor_total_criado || 0).toFixed(2)}`);
    console.log(`🆕 Tokens criados hoje: ${stats.tokens_hoje}`);
    console.log('═'.repeat(50));
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error.message);
  }
}

// Verificar conexão com banco
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexão com PostgreSQL OK!');
    console.log(`⏰ Timestamp do servidor: ${result.rows[0].now}`);
  } catch (error) {
    console.error('❌ Erro na conexão:', error.message);
  }
}

// Mostrar ajuda
function showHelp() {
  console.log('\n🛠️  GERENCIADOR DE TOKENS');
  console.log('═'.repeat(50));
  console.log('Comandos disponíveis:');
  console.log('');
  console.log('  list          - Lista todos os tokens');
  console.log('  used          - Lista apenas tokens usados');
  console.log('  stats         - Mostra estatísticas');
  console.log('  delete-used   - Apaga tokens usados');
  console.log('  delete-all    - Apaga TODOS os tokens');
  console.log('  test          - Testa conexão com banco');
  console.log('  help          - Mostra esta ajuda');
  console.log('');
  console.log('Exemplos:');
  console.log('  node manage-tokens.js list');
  console.log('  node manage-tokens.js delete-used');
  console.log('  node manage-tokens.js stats');
  console.log('');
}

// Função principal
async function main() {
  const command = process.argv[2];
  
  if (!command) {
    showHelp();
    process.exit(0);
  }
  
  switch (command.toLowerCase()) {
    case 'list':
      await listTokens();
      break;
    case 'used':
      await listUsedTokens();
      break;
    case 'stats':
      await showStats();
      break;
    case 'delete-used':
      console.log('⚠️  Tem certeza que deseja deletar todos os tokens usados?');
      console.log('Esta ação não pode ser desfeita!');
      console.log('Execute novamente com --confirm para confirmar:');
      console.log('node manage-tokens.js delete-used --confirm');
      
      if (process.argv[3] === '--confirm') {
        await deleteUsedTokens();
      }
      break;
    case 'delete-all':
      console.log('⚠️  ATENÇÃO: Tem certeza que deseja deletar TODOS os tokens?');
      console.log('Esta ação não pode ser desfeita!');
      console.log('Execute novamente com --confirm para confirmar:');
      console.log('node manage-tokens.js delete-all --confirm');
      
      if (process.argv[3] === '--confirm') {
        await deleteAllTokens();
      }
      break;
    case 'test':
      await testConnection();
      break;
    case 'help':
      showHelp();
      break;
    default:
      console.log(`❌ Comando desconhecido: ${command}`);
      showHelp();
  }
  
  await pool.end();
}

// Executar apenas se for chamado diretamente
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

module.exports = {
  listTokens,
  listUsedTokens,
  deleteUsedTokens,
  deleteAllTokens,
  showStats,
  testConnection
};