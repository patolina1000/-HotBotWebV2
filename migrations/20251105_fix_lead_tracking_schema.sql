-- Ensure funnel_events has telegram_id for lead metrics
ALTER TABLE IF EXISTS public.funnel_events
  ADD COLUMN IF NOT EXISTS telegram_id BIGINT;

-- Align tracking_data schema with lead requirements
ALTER TABLE IF EXISTS public.tracking_data
  ADD COLUMN IF NOT EXISTS external_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS zip_hash TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS client_ip_address TEXT,
  ADD COLUMN IF NOT EXISTS client_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS event_source_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.tracking_data
  ALTER COLUMN created_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS ix_tracking_data_external_id_hash ON public.tracking_data (external_id_hash);
CREATE INDEX IF NOT EXISTS ix_tracking_data_telegram_id ON public.tracking_data (telegram_id);
