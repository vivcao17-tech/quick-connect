UPDATE public.questions
SET option_a = 'plan a few things I really want to do',
    option_b = 'start somewhere and figure it out'
WHERE question_key = 'click_01'
  AND source = 'v2_pack';

UPDATE public.questions
SET option_b = 'wait and see if it still matters'
WHERE question_key = 'clash_05'
  AND source = 'v2_pack';

UPDATE public.questions
SET option_b = 'let them decide unless they ask'
WHERE question_key = 'clash_13'
  AND source = 'v2_pack';

UPDATE public.questions
SET option_b = 'make it feel manageable'
WHERE question_key = 'bring_08'
  AND source = 'v2_pack';

INSERT INTO public.questions (
  question_key, pack, question_type, mode, spice_level, text, option_a, option_b,
  self_prompt, is_values, first_round_role, source, active, is_featured, follow_up,
  stem_other, stem_self
)
VALUES
  ('click_16', 'click', 'ab', 'both', 1, 'A friend texts "Want to do something tonight?"', 'tell me what we''re doing first', 'sure, we''ll figure it out', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('click_17', 'click', 'ab', 'both', 1, 'A hangout is going well but it''s getting late:', 'keep it going', 'leave while it''s still good', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('clash_16', 'clash', 'ab', 'pair', 2, 'A friend leaves you on read, then sends a meme the next day:', 'totally normal', 'I''d want to finish the first conversation', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('clash_17', 'clash', 'ab', 'pair', 2, 'You''re upset and someone jumps straight to solutions:', 'that''s helpful', 'I need them to listen first', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('talk_16', 'talk', 'ab', 'both', 1, 'Someone tells you about a weird problem:', 'I look for the pattern', 'I ask for more details', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('talk_17', 'talk', 'ab', 'pair', 2, 'Someone has an unusual opinion:', 'I want their reasoning', 'I want to know what happened to them', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('talk_18', 'talk', 'ab', 'both', 1, 'Which rabbit hole sounds better?', 'how something became the way it is', 'where it might go next', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('bring_15', 'bring_out', 'ab', 'pair', 2, 'A conversation goes quiet:', 'I bring up something new', 'I help the current topic keep going', NULL, false, NULL, 'v2_pack', true, false, NULL, NULL, NULL),
  ('bring_i4', 'bring_out', 'impression', 'pair', 2, 'Around you, is {name} more likely to…', 'say yes to things', 'slow down and think', 'And around {name}, are you more likely to…', false, NULL, 'v2_pack', true, false, NULL, 'Around you, is {name} more likely to…', 'And around {name}, are you more likely to…'),
  ('bring_i5', 'bring_out', 'impression', 'pair', 2, 'Around you, is {name} more likely to…', 'talk more', 'listen more', 'And around {name}, are you more likely to…', false, NULL, 'v2_pack', true, false, NULL, 'Around you, is {name} more likely to…', 'And around {name}, are you more likely to…'),
  ('bring_i6', 'bring_out', 'impression', 'pair', 2, 'Around you, is {name} more likely to…', 'say what they''re actually thinking', 'keep things light', 'And around {name}, are you more likely to…', false, NULL, 'v2_pack', true, false, NULL, 'Around you, is {name} more likely to…', 'And around {name}, are you more likely to…'),
  ('bring_i7', 'bring_out', 'impression', 'pair', 2, 'Around you, is {name} more likely to…', 'feel more ambitious', 'feel less pressure', 'And around {name}, are you more likely to…', false, NULL, 'v2_pack', true, false, NULL, 'Around you, is {name} more likely to…', 'And around {name}, are you more likely to…'),
  ('bring_i8', 'bring_out', 'impression', 'pair', 2, 'Around you, is {name} more likely to…', 'take themselves more seriously', 'take themselves less seriously', 'And around {name}, are you more likely to…', false, NULL, 'v2_pack', true, false, NULL, 'Around you, is {name} more likely to…', 'And around {name}, are you more likely to…'),
  ('click_open', 'click', 'open', 'pair', 1, 'What kind of hangout almost always puts you in a good mood?', '', '', NULL, false, NULL, 'v2_pack', false, false, NULL, NULL, NULL),
  ('clash_open', 'clash', 'open', 'pair', 1, 'What''s a small thing people do that bothers you more than it probably should?', '', '', NULL, false, NULL, 'v2_pack', false, false, NULL, NULL, NULL),
  ('talk_open_2', 'talk', 'open', 'pair', 1, 'What''s something you''ve been unusually curious about lately?', '', '', NULL, false, NULL, 'v2_pack', false, false, NULL, NULL, NULL)
;