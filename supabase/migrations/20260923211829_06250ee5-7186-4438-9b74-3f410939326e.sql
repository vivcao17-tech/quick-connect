create table public.conversation_prompts (
  id uuid primary key default gen_random_uuid(),
  pack text,
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant all on public.conversation_prompts to service_role;
alter table public.conversation_prompts enable row level security;

insert into public.conversation_prompts (pack, text) values
('click','What does a perfect free Saturday look like for you?'),
('click','When do you have the most energy — morning or late at night?'),
('click','What''s something you always say yes to?'),
('talk','What''s something you''ve been curious about lately?'),
('talk','What''s the last thing you changed your mind about?'),
('talk','What could you talk about for an hour without notes?'),
('bring_out','Who''s usually the one who suggests plans between us?'),
('bring_out','What do people usually come to you for?'),
('bring_out','When do you feel most like yourself around others?'),
('clash','How do you usually know something is bothering you?'),
('clash','What''s easier for you: saying no, or hearing no?'),
('clash','What''s something small that always gets under your skin?'),
(null,'What''s one thing that made your week?'),
(null,'What''s something you''re looking forward to?'),
(null,'What''s a story you tell a lot?');