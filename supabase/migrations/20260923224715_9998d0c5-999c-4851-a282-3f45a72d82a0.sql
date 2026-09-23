UPDATE public.questions
SET question_key = 'meet_click_01',
    text = 'You’re getting to know someone:',
    option_a = 'See them several times casually',
    option_b = 'Have fewer, longer hangouts',
    pack = 'click',
    question_type = 'ab',
    mode = 'both',
    spice_level = 1,
    active = true
WHERE id = '3a41b494-e40b-4a50-8c58-3a028cd9ad8d'
  AND NOT EXISTS (SELECT 1 FROM public.answers WHERE question_id = '3a41b494-e40b-4a50-8c58-3a028cd9ad8d');

UPDATE public.questions
SET question_key = 'meet_clash_09',
    text = 'Someone gives you advice you didn’t ask for:',
    option_a = 'Fine if it’s good',
    option_b = 'Ask me first',
    pack = 'clash',
    question_type = 'ab',
    mode = 'both',
    spice_level = 1,
    active = true
WHERE id = '654d2830-7c30-45e6-b8be-da6736ce876b'
  AND NOT EXISTS (SELECT 1 FROM public.answers WHERE question_id = '654d2830-7c30-45e6-b8be-da6736ce876b');

UPDATE public.questions
SET active = false
WHERE id = '2c8404a5-929e-43f1-b145-e1ac371fa4ee';

INSERT INTO public.questions
  (question_key, text, option_a, option_b, spice_level, active, question_type, mode, is_featured, impression_pool, pack, is_values, source)
VALUES
  ('meet_click_02', 'A place is much busier than expected:', 'Stay', 'Find somewhere else', 1, true, 'ab', 'both', false, false, 'click', false, 'meet_paper_2026'),
  ('meet_click_03', 'Something better comes up halfway through:', 'Switch', 'Finish', 1, true, 'ab', 'both', false, false, 'click', false, 'meet_paper_2026'),
  ('meet_talk_04', 'What’s more interesting about someone:', 'They know a surprising amount', 'They notice what others miss', 1, true, 'ab', 'both', false, false, 'talk', false, 'meet_paper_2026'),
  ('meet_talk_05', 'You’d rather hear about:', 'How they made something work', 'How they changed their mind', 1, true, 'ab', 'both', false, false, 'talk', false, 'meet_paper_2026'),
  ('meet_talk_06', 'You’d rather understand:', 'How people get good at something', 'Why people make choices that don’t make sense', 1, true, 'ab', 'both', false, false, 'talk', false, 'meet_paper_2026'),
  ('meet_click_07', 'A weekend:', 'Going out to do something', 'Staying in and finishing something', 1, true, 'ab', 'both', false, false, 'click', false, 'meet_paper_2026'),
  ('meet_click_08', 'With a new friend:', 'Do something specific', 'Just sit and talk', 1, true, 'ab', 'both', false, false, 'click', false, 'meet_paper_2026'),
  ('meet_clash_10', 'A friend goes quiet for a week:', 'They have their reasons', 'I’d rather know', 1, true, 'ab', 'both', false, false, 'clash', false, 'meet_paper_2026');

CREATE TABLE public.meet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slot_label text NOT NULL,
  starts_at timestamptz NOT NULL,
  time_zone text NOT NULL DEFAULT 'America/Los_Angeles',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.meet_events TO service_role;
ALTER TABLE public.meet_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meet_event_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.meet_events(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, position),
  UNIQUE (event_id, question_id)
);
GRANT ALL ON public.meet_event_questions TO service_role;
ALTER TABLE public.meet_event_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meet_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_id uuid NOT NULL REFERENCES public.meet_events(id),
  profile_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES public.session_participants(id) ON DELETE SET NULL,
  answer_session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  contact text NOT NULL,
  berkeley_email text NOT NULL,
  confirmed_18 boolean NOT NULL CHECK (confirmed_18),
  consented boolean NOT NULL CHECK (consented),
  availability text NOT NULL,
  signup_answers jsonb NOT NULL,
  open_answers jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('online', 'paper')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (event_id, profile_id)
);
GRANT ALL ON public.meet_signups TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.meet_signups_signup_number_seq TO service_role;
ALTER TABLE public.meet_signups ENABLE ROW LEVEL SECURITY;

CREATE INDEX meet_event_questions_event_position_idx ON public.meet_event_questions(event_id, position);
CREATE INDEX meet_signups_event_created_idx ON public.meet_signups(event_id, created_at DESC);

CREATE TRIGGER meet_events_updated_at
BEFORE UPDATE ON public.meet_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER meet_signups_updated_at
BEFORE UPDATE ON public.meet_signups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH event_row AS (
  INSERT INTO public.meet_events (title, slot_label, starts_at, time_zone, active)
  VALUES ('Berkeley meetup', 'Sunday afternoon', '2026-09-27 14:00:00 America/Los_Angeles'::timestamptz, 'America/Los_Angeles', true)
  RETURNING id
)
INSERT INTO public.meet_event_questions (event_id, question_id, position)
SELECT event_row.id, q.id, v.position
FROM event_row
CROSS JOIN (VALUES
  (1, 'meet_click_01'),
  (2, 'meet_click_02'),
  (3, 'meet_click_03'),
  (4, 'meet_talk_04'),
  (5, 'meet_talk_05'),
  (6, 'meet_talk_06'),
  (7, 'meet_click_07'),
  (8, 'meet_click_08'),
  (9, 'meet_clash_09'),
  (10, 'meet_clash_10')
) AS v(position, question_key)
JOIN public.questions q ON q.question_key = v.question_key;