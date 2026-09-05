-- Indexes the exclusion join actually needs
CREATE INDEX IF NOT EXISTS answers_participant_id_idx ON public.answers (participant_id);
CREATE INDEX IF NOT EXISTS session_questions_question_id_idx ON public.session_questions (question_id);
DROP INDEX IF EXISTS public.answers_sq_idx;

-- One row per person identity, with every participant row that belongs to them.
CREATE OR REPLACE FUNCTION public.selection_persons(
  _session_id uuid,
  _guest_tokens text[],
  _profile_ids uuid[]
)
RETURNS TABLE(pkey text, pids uuid[])
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with seeds as (
    select distinct sp.guest_token, sp.profile_id
    from session_participants sp
    where (_session_id is not null and sp.session_id = _session_id)
       or (sp.guest_token = any(coalesce(_guest_tokens, '{}'::text[])))
       or (sp.profile_id = any(coalesce(_profile_ids, '{}'::uuid[])))
  ),
  keyed as (
    select coalesce(s.profile_id::text, s.guest_token) as pkey, s.guest_token, s.profile_id
    from seeds s
    where s.guest_token is not null or s.profile_id is not null
  )
  select k.pkey, array_agg(distinct sp.id)
  from keyed k
  join session_participants sp
    on (k.guest_token is not null and sp.guest_token = k.guest_token)
    or (k.profile_id is not null and sp.profile_id = k.profile_id)
  group by k.pkey
$$;

-- What each of those people has already seen. 'answered' = anywhere, with anyone.
-- 'group_used' = only what they have already used in a group room.
CREATE OR REPLACE FUNCTION public.selection_history(
  _session_id uuid,
  _guest_tokens text[],
  _profile_ids uuid[],
  _history text
)
RETURNS TABLE(pkey text, question_id uuid, n bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select p.pkey, a.question_id, count(*)
  from public.selection_persons(_session_id, _guest_tokens, _profile_ids) p
  join answers a on a.participant_id = any(p.pids)
  where _history = 'answered'
  group by 1, 2
  union all
  select p.pkey, sq.question_id, count(*)
  from public.selection_persons(_session_id, _guest_tokens, _profile_ids) p
  join session_participants sp on sp.id = any(p.pids)
  join sessions s on s.id = sp.session_id and s.kind in ('group', 'group_async')
  join session_questions sq on sq.session_id = s.id
  where _history = 'group_used'
  group by 1, 2
$$;

-- The whole selection in one call.
-- _slots is an ordered array like [{"count":1,"spice":1},{"count":1,"spice":2},{"count":1,"types":["impression"]}]
CREATE OR REPLACE FUNCTION public.draw_questions(
  _slots jsonb,
  _session_id uuid DEFAULT NULL,
  _guest_tokens text[] DEFAULT '{}'::text[],
  _profile_ids uuid[] DEFAULT '{}'::uuid[],
  _modes text[] DEFAULT ARRAY['pair','both'],
  _spice_max integer DEFAULT 2,
  _topic_ids uuid[] DEFAULT '{}'::uuid[],
  _bonus_topic_ids uuid[] DEFAULT '{}'::uuid[],
  _exclude uuid[] DEFAULT '{}'::uuid[],
  _max_per_topic integer DEFAULT 2,
  _history text DEFAULT 'answered'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_out jsonb := '[]'::jsonb;
  v_taken uuid[] := coalesce(_exclude, '{}'::uuid[]);
  v_topics uuid[] := '{}'::uuid[];
  v_people integer;
  v_caller text;
  v_slot jsonb;
  v_count integer;
  v_spice integer;
  v_types text[];
  v_row jsonb;
begin
  select count(*) into v_people
  from public.selection_persons(_session_id, _guest_tokens, _profile_ids);

  v_caller := coalesce(
    (coalesce(_profile_ids, '{}'::uuid[]))[1]::text,
    (coalesce(_guest_tokens, '{}'::text[]))[1]
  );

  create temporary table if not exists _draw_hist (
    pkey text, question_id uuid, n bigint
  ) on commit drop;
  delete from _draw_hist;
  insert into _draw_hist
  select * from public.selection_history(_session_id, _guest_tokens, _profile_ids, _history);

  for v_slot in select * from jsonb_array_elements(coalesce(_slots, '[]'::jsonb))
  loop
    v_count := coalesce((v_slot ->> 'count')::int, 1);
    v_spice := (v_slot ->> 'spice')::int;
    v_types := coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(v_slot -> 'types') value),
      ARRAY['ab','ab_reason']
    );

    for v_row in
      with seen as (
        select question_id, count(distinct pkey) as people from _draw_hist group by 1
      ),
      mine as (
        select question_id, sum(n) as n from _draw_hist
        where v_caller is not null and pkey = v_caller group by 1
      ),
      pool as (
        select q.*, coalesce(s.people, 0) as seen_by, coalesce(m.n, 0) as my_n
        from questions q
        left join seen s on s.question_id = q.id
        left join mine m on m.question_id = q.id
        where q.active
          and q.mode = any(_modes)
          and q.question_type = any(v_types)
          and q.spice_level <= greatest(_spice_max, coalesce(v_spice, 0))
          and not (q.id = any(v_taken))
      ),
      ranked as (
        select p.*,
          case when v_spice is not null and p.spice_level = v_spice then 0 else 1 end as spice_rank,
          case when cardinality(coalesce(_topic_ids, '{}'::uuid[])) > 0
                    and p.topic_id = any(_topic_ids) then 0 else 1 end as topic_rank,
          case when p.seen_by = 0 and p.is_featured then 0
               when p.seen_by = 0 then 1
               when v_people > 0 and p.seen_by >= v_people then 3
               else 2 end as tier,
          case when p.topic_id = any(coalesce(_bonus_topic_ids, '{}'::uuid[])) then 0 else 1 end as bonus,
          random() as r
        from pool p
      ),
      ordered as (
        select rr.*,
          row_number() over (
            partition by coalesce(rr.topic_id::text, 'none')
            order by rr.spice_rank, rr.topic_rank, rr.tier, rr.bonus, rr.r
          )
          + (select count(*) from unnest(v_topics) t where t is not distinct from rr.topic_id) as topic_rn
        from ranked rr
      )
      select jsonb_build_object(
        'id', o.id,
        'topic_id', o.topic_id,
        'text', o.text,
        'option_a', o.option_a,
        'option_b', o.option_b,
        'option_c', o.option_c,
        'spice_level', o.spice_level,
        'question_type', o.question_type,
        'mode', o.mode,
        'stem_other', o.stem_other,
        'stem_self', o.stem_self,
        'follow_up', o.follow_up,
        'is_featured', o.is_featured,
        'answered_count', o.my_n,
        'seen_by', o.seen_by,
        'reason_chips', coalesce((
          select jsonb_agg(jsonb_build_object('id', rc.id, 'option_key', rc.option_key, 'text', rc.text))
          from reason_chips rc where rc.question_id = o.id
        ), '[]'::jsonb)
      )
      from ordered o
      order by (case when o.topic_rn <= _max_per_topic then 0 else 1 end),
               o.spice_rank, o.topic_rank, o.tier, o.bonus, o.r
      limit v_count
    loop
      v_out := v_out || jsonb_build_array(v_row);
      v_taken := v_taken || ((v_row ->> 'id')::uuid);
      if (v_row ->> 'topic_id') is not null then
        v_topics := v_topics || ((v_row ->> 'topic_id')::uuid);
      end if;
    end loop;
  end loop;

  return v_out;
end;
$$;

-- Everything the in-person room screen reads, in one call.
CREATE OR REPLACE FUNCTION public.room_state(_session_id uuid, _guest_token text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select jsonb_build_object(
    'me', (
      select jsonb_build_object('id', sp.id, 'display_name', sp.display_name, 'role', sp.role)
      from session_participants sp
      where sp.session_id = _session_id and sp.guest_token = _guest_token
      limit 1
    ),
    'session', (
      select jsonb_build_object(
        'id', s.id, 'room_code', s.room_code, 'status', s.status,
        'current_index', s.current_index, 'spice_max', s.spice_max, 'kind', s.kind
      )
      from sessions s where s.id = _session_id
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'display_name', sp.display_name, 'role', sp.role
      ) order by sp.joined_at)
      from session_participants sp where sp.session_id = _session_id
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'slug', t.slug, 'label', t.label)
                       order by t.sort_order)
      from topics t where t.active
    ), '[]'::jsonb),
    'topicPicks', coalesce((
      select jsonb_agg(jsonb_build_object('participant_id', spt.participant_id, 'topic_id', spt.topic_id))
      from session_participant_topics spt where spt.session_id = _session_id
    ), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('participant_id', v.participant_id, 'question_id', v.question_id))
      from session_question_votes v where v.session_id = _session_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sq.id,
        'question_id', sq.question_id,
        'order_index', sq.order_index,
        'revealed_at', sq.revealed_at,
        'snapshot', sq.snapshot,
        'question_type', coalesce(q.question_type, 'standard')
      ) order by sq.order_index)
      from session_questions sq
      left join questions q on q.id = sq.question_id
      where sq.session_id = _session_id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session_question_id', a.session_question_id,
        'participant_id', a.participant_id,
        'option_key', a.option_key,
        'answer_role', coalesce(a.answer_role, 'about_self')
      ) order by a.created_at)
      from answers a
      join session_questions sq on sq.id = a.session_question_id
      where sq.session_id = _session_id
    ), '[]'::jsonb)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.selection_persons(uuid, text[], uuid[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.selection_history(uuid, text[], uuid[], text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.draw_questions(jsonb, uuid, text[], uuid[], text[], integer, uuid[], uuid[], uuid[], integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.room_state(uuid, text) FROM anon, authenticated;