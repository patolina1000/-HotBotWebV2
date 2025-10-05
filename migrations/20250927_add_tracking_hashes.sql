ALTER TABLE public.tracking_data
  ADD COLUMN IF NOT EXISTS external_id_hash text,
  ADD COLUMN IF NOT EXISTS zip_hash text;

CREATE INDEX IF NOT EXISTS ix_tracking_data_external_id_hash ON public.tracking_data (external_id_hash);
CREATE INDEX IF NOT EXISTS ix_tracking_data_telegram_id ON public.tracking_data (telegram_id);
