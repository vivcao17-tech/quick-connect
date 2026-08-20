CREATE TABLE public.host_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  requester_participant_id uuid not null references public.session_participants(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
GRANT SELECT ON public.host_requests TO anon, authenticated;
GRANT ALL ON public.host_requests TO service_role;
ALTER TABLE public.host_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY host_requests_member_read ON public.host_requests FOR SELECT TO anon, authenticated USING (public.is_session_member(session_id));

CREATE TABLE public.connections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete set null,
  owner_participant_id uuid not null references public.session_participants(id) on delete cascade,
  target_participant_id uuid not null references public.session_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_participant_id, target_participant_id)
);
GRANT SELECT ON public.connections TO anon, authenticated;
GRANT ALL ON public.connections TO service_role;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY connections_read_own ON public.connections FOR SELECT TO anon, authenticated USING (public.is_my_participant(owner_participant_id));