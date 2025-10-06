-- ================================================
-- SCRIPT DE CORREÇÃO DE SCHEMA PURCHASE CAPI
-- ================================================
-- Este script corrige todos os problemas de schema identificados no log
-- Execução segura: verifica antes de criar/alterar

-- ================================================
-- 1. CORRIGIR TABELA purchase_event_dedup
-- ================================================

-- 1.1. Verificar se a tabela existe, se não criar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'purchase_event_dedup'
    ) THEN
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
END $$;

-- 1.2. Adicionar coluna expires_at se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');
        
        RAISE NOTICE 'Coluna expires_at adicionada à purchase_event_dedup';
    ELSE
        RAISE NOTICE 'Coluna expires_at já existe na purchase_event_dedup';
    END IF;
END $$;

-- 1.3. Adicionar coluna transaction_id se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'transaction_id'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN transaction_id VARCHAR(255);
        
        RAISE NOTICE 'Coluna transaction_id adicionada à purchase_event_dedup';
    ELSE
        RAISE NOTICE 'Coluna transaction_id já existe na purchase_event_dedup';
    END IF;
END $$;

-- 1.4. Adicionar outras colunas essenciais se não existirem
DO $$
BEGIN
    -- event_name
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'event_name'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN event_name VARCHAR(50) NOT NULL DEFAULT 'Purchase';
        RAISE NOTICE 'Coluna event_name adicionada';
    END IF;

    -- value
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'value'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN value DECIMAL(10,2);
        RAISE NOTICE 'Coluna value adicionada';
    END IF;

    -- currency
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'currency'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'BRL';
        RAISE NOTICE 'Coluna currency adicionada';
    END IF;

    -- source
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'source'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'capi';
        RAISE NOTICE 'Coluna source adicionada';
    END IF;

    -- created_at
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'purchase_event_dedup' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE purchase_event_dedup 
        ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Coluna created_at adicionada';
    END IF;
END $$;

-- 1.5. Criar índices para performance (somente se não existirem)
DO $$
BEGIN
    -- Índice no event_id
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'purchase_event_dedup' 
        AND indexname = 'idx_purchase_dedup_event_id'
    ) THEN
        CREATE INDEX idx_purchase_dedup_event_id ON purchase_event_dedup(event_id);
        RAISE NOTICE 'Índice idx_purchase_dedup_event_id criado';
    END IF;

    -- Índice no transaction_id
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'purchase_event_dedup' 
        AND indexname = 'idx_purchase_dedup_transaction_id'
    ) THEN
        CREATE INDEX idx_purchase_dedup_transaction_id ON purchase_event_dedup(transaction_id);
        RAISE NOTICE 'Índice idx_purchase_dedup_transaction_id criado';
    END IF;

    -- Índice no expires_at
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'purchase_event_dedup' 
        AND indexname = 'idx_purchase_dedup_expires_at'
    ) THEN
        CREATE INDEX idx_purchase_dedup_expires_at ON purchase_event_dedup(expires_at);
        RAISE NOTICE 'Índice idx_purchase_dedup_expires_at criado';
    END IF;

    -- Índice no source
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'purchase_event_dedup' 
        AND indexname = 'idx_purchase_dedup_source'
    ) THEN
        CREATE INDEX idx_purchase_dedup_source ON purchase_event_dedup(source);
        RAISE NOTICE 'Índice idx_purchase_dedup_source criado';
    END IF;

    -- Índice composto para consultas de deduplicação
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'purchase_event_dedup' 
        AND indexname = 'idx_purchase_dedup_event_source'
    ) THEN
        CREATE INDEX idx_purchase_dedup_event_source ON purchase_event_dedup(event_id, source);
        RAISE NOTICE 'Índice idx_purchase_dedup_event_source criado';
    END IF;
END $$;

-- ================================================
-- 2. VERIFICAR/ADICIONAR COLUNAS NA TABELA tokens
-- ================================================

-- 2.1. Adicionar coluna bot_id se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'bot_id'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN bot_id TEXT;
        
        RAISE NOTICE 'Coluna bot_id adicionada à tokens';
    ELSE
        RAISE NOTICE 'Coluna bot_id já existe na tokens';
    END IF;
END $$;

-- 2.2. Adicionar outras colunas necessárias para Purchase CAPI
DO $$
BEGIN
    -- capi_ready
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'capi_ready'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN capi_ready BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Coluna capi_ready adicionada';
    END IF;

    -- capi_sent
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'capi_sent'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN capi_sent BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Coluna capi_sent adicionada';
    END IF;

    -- pixel_sent
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'pixel_sent'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN pixel_sent BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Coluna pixel_sent adicionada';
    END IF;

    -- capi_processing
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'capi_processing'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN capi_processing BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Coluna capi_processing adicionada';
    END IF;

    -- event_attempts
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'event_attempts'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN event_attempts INTEGER DEFAULT 0;
        RAISE NOTICE 'Coluna event_attempts adicionada';
    END IF;

    -- first_event_sent_at
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'tokens' 
        AND column_name = 'first_event_sent_at'
    ) THEN
        ALTER TABLE tokens 
        ADD COLUMN first_event_sent_at TIMESTAMP;
        RAISE NOTICE 'Coluna first_event_sent_at adicionada';
    END IF;
END $$;

-- ================================================
-- 3. LIMPAR DADOS EXPIRADOS
-- ================================================

-- Limpar eventos expirados da purchase_event_dedup
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM purchase_event_dedup 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Removidos % eventos expirados da purchase_event_dedup', deleted_count;
END $$;

-- ================================================
-- 4. VERIFICAR ESTRUTURA FINAL
-- ================================================

SELECT 
    'purchase_event_dedup' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'purchase_event_dedup'
ORDER BY ordinal_position;

SELECT 
    'tokens (colunas CAPI)' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'tokens'
AND column_name IN ('bot_id', 'capi_ready', 'capi_sent', 'pixel_sent', 'capi_processing', 'event_attempts', 'first_event_sent_at')
ORDER BY column_name;

-- ================================================
-- SCRIPT CONCLUÍDO
-- ================================================
SELECT '✅ Script de correção de schema concluído com sucesso!' as status;
