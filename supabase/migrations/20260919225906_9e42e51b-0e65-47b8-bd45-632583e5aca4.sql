ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS pack text;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_pack_check CHECK (pack IS NULL OR pack IN ('click','talk','bring_out','clash'));