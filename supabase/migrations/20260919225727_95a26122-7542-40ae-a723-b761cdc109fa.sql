ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_key text,
  ADD COLUMN IF NOT EXISTS pack text,
  ADD COLUMN IF NOT EXISTS self_prompt text,
  ADD COLUMN IF NOT EXISTS is_values boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_round_role text,
  ADD COLUMN IF NOT EXISTS source text;

UPDATE public.questions SET source = 'legacy' WHERE source IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS questions_question_key_idx ON public.questions (question_key) WHERE question_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS questions_pack_idx ON public.questions (pack) WHERE pack IS NOT NULL;

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_pack_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_pack_check CHECK (pack IS NULL OR pack IN ('click','talk','bring_out','clash'));
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_first_round_role_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_first_round_role_check CHECK (first_round_role IS NULL OR first_round_role IN ('icebreaker','divider','impression'));

CREATE TABLE IF NOT EXISTS public.pack_config (
  pack text PRIMARY KEY,
  unlock_threshold integer NOT NULL,
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pack_config TO service_role;
ALTER TABLE public.pack_config ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_pack_config_updated_at ON public.pack_config;
CREATE TRIGGER update_pack_config_updated_at BEFORE UPDATE ON public.pack_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pack_config (pack, unlock_threshold, display_order) VALUES
  ('click', 4, 1),
  ('talk', 5, 2),
  ('bring_out', 5, 3),
  ('clash', 6, 4)
ON CONFLICT (pack) DO UPDATE SET unlock_threshold = EXCLUDED.unlock_threshold, display_order = EXCLUDED.display_order;

INSERT INTO public.questions (
  question_key, pack, question_type, mode, spice_level, text, option_a, option_b,
  self_prompt, is_values, first_round_role, source, active, is_featured, follow_up,
  stem_other, stem_self
)
SELECT
  r->>0, r->>1, r->>2, r->>3, (r->>4)::int, r->>5, r->>6, r->>7,
  nullif(r->>8, ''), (r->>9)::boolean, nullif(r->>10, ''), 'v2_pack', true, false, NULL,
  CASE WHEN r->>2 = 'impression' THEN r->>5 END,
  CASE WHEN r->>2 = 'impression' THEN coalesce(nullif(r->>8, ''), 'And you?') END
FROM jsonb_array_elements($json$[
["click_01","click","ab","both",1,"One free day in a new city:","plan it","figure it out as you go","",false,"icebreaker"],
["click_02","click","ab","both",1,"At a party, you mostly:","talk to one person","float around","",false,"icebreaker"],
["click_03","click","ab","both",1,"“Can I call you?”","just call","tell me why first","",false,"icebreaker"],
["click_04","click","ab","both",1,"A perfect Saturday is:","planned the night before","figured out as it goes","",false,"icebreaker"],
["click_05","click","ab","both",1,"I recharge with:","a quiet night in","a loud night out","",false,"icebreaker"],
["click_06","click","ab","both",1,"Best group size:","two or three","the more the merrier","",false,""],
["click_07","click","ab","both",1,"My best hours are:","early","late","",false,""],
["click_08","click","ab","both",1,"On a trip:","see as much as possible","see less, stay longer","",false,""],
["click_09","click","ab","both",1,"Texts:","I reply right away","I reply when I have real energy for it","",false,""],
["click_10","click","ab","both",1,"My go-to spot:","same favorite place every time","somewhere new every time","",false,""],
["click_11","click","ab","both",1,"A 10pm “come out?” text:","I'm in","I'll catch the next one","",false,""],
["click_12","click","ab","pair",2,"Hanging out means:","doing something together","just talking","",false,""],
["click_13","click","ab","pair",2,"A good conversation:","goes deep on one thing","jumps between everything","",false,""],
["click_14","click","ab","pair",2,"When plans fall through, I'm:","a little relieved","a little disappointed","",false,""],
["click_15","click","ab","pair",2,"With friends, I:","bring the energy","match the energy","",false,""],
["click_i1","click","impression","pair",2,"When plans fall through last minute, is {name} more…","relieved","disappointed","And you?",false,""],
["click_i2","click","impression","pair",2,"On a free Saturday, is {name}…","out by noon","still home at 4","And you?",false,""],
["click_i3","click","impression","pair",2,"In a group, does {name}…","set the energy","match it","And you?",false,""],
["clash_01","clash","ab","pair",2,"A friend says “I'm fine” but clearly isn't:","ask again","give space","",false,""],
["clash_02","clash","ab","pair",2,"Something lands wrong in the group:","say it there","text later","",false,""],
["clash_03","clash","ab","pair",2,"A friend keeps canceling:","keep inviting","let them make the next plan","",false,""],
["clash_04","clash","ab","both",1,"Phones at dinner:","fine","put away","",false,""],
["clash_05","clash","ab","pair",2,"When something bothers me, I:","say it now","wait until I know what I think","",false,""],
["clash_06","clash","ab","pair",2,"After an argument, I need:","space first","to talk it out","",false,""],
["clash_07","clash","ab","pair",2,"On a bad day, I want:","company","some time alone","",false,""],
["clash_08","clash","ab","pair",2,"Feedback:","tell me straight","tell me kindly","",false,""],
["clash_09","clash","ab","pair",2,"A friend who's always late:","I say something","I just adjust","",false,""],
["clash_10","clash","ab","pair",2,"An apology is mostly:","the words","what changes after","",true,""],
["clash_11","clash","ab","pair",2,"I'd rather:","hear a hard truth","have someone read the room","",true,""],
["clash_12","clash","ab","pair",2,"Plans, once made, are:","a promise","flexible by nature","",true,""],
["clash_13","clash","ab","pair",2,"A friend makes a choice I disagree with:","I tell them","I trust them to figure it out","",true,""],
["clash_14","clash","ab","pair",2,"Harder to forgive:","flakiness","bluntness","",true,""],
["clash_15","clash","ab","pair",2,"Money between friends:","fine, it's what friends do","better kept out","",true,""],
["clash_i1","clash","impression","pair",2,"When {name} is upset, do they…","go quiet","say it","And you?",false,""],
["clash_i2","clash","impression","pair",2,"After a disagreement, does {name} want…","space","to talk it out","And you?",false,""],
["clash_i3","clash","impression","pair",2,"Would {name} rather hear…","a hard truth","the kind version","And you?",false,""],
["talk_01","talk","ab","both",1,"What pulls you in first:","how it works","what it means","",false,""],
["talk_02","talk","ab","pair",2,"You like:","thinkers who explain","doers who try first","",false,"divider"],
["talk_03","talk","ab","pair",2,"What keeps you talking longer:","why people do that","what you'd do","",false,"divider"],
["talk_04","talk","ab","both",1,"Stories I love are:","real","made up","",false,""],
["talk_05","talk","ab","both",1,"Would you rather know:","the future","the true story of the past","",false,""],
["talk_06","talk","ab","both",1,"In a new city, I notice first:","the people","the places","",false,""],
["talk_07","talk","ab","both",1,"Learning something new:","theory first","jump in and try","",false,""],
["talk_08","talk","ab","both",1,"When I'm into something, I:","go deep on one thing","try lots of things a little","",false,""],
["talk_09","talk","ab","pair",2,"I'd rather be:","really good at one thing","decent at many things","",true,""],
["talk_10","talk","ab","pair",2,"Figuring things out:","think it through first","try it and see","",false,"divider"],
["talk_11","talk","ab","pair",2,"Everyone loves a movie I didn't:","I'll say so","I'll wonder what I missed","",false,""],
["talk_12","talk","ab","pair",2,"A great conversation leaves me with:","a new idea","a new feeling","",false,"divider"],
["talk_13","talk","ab","pair",2,"I could talk for hours about:","what makes people happy","how the world will change","",false,""],
["talk_14","talk","ab","pair",2,"When I'm wrong, I want:","to know exactly why","to just get it right next time","",false,""],
["talk_15","talk","ab","pair",2,"I learn most from:","books and ideas","people and experience","",false,""],
["talk_i1","talk","impression","pair",2,"Does {name} learn by…","reading about it","trying it","And you?",false,""],
["talk_i2","talk","impression","pair",2,"With a free month, would {name}…","learn something new","get great at something they already do","And you?",false,""],
["talk_i3","talk","impression","pair",2,"With no prep, {name} could talk for an hour about…","something they're learning","someone they know","And you?",false,""],
["bring_01","bring_out","ab","both",1,"In a group, you:","get things started","make things feel easy","",false,""],
["bring_02","bring_out","ab","pair",2,"When someone doubts themselves:","encourage first","help make a plan","",false,""],
["bring_03","bring_out","ab","pair",2,"Around you, people:","open up more","loosen up more","",false,""],
["bring_04","bring_out","ab","both",1,"In group plans, I'm the one who:","starts it","makes it actually happen","",false,""],
["bring_05","bring_out","ab","both",1,"In conversation, I:","ask the questions","tell the stories","",false,""],
["bring_06","bring_out","ab","both",1,"On a group trip, I:","plan the route","find the detours","",false,""],
["bring_07","bring_out","ab","both",1,"In a creative project, I:","bring the ideas","make it real","",false,""],
["bring_08","bring_out","ab","pair",2,"Before someone's big day, I:","hype them up","calm them down","",false,""],
["bring_09","bring_out","ab","pair",2,"When things go wrong, I:","stay steady","feel it and move fast","",false,""],
["bring_10","bring_out","ab","pair",2,"I show I care by:","what I say","what I do","",false,""],
["bring_11","bring_out","ab","pair",2,"With new people, I'm the one who:","connects everyone","people open up to one-on-one","",false,""],
["bring_12","bring_out","ab","pair",2,"Friends come to me:","for honest advice","to feel lighter","",false,""],
["bring_13","bring_out","ab","pair",2,"In friendships, I:","usually reach out first","am always there when someone reaches out","",false,""],
["bring_14","bring_out","ab","pair",2,"I notice first:","what's off","what's going well","",false,""],
["bring_i1","bring_out","impression","pair",2,"In your friend group, does {name}…","start plans","make them happen","And you?",false,"impression"],
["bring_i2","bring_out","impression","pair",2,"When you're stressed, would {name}…","try to fix it","make you feel better","And you?",false,"impression"],
["bring_i3","bring_out","impression","pair",2,"Does {name} bring out your…","serious side","silly side","And which side do you bring out in {name}?",false,""]
]$json$::jsonb) AS r
WHERE NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.question_key = r->>0);