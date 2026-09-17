CREATE TABLE public.chain_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  sort_order integer NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.chain_questions TO service_role;
ALTER TABLE public.chain_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chain_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.chain_questions(id),
  opens_at timestamptz NOT NULL UNIQUE,
  settles_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.chain_weeks TO service_role;
ALTER TABLE public.chain_weeks ENABLE ROW LEVEL SECURITY;
CREATE INDEX chain_weeks_window_idx ON public.chain_weeks (opens_at DESC);

CREATE TABLE public.chain_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.chain_weeks(id) ON DELETE CASCADE,
  person_key text NOT NULL,
  profile_id uuid REFERENCES public.profiles(id),
  display_name text,
  option_key text NOT NULL CHECK (option_key IN ('a','b')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, person_key)
);
GRANT ALL ON public.chain_answers TO service_role;
ALTER TABLE public.chain_answers ENABLE ROW LEVEL SECURITY;
CREATE INDEX chain_answers_week_idx ON public.chain_answers (week_id);

CREATE TABLE public.chain_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.chain_weeks(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.chain_questions(id),
  token text NOT NULL UNIQUE,
  guesser_key text NOT NULL,
  guesser_profile_id uuid REFERENCES public.profiles(id),
  guesser_name text NOT NULL,
  subject_name text NOT NULL,
  subject_key text,
  guessed_option text NOT NULL CHECK (guessed_option IN ('a','b')),
  because_text text,
  subject_actual_option text CHECK (subject_actual_option IN ('a','b')),
  matched boolean,
  is_test boolean NOT NULL DEFAULT false,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.chain_guesses TO service_role;
ALTER TABLE public.chain_guesses ENABLE ROW LEVEL SECURITY;
CREATE INDEX chain_guesses_week_idx ON public.chain_guesses (week_id);
CREATE INDEX chain_guesses_subject_idx ON public.chain_guesses (week_id, subject_key);
CREATE INDEX chain_guesses_guesser_idx ON public.chain_guesses (week_id, guesser_key);

INSERT INTO public.chain_questions (text, option_a, option_b, sort_order) VALUES
('When someone is upset, {name}', 'Asks questions', 'Gives space', 1),
('When plans are unclear, {name}', 'Picks something and moves', 'Keeps exploring', 2),
('When there''s tension, {name}', 'Says it directly', 'Waits for a better moment', 3),
('With new people, {name}', 'Starts the conversation', 'Keeps it going', 4),
('When making decisions, {name}', 'Trusts the first instinct', 'Thinks through angles', 5),
('When something goes wrong, {name}', 'Solves it immediately', 'Understands what happened first', 6),
('Hearing a wild idea, {name}', 'Builds on it', 'Pressure-tests it', 7),
('When plans change, {name}', 'Adapts quickly', 'Wants a new plan', 8),
('Learning something, {name}', 'Jumps in', 'Understands it first', 9),
('With close friends, {name} shows care by', 'Helping', 'Listening', 10),
('When someone keeps cancelling, {name}', 'Keeps inviting', 'Lets them make the next move', 11),
('When excited about something, {name}', 'Tells people immediately', 'Sits with it first', 12),
('At a party, {name}', 'Moves between groups', 'Settles into one conversation', 13),
('When everyone''s indecisive, {name}', 'Makes the call', 'Helps people reach a choice', 14),
('When someone tells a long story, {name}', 'Asks for details', 'Focuses on the point', 15),
('Entering a new group, {name}', 'Observes first', 'Jumps in quickly', 16),
('When conflict happens, {name}', 'Clears the air now', 'Lets emotions settle', 17),
('When someone is quiet, {name}', 'Pulls them in', 'Lets them join when they want', 18),
('With a strong opinion, {name}', 'Says it early', 'Waits until it matters', 19),
('When a friend takes a risk, {name}', 'Encourages them', 'Asks what could go wrong', 20);

INSERT INTO public.chain_weeks (question_id, opens_at, settles_at)
SELECT q.id,
       timestamptz '2026-09-17 00:00:00+00' + ((q.sort_order - 1) * interval '7 days'),
       timestamptz '2026-09-17 00:00:00+00' + ((q.sort_order - 1) * interval '7 days') + interval '4 days 2 hours'
FROM public.chain_questions q;