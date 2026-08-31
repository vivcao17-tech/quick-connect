alter table public.sessions add column if not exists is_test boolean not null default false;
alter table public.events add column if not exists participant_id uuid references public.session_participants(id) on delete set null;

create index if not exists events_name_created_idx on public.events (name, created_at desc);
create index if not exists events_session_idx on public.events (session_id);
create index if not exists events_participant_idx on public.events (participant_id);
create index if not exists events_guest_idx on public.events (guest_token);
create index if not exists events_profile_idx on public.events (profile_id);
create index if not exists answers_sq_idx on public.answers (session_question_id);
create index if not exists thread_messages_sq_idx on public.thread_messages (session_question_id);
create index if not exists session_participants_session_idx on public.session_participants (session_id);
create index if not exists session_questions_session_idx on public.session_questions (session_id);
create index if not exists sessions_created_idx on public.sessions (created_at desc);