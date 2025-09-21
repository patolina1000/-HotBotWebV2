/**
 * Script para criar tabela de deduplicação de eventos Purchase
 * Executa: node create-purchase-dedup-table.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createPurchaseDedupTable() {
  try {
    console.log('🔧 Criando tabela de deduplicação de Purchase...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS purchase_event_dedup (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(64) UNIQUE NOT NULL,
        transaction_id VARCHAR(255) NOT NULL,
        event_name VARCHAR(50) NOT NULL DEFAULT 'Purchase',
        value DECIMAL(10,2),
        currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
        source VARCHAR(20) NOT NULL, -- 'pixel' ou 'capi'
        fbp VARCHAR(255),
        fbc VARCHAR(255),
        external_id VARCHAR(64),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
      );
      
      -- Índices para performance
      CREATE INDEX IF NOT EXISTS idx_purchase_dedup_event_id ON purchase_event_dedup(event_id);
      CREATE INDEX IF NOT EXISTS idx_purchase_dedup_transaction_id ON purchase_event_dedup(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_purchase_dedup_expires_at ON purchase_event_dedup(expires_at);
      CREATE INDEX IF NOT EXISTS idx_purchase_dedup_source ON purchase_event_dedup(source);
      
      -- Índice composto para consultas de deduplicação
      CREATE INDEX IF NOT EXISTS idx_purchase_dedup_event_source ON purchase_event_dedup(event_id, source);
    `;
    
    await pool.query(query);
    console.log('✅ Tabela purchase_event_dedup criada com sucesso!');
    
    // Criar função para limpeza automática de registros expirados
    const cleanupFunction = `
      CREATE OR REPLACE FUNCTION cleanup_expired_purchase_events()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM purchase_event_dedup 
        WHERE expires_at < CURRENT_TIMESTAMP;
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    await pool.query(cleanupFunction);
    console.log('✅ Função de limpeza automática criada!');
    
    // Criar trigger para limpeza automática (opcional)
    const triggerQuery = `
      CREATE OR REPLACE FUNCTION trigger_cleanup_purchase_events()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Executar limpeza a cada 100 inserções
        IF (SELECT COUNT(*) FROM purchase_event_dedup) % 100 = 0 THEN
          PERFORM cleanup_expired_purchase_events();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      DROP TRIGGER IF EXISTS trigger_cleanup_purchase_events ON purchase_event_dedup;
      CREATE TRIGGER trigger_cleanup_purchase_events
        AFTER INSERT ON purchase_event_dedup
        FOR EACH ROW
        EXECUTE FUNCTION trigger_cleanup_purchase_events();
    `;
    
    await pool.query(triggerQuery);
    console.log('✅ Trigger de limpeza automática criado!');
    
    console.log('🎉 Setup de deduplicação de Purchase concluído!');
    
  } catch (error) {
    console.error('❌ Erro ao criar tabela de deduplicação:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  createPurchaseDedupTable()
    .then(() => {
      console.log('✅ Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro na execução:', error);
      process.exit(1);
    });
}

module.exports = { createPurchaseDedupTable };
