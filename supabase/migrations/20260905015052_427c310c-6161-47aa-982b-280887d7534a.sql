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
  v_hist jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object('pkey', h.pkey, 'question_id', h.question_id, 'n', h.n)), '[]'::jsonb)
    into v_hist
  from public.selection_history(_session_id, _guest_tokens, _profile_ids, _history) h;

  for v_slot in select * from jsonb_array_elements(coalesce(_slots, '[]'::jsonb))
  loop
    v_count := coalesce((v_slot ->> 'count')::int, 1);
    v_spice := (v_slot ->> 'spice')::int;
    v_types := coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(v_slot -> 'types') value),
      ARRAY['ab','ab_reason']
    );

    for v_row in
      with hist as (
        select * from jsonb_to_recordset(v_hist) as x(pkey text, question_id uuid, n bigint)
      ),
      seen as (
        select h.question_id, count(distinct h.pkey) as people from hist h group by 1
      ),
      mine as (
        select h.question_id, sum(h.n) as n from hist h
        where v_caller is not null and h.pkey = v_caller group by 1
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

REVOKE EXECUTE ON FUNCTION public.selection_persons(uuid, text[], uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.selection_history(uuid, text[], uuid[], text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.draw_questions(jsonb, uuid, text[], uuid[], text[], integer, uuid[], uuid[], uuid[], integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.room_state(uuid, text) FROM PUBLIC;