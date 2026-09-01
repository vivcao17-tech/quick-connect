CREATE OR REPLACE FUNCTION public.admin_question_performance(_include_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
totals as (select qid, sum(votes) as total from splits group by 1),
fu as (
  select e.props->>'question_id' as qid,
    count(*) filter (where e.name = 'follow_up_shown') as shown,
    count(*) filter (where e.name = 'follow_up_answered') as answered
  from events e
  where e.name in ('follow_up_shown', 'follow_up_answered')
  group by 1
)
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
  'mindChanged', (select count(*) from events e where e.name = 'mind_changed' and e.props->>'question_id' = q.id::text),
  'followUp', q.follow_up,
  'followUpShown', coalesce((select f.shown from fu f where f.qid = q.id::text), 0),
  'followUpAnswered', coalesce((select f.answered from fu f where f.qid = q.id::text), 0),
  'followUpAnswerRate', (select case when f.shown > 0 then f.answered::numeric / f.shown else null end
      from fu f where f.qid = q.id::text)
) order by (select count(*) from per_instance pi where pi.question_id = q.id and pi.messages > 0) desc), '[]'::jsonb)
from questions q
left join topics t on t.id = q.topic_id
left join totals tt on tt.qid = q.id
where exists (select 1 from sq where sq.question_id = q.id);
$function$;