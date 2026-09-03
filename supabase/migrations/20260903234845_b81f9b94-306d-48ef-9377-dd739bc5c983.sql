ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

UPDATE public.questions
SET is_featured = true
WHERE created_at >= '2026-09-03'::date AND active = true;

CREATE INDEX IF NOT EXISTS questions_selection_idx ON public.questions (active, mode, question_type, spice_level, is_featured);