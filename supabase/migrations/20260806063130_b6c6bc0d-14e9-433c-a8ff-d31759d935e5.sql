ALTER TABLE public.session_questions ADD COLUMN IF NOT EXISTS snapshot jsonb;
ALTER TABLE public.session_participants ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS recipient_participant_id uuid REFERENCES public.session_participants(id);

ALTER TABLE public.thread_messages DROP CONSTRAINT IF EXISTS thread_messages_kind_check;
ALTER TABLE public.thread_messages ADD CONSTRAINT thread_messages_kind_check CHECK (kind = ANY (ARRAY['reaction'::text,'text'::text,'quick_ask'::text,'starter'::text]));

CREATE INDEX IF NOT EXISTS invites_session_id_idx ON public.invites(session_id);
CREATE INDEX IF NOT EXISTS session_questions_session_id_idx ON public.session_questions(session_id);
CREATE INDEX IF NOT EXISTS answers_session_question_id_idx ON public.answers(session_question_id);
CREATE INDEX IF NOT EXISTS session_participants_session_id_idx ON public.session_participants(session_id);