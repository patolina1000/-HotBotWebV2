ALTER TABLE public.payload_tracking
  ADD COLUMN IF NOT EXISTS geo_postal_code text;
