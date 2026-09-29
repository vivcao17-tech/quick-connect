ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS report_axis text;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_report_axis_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_report_axis_check CHECK (report_axis IS NULL OR (pack = 'click' AND report_axis IN ('planning','social_energy','tempo','staying_power')) OR (pack = 'talk' AND report_axis IN ('depth','how_why','learning_mode','people_ideas')) OR (pack = 'bring_out' AND report_axis IN ('initiating','words_actions','push_comfort','group_one')));
UPDATE public.questions SET report_axis = CASE
 WHEN pack = 'click' AND question_key IN ('click_01','click_04','click_16') THEN 'planning'
 WHEN pack = 'click' AND question_key IN ('click_02','click_05','click_06') THEN 'social_energy'
 WHEN pack = 'click' AND question_key IN ('click_07','click_09','click_11') THEN 'tempo'
 WHEN pack = 'click' AND question_key IN ('click_17','meet_click_03') THEN 'staying_power'
 WHEN pack = 'talk' AND question_key IN ('talk_08','talk_09') THEN 'depth'
 WHEN pack = 'talk' AND question_key IN ('talk_01','meet_talk_06') THEN 'how_why'
 WHEN pack = 'talk' AND question_key IN ('talk_02','talk_07','talk_10') THEN 'learning_mode'
 WHEN pack = 'talk' AND question_key IN ('talk_12','talk_15','talk_17') THEN 'people_ideas'
 WHEN pack = 'bring_out' AND question_key IN ('bring_04','bring_07') THEN 'initiating'
 WHEN pack = 'bring_out' AND question_key = 'bring_10' THEN 'words_actions'
 WHEN pack = 'bring_out' AND question_key IN ('bring_02','bring_08','bring_12') THEN 'push_comfort'
 WHEN pack = 'bring_out' AND question_key = 'bring_11' THEN 'group_one'
 ELSE NULL END
 WHERE pack IN ('click','talk','bring_out') AND question_type IN ('ab','ab_reason');
UPDATE public.questions SET report_axis = CASE id
 WHEN 'dc1ff098-ef91-4555-9442-15148b8279aa'::uuid THEN 'planning'
 WHEN '9e5be299-7a44-413f-ba39-5a450187e0b4'::uuid THEN 'planning'
 WHEN '54306a86-a715-434a-9dce-fec3e57888a4'::uuid THEN 'push_comfort'
 WHEN '34f13a21-6330-4f1f-ba43-ebe939f86741'::uuid THEN 'push_comfort'
 ELSE report_axis END
 WHERE id IN ('dc1ff098-ef91-4555-9442-15148b8279aa','9e5be299-7a44-413f-ba39-5a450187e0b4','54306a86-a715-434a-9dce-fec3e57888a4','34f13a21-6330-4f1f-ba43-ebe939f86741') AND question_type IN ('ab','ab_reason');