const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuração do pool de conexões
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // máximo de conexões no pool
  idleTimeoutMillis: 30000, // tempo limite para conexões inativas
  connectionTimeoutMillis: 10000, // tempo limite para novas conexões
  statement_timeout: 30000, // tempo limite para statements
  query_timeout: 30000, // tempo limite para queries
  application_name: 'HotBot-Web'
};

// Pool global
let globalPool = null;

// Função para criar pool de conexões
function createPool() {
  if (globalPool) {
    return globalPool;
  }
  
  try {
    globalPool = new Pool(poolConfig);
    
    // Event listeners para o pool
    globalPool.on('connect', (client) => {
      console.log('🔗 Nova conexão PostgreSQL estabelecida');
    });
    
    globalPool.on('error', (err, client) => {
      console.error('❌ Erro no pool PostgreSQL:', err);
    });
    
    globalPool.on('remove', (client) => {
      console.log('🔌 Conexão PostgreSQL removida do pool');
    });
    
    return globalPool;
  } catch (error) {
    console.error('❌ Erro ao criar pool PostgreSQL:', error);
    throw error;
  }
}

// Função para testar conexão básica
async function testDatabaseConnection() {
  let client = null;
  
  try {
    console.log('🔍 Testando conexão com PostgreSQL...');
    
    // Validar DATABASE_URL
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não está definida');
    }
    
    // Criar pool se não existir
    const pool = createPool();
    
    // Testar conexão
    client = await pool.connect();
    
    // Testar query simples
    const result = await client.query('SELECT NOW() as timestamp, version() as version');
    const dbInfo = result.rows[0];
    
    console.log('✅ Conexão PostgreSQL bem-sucedida');
    console.log('📅 Timestamp do banco:', dbInfo.timestamp);
    console.log('🔧 Versão PostgreSQL:', dbInfo.version.split(' ')[0]);
    
    return {
      success: true,
      pool: pool,
      timestamp: dbInfo.timestamp,
      version: dbInfo.version,
      connection_string: process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@')
    };
    
  } catch (error) {
    console.error('❌ Falha na conexão PostgreSQL:', error.message);
    
    // Log detalhado do erro
    if (error.code) {
      console.error('🔍 Código do erro:', error.code);
    }
    
    if (error.detail) {
      console.error('🔍 Detalhes:', error.detail);
    }
    
    return {
      success: false,
      error: error,
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Função para inicializar banco de dados completo
async function initializeDatabase() {
  try {
    console.log('🚀 Inicializando sistema completo de banco de dados...');
    
    // Testar conexão primeiro
    const testResult = await testDatabaseConnection();
    
    if (!testResult.success) {
      throw testResult.error || new Error('Falha no teste de conexão');
    }
    
    const pool = testResult.pool;
    
    // Criar tabelas necessárias
    await createTables(pool);
    
    // Verificar integridade das tabelas
    await verifyTables(pool);
    
    console.log('✅ Sistema de banco de dados inicializado com sucesso');
    return pool;
    
  } catch (error) {
    console.error('❌ Erro na inicialização do banco de dados:', error.message);
    throw error;
  }
}

// Função para criar tabelas
async function createTables(pool) {
  const client = await pool.connect();
  
  try {
    console.log('📋 Criando/verificando tabelas...');

    // Tabela de tokens
    try {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tokens (
          id_transacao TEXT PRIMARY KEY,
          token TEXT UNIQUE,
          telegram_id TEXT,
          valor NUMERIC,
          criado_em TIMESTAMP DEFAULT NOW(),
          usado_em TIMESTAMP NULL,
          status TEXT DEFAULT 'pendente',
          usado BOOLEAN DEFAULT FALSE,
          bot_id TEXT,
          utm_source TEXT,
          utm_medium TEXT,
          utm_campaign TEXT,
          utm_term TEXT,
          utm_content TEXT,
          fbp TEXT,
          fbc TEXT,
          ip_criacao TEXT,
          user_agent_criacao TEXT,
          event_time INTEGER
        )
      `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tracking_data (
          telegram_id BIGINT PRIMARY KEY,
          fbp TEXT,
          fbc TEXT,
          ip TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (err) {
      console.error('❌ Erro ao criar tabela tokens:', err.message);
      throw err;
    }
    
    // Garantir coluna criado_em existente
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='criado_em'
        ) THEN
          ALTER TABLE tokens ADD COLUMN criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='fbp'
        ) THEN
          ALTER TABLE tokens ADD COLUMN fbp TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='fbc'
        ) THEN
          ALTER TABLE tokens ADD COLUMN fbc TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='ip_criacao'
        ) THEN
          ALTER TABLE tokens ADD COLUMN ip_criacao TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='user_agent_criacao'
        ) THEN
          ALTER TABLE tokens ADD COLUMN user_agent_criacao TEXT;
        END IF;
      END
      $$;
    `);

    // Criar índice para status dos tokens
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status)
    `);

    // Tabela de downsell progress
    await client.query(`
      CREATE TABLE IF NOT EXISTS downsell_progress (
        telegram_id BIGINT PRIMARY KEY,
        index_downsell INTEGER,
        pagou INTEGER DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Garantir coluna last_sent_at para controle de envio individual
    await client.query(`
      ALTER TABLE downsell_progress
      ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_downsell_pagou ON downsell_progress(pagou);
      CREATE INDEX IF NOT EXISTS idx_downsell_criado_em ON downsell_progress(criado_em);
    `);
    
    // Tabela de logs (opcional)
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        meta JSONB NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar índice para logs
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    `);
    
    console.log('✅ Tabelas criadas/verificadas com sucesso');
    
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Função para verificar tabelas
async function verifyTables(pool) {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verificando integridade das tabelas...');
    
    // Verificar estrutura da tabela tokens
    const tokensResult = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'tokens' 
      ORDER BY ordinal_position
    `);
    
    if (tokensResult.rows.length === 0) {
      throw new Error('Tabela tokens não encontrada');
    }
    
    console.log('✅ Tabela tokens verificada:', tokensResult.rows.length, 'colunas');
    
    // Contar registros existentes
    const countResult = await client.query('SELECT COUNT(*) as total FROM tokens');
    const totalTokens = countResult.rows[0].total;
    
    console.log('📊 Tokens existentes no banco:', totalTokens);
    
    // Verificar tabela logs
    const logsResult = await client.query(`
      SELECT COUNT(*) as total
      FROM information_schema.tables
      WHERE table_name = 'logs'
    `);

    if (logsResult.rows[0].total > 0) {
      console.log('✅ Tabela logs verificada');
    }

    // Verificar tabela downsell_progress
    const downsellResult = await client.query(`
      SELECT COUNT(*) as total
      FROM information_schema.tables
      WHERE table_name = 'downsell_progress'
    `);

    if (downsellResult.rows[0].total > 0) {
      console.log('✅ Tabela downsell_progress verificada');
    }
    
  } catch (error) {
    console.error('❌ Erro na verificação das tabelas:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Função de health check
async function healthCheck(pool) {
  if (!pool) {
    return {
      healthy: false,
      error: 'Pool de conexões não disponível',
      timestamp: new Date().toISOString()
    };
  }
  
  let client = null;
  
  try {
    // Testar conexão
    client = await pool.connect();
    
    // Testar query
    const result = await client.query('SELECT NOW() as timestamp, COUNT(*) as connection_count FROM pg_stat_activity');
    const info = result.rows[0];
    
    // Verificar se as tabelas existem
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('tokens', 'logs')
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    return {
      healthy: true,
      timestamp: info.timestamp,
      connection_count: parseInt(info.connection_count),
      tables: tables,
      pool_stats: getPoolStats(pool)
    };
    
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Função para obter estatísticas do pool
function getPoolStats(pool) {
  if (!pool) {
    return null;
  }
  
  return {
    total_connections: pool.totalCount,
    idle_connections: pool.idleCount,
    waiting_requests: pool.waitingCount,
    max_connections: pool.options.max,
    database: pool.options.database,
    host: pool.options.host,
    port: pool.options.port
  };
}

// Função para validar ambiente
function validateEnvironment() {
  console.log('🔍 Validando ambiente de banco de dados...');
  
  const requiredVars = ['DATABASE_URL'];
  const missingVars = [];
  
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });
  
  if (missingVars.length > 0) {
    console.error('❌ Variáveis de ambiente obrigatórias não definidas:', missingVars);
    return false;
  }
  
  // Validar formato da DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.error('❌ DATABASE_URL deve começar com postgresql:// ou postgres://');
    return false;
  }
  
  console.log('✅ Ambiente validado com sucesso');
  return true;
}

// Função de limpeza de emergência
function emergencyCleanup() {
  console.log('🧹 Executando limpeza de emergência...');
  
  try {
    // Fechar pool global se existir
    if (globalPool) {
      globalPool.end().then(() => {
        console.log('✅ Pool global fechado na limpeza de emergência');
      }).catch(err => {
        console.error('❌ Erro ao fechar pool na limpeza:', err);
      });
      globalPool = null;
    }
    
    // Limpar variáveis de ambiente sensíveis do log
    if (process.env.DATABASE_URL) {
      console.log('🔒 Variáveis sensíveis mascaradas para segurança');
    }
    
    console.log('✅ Limpeza de emergência concluída');
    
  } catch (error) {
    console.error('❌ Erro na limpeza de emergência:', error);
  }
}

// Função para executar query segura
async function executeQuery(pool, query, params = []) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

// Função para executar transação
async function executeTransaction(pool, queries) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    for (const { query, params } of queries) {
      const result = await client.query(query, params);
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Função para backup simples
async function createBackup(pool) {
  try {
    const client = await pool.connect();
    
    // Exportar dados da tabela tokens
    const tokensResult = await client.query('SELECT * FROM tokens ORDER BY id');
    const tokens = tokensResult.rows;
    
    // Criar backup em JSON
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      tables: {
        tokens: tokens
      }
    };
    
    // Salvar backup
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    const backupFile = path.join(backupDir, `backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    
    console.log('✅ Backup criado:', backupFile);
    
    client.release();
    return backupFile;
    
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error);
    throw error;
  }
}

// Função para limpar downsells antigos
async function limparDownsellsAntigos(pool) {
  if (!pool) {
    console.warn('⚠️ Pool de conexões PostgreSQL não fornecido para limpeza de downsells');
    return;
  }

  try {
    const result = await executeQuery(
      pool,
      `DELETE FROM downsell_progress
       WHERE pagou = 0
       AND criado_em < NOW() - INTERVAL '72 hours'`
    );

    console.log(`🧹 Downsells antigos removidos: ${result.rowCount}`);
  } catch (error) {
    console.error('❌ Erro ao limpar downsells antigos:', error.message);
  }
}

// Exportar todas as funções
module.exports = {
  testDatabaseConnection,
  initializeDatabase,
  healthCheck,
  getPoolStats,
  validateEnvironment,
  emergencyCleanup,
  executeQuery,
  executeTransaction,
  createBackup,
  limparDownsellsAntigos,
  createPool,
  createTables,
  verifyTables
};