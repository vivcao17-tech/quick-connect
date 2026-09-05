ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS handle text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS impressions_seen_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique ON public.profiles (lower(handle));

CREATE TABLE IF NOT EXISTS public.profile_impression_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  hidden boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_impression_prefs TO authenticated;
GRANT ALL ON public.profile_impression_prefs TO service_role;
ALTER TABLE public.profile_impression_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their impression settings"
  ON public.profile_impression_prefs FOR ALL TO authenticated
  USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE TABLE IF NOT EXISTS public.profile_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_key text NOT NULL,
  answer text NOT NULL CHECK (char_length(answer) <= 200),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, prompt_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_prompts TO authenticated;
GRANT ALL ON public.profile_prompts TO service_role;
ALTER TABLE public.profile_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their prompts"
  ON public.profile_prompts FOR ALL TO authenticated
  USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE TRIGGER profile_prompts_updated_at BEFORE UPDATE ON public.profile_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER profile_impression_prefs_updated_at BEFORE UPDATE ON public.profile_impression_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS answers_about_participant_idx ON public.answers (about_participant_id);

CREATE OR REPLACE FUNCTION public.profile_participants(_profile_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tokens AS (
    SELECT DISTINCT guest_token FROM session_participants
    WHERE profile_id = _profile_id AND guest_token IS NOT NULL
  )
  SELECT sp.id FROM session_participants sp
  WHERE sp.profile_id = _profile_id
     OR (sp.guest_token IS NOT NULL AND sp.guest_token IN (SELECT guest_token FROM tokens));
$$;

CREATE OR REPLACE FUNCTION public.profile_data(_profile_id uuid, _include_hidden boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  WITH me AS (SELECT id FROM public.profile_participants(_profile_id)),
  about AS (
    SELECT a.question_id, a.option_key, count(*)::int AS n
    FROM answers a
    WHERE a.answer_role = 'about_other'
      AND a.about_participant_id IN (SELECT id FROM me)
      AND a.created_at > now() - interval '90 days'
    GROUP BY 1, 2
  ),
  self AS (
    SELECT DISTINCT ON (a.question_id) a.question_id, a.option_key
    FROM answers a
    WHERE a.answer_role = 'about_self'
      AND a.participant_id IN (SELECT id FROM me)
      AND a.created_at > now() - interval '90 days'
    ORDER BY a.question_id, a.created_at DESC
  ),
  agg AS (
    SELECT q.id, q.text, q.stem_self, q.stem_other, q.option_a, q.option_b, q.option_c,
      coalesce(p.hidden, false) AS hidden,
      (SELECT coalesce(jsonb_object_agg(b.option_key, b.n), '{}'::jsonb) FROM about b WHERE b.question_id = q.id) AS counts,
      (SELECT coalesce(sum(b.n), 0)::int FROM about b WHERE b.question_id = q.id) AS total,
      (SELECT s.option_key FROM self s WHERE s.question_id = q.id) AS self_key
    FROM questions q
    LEFT JOIN profile_impression_prefs p ON p.profile_id = _profile_id AND p.question_id = q.id
    WHERE q.id IN (SELECT question_id FROM about)
  )
  SELECT jsonb_build_object(
    'profileId', _profile_id,
    'handle', (SELECT handle FROM profiles WHERE id = _profile_id),
    'displayName', coalesce(
      (SELECT nullif(btrim(display_name), '') FROM profiles WHERE id = _profile_id),
      (SELECT nullif(btrim(sp.display_name), '') FROM session_participants sp
        WHERE sp.id IN (SELECT id FROM me) AND sp.display_name IS NOT NULL
        ORDER BY sp.joined_at DESC LIMIT 1),
      'Someone'
    ),
    'impressions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'questionId', a.id, 'text', a.text, 'stemSelf', a.stem_self, 'stemOther', a.stem_other,
        'options', (SELECT jsonb_agg(o ORDER BY o->>'key') FROM (
            SELECT jsonb_build_object('key','a','label',a.option_a) AS o
            UNION ALL SELECT jsonb_build_object('key','b','label',a.option_b)
            UNION ALL SELECT jsonb_build_object('key','c','label',a.option_c) WHERE a.option_c IS NOT NULL
          ) opts),
        'counts', a.counts, 'total', a.total, 'selfKey', a.self_key, 'hidden', a.hidden
      ))
      FROM agg a WHERE _include_hidden OR NOT a.hidden
    ), '[]'::jsonb),
    'prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('key', pr.prompt_key, 'answer', pr.answer, 'visible', pr.visible) ORDER BY pr.created_at)
      FROM profile_prompts pr
      WHERE pr.profile_id = _profile_id AND (_include_hidden OR pr.visible)
    ), '[]'::jsonb),
    'newSince', (
      SELECT count(*) FROM answers a
      WHERE a.answer_role = 'about_other'
        AND a.about_participant_id IN (SELECT id FROM me)
        AND a.created_at > coalesce((SELECT impressions_seen_at FROM profiles WHERE id = _profile_id), timestamptz 'epoch')
    )
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_id_for_handle(_handle text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM profiles WHERE lower(handle) = lower(btrim(_handle)) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_impression_questions(_include_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pairs AS (
    SELECT g.question_id,
           g.option_key AS guess,
           s.option_key AS self
    FROM answers g
    JOIN session_questions sq ON sq.id = g.session_question_id
    JOIN sessions ses ON ses.id = sq.session_id
    JOIN answers s ON s.participant_id = g.about_participant_id
      AND s.question_id = g.question_id
      AND s.answer_role = 'about_self'
    WHERE g.answer_role = 'about_other'
      AND g.about_participant_id IS NOT NULL
      AND (_include_test OR NOT ses.is_test)
  )
  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'mismatchRate')::numeric DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'questionId', q.id,
      'text', q.text,
      'guesses', count(*),
      'mismatches', count(*) FILTER (WHERE p.guess IS DISTINCT FROM p.self),
      'mismatchRate', round(100.0 * count(*) FILTER (WHERE p.guess IS DISTINCT FROM p.self) / greatest(count(*), 1))
    ) AS row
    FROM pairs p JOIN questions q ON q.id = p.question_id
    GROUP BY q.id, q.text
  ) rows;
$$;

CREATE OR REPLACE FUNCTION public.admin_impression_exhaustion()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH bank AS (SELECT count(*)::int AS n FROM questions WHERE active AND question_type = 'impression'),
  seen AS (
    SELECT coalesce(sp.profile_id::text, sp.guest_token) AS person_key,
           max(sp.display_name) AS name,
           count(DISTINCT a.question_id)::int AS seen
    FROM answers a
    JOIN session_participants sp ON sp.id = a.participant_id
    JOIN questions q ON q.id = a.question_id AND q.question_type = 'impression'
    WHERE coalesce(sp.profile_id::text, sp.guest_token) IS NOT NULL
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'personKey', s.person_key, 'name', s.name, 'seen', s.seen, 'bank', (SELECT n FROM bank)
  ) ORDER BY s.seen DESC), '[]'::jsonb)
  FROM seen s WHERE s.seen * 2 > (SELECT n FROM bank);
$$;