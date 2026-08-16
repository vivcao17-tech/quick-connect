CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  session_question_id uuid NOT NULL REFERENCES public.session_questions(id) ON DELETE CASCADE,
  actor_name text NOT NULL,
  question_text text NOT NULL,
  link text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read_own ON public.notifications FOR SELECT TO anon, authenticated USING (public.is_my_participant(participant_id));

CREATE TABLE public.thread_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  session_question_id uuid NOT NULL REFERENCES public.session_questions(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, session_question_id)
);
GRANT ALL ON public.thread_reads TO service_role;
ALTER TABLE public.thread_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY thread_reads_read_own ON public.thread_reads FOR SELECT TO anon, authenticated USING (public.is_my_participant(participant_id));

CREATE INDEX notifications_participant_idx ON public.notifications (participant_id, created_at DESC);
CREATE INDEX notifications_thread_idx ON public.notifications (participant_id, session_question_id, created_at DESC);