-- ============ helpers ============

create or replace function public.admin_person_key(_participant_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(sp.profile_id::text, sp.guest_token, sp.id::text)
  from session_participants sp where sp.id = _participant_id
$$;

create or replace function public.admin_median(_values double precision[])
returns double precision language sql immutable as $$
  select percentile_cont(0.5) within group (order by v)
  from unnest(_values) v where v is not null
$$;

-- ============ overview ============

create or replace function public.admin_overview_window(
  _from timestamptz, _to timestamptz, _include_test boolean
) returns jsonb language sql stable security definer set search_path = public as $$
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
$$;

create or replace function public.admin_overview(
  _from timestamptz, _to timestamptz, _include_test boolean default false
) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'current', public.admin_overview_window(_from, _to, _include_test),
    'previous', public.admin_overview_window(_from - (_to - _from), _from, _include_test),
    'from', _from, 'to', _to
  );
$$;

-- ============ funnel ============

create or replace function public.admin_funnel(
  _from timestamptz, _to timestamptz, _include_test boolean default false,
  _segment text default 'none'
) returns jsonb language sql stable security definer set search_path = public as $$
with s as (select * from sessions where (_include_test or not is_test)),
inv as (
  select i.*, s.kind,
         (coalesce(i.personal_note, '') <> '') as has_note,
         date_trunc('week', i.created_at) as cohort_week
  from invites i join s on s.id = i.session_id
  where i.created_at >= _from and i.created_at < _to
),
base as (
  select inv.id, inv.token, inv.session_id, inv.kind, inv.has_note, inv.cohort_week,
         inv.opened_at, inv.recipient_participant_id as pid,
         coalesce(inv.child_session_id, inv.session_id) as play_session
  from inv
),
enriched as (
  select b.*,
    coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) as person_key,
    (select count(*) from session_questions x where x.session_id = b.play_session) as total_q,
    (select count(distinct a.session_question_id) from answers a where a.participant_id = b.pid) as answered_q,
    (select min(a.created_at) from answers a where a.participant_id = b.pid) as first_answer_at,
    (select max(a.created_at) from answers a where a.participant_id = b.pid) as last_answer_at,
    (select min(x.revealed_at) from session_questions x where x.session_id = b.play_session and x.revealed_at is not null) as revealed_at,
    (select min(tm.created_at) from thread_messages tm where tm.participant_id = b.pid) as first_msg_at,
    (select min(tm.created_at) from thread_messages tm
       join session_questions x on x.id = tm.session_question_id
      where x.session_id = b.play_session and tm.participant_id <> b.pid) as other_msg_at
  from base b left join session_participants sp on sp.id = b.pid
),
final as (
  select e.*,
    (e.total_q > 0 and e.answered_q >= e.total_q) as answered_all,
    (select min(a.created_at) from answers a
       join session_participants sp2 on sp2.id = a.participant_id
      where coalesce(sp2.profile_id::text, sp2.guest_token, sp2.id::text) = e.person_key
        and a.created_at > coalesce(e.last_answer_at, e.first_answer_at) + interval '1 hour'
        and a.created_at < coalesce(e.last_answer_at, e.first_answer_at) + interval '7 days') as returned_at,
    (select count(*) from session_participants sp3
      where coalesce(sp3.profile_id::text, sp3.guest_token, sp3.id::text) = e.person_key
        and sp3.session_id <> e.play_session) as later_sessions
  from enriched e
),
seg as (
  select case _segment
           when 'note' then case when has_note then 'with note' else 'no note' end
           when 'mode' then kind
           when 'week' then to_char(cohort_week, 'YYYY-MM-DD')
           else 'all'
         end as segment, *
  from final
)
select coalesce(jsonb_agg(row order by row->>'segment'), '[]'::jsonb) from (
  select jsonb_build_object(
    'segment', segment,
    'steps', jsonb_build_array(
      jsonb_build_object('key','invite_opened','label','Invite opened','count', count(*) filter (where opened_at is not null)),
      jsonb_build_object('key','name_entered','label','Name entered','count', count(*) filter (where pid is not null)),
      jsonb_build_object('key','first_answer','label','First answer','count', count(*) filter (where first_answer_at is not null)),
      jsonb_build_object('key','all_answered','label','All questions answered','count', count(*) filter (where answered_all)),
      jsonb_build_object('key','reveal','label','Reveal seen','count', count(*) filter (where revealed_at is not null and first_answer_at is not null)),
      jsonb_build_object('key','first_message','label','Sent a message','count', count(*) filter (where first_msg_at is not null)),
      jsonb_build_object('key','reply','label','Got a reply','count', count(*) filter (where other_msg_at is not null)),
      jsonb_build_object('key','return_7d','label','Returned within 7 days','count', count(*) filter (where returned_at is not null)),
      jsonb_build_object('key','new_session','label','New session after','count', count(*) filter (where later_sessions > 0))
    ),
    'sent', count(*)
  ) as row
  from seg group by segment
) x;
$$;

-- ============ cohorts ============

create or replace function public.admin_cohorts(
  _activity text default 'answer',
  _include_test boolean default false,
  _weeks integer default 8
) returns jsonb language sql stable security definer set search_path = public as $$
with s as (select * from sessions where (_include_test or not is_test)),
parts as (
  select sp.id, sp.session_id, coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) as person_key,
         sp.joined_at, sp.role, s.created_at as session_created
  from session_participants sp join s on s.id = sp.session_id
),
first_seen as (select person_key, min(joined_at) as first_at from parts group by 1),
acts as (
  select p.person_key, a.created_at as at from answers a join parts p on p.id = a.participant_id
   where _activity = 'answer'
  union all
  select p.person_key, tm.created_at from thread_messages tm join parts p on p.id = tm.participant_id
   where _activity = 'message'
  union all
  select p.person_key, p.joined_at from parts p where _activity = 'session'
  union all
  select coalesce(e.profile_id::text, e.guest_token, public.admin_person_key(e.participant_id)), e.created_at
    from events e where _activity = 'open'
),
grid as (
  select date_trunc('week', f.first_at) as cohort,
         floor(extract(epoch from (a.at - date_trunc('week', f.first_at))) / 604800)::int as week_index,
         f.person_key
  from first_seen f join acts a on a.person_key = f.person_key
  where f.first_at >= now() - (_weeks || ' weeks')::interval
),
sizes as (
  select date_trunc('week', first_at) as cohort, count(*) as size
  from first_seen where first_at >= now() - (_weeks || ' weeks')::interval group by 1
),
cells as (
  select cohort, week_index, count(distinct person_key) as active
  from grid where week_index >= 0 group by 1,2
),
stats as (
  select date_trunc('week', f.first_at) as cohort,
         percentile_cont(0.5) within group (order by (select count(distinct p.session_id) from parts p where p.person_key = f.person_key)) as median_sessions,
         percentile_cont(0.5) within group (order by (
            select count(distinct coalesce(o.profile_id::text, o.guest_token, o.id::text))
            from parts me join session_participants o on o.session_id = me.session_id
            where me.person_key = f.person_key and coalesce(o.profile_id::text, o.guest_token, o.id::text) <> f.person_key)) as median_people,
         avg(case when exists (select 1 from parts p where p.person_key = f.person_key and p.role not in ('recipient','member')) then 1 else 0 end)::numeric as initiator_share
  from first_seen f where f.first_at >= now() - (_weeks || ' weeks')::interval group by 1
)
select coalesce(jsonb_agg(jsonb_build_object(
  'cohort', to_char(z.cohort, 'YYYY-MM-DD'),
  'size', z.size,
  'medianSessions', st.median_sessions,
  'medianPeople', st.median_people,
  'initiatorShare', st.initiator_share,
  'cells', coalesce((select jsonb_agg(jsonb_build_object('week', c.week_index, 'active', c.active) order by c.week_index)
                     from cells c where c.cohort = z.cohort), '[]'::jsonb)
) order by z.cohort desc), '[]'::jsonb)
from sizes z left join stats st on st.cohort = z.cohort;
$$;

-- ============ people search + timeline ============

create or replace function public.admin_people(_q text default '', _include_test boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
with s as (select * from sessions where (_include_test or not is_test)),
parts as (
  select sp.*, coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) as person_key
  from session_participants sp join s on s.id = sp.session_id
),
grouped as (
  select person_key,
         max(display_name) as name,
         count(distinct session_id) as sessions,
         min(joined_at) as first_seen,
         max(joined_at) as last_seen,
         bool_or(profile_id is not null) as has_profile,
         array_agg(id) as participant_ids
  from parts
  where _q = '' or display_name ilike '%' || _q || '%' or person_key ilike '%' || _q || '%'
  group by person_key
)
select coalesce(jsonb_agg(jsonb_build_object(
  'personKey', g.person_key,
  'name', g.name,
  'sessions', g.sessions,
  'firstSeen', g.first_seen,
  'lastSeen', g.last_seen,
  'identity', case when g.has_profile then 'account'
                   when exists (select 1 from participant_emails pe where pe.participant_id = any(g.participant_ids)) then 'email'
                   else 'guest' end
) order by g.last_seen desc), '[]'::jsonb)
from (select * from grouped order by last_seen desc limit 200) g;
$$;

create or replace function public.admin_person_timeline(_person_key text)
returns jsonb language sql stable security definer set search_path = public as $$
with me as (
  select sp.*, coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) as person_key
  from session_participants sp
  where coalesce(sp.profile_id::text, sp.guest_token, sp.id::text) = _person_key
),
sess as (
  select s.*, m.id as participant_id, m.joined_at, m.role, m.display_name
  from me m join sessions s on s.id = m.session_id
),
answers_rows as (
  select a.*, sq.session_id, sq.order_index, sq.revealed_at as sq_revealed_at, sq.snapshot
  from answers a join session_questions sq on sq.id = a.session_question_id
  where a.participant_id in (select id from me)
),
msgs as (
  select tm.*, sq.session_id from thread_messages tm join session_questions sq on sq.id = tm.session_question_id
  where sq.session_id in (select session_id from me)
),
evts as (
  select e.* from events e
  where e.participant_id in (select id from me)
     or (e.guest_token is not null and e.guest_token in (select guest_token from me where guest_token is not null))
     or (e.profile_id is not null and e.profile_id::text = _person_key)
)
select jsonb_build_object(
  'personKey', _person_key,
  'summary', jsonb_build_object(
    'name', (select max(display_name) from me),
    'firstSeen', (select min(joined_at) from me),
    'lastSeen', greatest((select max(joined_at) from me), coalesce((select max(created_at) from evts), (select max(joined_at) from me))),
    'sessions', (select count(*) from sess),
    'messagesSent', (select count(*) from msgs where participant_id in (select id from me)),
    'messagesReceived', (select count(*) from msgs where participant_id not in (select id from me)),
    'distinctPeople', (select count(distinct coalesce(o.profile_id::text, o.guest_token, o.id::text))
                        from session_participants o where o.session_id in (select session_id from me)
                          and coalesce(o.profile_id::text, o.guest_token, o.id::text) <> _person_key),
    'everInitiated', (select bool_or(role in ('sender','host','creator')) from me),
    'identity', case when (select bool_or(profile_id is not null) from me) then 'account'
                     when exists (select 1 from participant_emails pe where pe.participant_id in (select id from me)) then 'email'
                     else 'guest' end,
    'linked', (select count(*) > 0 from events e where e.name = 'identity_linked'
                and (e.profile_id::text = _person_key or e.guest_token in (select guest_token from me where guest_token is not null))),
    'emails', coalesce((select jsonb_agg(distinct pe.email) from participant_emails pe where pe.participant_id in (select id from me)), '[]'::jsonb),
    'participantRows', (select count(*) from me),
    'gapSinceLastVisitSeconds', extract(epoch from (now() - greatest((select max(joined_at) from me), coalesce((select max(created_at) from evts), (select max(joined_at) from me)))))
  ),
  'sessions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'sessionId', s.id, 'kind', s.kind, 'isTest', s.is_test,
      'startedAt', s.created_at, 'joinedAt', s.joined_at, 'endedAt', s.ended_at, 'role', s.role,
      'others', coalesce((select jsonb_agg(distinct coalesce(o.display_name, 'Someone'))
                          from session_participants o where o.session_id = s.id and o.id <> s.participant_id), '[]'::jsonb),
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'orderIndex', ar.order_index,
          'text', coalesce(ar.snapshot->>'text', ''),
          'optionKey', ar.option_key,
          'label', coalesce((select o->>'label' from jsonb_array_elements(ar.snapshot->'options') o where o->>'key' = ar.option_key), ar.option_key),
          'role', ar.answer_role,
          'hasReason', (coalesce(ar.reason_text,'') <> ''),
          'reason', ar.reason_text,
          'answeredAt', ar.created_at,
          'revealedAt', ar.sq_revealed_at
        ) order by ar.order_index)
        from answers_rows ar where ar.session_id = s.id), '[]'::jsonb),
      'messages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'at', m.created_at, 'mine', (m.participant_id = s.participant_id),
          'chars', length(coalesce(m.body, '')), 'kind', m.kind, 'body', m.body
        ) order by m.created_at)
        from msgs m where m.session_id = s.id), '[]'::jsonb)
    ) order by s.created_at desc)
    from sess s), '[]'::jsonb),
  'events', coalesce((
    select jsonb_agg(jsonb_build_object('name', e.name, 'at', e.created_at, 'sessionId', e.session_id, 'props', e.props)
                     order by e.created_at desc)
    from (select * from evts order by created_at desc limit 500) e), '[]'::jsonb)
);
$$;

-- ============ per-question performance ============

create or replace function public.admin_question_performance(_include_test boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
with s as (select * from sessions where (_include_test or not is_test)),
sq as (select q.* from session_questions q join s on s.id = q.session_id),
ans as (select a.*, sq.question_id as qid, sq.id as sqid from answers a join sq on sq.id = a.session_question_id),
per_instance as (
  select sq.id as sqid, sq.question_id,
    (select count(*) from ans a where a.sqid = sq.id) as answers,
    (select extract(epoch from (max(a.created_at) - min(a.created_at))) from ans a where a.sqid = sq.id) as window_secs,
    (select count(*) from thread_messages tm where tm.session_question_id = sq.id) as messages
  from sq
),
splits as (
  select a.qid, a.option_key, count(*) as votes from ans a group by 1,2
),
totals as (select qid, sum(votes) as total from splits group by 1)
select coalesce(jsonb_agg(jsonb_build_object(
  'questionId', q.id,
  'text', q.text,
  'topic', t.label,
  'type', q.question_type,
  'spice', q.spice_level,
  'mode', q.mode,
  'timesShown', (select count(*) from sq where sq.question_id = q.id),
  'timesAnswered', coalesce(tt.total, 0),
  'skipRate', case when (select count(*) from sq where sq.question_id = q.id) = 0 then null else
      (select count(*) from sq sq2 where sq2.question_id = q.id and sq2.revealed_at is null
         and not exists (select 1 from ans a where a.sqid = sq2.id))::numeric
      / (select count(*) from sq where sq.question_id = q.id) end,
  'passRate', case when coalesce(tt.total,0) = 0 then null else
      (select count(*) from ans a where a.qid = q.id and a.option_key = 'pass')::numeric / tt.total end,
  'options', coalesce((select jsonb_agg(jsonb_build_object('key', sp.option_key, 'votes', sp.votes,
       'label', case sp.option_key when 'a' then q.option_a when 'b' then q.option_b when 'c' then q.option_c else sp.option_key end)
       order by sp.option_key) from splits sp where sp.qid = q.id), '[]'::jsonb),
  'medianAnswerWindowSeconds', (select percentile_cont(0.5) within group (order by pi.window_secs)
      from per_instance pi where pi.question_id = q.id and pi.answers > 1),
  'avgAnswerWindowSeconds', (select avg(pi.window_secs) from per_instance pi where pi.question_id = q.id and pi.answers > 1),
  'medianSecondsToAnswer', (select percentile_cont(0.5) within group (order by (e.props->>'seconds_since_shown')::numeric)
      from events e where e.name = 'answer_submitted' and e.props->>'question_id' = q.id::text
        and (e.props->>'seconds_since_shown') ~ '^[0-9.]+$'),
  'threads', (select count(*) from per_instance pi where pi.question_id = q.id and pi.messages > 0),
  'medianMessagesPerThread', (select percentile_cont(0.5) within group (order by pi.messages)
      from per_instance pi where pi.question_id = q.id and pi.messages > 0),
  'bridgeTaps', (select count(*) from events e where e.name = 'bridge_tapped' and e.props->>'question_id' = q.id::text),
  'mindChanged', (select count(*) from events e where e.name = 'mind_changed' and e.props->>'question_id' = q.id::text)
) order by (select count(*) from per_instance pi where pi.question_id = q.id and pi.messages > 0) desc), '[]'::jsonb)
from questions q
left join topics t on t.id = q.topic_id
left join totals tt on tt.qid = q.id
where exists (select 1 from sq where sq.question_id = q.id);
$$;

-- ============ per-session detail list ============

create or replace function public.admin_session_rows(
  _from timestamptz, _to timestamptz, _include_test boolean default false
) returns jsonb language sql stable security definer set search_path = public as $$
with s as (
  select * from sessions
  where created_at >= _from and created_at < _to and (_include_test or not is_test)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'sessionId', s.id, 'kind', s.kind, 'isTest', s.is_test,
  'startedAt', s.created_at, 'endedAt', s.ended_at,
  'people', (select count(*) from session_participants sp where sp.session_id = s.id),
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
$$;

-- ============ invites ============

create or replace function public.admin_invites(
  _from timestamptz, _to timestamptz, _include_test boolean default false
) returns jsonb language sql stable security definer set search_path = public as $$
with s as (select * from sessions where (_include_test or not is_test)),
inv as (
  select i.*, (coalesce(i.personal_note,'') <> '') as has_note,
    coalesce(i.child_session_id, i.session_id) as play_session
  from invites i join s on s.id = i.session_id
  where i.created_at >= _from and i.created_at < _to
),
rows as (
  select inv.*,
    extract(epoch from (inv.opened_at - inv.created_at)) as to_open,
    extract(epoch from (inv.completed_at - inv.opened_at)) as to_complete,
    (select max(sq.order_index) from answers a join session_questions sq on sq.id = a.session_question_id
      where a.participant_id = inv.recipient_participant_id) as last_index
  from inv
),
grp as (
  select case when has_note then 'with note' else 'no note' end as segment,
    count(*) as created,
    count(*) filter (where opened_at is not null) as opened,
    count(*) filter (where completed_at is not null) as completed,
    percentile_cont(0.5) within group (order by to_open) as median_to_open,
    percentile_cont(0.5) within group (order by to_complete) as median_to_complete
  from rows group by 1
)
select jsonb_build_object(
  'segments', coalesce((select jsonb_agg(to_jsonb(grp) order by grp.segment) from grp), '[]'::jsonb),
  'abandoned', coalesce((select jsonb_agg(jsonb_build_object(
      'token', r.token, 'label', r.recipient_label, 'hasNote', r.has_note,
      'openedAt', r.opened_at, 'lastQuestionIndex', r.last_index, 'sessionId', r.play_session
    ) order by r.opened_at desc)
    from rows r where r.opened_at is not null and r.completed_at is null), '[]'::jsonb)
);
$$;

-- ============ notifications ============

create or replace function public.admin_notifications(
  _from timestamptz, _to timestamptz, _include_test boolean default false
) returns jsonb language sql stable security definer set search_path = public as $$
with s as (select * from sessions where (_include_test or not is_test)),
n as (select nf.* from notifications nf join s on s.id = nf.session_id
      where nf.created_at >= _from and nf.created_at < _to),
clicks as (
  select e.*, coalesce(e.props->>'type', 'reply') as type from events e
  where e.name = 'notification_clicked' and e.created_at >= _from and e.created_at < _to
),
delivery as (
  select coalesce(e.props->>'status', 'unknown') as status, count(*) as n
  from events e where e.name in ('email_failed','email_bounced','email_sent')
    and e.created_at >= _from and e.created_at < _to
  group by 1
)
select jsonb_build_object(
  'byType', jsonb_build_array(jsonb_build_object(
    'type', 'reply',
    'sent', (select count(*) from n),
    'emailed', (select count(*) from n where emailed_at is not null),
    'read', (select count(*) from n where read_at is not null),
    'clicked', (select count(*) from clicks),
    'clickThroughRate', case when (select count(*) from n) = 0 then null
      else (select count(*) from clicks)::numeric / (select count(*) from n) end,
    'ledToMessage', (select count(*) from clicks c
       where exists (select 1 from thread_messages tm
          where tm.participant_id = c.participant_id and tm.created_at between c.created_at and c.created_at + interval '1 hour'))
  )),
  'delivery', coalesce((select jsonb_agg(to_jsonb(delivery)) from delivery), '[]'::jsonb)
);
$$;

do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;