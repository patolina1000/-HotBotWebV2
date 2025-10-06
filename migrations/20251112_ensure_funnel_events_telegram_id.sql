-- Ensure funnel_events has telegram_id column for lead tracking metrics
ALTER TABLE IF EXISTS public.funnel_events
  ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
