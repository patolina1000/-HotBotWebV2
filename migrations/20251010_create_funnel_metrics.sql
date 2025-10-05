CREATE TABLE IF NOT EXISTS public.funnel_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_name TEXT NOT NULL,
  telegram_id BIGINT,
  token TEXT,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS ix_funnel_events_event_time ON public.funnel_events (event_name, occurred_at);
CREATE INDEX IF NOT EXISTS ix_funnel_events_telegram ON public.funnel_events (telegram_id);
CREATE INDEX IF NOT EXISTS ix_funnel_events_token ON public.funnel_events (token);

CREATE TABLE IF NOT EXISTS public.funnel_counters (
  event_date DATE NOT NULL,
  event_name TEXT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, event_name)
);
