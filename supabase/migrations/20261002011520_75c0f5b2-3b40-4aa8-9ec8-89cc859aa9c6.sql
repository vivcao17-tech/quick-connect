CREATE TABLE public.card_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  card_id uuid,
  guest_token text,
  user_id uuid,
  meta jsonb
);
GRANT ALL ON public.card_events TO service_role;
ALTER TABLE public.card_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX card_events_created_idx ON public.card_events (created_at DESC);
CREATE INDEX card_events_event_idx ON public.card_events (event, created_at DESC);