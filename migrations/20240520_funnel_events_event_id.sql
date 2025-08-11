-- Ensure funnel_events has event_id column and unique index
ALTER TABLE public.funnel_events ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Backfill existing rows deterministically
UPDATE public.funnel_events
SET event_id = encode(digest(CONCAT_WS('|', COALESCE(event_name,''), COALESCE(transaction_id,''), COALESCE(telegram_id::text,''), EXTRACT(EPOCH FROM occurred_at)::bigint::text), 'sha256'), 'hex')
WHERE event_id IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE public.funnel_events ALTER COLUMN event_id SET NOT NULL;

-- Create unique index to support ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = i.indexrelid AND a.attnum = ANY(i.indkey)
     WHERE t.relname = 'funnel_events' AND i.indisunique AND a.attname = 'event_id'
  ) THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX CONCURRENTLY ux_funnel_events_event_id ON public.funnel_events(event_id)';
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_funnel_events_event_id ON public.funnel_events(event_id)';
    END;
  END IF;
END$$;
