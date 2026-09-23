UPDATE public.sessions
SET is_test = true
WHERE is_test IS DISTINCT FROM true;

INSERT INTO public.excluded_identities (kind, value, note)
SELECT DISTINCT 'profile', sp.profile_id::text, 'existing test data'
FROM public.session_participants sp
WHERE sp.profile_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.excluded_identities (kind, value, note)
SELECT DISTINCT 'guest_token', sp.guest_token, 'existing test data'
FROM public.session_participants sp
WHERE sp.guest_token IS NOT NULL
ON CONFLICT DO NOTHING;