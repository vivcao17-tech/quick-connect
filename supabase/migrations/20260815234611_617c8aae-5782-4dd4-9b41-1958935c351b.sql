ALTER TABLE public.questions
  ADD COLUMN question_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('standard', 'impression', 'prediction'));

ALTER TABLE public.answers
  ADD COLUMN answer_role text NOT NULL DEFAULT 'about_self',
  ADD COLUMN about_participant_id uuid REFERENCES public.session_participants(id) ON DELETE CASCADE;

ALTER TABLE public.answers
  ADD CONSTRAINT answers_answer_role_check
  CHECK (answer_role IN ('about_self', 'about_other'));

INSERT INTO public.questions (topic_id, text, option_a, option_b, option_c, spice_level, active, question_type)
VALUES
  (NULL, 'Impulsive or careful?', 'More impulsive', 'More careful', NULL, 2, true, 'impression'),
  (NULL, 'Says it straight or softens it?', 'Says it straight', 'Softens it', NULL, 2, true, 'impression'),
  (NULL, 'Needs people around or needs the room quiet?', 'Needs people around', 'Needs it quiet', NULL, 2, true, 'impression'),
  (NULL, 'Holds a grudge or lets it go?', 'Holds a grudge', 'Lets it go', NULL, 2, true, 'impression'),
  (NULL, 'Plans the trip or shows up and figures it out?', 'Plans it', 'Figures it out', NULL, 2, true, 'impression');