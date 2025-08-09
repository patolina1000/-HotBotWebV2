-- Migração: Criação da tabela funnel_events
-- Data: $(date)
-- Descrição: Tabela para registrar eventos do funil com alta confiabilidade

-- Criar tabela principal
CREATE TABLE IF NOT EXISTS funnel_events (
  id SERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  event_name TEXT NOT NULL,
  bot TEXT,
  telegram_id TEXT,
  payload_id TEXT,
  session_id TEXT,
  offer_tier TEXT,
  price_cents INTEGER CHECK (price_cents >= 0),
  transaction_id TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name_occurred_at 
ON funnel_events (event_name, occurred_at);

CREATE INDEX IF NOT EXISTS idx_funnel_events_bot_occurred_at 
ON funnel_events (bot, occurred_at);

CREATE INDEX IF NOT EXISTS idx_funnel_events_telegram_id 
ON funnel_events (telegram_id);

CREATE INDEX IF NOT EXISTS idx_funnel_events_payload_id 
ON funnel_events (payload_id);

CREATE INDEX IF NOT EXISTS idx_funnel_events_transaction_id 
ON funnel_events (transaction_id);

CREATE INDEX IF NOT EXISTS idx_funnel_events_offer_tier 
ON funnel_events (offer_tier);

-- Comentários para documentação
COMMENT ON TABLE funnel_events IS 'Tabela para registrar eventos do funil de vendas';
COMMENT ON COLUMN funnel_events.id IS 'ID único do evento';
COMMENT ON COLUMN funnel_events.occurred_at IS 'Timestamp do evento (com timezone)';
COMMENT ON COLUMN funnel_events.event_name IS 'Nome do evento (obrigatório)';
COMMENT ON COLUMN funnel_events.bot IS 'ID do bot que gerou o evento';
COMMENT ON COLUMN funnel_events.telegram_id IS 'ID do usuário no Telegram';
COMMENT ON COLUMN funnel_events.payload_id IS 'ID do payload relacionado';
COMMENT ON COLUMN funnel_events.session_id IS 'ID da sessão do usuário';
COMMENT ON COLUMN funnel_events.offer_tier IS 'Nível da oferta (ex: basic, premium, vip)';
COMMENT ON COLUMN funnel_events.price_cents IS 'Preço em centavos (deve ser >= 0)';
COMMENT ON COLUMN funnel_events.transaction_id IS 'ID da transação (para eventos de compra)';
COMMENT ON COLUMN funnel_events.meta IS 'Metadados adicionais em formato JSON';

-- Verificar se a tabela foi criada
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'funnel_events'
ORDER BY ordinal_position;

-- Verificar se os índices foram criados
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'funnel_events';
