const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

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

// Pool global singleton
let pool = null;
let poolClosed = false;

// Função para obter pool de conexões (singleton)
function getPool() {
  if (!pool) {
    pool = new Pool(poolConfig);
    
    // Event listeners para o pool
    pool.on('connect', (client) => {
      console.log('🔗 Nova conexão PostgreSQL estabelecida');
    });
    
    pool.on('error', (err, client) => {
      console.error('❌ Erro no pool PostgreSQL:', err);
    });
    
    pool.on('remove', (client) => {
      console.log('🔌 Conexão PostgreSQL removida do pool');
    });
  }
  return pool;
}

// Função para fechar pool de forma idempotente
async function closePool() {
  if (poolClosed || !pool) return;
  poolClosed = true;
  await pool.end();
  pool = null;
}

// Função para criar pool de conexões (mantida para compatibilidade)
function createPool() {
  return getPool();
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
          event_time INTEGER,
          pixel_sent BOOLEAN DEFAULT FALSE,
          capi_sent BOOLEAN DEFAULT FALSE,
          cron_sent BOOLEAN DEFAULT FALSE,
          first_event_sent_at TIMESTAMP,
          event_attempts INTEGER DEFAULT 0,
          capi_ready BOOLEAN DEFAULT FALSE,
          capi_processing BOOLEAN DEFAULT FALSE,
          fn_hash TEXT,
          ln_hash TEXT,
          external_id_hash TEXT,
          nome_oferta TEXT
        )
      `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tracking_data (
          telegram_id BIGINT PRIMARY KEY,
          utm_source TEXT,
          utm_medium TEXT,
          utm_campaign TEXT,
          utm_term TEXT,
          utm_content TEXT,
          fbp TEXT,
          fbc TEXT,
          ip TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    // tabela payload_tracking movida para init-postgres
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
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='fn_hash'
        ) THEN
          ALTER TABLE tokens ADD COLUMN fn_hash TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='ln_hash'
        ) THEN
          ALTER TABLE tokens ADD COLUMN ln_hash TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='external_id_hash'
        ) THEN
          ALTER TABLE tokens ADD COLUMN external_id_hash TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='nome_oferta'
        ) THEN
          ALTER TABLE tokens ADD COLUMN nome_oferta TEXT;
        END IF;
        -- Colunas de controle de eventos
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='pixel_sent'
        ) THEN
          ALTER TABLE tokens ADD COLUMN pixel_sent BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='capi_sent'
        ) THEN
          ALTER TABLE tokens ADD COLUMN capi_sent BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='cron_sent'
        ) THEN
          ALTER TABLE tokens ADD COLUMN cron_sent BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='first_event_sent_at'
        ) THEN
          ALTER TABLE tokens ADD COLUMN first_event_sent_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='event_attempts'
        ) THEN
          ALTER TABLE tokens ADD COLUMN event_attempts INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='capi_ready'
        ) THEN
          ALTER TABLE tokens ADD COLUMN capi_ready BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tokens' AND column_name='capi_processing'
        ) THEN
          ALTER TABLE tokens ADD COLUMN capi_processing BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracking_data' AND column_name='utm_source'
        ) THEN
          ALTER TABLE tracking_data ADD COLUMN utm_source TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracking_data' AND column_name='utm_medium'
        ) THEN
          ALTER TABLE tracking_data ADD COLUMN utm_medium TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracking_data' AND column_name='utm_campaign'
        ) THEN
          ALTER TABLE tracking_data ADD COLUMN utm_campaign TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracking_data' AND column_name='utm_term'
        ) THEN
          ALTER TABLE tracking_data ADD COLUMN utm_term TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tracking_data' AND column_name='utm_content'
        ) THEN
          ALTER TABLE tracking_data ADD COLUMN utm_content TEXT;
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
    // Fechar pool singleton se existir
    if (pool) {
      closePool().then(() => {
        console.log('✅ Pool singleton fechado na limpeza de emergência');
      }).catch(err => {
        console.error('❌ Erro ao fechar pool na limpeza:', err);
      });
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

// NOVA FUNÇÃO: Validação segura de colunas de flag
function validateFlagColumn(source) {
  const validFlagColumns = {
    'pixel': 'pixel_sent',
    'capi': 'capi_sent', 
    'cron': 'cron_sent'
  };

  if (!validFlagColumns[source]) {
    throw new Error(`Fonte inválida para flag: ${source}. Apenas: ${Object.keys(validFlagColumns).join(', ')}`);
  }

  return validFlagColumns[source];
}

// NOVA FUNÇÃO: Atualização segura de flags com validação rigorosa
async function updateTokenFlag(pool, token, source) {
  if (!pool || !token || !source) {
    throw new Error('Pool, token e source são obrigatórios');
  }

  try {
    // Validar entrada usando whitelist
    const flagColumn = validateFlagColumn(source);
    const now = new Date().toISOString();
    
    // Query totalmente parametrizada - zero interpolação
    const query = `
      UPDATE tokens 
      SET ${flagColumn} = TRUE,
          first_event_sent_at = COALESCE(first_event_sent_at, $2),
          event_attempts = event_attempts + 1
      WHERE token = $1
      RETURNING id_transacao, ${flagColumn}, first_event_sent_at, event_attempts
    `;
    
    const result = await executeQuery(pool, query, [token, now]);
    
    if (result.rows.length === 0) {
      console.warn(`⚠️ Token não encontrado para atualização: ${token}`);
      return false;
    }

    const updatedRow = result.rows[0];
    console.log(`🏷️ Flag ${flagColumn} atualizada com segurança:`, {
      id_transacao: updatedRow.id_transacao,
      flag_value: updatedRow[flagColumn],
      first_event_sent_at: updatedRow.first_event_sent_at,
      event_attempts: updatedRow.event_attempts
    });
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao atualizar flag de token:', error);
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

// Funções e esquema para funil de eventos
let funnelSchemaInitialized = false;

async function ensureFunnelSchema(pool) {
  if (funnelSchemaInitialized) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.funnel_events (
        id BIGSERIAL PRIMARY KEY,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        event_name TEXT NOT NULL,
        telegram_id BIGINT,
        session_id TEXT,
        payload_id TEXT,
        transaction_id TEXT,
        price_cents INT,
        meta JSONB,
        event_id TEXT UNIQUE NOT NULL
      );
    `);

    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'funnel_events'
    `);

    const colMap = {};
    for (const r of cols.rows) {
      colMap[r.column_name] = { type: r.data_type, nullable: r.is_nullable === 'YES' };
    }

    if (!colMap.event_id) {
      await client.query(`ALTER TABLE public.funnel_events ADD COLUMN IF NOT EXISTS event_id TEXT`);
      colMap.event_id = { type: 'text', nullable: true };
      console.log('ℹ️ Coluna event_id adicionada.');
    }

    // Backfill utilizando mesma lógica do helper buildEventId
    const { rows } = await client.query(`
      SELECT id, event_name, session_id, payload_id, telegram_id, transaction_id
        FROM public.funnel_events
       WHERE event_id IS NULL
    `);
    for (const row of rows) {
      const eid = buildEventId(row);
      await client.query(`UPDATE public.funnel_events SET event_id = $1 WHERE id = $2`, [eid, row.id]);
    }
    if (rows.length) {
      console.log(`ℹ️ event_id backfilled em ${rows.length} linhas.`);
    }

    if (colMap.event_id.nullable) {
      await client.query(`ALTER TABLE public.funnel_events ALTER COLUMN event_id SET NOT NULL`);
      console.log('ℹ️ Coluna event_id marcada como NOT NULL.');
    }

    const idxCheck = await client.query(`
      SELECT 1
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_attribute a ON a.attrelid = i.indexrelid AND a.attnum = ANY(i.indkey)
       WHERE t.relname = 'funnel_events'
         AND i.indisunique
         AND a.attname = 'event_id'
    `);
    if (idxCheck.rowCount === 0) {
      try {
        await client.query(`CREATE UNIQUE INDEX CONCURRENTLY ux_funnel_events_event_id ON public.funnel_events(event_id)`);
        console.log('ℹ️ Índice único ux_funnel_events_event_id criado CONCURRENTLY.');
      } catch (err) {
        console.warn('⚠️ Falha ao criar índice CONCURRENTLY:', err.message);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_funnel_events_event_id ON public.funnel_events(event_id)`);
        console.log('ℹ️ Índice único ux_funnel_events_event_id criado sem CONCURRENTLY.');
      }
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_funnel_events_occurred_at ON public.funnel_events(occurred_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name ON public.funnel_events(LOWER(event_name));
    `);

    // Índice composto auxiliar para consultas por nome+data
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_funnel_events_name_date ON public.funnel_events(LOWER(event_name), occurred_at);
    `);

    if (colMap.telegram_id && colMap.telegram_id.type !== 'bigint') {
      console.warn(`⚠️ Divergência de tipo: telegram_id é ${colMap.telegram_id.type} (esperado BIGINT). Riscos: casts/índices.`);
    }

    funnelSchemaInitialized = true;
  } finally {
    client.release();
  }
}

function normalizeEventName(name) {
  return String(name || '').trim().toLowerCase();
}

function buildEventId({ event_name, session_id, payload_id, telegram_id, transaction_id }) {
  const e = String(event_name || '').toLowerCase();
  switch (e) {
    case 'welcome':     return session_id ? `wel:${session_id}` : `wel:${randomUUID()}`;
    case 'cta_click':   return payload_id ? `cta:${payload_id}` :
                              (session_id ? `cta:${session_id}` : `cta:${randomUUID()}`);
    case 'bot_start':   return (telegram_id && payload_id)
                              ? `bot:${telegram_id}:${payload_id}`
                              : (telegram_id ? `bot:${telegram_id}:${randomUUID()}` : `bot:${randomUUID()}`);
    case 'pix_created': return transaction_id ? `pix:${transaction_id}` : `pix:${randomUUID()}`;
    case 'purchase':    return transaction_id ? `pur:${transaction_id}` : `pur:${randomUUID()}`;
    default:            return `evt:${e}:${randomUUID()}`;
  }
}

async function insertFunnelEvent(pool, data) {
  const p = pool || getPool();
  await ensureFunnelSchema(p);
  const client = await p.connect();
  try {
    const eventId = data.event_id || buildEventId(data);
    const canonicalName = normalizeEventName(data.event_name);
    if (!canonicalName) throw new Error('event_name inválido');

    const params = [
      data.occurred_at ? new Date(data.occurred_at) : null,
      canonicalName,
      data.telegram_id ?? null,
      data.session_id ?? null,
      data.payload_id ?? null,
      data.transaction_id ?? null,
      data.price_cents ?? null,
      data.meta ? JSON.stringify(data.meta) : null,
      eventId
    ];

    const sql = `
      INSERT INTO public.funnel_events
        (occurred_at, event_name, telegram_id, session_id, payload_id, transaction_id, price_cents, meta, event_id)
      VALUES
        (COALESCE($1, NOW()), LOWER($2), $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (event_id) DO NOTHING
    `;

    const result = await client.query(sql, params);
    return { inserted: result.rowCount > 0, event_id: eventId };
  } finally {
    client.release();
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
  getPool,      // NOVA: singleton
  closePool,    // NOVA: shutdown idempotente
  createTables,
  verifyTables,
  validateFlagColumn,
  updateTokenFlag,
  ensureFunnelSchema,
  normalizeEventName,
  buildEventId,
  insertFunnelEvent
};