-- Migração para adicionar colunas first_name, last_name e phone na tabela tokens
-- Data: 2025-09-23

-- Para PostgreSQL
DO $$
BEGIN
    -- Adicionar coluna first_name se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tokens' AND column_name='first_name'
    ) THEN
        ALTER TABLE tokens ADD COLUMN first_name TEXT;
        RAISE NOTICE 'Coluna first_name adicionada à tabela tokens';
    END IF;
    
    -- Adicionar coluna last_name se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tokens' AND column_name='last_name'
    ) THEN
        ALTER TABLE tokens ADD COLUMN last_name TEXT;
        RAISE NOTICE 'Coluna last_name adicionada à tabela tokens';
    END IF;
    
    -- Adicionar coluna phone se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tokens' AND column_name='phone'
    ) THEN
        ALTER TABLE tokens ADD COLUMN phone TEXT;
        RAISE NOTICE 'Coluna phone adicionada à tabela tokens';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='tokens' AND column_name='event_time'
    ) THEN
        ALTER TABLE tokens ADD COLUMN event_time INTEGER;
        RAISE NOTICE 'Coluna event_time adicionada à tabela tokens';
    END IF;

    UPDATE tokens
    SET event_time = EXTRACT(EPOCH FROM criado_em)::INTEGER
    WHERE event_time IS NULL;
END
$$;

-- Para SQLite (executar separadamente se necessário)
-- ALTER TABLE tokens ADD COLUMN first_name TEXT;
-- ALTER TABLE tokens ADD COLUMN last_name TEXT;
-- ALTER TABLE tokens ADD COLUMN phone TEXT;
