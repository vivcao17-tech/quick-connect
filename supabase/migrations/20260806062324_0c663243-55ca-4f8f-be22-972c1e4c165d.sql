
-- ============ helpers ============
create or replace function public.current_guest_token()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(
    coalesce(
      current_setting('request.headers', true)::json ->> 'x-guest-token',
      ''
    ),
    ''
  )
$$;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ============ topics ============
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true
);
grant select on public.topics to anon, authenticated;
grant all on public.topics to service_role;
alter table public.topics enable row level security;
create policy "topics_public_read" on public.topics for select to anon, authenticated using (active);

-- ============ questions ============
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete cascade,
  text text not null,
  option_a text not null,
  option_b text not null,
  option_c text,
  spice_level int not null default 2,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.questions to anon, authenticated;
grant all on public.questions to service_role;
alter table public.questions enable row level security;
create policy "questions_public_read" on public.questions for select to anon, authenticated using (active);

-- ============ reason_chips ============
create table public.reason_chips (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_key text not null check (option_key in ('a','b','c')),
  text text not null
);
grant select on public.reason_chips to anon, authenticated;
grant all on public.reason_chips to service_role;
alter table public.reason_chips enable row level security;
create policy "reason_chips_public_read" on public.reason_chips for select to anon, authenticated using (true);

-- ============ sessions ============
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'irl_pair',
  room_code text unique,
  host_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  spice_max int not null default 2,
  current_index int not null default 0,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
grant select on public.sessions to anon, authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;

-- ============ session_participants ============
create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  guest_token text,
  display_name text,
  joined_at timestamptz not null default now()
);
create index session_participants_session_idx on public.session_participants(session_id);
grant select on public.session_participants to anon, authenticated;
grant all on public.session_participants to service_role;
alter table public.session_participants enable row level security;

-- membership helper (security definer, avoids recursive RLS)
create or replace function public.is_session_member(_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_participants sp
    where sp.session_id = _session_id
      and (
        (auth.uid() is not null and sp.profile_id = auth.uid())
        or (public.current_guest_token() is not null and sp.guest_token = public.current_guest_token())
      )
  )
$$;

create or replace function public.is_my_participant(_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_participants sp
    where sp.id = _participant_id
      and (
        (auth.uid() is not null and sp.profile_id = auth.uid())
        or (public.current_guest_token() is not null and sp.guest_token = public.current_guest_token())
      )
  )
$$;

create policy "sessions_member_read" on public.sessions for select to anon, authenticated
  using (public.is_session_member(id));
create policy "participants_member_read" on public.session_participants for select to anon, authenticated
  using (public.is_session_member(session_id));

-- ============ session_questions ============
create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  order_index int not null default 0,
  revealed_at timestamptz
);
create index session_questions_session_idx on public.session_questions(session_id);
grant select on public.session_questions to anon, authenticated;
grant all on public.session_questions to service_role;
alter table public.session_questions enable row level security;
create policy "session_questions_member_read" on public.session_questions for select to anon, authenticated
  using (public.is_session_member(session_id));

create or replace function public.session_question_revealed(_session_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_questions sq
    where sq.id = _session_question_id and sq.revealed_at is not null
  )
$$;

-- ============ answers (insert-only) ============
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  session_question_id uuid not null references public.session_questions(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  option_key text not null check (option_key in ('a','b','c')),
  reason_text text,
  reason_chip_id uuid references public.reason_chips(id) on delete set null,
  attachment_ref text,
  visibility text not null default 'session' check (visibility in ('private','session','circle','public')),
  created_at timestamptz not null default now()
);
create index answers_session_question_idx on public.answers(session_question_id);
create index answers_question_idx on public.answers(question_id);
-- no UPDATE / DELETE grants: answers are append-only
grant select on public.answers to anon, authenticated;
grant select, insert on public.answers to anon, authenticated;
grant select, insert on public.answers to service_role;
alter table public.answers enable row level security;

create policy "answers_read_own_or_revealed" on public.answers for select to anon, authenticated
  using (
    public.is_my_participant(participant_id)
    or public.session_question_revealed(session_question_id)
  );
create policy "answers_insert_own" on public.answers for insert to anon, authenticated
  with check (public.is_my_participant(participant_id));

-- ============ thread_messages ============
create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  session_question_id uuid not null references public.session_questions(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  kind text not null default 'text' check (kind in ('reaction','text')),
  body text,
  created_at timestamptz not null default now()
);
grant select, insert on public.thread_messages to anon, authenticated;
grant all on public.thread_messages to service_role;
alter table public.thread_messages enable row level security;
create policy "thread_read_revealed_or_own" on public.thread_messages for select to anon, authenticated
  using (
    public.is_my_participant(participant_id)
    or public.session_question_revealed(session_question_id)
  );
create policy "thread_insert_own" on public.thread_messages for insert to anon, authenticated
  with check (public.is_my_participant(participant_id));

-- ============ invites ============
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  inviter_participant_id uuid references public.session_participants(id) on delete set null,
  token text unique not null,
  recipient_label text,
  personal_note text,
  child_session_id uuid references public.sessions(id) on delete set null,
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.invites to anon, authenticated;
grant all on public.invites to service_role;
alter table public.invites enable row level security;
create policy "invites_member_read" on public.invites for select to anon, authenticated
  using (public.is_session_member(session_id));

-- ============ events ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  guest_token text,
  session_id uuid references public.sessions(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_idx on public.events(name);
grant insert on public.events to anon, authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;
create policy "events_insert_any" on public.events for insert to anon, authenticated with check (true);

-- ============ aggregate tally for the single-player reveal ============
create or replace function public.question_tally(_question_id uuid)
returns table (option_key text, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select a.option_key, count(*)::bigint as votes
  from public.answers a
  where a.question_id = _question_id
  group by a.option_key
$$;
grant execute on function public.question_tally(uuid) to anon, authenticated, service_role;

-- ============ seed ============
insert into public.topics (slug, label, sort_order) values
  ('money','Money',1),
  ('love','Love',2),
  ('family','Family',3),
  ('work','Work',4),
  ('friendship','Friendship',5),
  ('regret','Regret',6),
  ('home','Home',7),
  ('future','Future',8);

insert into public.questions (topic_id, text, option_a, option_b, option_c, spice_level)
select t.id, q.text, q.a, q.b, q.c, q.spice from public.topics t
join (values
  ('money','Someone offers you a job paying double, doing work you don''t care about.','Take it','Stay where I am', null, 2),
  ('money','A close friend asks to borrow a month of your rent.','Lend it','Say no', 'Give what I can spare', 2),
  ('money','You get an unexpected 10k.','Save it all','Spend some of it now', null, 1),
  ('love','Your partner reads a text on your phone without asking.','That''s a betrayal','It''s not a big deal', null, 3),
  ('love','You''d move to another country for someone you''ve dated a year.','Yes','No', null, 2),
  ('love','The better sign of love is:','Showing up','Saying it out loud', null, 1),
  ('family','You''d tell a sibling a hard truth about their partner.','Tell them','Stay out of it', null, 3),
  ('family','Family holidays are:','Something I protect','Something I survive', 'Something I skip', 2),
  ('family','You''d take in a parent who needs care.','Without question','Only if there''s no other way', null, 2),
  ('work','You''d quit a job with nothing lined up.','Yes','Never', null, 2),
  ('work','A coworker takes credit for your work.','Say something publicly','Handle it privately', 'Let it go', 2),
  ('work','Work is:','Where I build meaning','How I pay for my life', null, 1),
  ('friendship','A friend goes quiet for six months.','I reach out first','I wait', null, 1),
  ('friendship','You''d end a long friendship over politics.','Yes','No', null, 3),
  ('friendship','Better friend:','The one who tells you the truth','The one who always shows up', null, 1),
  ('regret','Bigger regret:','What I did','What I never tried', null, 2),
  ('regret','You''d read a letter from your past self.','Open it','Burn it', null, 1),
  ('regret','You''d apologise to someone who never apologised to you.','Yes','No', null, 3),
  ('home','Home is:','A place','A person', 'Neither yet', 1),
  ('home','You''d live alone forever if the place were perfect.','Yes','No', null, 2),
  ('home','You''d move back to where you grew up.','Yes','Never', null, 2),
  ('future','Ten years out, you''d rather have:','A life that''s calm','A life that''s interesting', null, 1),
  ('future','You''d want to know the date you die.','Tell me','Don''t', null, 3),
  ('future','You''d rather be:','Remembered by many','Deeply known by a few', null, 2)
) as q(slug, text, a, b, c, spice) on q.slug = t.slug;

insert into public.reason_chips (question_id, option_key, text)
select q.id, c.option_key, c.text
from public.questions q
cross join (values
  ('a','It just feels right'),
  ('a','I''ve been here before'),
  ('b','I''d regret the other one'),
  ('b','It''s who I am now')
) as c(option_key, text);
