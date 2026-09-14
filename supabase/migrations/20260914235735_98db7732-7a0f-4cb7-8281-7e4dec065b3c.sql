create or replace function public.relationships_detail(_guest_token text, _profile_id uuid)
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
  select sq.id, sq.session_id, sq.question_id, sq.revealed_at, sq.order_index, sq.snapshot,
         p.person_key, p.partner_id
  from session_questions sq
  join partners p on p.session_id = sq.session_id
  where sq.snapshot is not null
),
my_answers as (
  select distinct on (a.session_question_id)
         a.session_question_id, a.option_key, a.reason_text, a.created_at
  from answers a
  join qs on qs.id = a.session_question_id
  join me_in_session mis
    on mis.session_id = qs.session_id and mis.my_participant_id = a.participant_id
  where a.answer_role <> 'about_other'
  order by a.session_question_id, a.created_at desc
),
their_answers as (
  select distinct on (a.session_question_id)
         a.session_question_id, a.option_key, a.reason_text, a.created_at
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
         q.order_index,
         q.id as session_question_id,
         q.question_id,
         qn.topic_id,
         coalesce(t.label, '') as topic,
         coalesce(q.snapshot ->> 'text', '') as text,
         (q.revealed_at is not null) as revealed,
         coalesce((select o ->> 'label' from jsonb_array_elements(q.snapshot -> 'options') o
                   where o ->> 'key' = ma.option_key), '') as my_label,
         coalesce(ma.reason_text, '') as my_reason,
         coalesce((select o ->> 'label' from jsonb_array_elements(q.snapshot -> 'options') o
                   where o ->> 'key' = ta.option_key), '') as their_label,
         coalesce(ta.reason_text, '') as their_reason,
         case when ta.session_question_id is null then null
              else ma.option_key = ta.option_key end as matched,
         coalesce(ms.message_count, 0) as message_count,
         coalesce(ms.unread, 0) as unread,
         greatest(ma.created_at, ta.created_at, q.revealed_at, ms.last_message_at) as last_activity
  from qs q
  join my_answers ma on ma.session_question_id = q.id
  join questions qn on qn.id = q.question_id
  left join topics t on t.id = qn.topic_id
  left join their_answers ta on ta.session_question_id = q.id
  left join msg_stats ms on ms.session_question_id = q.id
),
blocks as (
  select qr.session_id,
         qr.person_key,
         s.kind,
         count(*)::int as total,
         count(*) filter (where qr.matched = false)::int as different,
         sum(qr.message_count)::int as message_count,
         sum(qr.unread)::int as unread,
         bool_or(qr.revealed) as revealed,
         max(qr.last_activity) as last_activity,
         jsonb_agg(jsonb_build_object(
           'sessionQuestionId', qr.session_question_id,
           'sessionId', qr.session_id,
           'questionId', qr.question_id,
           'topicId', qr.topic_id,
           'topic', qr.topic,
           'text', qr.text,
           'revealed', qr.revealed,
           'myLabel', qr.my_label,
           'myReason', qr.my_reason,
           'theirLabel', qr.their_label,
           'theirReason', qr.their_reason,
           'matched', qr.matched,
           'messageCount', qr.message_count,
           'unread', qr.unread,
           'lastActivity', qr.last_activity
         ) order by qr.order_index) as questions
  from question_rows qr
  join sessions s on s.id = qr.session_id
  group by qr.session_id, qr.person_key, s.kind
),
blocks_with_topic as (
  select b.*,
         coalesce((select t.label
                   from session_questions sq2
                   join questions qn on qn.id = sq2.question_id
                   join topics t on t.id = qn.topic_id
                   where sq2.session_id = b.session_id
                   order by sq2.order_index
                   limit 1), '') as topic
  from blocks b
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
),
people_agg as (
  select b.person_key,
         coalesce(pn.name, 'Someone') as name,
         coalesce(nd.nickname, '') as nickname,
         coalesce(nd.contact, '') as contact,
         coalesce(nd.note, '') as note,
         max(b.last_activity) as last_activity,
         jsonb_agg(jsonb_build_object(
           'sessionId', b.session_id,
           'kind', b.kind,
           'topic', b.topic,
           'total', b.total,
           'different', b.different,
           'messageCount', b.message_count,
           'unread', b.unread,
           'revealed', b.revealed,
           'lastActivity', b.last_activity,
           'questions', b.questions
         ) order by b.last_activity desc) as sessions
  from blocks_with_topic b
  left join partner_names pn on pn.person_key = b.person_key
  left join notes_dedup nd on nd.target_key = b.person_key
  group by b.person_key, pn.name, nd.nickname, nd.contact, nd.note
),
waiting as (
  select i.token,
         coalesce(i.recipient_label, 'Someone') as label,
         coalesce(i.personal_note, '') as note,
         i.created_at as sent_at,
         (i.opened_at is not null) as opened,
         i.session_id
  from invites i
  where i.completed_at is null
    and i.session_id in (
      select sp.session_id
      from session_participants sp
      where sp.role = 'sender'
        and ((_guest_token is not null and sp.guest_token = _guest_token)
          or (_profile_id is not null and sp.profile_id = _profile_id))
    )
  order by i.created_at desc
)
select jsonb_build_object(
  'people', coalesce((
    select jsonb_agg(jsonb_build_object(
      'personKey', p.person_key,
      'name', p.name,
      'nickname', p.nickname,
      'contact', p.contact,
      'note', p.note,
      'lastActivity', p.last_activity,
      'sessions', p.sessions
    ) order by p.last_activity desc)
    from people_agg p
  ), '[]'::jsonb),
  'waiting', coalesce((
    select jsonb_agg(jsonb_build_object(
      'token', w.token,
      'label', w.label,
      'note', w.note,
      'sentAt', w.sent_at,
      'opened', w.opened,
      'sessionId', w.session_id
    ) order by w.sent_at desc)
    from waiting w
  ), '[]'::jsonb)
);
$$;

revoke all on function public.relationships_detail(text, uuid) from public, anon, authenticated;
grant execute on function public.relationships_detail(text, uuid) to service_role;