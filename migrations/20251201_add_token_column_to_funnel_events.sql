-- Ensure funnel_events has token column for Meta CAPI metrics
ALTER TABLE IF EXISTS public.funnel_events
  ADD COLUMN IF NOT EXISTS token text;
