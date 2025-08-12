const postgres = require('./database/postgres');

async function testDatabaseFixed() {
  console.log('🧪 Testando banco de dados corrigido...');
  
  try {
    // Testar conexão
    console.log('\n1️⃣ Testando conexão...');
    const testResult = await postgres.testDatabaseConnection();
    
    if (!testResult.success) {
      console.error('❌ Teste de conexão falhou:', testResult.message);
      console.error('❌ Código do erro:', testResult.code);
      return;
    }
    
    console.log('✅ Teste de conexão passou');
    
    // Testar inicialização
    console.log('\n2️⃣ Testando inicialização...');
    const pool = await postgres.initializeDatabase();
    
    if (pool) {
      console.log('✅ Inicialização do banco passou');
      
      // Testar health check
      console.log('\n3️⃣ Testando health check...');
      const health = await postgres.healthCheck(pool);
      
      if (health.healthy) {
        console.log('✅ Health check passou');
        console.log('📊 Estatísticas do pool:', health.pool_stats);
      } else {
        console.error('❌ Health check falhou:', health.error);
      }
      
      // Fechar pool
      await pool.end();
      console.log('🔌 Pool fechado');
      
    } else {
      console.error('❌ Inicialização do banco falhou');
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    console.error('❌ Stack trace:', error.stack);
  }
}

// Executar teste
testDatabaseFixed().then(() => {
  console.log('\n🏁 Teste concluído');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Erro fatal no teste:', error);
  process.exit(1);
});