-- Migration: Adicionar coluna 'token' à tabela funnel_events
-- Esta migration é OPCIONAL e deve ser executada manualmente se necessário
-- 
-- Contexto:
-- A coluna 'token' permite rastrear eventos de conversão vinculados a tokens de pagamento,
-- facilitando a auditoria e análise de métricas de funil.
-- 
-- Execução manual:
-- psql -U seu_usuario -d sua_database -f migrations/add_token_column_to_funnel_events.sql
--
-- Para reverter:
-- ALTER TABLE funnel_events DROP COLUMN IF EXISTS token;

-- Adicionar coluna 'token' se não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'funnel_events'
        AND column_name = 'token'
    ) THEN
        ALTER TABLE funnel_events ADD COLUMN token TEXT NULL;
        
        -- Adicionar índice para melhorar performance em queries por token
        CREATE INDEX IF NOT EXISTS idx_funnel_events_token ON funnel_events(token) WHERE token IS NOT NULL;
        
        RAISE NOTICE 'Coluna "token" adicionada com sucesso à tabela funnel_events';
    ELSE
        RAISE NOTICE 'Coluna "token" já existe na tabela funnel_events';
    END IF;
END $$;

-- Comentário descritivo para documentação
COMMENT ON COLUMN funnel_events.token IS 'Token de pagamento associado ao evento (opcional). Permite vincular eventos de conversão a transações específicas.';
