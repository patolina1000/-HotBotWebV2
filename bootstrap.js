// bootstrap.js - Sistema de inicialização assíncrona com verificação de banco
require('dotenv').config();

const postgres = require('./database/postgres');
const fs = require('fs');
const path = require('path');

// Estado global de readiness
let readinessFlag = false;
let databasePool = null;
let bootstrapError = null;

// Timeout e retry configuration
const BOOTSTRAP_TIMEOUT = 15000; // 15 segundos
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 segundos

/**
 * Carrega e valida variáveis de ambiente críticas
 */
async function loadEnvOrCrash() {
  console.log('[BOOTSTRAP_ENV] Verificando variáveis de ambiente...');
  
  const requiredVars = ['DATABASE_URL'];
  const missingVars = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    const error = new Error(`Variáveis de ambiente obrigatórias não definidas: ${missingVars.join(', ')}`);
    console.error('[BOOTSTRAP_ERROR]', error.message);
    throw error;
  }
  
  console.log('[BOOTSTRAP_ENV_OK] Todas as variáveis de ambiente estão definidas');
}

/**
 * Inicializa o banco de dados com timeout e retry
 */
async function initDatabase() {
  console.log('[BOOTSTRAP_DB_CONNECTING] Inicializando conexão com banco de dados...');
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[BOOTSTRAP_DB] Tentativa ${attempt}/${MAX_RETRIES}`);
      
      // Usar Promise.race para implementar timeout
      const initPromise = postgres.initializeDatabase();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout na inicialização do banco')), BOOTSTRAP_TIMEOUT);
      });
      
      const pool = await Promise.race([initPromise, timeoutPromise]);
      
      if (pool) {
        // Testar conexão real com ping
        console.log('[BOOTSTRAP_DB] Testando conexão com ping...');
        const client = await pool.connect();
        await client.query('SELECT 1 as ping');
        client.release();
        
        databasePool = pool;
        console.log('[BOOTSTRAP_DB_READY] Banco de dados conectado e respondendo');
        return pool;
      } else {
        throw new Error('Pool de conexão não foi criado');
      }
      
    } catch (error) {
      lastError = error;
      console.warn(`[BOOTSTRAP_DB] Tentativa ${attempt} falhou:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        console.log(`[BOOTSTRAP_DB] Aguardando ${RETRY_DELAY}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  const finalError = new Error(`Falha na inicialização do banco após ${MAX_RETRIES} tentativas. Último erro: ${lastError?.message}`);
  console.error('[BOOTSTRAP_ERROR]', finalError.message);
  throw finalError;
}

/**
 * Executa migrações se existirem
 */
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'database', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('[BOOTSTRAP_MIGRATIONS] Diretório de migrações não encontrado, pulando...');
    return;
  }
  
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  if (migrationFiles.length === 0) {
    console.log('[BOOTSTRAP_MIGRATIONS] Nenhum arquivo de migração encontrado');
    return;
  }
  
  console.log(`[BOOTSTRAP_MIGRATIONS] Executando ${migrationFiles.length} migração(ões)...`);
  
  try {
    for (const migrationFile of migrationFiles) {
      console.log(`[BOOTSTRAP_MIGRATIONS] Executando: ${migrationFile}`);
      
      const migrationPath = path.join(migrationsDir, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      // Executar migração
      await databasePool.query(migrationSQL);
      console.log(`[BOOTSTRAP_MIGRATIONS] ✅ ${migrationFile} executado com sucesso`);
    }
    
    // Re-testar conexão após migrações
    console.log('[BOOTSTRAP_MIGRATIONS] Verificando conexão após migrações...');
    const client = await databasePool.connect();
    await client.query('SELECT 1 as post_migration_test');
    client.release();
    
    console.log('[BOOTSTRAP_MIGRATIONS_DONE] Todas as migrações executadas com sucesso');
    
  } catch (error) {
    const migrationError = new Error(`Erro ao executar migrações: ${error.message}`);
    console.error('[BOOTSTRAP_ERROR]', migrationError.message);
    throw migrationError;
  }
}

/**
 * Função principal de bootstrap
 */
async function start() {
  try {
    console.log('[BOOTSTRAP_START] Iniciando processo de bootstrap...');
    
    // 1. Carregar e validar variáveis de ambiente
    await loadEnvOrCrash();
    
    // 2. Inicializar banco de dados
    await initDatabase();
    
    // 3. Executar migrações se existirem
    await runMigrations();
    
    // 4. Marcar como ready
    readinessFlag = true;
    bootstrapError = null;
    
    console.log('[BOOTSTRAP_READY] Sistema pronto para receber requisições');
    
  } catch (error) {
    bootstrapError = error;
    console.error('[BOOTSTRAP_ERROR]', error.message);
    console.error('[BOOTSTRAP_ERROR] Stack trace:', error.stack);
    
    // Aguardar um pouco para logs serem escritos
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Falhar rápido com código de erro
    process.exit(1);
  }
}

/**
 * Verifica se o sistema está pronto
 */
function isReady() {
  return readinessFlag && databasePool && !bootstrapError;
}

/**
 * Retorna o pool de conexão do banco
 */
function getDatabasePool() {
  return databasePool;
}

/**
 * Retorna informações de status para healthcheck
 */
function getStatus() {
  if (!isReady()) {
    return {
      status: 'starting',
      database: databasePool ? 'connected' : 'disconnected',
      error: bootstrapError ? bootstrapError.message : null,
      timestamp: new Date().toISOString()
    };
  }
  
  return {
    status: 'ok',
    database: 'connected',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  start,
  isReady,
  getDatabasePool,
  getStatus,
  readinessFlag: () => readinessFlag
};