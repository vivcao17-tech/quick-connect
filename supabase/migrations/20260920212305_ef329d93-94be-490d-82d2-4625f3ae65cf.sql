CREATE OR REPLACE FUNCTION public.profile_wall(_profile_id uuid, _phase text DEFAULT 'impressions'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  seen_at timestamptz;
BEGIN
  IF _phase NOT IN ('impressions', 'details') THEN
    RAISE EXCEPTION 'Unknown profile wall phase';
  END IF;

  IF _phase = 'impressions' THEN
    SELECT coalesce(impressions_seen_at, timestamptz 'epoch') INTO seen_at
    FROM profiles WHERE id = _profile_id;
    seen_at := coalesce(seen_at, timestamptz 'epoch');

    RETURN coalesce((
    WITH tokens AS (
      SELECT DISTINCT guest_token
      FROM session_participants
      WHERE profile_id = _profile_id AND guest_token IS NOT NULL
    ),
    me AS (
      SELECT sp.id
      FROM session_participants sp
      WHERE sp.profile_id = _profile_id
         OR (sp.guest_token IS NOT NULL AND sp.guest_token IN (SELECT guest_token FROM tokens))
    ),
    reads AS (
      SELECT a.question_id, a.option_key, a.created_at
      FROM answers a
      WHERE a.answer_role = 'about_other'
        AND a.about_participant_id IN (SELECT id FROM me)
        AND a.created_at > now() - interval '90 days'
    ),
    about AS (
      SELECT r.question_id, r.option_key, count(*)::int AS n
      FROM reads r
      GROUP BY r.question_id, r.option_key
    ),
    recency AS (
      SELECT r.question_id,
             max(r.created_at) AS last_at,
             count(*) FILTER (WHERE r.created_at > seen_at)::int AS new_count
      FROM reads r
      GROUP BY r.question_id
    ),
    self_answers AS (
      SELECT DISTINCT ON (a.question_id) a.question_id, a.option_key
      FROM answers a
      WHERE a.answer_role = 'about_self'
        AND a.participant_id IN (SELECT id FROM me)
        AND a.created_at > now() - interval '90 days'
      ORDER BY a.question_id, a.created_at DESC
    ),
    impression_rows AS (
      SELECT
        q.id, q.text, q.stem_self, q.stem_other, q.option_a, q.option_b, q.option_c,
        coalesce(pref.hidden, false) AS hidden,
        coalesce((SELECT jsonb_object_agg(a.option_key, a.n) FROM about a WHERE a.question_id = q.id), '{}'::jsonb) AS counts,
        coalesce((SELECT sum(a.n)::int FROM about a WHERE a.question_id = q.id), 0) AS total,
        (SELECT rc.last_at FROM recency rc WHERE rc.question_id = q.id) AS last_at,
        coalesce((SELECT rc.new_count FROM recency rc WHERE rc.question_id = q.id), 0) AS new_count,
        (SELECT sa.option_key FROM self_answers sa WHERE sa.question_id = q.id) AS self_key
      FROM questions q
      LEFT JOIN profile_impression_prefs pref
        ON pref.profile_id = _profile_id AND pref.question_id = q.id
      WHERE q.id IN (SELECT question_id FROM about)
    )
    SELECT jsonb_build_object(
      'profileId', _profile_id,
      'handle', p.handle,
      'displayName', coalesce(
        nullif(btrim(p.display_name), ''),
        (SELECT nullif(btrim(sp.display_name), '')
         FROM session_participants sp
         WHERE sp.id IN (SELECT id FROM me) AND sp.display_name IS NOT NULL
         ORDER BY sp.joined_at DESC LIMIT 1),
        'Someone'
      ),
      'curated', EXISTS (
        SELECT 1 FROM profile_impression_prefs pref WHERE pref.profile_id = _profile_id
      ),
      'impressions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'questionId', ir.id,
          'text', ir.text,
          'stemSelf', ir.stem_self,
          'stemOther', ir.stem_other,
          'options', (SELECT jsonb_agg(option_row ORDER BY option_row->>'key') FROM (
            SELECT jsonb_build_object('key', 'a', 'label', ir.option_a) AS option_row
            UNION ALL SELECT jsonb_build_object('key', 'b', 'label', ir.option_b)
            UNION ALL SELECT jsonb_build_object('key', 'c', 'label', ir.option_c) WHERE ir.option_c IS NOT NULL
          ) options),
          'counts', ir.counts,
          'total', ir.total,
          'selfKey', ir.self_key,
          'hidden', ir.hidden,
          'lastAt', ir.last_at,
          'newCount', ir.new_count
        )) FROM impression_rows ir
      ), '[]'::jsonb)
    )
    FROM profiles p
    WHERE p.id = _profile_id
    ), jsonb_build_object(
      'profileId', _profile_id,
      'handle', null,
      'displayName', 'Someone',
      'curated', false,
      'impressions', '[]'::jsonb
    ));
  END IF;

  WITH tokens AS (
    SELECT DISTINCT guest_token
    FROM session_participants
    WHERE profile_id = _profile_id AND guest_token IS NOT NULL
  ),
  me AS (
    SELECT sp.id
    FROM session_participants sp
    WHERE sp.profile_id = _profile_id
       OR (sp.guest_token IS NOT NULL AND sp.guest_token IN (SELECT guest_token FROM tokens))
  ),
  prefs AS (
    SELECT question_id, hidden
    FROM profile_impression_prefs
    WHERE profile_id = _profile_id
  ),
  fresh AS (
    SELECT a.question_id
    FROM answers a
    WHERE a.answer_role = 'about_other'
      AND a.about_participant_id IN (SELECT id FROM me)
      AND a.created_at > coalesce(
        (SELECT impressions_seen_at FROM profiles WHERE id = _profile_id),
        timestamptz 'epoch'
      )
  )
  SELECT jsonb_build_object(
    'prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key', pr.prompt_key,
        'answer', pr.answer,
        'visible', pr.visible
      ) ORDER BY pr.created_at)
      FROM profile_prompts pr
      WHERE pr.profile_id = _profile_id
    ), '[]'::jsonb),
    'newSince', (SELECT count(*) FROM fresh),
    'undisplayedNew', (
      SELECT count(*)
      FROM fresh f
      WHERE EXISTS (SELECT 1 FROM prefs)
        AND NOT EXISTS (
          SELECT 1 FROM prefs p WHERE p.question_id = f.question_id AND NOT p.hidden
        )
    )
  ) INTO result;

  RETURN result;
END;
$function$;