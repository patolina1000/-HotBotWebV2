-- Script SQL para corrigir a estrutura da tabela purchase_event_dedup
-- Execute este script no seu banco PostgreSQL

-- 1. Verificar se a tabela existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'purchase_event_dedup') THEN
        -- Criar tabela se não existir
        CREATE TABLE purchase_event_dedup (
            id SERIAL PRIMARY KEY,
            event_id VARCHAR(64) UNIQUE NOT NULL,
            transaction_id VARCHAR(255),
            event_name VARCHAR(50) NOT NULL DEFAULT 'Purchase',
            value DECIMAL(10,2),
            currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
            source VARCHAR(20) NOT NULL,
            fbp VARCHAR(255),
            fbc VARCHAR(255),
            external_id VARCHAR(64),
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
        );
        
        RAISE NOTICE 'Tabela purchase_event_dedup criada';
    ELSE
        RAISE NOTICE 'Tabela purchase_event_dedup já existe';
    END IF;
END
$$;

-- 2. Adicionar colunas que podem estar faltando
DO $$
BEGIN
    -- Adicionar coluna id se não existir
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'id') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN id SERIAL PRIMARY KEY;
        RAISE NOTICE 'Coluna id adicionada';
    END IF;
    
    -- Adicionar coluna event_name se não existir
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'event_name') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN event_name VARCHAR(50) NOT NULL DEFAULT 'Purchase';
        RAISE NOTICE 'Coluna event_name adicionada';
    END IF;
    
    -- Adicionar coluna transaction_id se não existir
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'transaction_id') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN transaction_id VARCHAR(255);
        RAISE NOTICE 'Coluna transaction_id adicionada';
    END IF;
    
    -- Adicionar outras colunas importantes se não existirem
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'value') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN value DECIMAL(10,2);
        RAISE NOTICE 'Coluna value adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'currency') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'BRL';
        RAISE NOTICE 'Coluna currency adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'source') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'unknown';
        RAISE NOTICE 'Coluna source adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'fbp') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN fbp VARCHAR(255);
        RAISE NOTICE 'Coluna fbp adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'fbc') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN fbc VARCHAR(255);
        RAISE NOTICE 'Coluna fbc adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'external_id') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN external_id VARCHAR(64);
        RAISE NOTICE 'Coluna external_id adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'ip_address') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN ip_address INET;
        RAISE NOTICE 'Coluna ip_address adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'user_agent') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN user_agent TEXT;
        RAISE NOTICE 'Coluna user_agent adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'created_at') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Coluna created_at adicionada';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'purchase_event_dedup' AND column_name = 'expires_at') THEN
        ALTER TABLE purchase_event_dedup ADD COLUMN expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');
        RAISE NOTICE 'Coluna expires_at adicionada';
    END IF;
END
$$;

-- 3. Criar índices se não existirem
CREATE INDEX IF NOT EXISTS idx_purchase_dedup_event_id ON purchase_event_dedup(event_id);
CREATE INDEX IF NOT EXISTS idx_purchase_dedup_transaction_id ON purchase_event_dedup(transaction_id);
CREATE INDEX IF NOT EXISTS idx_purchase_dedup_expires_at ON purchase_event_dedup(expires_at);
CREATE INDEX IF NOT EXISTS idx_purchase_dedup_source ON purchase_event_dedup(source);
CREATE INDEX IF NOT EXISTS idx_purchase_dedup_event_source ON purchase_event_dedup(event_id, source);

-- 4. Mostrar estrutura final da tabela
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'purchase_event_dedup' 
ORDER BY ordinal_position;
