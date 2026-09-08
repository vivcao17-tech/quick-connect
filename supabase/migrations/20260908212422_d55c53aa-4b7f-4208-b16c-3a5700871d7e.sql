create or replace function public.admin_overview_window(_from timestamptz, _to timestamptz, _include_test boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
with s as (
  select * from sessions
  where created_at >= _from and created_at < _to
    and (_include_test or not is_test)
),
all_s as (select * from sessions where _include_test or not is_test),
parts as (
  select sp.*, coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) as person_key, s.kind, s.created_at as session_created
  from session_participants sp join s on s.id = sp.session_id
),
inv as (
  select i.* from invites i join all_s s2 on s2.id = i.session_id
  where i.created_at >= _from and i.created_at < _to
),
sq as (
  select q.* from session_questions q join s on s.id = q.session_id
),
revealed as (select * from sq where revealed_at is not null),
reply_gap as (
  select r.id,
         (select min(tm.created_at) from thread_messages tm where tm.session_question_id = r.id) as first_msg,
         r.revealed_at
  from revealed r
),
answered_all as (
  select p.id as participant_id, p.person_key, p.session_id
  from parts p
  where (select count(*) from session_questions x where x.session_id = p.session_id) > 0
    and (select count(distinct a.session_question_id) from answers a where a.participant_id = p.id)
        >= (select count(*) from session_questions x where x.session_id = p.session_id)
),
pairs as (
  select least(a.person_key, b.person_key) as p1, greatest(a.person_key, b.person_key) as p2, a.session_id
  from parts a join parts b on a.session_id = b.session_id and a.person_key < b.person_key
),
pair_counts as (select p1, p2, count(distinct session_id) as n from pairs group by 1,2),
group_people as (select distinct person_key from parts where kind like 'group%'),
bridge as (
  select distinct coalesce(e.profile_id::text, e.guest_token, public.admin_person_key(e.participant_id)) as person_key
  from events e where e.name = 'bridge_tapped' and e.created_at >= _from and e.created_at < _to
),
end_seen as (
  select distinct coalesce(e.profile_id::text, e.guest_token, public.admin_person_key(e.participant_id)) as person_key
  from events e
  where e.name = 'end_screen_shown' and e.created_at >= _from and e.created_at < _to
    and (_include_test or not exists (select 1 from sessions s2 where s2.id = e.session_id and s2.is_test))
),
prompt_seen as (
  select distinct coalesce(e.profile_id::text, e.guest_token, public.admin_person_key(e.participant_id)) as person_key
  from events e
  where e.name = 'save_prompt_shown' and e.created_at >= _from and e.created_at < _to
    and (_include_test or not exists (select 1 from sessions s2 where s2.id = e.session_id and s2.is_test))
),
person_emailed as (
  select distinct p.person_key from parts p
  join participant_emails pe on pe.participant_id = p.id
),
finishers as (select distinct person_key, participant_id from answered_all),
emailed as (
  select distinct f.person_key from finishers f
  join participant_emails pe on pe.participant_id = f.participant_id
),
sent_invites as (select count(*)::numeric as n from inv),
second_session as (
  select person_key,
         extract(epoch from (min(session_created) filter (where rn = 2) - min(session_created) filter (where rn = 1))) as gap
  from (select person_key, session_created, row_number() over (partition by person_key order by session_created) as rn from parts) x
  group by person_key
)
select jsonb_build_object(
  'inviteCompletionRate', (select case when count(*) filter (where opened_at is not null) = 0 then null
      else count(*) filter (where completed_at is not null)::numeric / count(*) filter (where opened_at is not null) end from inv),
  'invitesOpened', (select count(*) filter (where opened_at is not null) from inv),
  'invitesCompleted', (select count(*) filter (where completed_at is not null) from inv),
  'revealToReplyRate', (select case when count(*) = 0 then null else count(*) filter (where first_msg is not null)::numeric / count(*) end from reply_gap),
  'reveals', (select count(*) from reply_gap),
  'repeatPairRate', (select case when count(*) = 0 then null else count(*) filter (where n > 1)::numeric / count(*) end from pair_counts),
  'pairs', (select count(*) from pair_counts),
  'bridgeRate', (select case when (select count(*) from group_people) = 0 then null
      else (select count(*) from bridge b where b.person_key in (select person_key from group_people))::numeric
           / (select count(*) from group_people) end),
  'emailCaptureRate', (select case when (select count(distinct person_key) from finishers) = 0 then null
      else (select count(*) from emailed)::numeric / (select count(distinct person_key) from finishers) end),
  'finishers', (select count(distinct person_key) from finishers),
  'endShown', (select count(*) from end_seen),
  'savePromptShown', (select count(*) from prompt_seen),
  'savePromptCaptureRate', (select case when (select count(*) from prompt_seen) = 0 then null
      else (select count(*) from prompt_seen ps where ps.person_key in (select person_key from person_emailed))::numeric
           / (select count(*) from prompt_seen) end),
  'medianRevealToFirstMessage', (select percentile_cont(0.5) within group (
      order by extract(epoch from (first_msg - revealed_at))) from reply_gap where first_msg is not null),
  'sessions', (select count(*) from s),
  'people', (select count(distinct person_key) from parts),
  'kFactor', (select case when (select count(distinct person_key) from finishers) = 0 then null
      else (select n from sent_invites) / (select count(distinct person_key) from finishers)
           * coalesce((select case when count(*) filter (where opened_at is not null) = 0 then 0
                 else count(*) filter (where completed_at is not null)::numeric / count(*) end from inv), 0) end),
  'invitesPerFinisher', (select case when (select count(distinct person_key) from finishers) = 0 then null
      else (select n from sent_invites) / (select count(distinct person_key) from finishers) end),
  'medianTimeToSecondSession', (select percentile_cont(0.5) within group (order by gap) from second_session where gap is not null),
  'medianSessionDepth', (select percentile_cont(0.5) within group (order by c)
      from (select s.id, (select count(*) from answers a join session_questions x on x.id = a.session_question_id where x.session_id = s.id) as c from s) d),
  'medianMessagesPerRevealedQuestion', (select percentile_cont(0.5) within group (order by c)
      from (select r.id, (select count(*) from thread_messages tm where tm.session_question_id = r.id) as c from revealed r) d)
);
$fn$;

create or replace function public.admin_session_rows(_from timestamptz, _to timestamptz, _include_test boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
with s as (
  select * from sessions
  where created_at >= _from and created_at < _to and (_include_test or not is_test)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'sessionId', s.id, 'kind', s.kind, 'isTest', s.is_test,
  'startedAt', s.created_at, 'endedAt', s.ended_at,
  'people', (select count(*) from session_participants sp where sp.session_id = s.id),
  'endShown', (select count(distinct coalesce(e.profile_id::text, e.guest_token, e.participant_id::text, e.id::text))
               from events e where e.session_id = s.id and e.name = 'end_screen_shown'),
  'savePromptShown', (select count(distinct coalesce(e.profile_id::text, e.guest_token, e.participant_id::text, e.id::text))
               from events e where e.session_id = s.id and e.name = 'save_prompt_shown'),
  'emailsSaved', (select count(*) from participant_emails pe
               join session_participants sp on sp.id = pe.participant_id where sp.session_id = s.id),
  'participants', coalesce((select jsonb_agg(jsonb_build_object(
       'participantId', sp.id, 'name', coalesce(sp.display_name, 'Someone'), 'role', sp.role,
       'answered', (select count(distinct a.session_question_id) from answers a where a.participant_id = sp.id),
       'lastAnsweredIndex', (select max(sq2.order_index) from answers a join session_questions sq2 on sq2.id = a.session_question_id where a.participant_id = sp.id)
     )) from session_participants sp where sp.session_id = s.id), '[]'::jsonb),
  'totalQuestions', (select count(*) from session_questions sq where sq.session_id = s.id),
  'revealedQuestions', (select count(*) from session_questions sq where sq.session_id = s.id and sq.revealed_at is not null),
  'reachedReveal', exists (select 1 from session_questions sq where sq.session_id = s.id and sq.revealed_at is not null),
  'secondsToFirstReveal', (select extract(epoch from (min(sq.revealed_at) - s.created_at)) from session_questions sq where sq.session_id = s.id and sq.revealed_at is not null),
  'secondsToLastActivity', greatest(
     coalesce((select extract(epoch from (max(a.created_at) - s.created_at)) from answers a join session_questions sq on sq.id = a.session_question_id where sq.session_id = s.id), 0),
     coalesce((select extract(epoch from (max(tm.created_at) - s.created_at)) from thread_messages tm join session_questions sq on sq.id = tm.session_question_id where sq.session_id = s.id), 0)),
  'questions', coalesce((select jsonb_agg(jsonb_build_object(
       'orderIndex', sq.order_index,
       'text', coalesce(sq.snapshot->>'text', ''),
       'revealed', sq.revealed_at is not null,
       'answers', (select count(*) from answers a where a.session_question_id = sq.id),
       'messages', (select count(*) from thread_messages tm where tm.session_question_id = sq.id),
       'split', coalesce((select jsonb_agg(jsonb_build_object('key', x.option_key, 'votes', x.votes))
                          from (select a.option_key, count(*) as votes from answers a where a.session_question_id = sq.id group by 1) x), '[]'::jsonb)
     ) order by sq.order_index) from session_questions sq where sq.session_id = s.id), '[]'::jsonb)
) order by s.created_at desc), '[]'::jsonb)
from s;
$fn$;

revoke all on function public.admin_overview_window(timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_session_rows(timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.admin_overview_window(timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.admin_session_rows(timestamptz, timestamptz, boolean) to service_role;