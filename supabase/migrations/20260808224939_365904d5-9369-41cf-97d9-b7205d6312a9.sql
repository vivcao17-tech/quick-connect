CREATE TABLE public.session_participant_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, topic_id)
);

GRANT SELECT ON public.session_participant_topics TO anon, authenticated;
GRANT ALL ON public.session_participant_topics TO service_role;
ALTER TABLE public.session_participant_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spt_member_read" ON public.session_participant_topics
  FOR SELECT TO anon, authenticated
  USING (public.is_session_member(session_id));

CREATE TABLE public.session_question_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, question_id)
);

GRANT SELECT ON public.session_question_votes TO anon, authenticated;
GRANT ALL ON public.session_question_votes TO service_role;
ALTER TABLE public.session_question_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sqv_member_read" ON public.session_question_votes
  FOR SELECT TO anon, authenticated
  USING (public.is_session_member(session_id));

CREATE INDEX idx_spt_session ON public.session_participant_topics(session_id);
CREATE INDEX idx_sqv_session ON public.session_question_votes(session_id);
CREATE UNIQUE INDEX idx_sessions_room_code ON public.sessions(room_code) WHERE room_code IS NOT NULL;

ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.session_questions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_questions;