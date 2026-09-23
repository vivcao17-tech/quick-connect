ALTER TABLE public.thread_messages ALTER COLUMN session_question_id DROP NOT NULL;
ALTER TABLE public.thread_messages ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS thread_messages_session_standalone_idx ON public.thread_messages (session_id, created_at) WHERE session_question_id IS NULL;
UPDATE public.conversation_prompts SET active = false;