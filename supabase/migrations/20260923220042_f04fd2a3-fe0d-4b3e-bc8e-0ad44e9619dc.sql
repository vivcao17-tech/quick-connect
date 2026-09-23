DELETE FROM public.conversation_prompts WHERE active = false;
ALTER TABLE public.conversation_prompts RENAME COLUMN text TO question;
ALTER TABLE public.conversation_prompts ADD COLUMN subtopic text NOT NULL DEFAULT '', ADD COLUMN sort integer NOT NULL DEFAULT 0;
GRANT ALL ON public.conversation_prompts TO service_role;
INSERT INTO public.conversation_prompts (pack, subtopic, question, sort, active)
SELECT v.pack, v.subtopic, q.question, v.base + q.ord, true
FROM (VALUES
('click','Pace',10,'What does a perfect slow day look like for you? / When do you feel most like yourself: busy or bored? / What''s something you always rush that you wish you didn''t?'),
('click','Plans',20,'What''s the best plan you ever made last minute? / Do you like knowing what''s next, or finding out? / What''s a plan you keep meaning to make?'),
('click','Energy',30,'What kind of night leaves you more awake than before? / Who''s someone who always gives you energy? / How do you know you need a night in?'),
('click','Staying in touch',40,'How do you usually keep up with people you care about? / What''s a message that always makes your day? / Call, text, or voice note, and why?'),
('talk','What pulls you in',10,'What''s something you could explain for an hour? / What''s a rabbit hole you went down recently? / What did you care about at 12 that you still care about?'),
('talk','How you think',20,'How do you usually figure out something hard? / What''s an opinion you changed your mind on? / Do you think out loud or in your head first?'),
('talk','Stories',30,'What''s a story you tell a lot? / What''s something that happened to you that nobody believes? / What''s a book, show, or song that changed how you see something?'),
('talk','Learning',40,'What''s something you''re trying to get better at right now? / Who taught you something that stuck? / What''s a mistake that taught you the most?'),
('bring_out','In a group',10,'What role do you usually play in your friend group? / Who''s the friend who gets everyone together? / What''s a group moment you''ll remember for a while?'),
('bring_out','Support',20,'What actually helps when you''re having a hard week? / How do you usually show up for a friend? / What''s the best thing someone did for you when you were stressed?'),
('bring_out','Encouragement',30,'What''s something you''re quietly proud of? / Who believed in you before you did? / What would you try if you knew it''d go fine?'),
('bring_out','How people see you',40,'What do friends usually come to you for? / What''s something people get wrong about you at first? / What''s a side of you people only see later?'),
('clash','Bad days',10,'What do you need from a friend right after a bad day? / How can someone tell you''re not okay? / What''s the worst thing to say to you when you''re upset?'),
('clash','Saying hard things',20,'How do you like to hear hard news? / Is it easier for you to say something in person or over text? / What''s something you wish people said more directly?'),
('clash','Space and company',30,'How much time alone do you need in a week? / When do you want company even if you say you don''t? / How do you tell someone you need space?'),
('clash','Keeping plans',40,'How do you feel when plans change last minute? / What makes you cancel on something? / What''s a promise you always keep?')
) AS v(pack, subtopic, base, qs)
CROSS JOIN LATERAL unnest(string_to_array(v.qs, ' / ')) WITH ORDINALITY AS q(question, ord);