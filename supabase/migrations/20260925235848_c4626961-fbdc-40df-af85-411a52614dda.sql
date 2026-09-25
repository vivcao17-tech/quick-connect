UPDATE public.questions SET question_key='know_wrong' WHERE question_key IS NULL AND impression_pool AND stem_self='When something goes wrong, you';
UPDATE public.questions SET question_key='know_better_at' WHERE question_key IS NULL AND impression_pool AND stem_self='You''re better at' AND option_a='Starting things';
UPDATE public.questions SET question_key='know_privately' WHERE question_key IS NULL AND impression_pool AND stem_self='Privately, you''re more';
UPDATE public.questions SET question_key='know_apologize' WHERE question_key IS NULL AND impression_pool AND stem_self='You apologize';
UPDATE public.questions SET question_key='know_host' WHERE question_key IS NULL AND impression_pool AND stem_self='You''d rather' AND option_a='Host';

CREATE TABLE public.impression_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  subject_profile_id uuid,
  subject_guest_token text NOT NULL,
  subject_name text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.session_participants(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT false,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX impression_cards_profile_idx ON public.impression_cards(subject_profile_id);
CREATE INDEX impression_cards_guest_idx ON public.impression_cards(subject_guest_token);
GRANT ALL ON public.impression_cards TO service_role;
ALTER TABLE public.impression_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.impression_cards FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.impression_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.impression_cards(id) ON DELETE CASCADE,
  guesser_profile_id uuid,
  guesser_session_id text NOT NULL,
  guesser_display_name text NOT NULL,
  question_key text NOT NULL,
  guessed_option text NOT NULL CHECK (guessed_option IN ('a','b')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, guesser_session_id, question_key)
);
CREATE INDEX impression_guesses_card_idx ON public.impression_guesses(card_id);
GRANT ALL ON public.impression_guesses TO service_role;
ALTER TABLE public.impression_guesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.impression_guesses FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);