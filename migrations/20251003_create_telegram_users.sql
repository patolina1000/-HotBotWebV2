CREATE TABLE IF NOT EXISTS public.telegram_users (
  telegram_id BIGINT PRIMARY KEY,
  external_id_hash TEXT,
  fbp TEXT,
  fbc TEXT,
  zip_hash TEXT,
  ip_capturado TEXT,
  ua_capturado TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  event_source_url TEXT,
  criado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_telegram_users_external_id_hash ON public.telegram_users (external_id_hash);
CREATE INDEX IF NOT EXISTS ix_telegram_users_created_at ON public.telegram_users (criado_em);
