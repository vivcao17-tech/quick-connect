ALTER TABLE public.meet_events
  ADD COLUMN signup_deadline timestamptz;

UPDATE public.meet_events
SET signup_deadline = '2026-09-25 17:00:00 America/Los_Angeles'::timestamptz
WHERE active = true;

ALTER TABLE public.meet_events
  ALTER COLUMN signup_deadline SET NOT NULL;

CREATE TABLE public.meet_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.meet_events(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, email)
);
GRANT ALL ON public.meet_waitlist TO service_role;
ALTER TABLE public.meet_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meet_waitlist_deny_all"
ON public.meet_waitlist
AS RESTRICTIVE
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE INDEX meet_waitlist_event_created_idx
ON public.meet_waitlist(event_id, created_at DESC);