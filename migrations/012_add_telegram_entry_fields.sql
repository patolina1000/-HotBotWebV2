-- Migração: Adicionar campos telegram_entry_* à tabela payloads
-- Descrição: Campos para persistir dados de entrada via página /telegram antes de abrir o bot
-- Data: 2025-10-10
-- [TELEGRAM-ENTRY] Campos para captura de _fbc/_fbp na página /telegram

ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_at TIMESTAMPTZ;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_fbc TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_fbp TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_fbclid TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_user_agent TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_event_source_url TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_referrer TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_ip TEXT;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_payloads_telegram_entry_at ON payloads(telegram_entry_at);

-- Log de conclusão
DO $$
BEGIN
  RAISE NOTICE '[MIGRATION] Colunas telegram_entry_* adicionadas à tabela payloads';
END $$;
