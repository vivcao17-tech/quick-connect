create table if not exists public.participant_emails (
  participant_id uuid primary key references public.session_participants(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
grant all on public.participant_emails to service_role;
alter table public.participant_emails enable row level security;

create table if not exists public.email_optouts (
  email text primary key,
  created_at timestamptz not null default now()
);
grant all on public.email_optouts to service_role;
alter table public.email_optouts enable row level security;

alter table public.notifications add column if not exists emailed_at timestamptz;

insert into public.participant_emails (participant_id, email)
select i.recipient_participant_id, lower(i.recipient_email)
from public.invites i
where i.recipient_participant_id is not null and i.recipient_email is not null
on conflict (participant_id) do nothing;