UPDATE public.session_questions sq
SET snapshot = jsonb_set(
  jsonb_set(
    jsonb_set(coalesce(sq.snapshot, '{}'::jsonb), '{text}', to_jsonb(q.text)),
    '{stemOther}', to_jsonb(q.stem_other)),
  '{stemSelf}', to_jsonb(q.stem_self))
  || jsonb_build_object('options', jsonb_build_array(
       jsonb_build_object('key','a','label',q.option_a),
       jsonb_build_object('key','b','label',q.option_b)))
FROM public.questions q
WHERE q.id = sq.question_id
  AND q.question_type = 'impression'
  AND q.stem_other IS NOT NULL
  AND sq.revealed_at IS NULL;