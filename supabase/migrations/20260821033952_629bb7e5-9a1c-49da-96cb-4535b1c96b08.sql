ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS stem_other text,
  ADD COLUMN IF NOT EXISTS stem_self text;

UPDATE public.questions AS q SET
  stem_other = v.so, stem_self = v.ss, text = v.ss,
  option_a = v.a, option_b = v.b, active = true
FROM (VALUES
 ('07c67b17-a2a3-4c09-a4ae-30916a229810','{name}''s phone is','Your phone is','Chaos','Suspiciously organized'),
 ('45cd7bca-3095-49de-99ff-7d613701e6d0','{name}''s room right now is','Your room right now is','Fine, honestly','Not ready for visitors'),
 ('96a7a656-b73f-4e14-bd2e-e3a15b62d564','{name} makes decisions','You make decisions','After thinking way too long','In about two seconds'),
 ('189f6678-1429-4651-85b8-f38f1766e9cc','{name} is more afraid of','You''re more afraid of','Being embarrassed','Being bored'),
 ('6044e34c-3995-4349-8c30-9690edfc9744','{name} cares more about','You care more about','Being understood','Being left alone'),
 ('e60c24fd-fa9b-49ce-88e9-174c92ad0244','{name} remembers','You remember','Names','Faces'),
 ('b21f355c-d45d-40b1-a757-80e27b2b307f','{name} apologizes','You apologize','Too much','Not enough'),
 ('acdc8471-741d-4fd4-bae3-fb68941df8b4','{name} is better at','You''re better at','Starting things','Finishing things'),
 ('23e397b3-75b1-4afe-9733-ed1d65a928e5','{name} overthinks','You overthink','Conversations already had','Decisions not made yet'),
 ('32ca434b-2273-4b37-8497-9d4a4395e576','{name} would rather','You''d rather','Host','Be invited'),
 ('c4754569-9712-4976-ad83-37333d6e7712','{name} would rather have','You''d rather have','A packed weekend','An empty one'),
 ('afe02c6c-72f5-46df-9ec8-2ff36ed0f04f','{name} would rather be called','You''d rather be called','Kind','Interesting'),
 ('d3c51e69-065f-4e59-96a4-699eb7c42019','Privately, {name} is more','Privately, you''re more','Chaotic than expected','Organized than expected'),
 ('42de8e18-eeff-4e21-b1c0-55fd40d2fc25','Privately, {name} is more','Privately, you''re more','Loud than expected','Quiet than expected'),
 ('0d260a61-8db2-4d9b-ae91-5866f3e65cfc','Privately, {name} is more','Privately, you''re more','Sentimental than expected','Practical than expected'),
 ('ccb8d056-d8ba-4305-9e93-c2c2019e5513','Privately, {name} is more','Privately, you''re more','Competitive than expected','Chill than expected'),
 ('d6f22421-7179-4f5b-99d2-2c1e75e4a8cc','When something goes wrong, {name}','When something goes wrong, you','Says it right away','Handles it and mentions it later'),
 ('6897a589-94b4-4494-9ba9-9a90905fd141','Under stress, {name} gets','Under stress, you get','Very talkative','Very quiet'),
 ('8f065300-bff1-451d-8734-ddbd7969e761','{name} is the friend who','You''re the friend who','Texts first','Waits to be texted'),
 ('bdaeb004-e12f-4635-a8ec-f10d74295f9f','{name} thinks about the past','You think about the past','More than expected','Barely at all')
) AS v(id, so, ss, a, b)
WHERE q.id = v.id::uuid;

UPDATE public.questions SET active = false
WHERE question_type = 'impression' AND stem_other IS NULL;