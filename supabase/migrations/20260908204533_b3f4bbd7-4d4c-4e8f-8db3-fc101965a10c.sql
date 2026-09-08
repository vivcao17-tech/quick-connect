CREATE TABLE public.excluded_identities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('profile','guest_token')),
  value text NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
GRANT ALL ON public.excluded_identities TO service_role;
ALTER TABLE public.excluded_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.excluded_identities FOR ALL TO service_role USING (true) WITH CHECK (true);