// Script para inserir logs de exemplo no banco de dados
// Execute este script para popular o dashboard com dados de teste

const { Pool } = require('pg');

// Configuração do banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Logs de exemplo
const sampleLogs = [
  // Logs de INFO
  {
    level: 'INFO',
    message: 'Sistema iniciado com sucesso',
    service: 'system',
    source: 'startup',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { version: '1.0.0', environment: 'production' }
  },
  {
    level: 'INFO',
    message: 'Usuário autenticado com sucesso',
    service: 'auth',
    source: 'api',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    metadata: { user_id: 12345, method: 'POST', endpoint: '/api/login' }
  },
  {
    level: 'INFO',
    message: 'Pedido processado com sucesso',
    service: 'orders',
    source: 'webhook',
    ip_address: '10.0.0.50',
    user_agent: 'Stripe-Webhook/1.0',
    metadata: { order_id: 'ord_123456', amount: 99.90, currency: 'BRL' }
  },
  
  // Logs de WARN
  {
    level: 'WARN',
    message: 'Tentativa de login com credenciais inválidas',
    service: 'auth',
    source: 'api',
    ip_address: '192.168.1.101',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    metadata: { email: 'user@example.com', attempts: 3 }
  },
  {
    level: 'WARN',
    message: 'Taxa de requisições alta detectada',
    service: 'rate-limiter',
    source: 'middleware',
    ip_address: '203.0.113.10',
    user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    metadata: { requests_per_minute: 120, limit: 100 }
  },
  {
    level: 'WARN',
    message: 'Conexão com banco de dados lenta',
    service: 'database',
    source: 'connection-pool',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { query_time: 2500, threshold: 1000 }
  },
  
  // Logs de ERROR
  {
    level: 'ERROR',
    message: 'Falha na conexão com API externa',
    service: 'payment',
    source: 'gateway',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { provider: 'stripe', error_code: 'connection_timeout', retry_count: 3 }
  },
  {
    level: 'ERROR',
    message: 'Erro ao processar pagamento',
    service: 'payment',
    source: 'webhook',
    ip_address: '10.0.0.51',
    user_agent: 'Stripe-Webhook/1.0',
    metadata: { payment_id: 'pi_123456', error: 'insufficient_funds' }
  },
  {
    level: 'ERROR',
    message: 'Exceção não tratada no middleware',
    service: 'api',
    source: 'middleware',
    ip_address: '192.168.1.102',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    metadata: { stack_trace: 'TypeError: Cannot read property...', endpoint: '/api/users' }
  },
  
  // Logs de DEBUG
  {
    level: 'DEBUG',
    message: 'Query SQL executada',
    service: 'database',
    source: 'query',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { query: 'SELECT * FROM users WHERE id = $1', params: [12345], duration: 15 }
  },
  {
    level: 'DEBUG',
    message: 'Cache miss para chave',
    service: 'cache',
    source: 'redis',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { key: 'user:12345', ttl: 3600 }
  },
  
  // Logs de SUCCESS
  {
    level: 'SUCCESS',
    message: 'Backup realizado com sucesso',
    service: 'backup',
    source: 'cron',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { size: '2.5GB', duration: 300, files: 15000 }
  },
  {
    level: 'SUCCESS',
    message: 'Email enviado com sucesso',
    service: 'email',
    source: 'smtp',
    ip_address: '127.0.0.1',
    user_agent: 'Node.js/18.0.0',
    metadata: { recipient: 'user@example.com', template: 'welcome', delivery_time: 2.5 }
  }
];

// Função para inserir logs com timestamps variados
async function insertSampleLogs() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Inserindo logs de exemplo...');
    
    // Inserir logs com timestamps distribuídos nas últimas 24 horas
    for (let i = 0; i < sampleLogs.length; i++) {
      const log = sampleLogs[i];
      
      // Criar timestamp distribuído nas últimas 24 horas
      const now = new Date();
      const hoursAgo = Math.random() * 24; // 0 a 24 horas atrás
      const timestamp = new Date(now.getTime() - (hoursAgo * 60 * 60 * 1000));
      
      // Inserir múltiplas instâncias do mesmo log para simular volume
      const instances = Math.floor(Math.random() * 10) + 1; // 1 a 10 instâncias
      
      for (let j = 0; j < instances; j++) {
        const query = `
          INSERT INTO logs (level, message, service, source, ip_address, user_agent, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        const values = [
          log.level,
          log.message,
          log.service,
          log.source,
          log.ip_address,
          log.user_agent,
          JSON.stringify(log.metadata),
          timestamp
        ];
        
        await client.query(query, values);
      }
    }
    
    console.log('✅ Logs de exemplo inseridos com sucesso!');
    
    // Contar total de logs inseridos
    const countResult = await client.query('SELECT COUNT(*) as total FROM logs');
    console.log(`📊 Total de logs no banco: ${countResult.rows[0].total}`);
    
  } catch (error) {
    console.error('❌ Erro ao inserir logs:', error);
  } finally {
    client.release();
  }
}

// Função para limpar logs antigos (opcional)
async function clearOldLogs() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Limpando logs antigos...');
    
    const result = await client.query(`
      DELETE FROM logs 
      WHERE created_at < NOW() - INTERVAL '7 days'
    `);
    
    console.log(`✅ ${result.rowCount} logs antigos removidos`);
    
  } catch (error) {
    console.error('❌ Erro ao limpar logs:', error);
  } finally {
    client.release();
  }
}

// Função para mostrar estatísticas
async function showStats() {
  const client = await pool.connect();
  
  try {
    console.log('📈 Estatísticas dos logs:');
    
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN level = 'ERROR' THEN 1 END) as errors,
        COUNT(CASE WHEN level = 'WARN' THEN 1 END) as warnings,
        COUNT(CASE WHEN level = 'INFO' THEN 1 END) as info,
        COUNT(CASE WHEN level = 'DEBUG' THEN 1 END) as debug,
        COUNT(CASE WHEN level = 'SUCCESS' THEN 1 END) as success,
        COUNT(DISTINCT service) as services
      FROM logs
    `);
    
    const row = stats.rows[0];
    console.log(`   Total: ${row.total}`);
    console.log(`   Errors: ${row.errors}`);
    console.log(`   Warnings: ${row.warnings}`);
    console.log(`   Info: ${row.info}`);
    console.log(`   Debug: ${row.debug}`);
    console.log(`   Success: ${row.success}`);
    console.log(`   Services: ${row.services}`);
    
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas:', error);
  } finally {
    client.release();
  }
}

// Executar script
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'insert':
      await insertSampleLogs();
      break;
    case 'clear':
      await clearOldLogs();
      break;
    case 'stats':
      await showStats();
      break;
    default:
      console.log('📋 Comandos disponíveis:');
      console.log('   node insert-sample-logs.js insert  - Inserir logs de exemplo');
      console.log('   node insert-sample-logs.js clear   - Limpar logs antigos');
      console.log('   node insert-sample-logs.js stats   - Mostrar estatísticas');
  }
  
  await pool.end();
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  insertSampleLogs,
  clearOldLogs,
  showStats
};