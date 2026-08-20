CREATE TABLE public.session_links (
  token text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX session_links_participant_idx ON public.session_links(participant_id);
GRANT ALL ON public.session_links TO service_role;
ALTER TABLE public.session_links ENABLE ROW LEVEL SECURITY;