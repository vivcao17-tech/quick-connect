ALTER TABLE public.meet_signups DROP CONSTRAINT meet_signups_event_id_profile_id_key;
CREATE UNIQUE INDEX meet_signups_one_profile_per_event_idx
ON public.meet_signups(event_id, profile_id)
WHERE profile_id IS NOT NULL;