CREATE TABLE public.person_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key text NOT NULL,
  target_key text NOT NULL,
  nickname text,
  contact text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_key, target_key)
);

GRANT ALL ON public.person_notes TO service_role;

ALTER TABLE public.person_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_person_notes_updated_at
BEFORE UPDATE ON public.person_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();