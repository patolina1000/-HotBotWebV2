-- Migration para adicionar colunas necessárias ao fluxo de Purchase com deduplicação
-- Data: 2025-10-06
-- Descrição: Adiciona colunas para armazenar dados do webhook PushinPay e controlar fluxo Purchase CAPI

-- Adicionar colunas para dados do webhook PushinPay
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS payer_cpf TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS price_cents INTEGER;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL';

-- Adicionar colunas para dados coletados na página de obrigado
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS email TEXT;
-- Nota: phone já existe da migration 20250923_add_name_phone_columns.sql

-- Adicionar colunas para controle do fluxo Purchase
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS event_id_purchase TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS capi_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS capi_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS pixel_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS capi_processing BOOLEAN DEFAULT FALSE;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS event_attempts INTEGER DEFAULT 0;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS first_event_sent_at TIMESTAMPTZ;

-- Criar índice para transaction_id para otimizar buscas
CREATE INDEX IF NOT EXISTS idx_tokens_transaction_id ON tokens(transaction_id);

-- Criar índice para event_id_purchase para otimizar buscas
CREATE INDEX IF NOT EXISTS idx_tokens_event_id_purchase ON tokens(event_id_purchase);

-- Criar índice composto para capi_ready e capi_sent para otimizar consultas de reprocessamento
CREATE INDEX IF NOT EXISTS idx_tokens_capi_status ON tokens(capi_ready, capi_sent, pixel_sent) WHERE capi_ready = TRUE;

-- Comentários para documentação
COMMENT ON COLUMN tokens.payer_name IS 'Nome do pagador recebido do webhook PushinPay';
COMMENT ON COLUMN tokens.payer_cpf IS 'CPF do pagador recebido do webhook PushinPay';
COMMENT ON COLUMN tokens.transaction_id IS 'ID da transação PushinPay (mesmo que id_transacao)';
COMMENT ON COLUMN tokens.price_cents IS 'Valor da compra em centavos';
COMMENT ON COLUMN tokens.currency IS 'Moeda da transação (padrão BRL)';
COMMENT ON COLUMN tokens.email IS 'Email coletado na página de obrigado';
COMMENT ON COLUMN tokens.event_id_purchase IS 'Event ID compartilhado entre Purchase browser e CAPI';
COMMENT ON COLUMN tokens.capi_ready IS 'Indica se o webhook recebeu os dados e o token está pronto para CAPI';
COMMENT ON COLUMN tokens.capi_sent IS 'Indica se o evento Purchase CAPI foi enviado com sucesso';
COMMENT ON COLUMN tokens.pixel_sent IS 'Indica se o evento Purchase browser foi disparado';
COMMENT ON COLUMN tokens.capi_processing IS 'Indica se o envio CAPI está em processamento';
COMMENT ON COLUMN tokens.event_attempts IS 'Número de tentativas de envio do evento CAPI';
COMMENT ON COLUMN tokens.first_event_sent_at IS 'Timestamp do primeiro envio bem-sucedido do evento';
