CREATE TABLE IF NOT EXISTS page_tokens (
  id BIGSERIAL PRIMARY KEY,
  page_token UUID NOT NULL,
  transaction_id TEXT,
  telegram_id BIGINT,
  payer_name TEXT NOT NULL,
  payer_cpf TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS page_tokens_page_token_idx ON page_tokens(page_token);
CREATE INDEX IF NOT EXISTS page_tokens_transaction_idx ON page_tokens(transaction_id);
CREATE INDEX IF NOT EXISTS page_tokens_telegram_idx ON page_tokens(telegram_id);
