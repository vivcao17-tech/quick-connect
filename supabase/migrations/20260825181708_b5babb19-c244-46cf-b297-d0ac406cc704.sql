-- 1. Missing indexes on foreign keys used by the identity lookups and thread joins
create index if not exists session_participants_profile_id_idx
  on public.session_participants (profile_id);
create index if not exists session_participants_guest_token_idx
  on public.session_participants (guest_token);
create index if not exists thread_messages_session_question_id_idx
  on public.thread_messages (session_question_id);

-- 2. Exact-duplicate indexes from earlier migrations (keep the *_id_idx originals)
drop index if exists public.answers_session_question_idx;
drop index if exists public.session_participants_session_idx;
drop index if exists public.session_questions_session_idx;

-- 3. One-round-trip overview for the People page
create or replace function public.people_overview(_guest_token text, _profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with mine as (
  select id, session_id, joined_at
  from session_participants
  where (_guest_token is not null and guest_token = _guest_token)
     or (_profile_id is not null and profile_id = _profile_id)
),
me_in_session as (
  select distinct on (session_id) session_id, id as my_participant_id
  from mine
  order by session_id, joined_at, id
),
partners as (
  -- the first other participant in each of my sessions
  select distinct on (sp.session_id)
         sp.session_id,
         sp.id as partner_id,
         coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) as person_key,
         sp.display_name,
         sp.joined_at
  from session_participants sp
  where sp.session_id in (select session_id from mine)
    and not exists (select 1 from mine m where m.id = sp.id)
  order by sp.session_id, sp.joined_at, sp.id
),
partner_names as (
  select distinct on (person_key)
         person_key, coalesce(display_name, 'Someone') as name
  from partners
  order by person_key, joined_at desc, partner_id
),
qs as (
  select sq.id, sq.session_id, sq.revealed_at, p.person_key, p.partner_id
  from session_questions sq
  join partners p on p.session_id = sq.session_id
  where sq.snapshot is not null
),
my_answers as (
  select distinct on (a.session_question_id)
         a.session_question_id, a.option_key, a.created_at
  from answers a
  join qs on qs.id = a.session_question_id
  join me_in_session mis
    on mis.session_id = qs.session_id and mis.my_participant_id = a.participant_id
  where a.answer_role <> 'about_other'
  order by a.session_question_id, a.created_at desc
),
their_answers as (
  select distinct on (a.session_question_id)
         a.session_question_id, a.option_key, a.created_at
  from answers a
  join qs on qs.id = a.session_question_id
  where a.answer_role <> 'about_other'
    and a.participant_id = qs.partner_id
    and qs.revealed_at is not null
  order by a.session_question_id, a.created_at desc
),
msg_stats as (
  select tm.session_question_id,
         count(*)::int as message_count,
         max(tm.created_at) as last_message_at,
         count(*) filter (
           where tm.participant_id <> mis.my_participant_id
             and (tr.read_at is null or tm.created_at > tr.read_at)
         )::int as unread
  from thread_messages tm
  join qs on qs.id = tm.session_question_id
  join me_in_session mis on mis.session_id = qs.session_id
  left join thread_reads tr
    on tr.session_question_id = tm.session_question_id
   and tr.participant_id = mis.my_participant_id
  group by tm.session_question_id
),
question_rows as (
  select q.session_id,
         q.person_key,
         greatest(ma.created_at, ta.created_at, q.revealed_at, ms.last_message_at) as last_activity,
         coalesce(ms.message_count, 0) as message_count,
         coalesce(ms.unread, 0) as unread,
         (ta.session_question_id is not null and ta.option_key <> ma.option_key) as different
  from qs q
  join my_answers ma on ma.session_question_id = q.id
  left join their_answers ta on ta.session_question_id = q.id
  left join msg_stats ms on ms.session_question_id = q.id
),
blocks as (
  select qr.session_id,
         qr.person_key,
         s.kind,
         count(*)::int as total,
         count(*) filter (where qr.different)::int as different,
         sum(qr.message_count)::int as message_count,
         sum(qr.unread)::int as unread,
         max(qr.last_activity) as last_activity
  from question_rows qr
  join sessions s on s.id = qr.session_id
  group by qr.session_id, qr.person_key, s.kind
),
people_sessions as (
  select b.person_key,
         count(*)::int as session_count,
         sum(b.unread)::int as unread,
         max(b.last_activity) as last_activity
  from blocks b
  group by b.person_key
),
conn as (
  select distinct on (person_key) person_key, name, added_at
  from (
    select coalesce(tp.profile_id::text, tp.guest_token, tp.id::text) as person_key,
           coalesce(tp.display_name, 'Someone') as name,
           c.created_at as added_at
    from connections c
    join mine m on m.id = c.owner_participant_id
    join session_participants tp on tp.id = c.target_participant_id
  ) x
  order by person_key, added_at desc
),
notes_dedup as (
  select distinct on (target_key)
         target_key,
         coalesce(nickname, '') as nickname,
         coalesce(contact, '') as contact,
         coalesce(note, '') as note
  from person_notes
  where owner_key = any (array_remove(array[_guest_token, _profile_id::text], null))
  order by target_key, updated_at desc
)
select jsonb_build_object(
  'people', coalesce((
    select jsonb_agg(t order by t."lastActivity" desc nulls last)
    from (
      select ps.person_key as "personKey",
             coalesce(nullif(nd.nickname, ''), pn.name) as name,
             coalesce(nd.nickname, '') as nickname,
             coalesce(nd.contact, '') as contact,
             coalesce(nd.note, '') as note,
             oldest.kind as "metKind",
             ps.session_count as "sessionCount",
             ps.unread as unread,
             ps.last_activity as "lastActivity"
      from people_sessions ps
      join partner_names pn on pn.person_key = ps.person_key
      join lateral (
        select b.kind
        from blocks b
        where b.person_key = ps.person_key
        order by b.last_activity asc
        limit 1
      ) oldest on true
      left join notes_dedup nd on nd.target_key = ps.person_key

      union all

      select c.person_key,
             coalesce(nullif(nd.nickname, ''), c.name),
             coalesce(nd.nickname, ''),
             coalesce(nd.contact, ''),
             coalesce(nd.note, ''),
             'group',
             0,
             0,
             c.added_at
      from conn c
      left join notes_dedup nd on nd.target_key = c.person_key
      where not exists (
        select 1 from people_sessions ps where ps.person_key = c.person_key
      )
    ) t
  ), '[]'::jsonb)
);
$$;

-- server-only: browsers and anonymous callers must not reach this
revoke execute on function public.people_overview(text, uuid) from public, anon, authenticated;
grant execute on function public.people_overview(text, uuid) to service_role;