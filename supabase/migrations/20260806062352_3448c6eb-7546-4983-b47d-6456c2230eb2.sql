
create or replace function public.current_guest_token()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select nullif(
    coalesce(current_setting('request.headers', true)::json ->> 'x-guest-token', ''),
    ''
  )
$$;

create or replace function public.session_question_revealed(_session_question_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.session_questions sq
    where sq.id = _session_question_id and sq.revealed_at is not null
  )
$$;

revoke all on function public.question_tally(uuid) from public;
grant execute on function public.question_tally(uuid) to anon, authenticated, service_role;
