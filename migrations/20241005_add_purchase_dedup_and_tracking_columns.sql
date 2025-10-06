CREATE TABLE IF NOT EXISTS purchase_event_dedup (
  id BIGSERIAL PRIMARY KEY,
  transaction_id TEXT UNIQUE,
  event_id TEXT UNIQUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_event_dedup_seen ON purchase_event_dedup(first_seen_at);

ALTER TABLE tracking_data
  ADD COLUMN IF NOT EXISTS external_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS zip_hash TEXT,
  ADD COLUMN IF NOT EXISTS client_ip_address TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS event_source_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS external_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS zip_hash TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS client_ip_address TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS event_source_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tel_users_tg ON telegram_users(telegram_id);
