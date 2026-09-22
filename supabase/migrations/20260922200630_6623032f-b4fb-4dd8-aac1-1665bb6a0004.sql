
ALTER TABLE public.excluded_identities DROP CONSTRAINT IF EXISTS excluded_identities_kind_check;
ALTER TABLE public.excluded_identities
  ADD CONSTRAINT excluded_identities_kind_check
  CHECK (kind IN ('guest_token', 'profile', 'email'));

INSERT INTO public.excluded_identities (kind, value, note)
SELECT 'email', 'vivcao17@gmail.com', 'test account'
WHERE NOT EXISTS (
  SELECT 1 FROM public.excluded_identities WHERE kind = 'email' AND lower(value) = 'vivcao17@gmail.com'
);

CREATE UNIQUE INDEX IF NOT EXISTS excluded_identities_kind_value_key
  ON public.excluded_identities (kind, lower(value));

CREATE OR REPLACE FUNCTION public.identity_is_test(_profile_id uuid, _guest_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.excluded_identities e
    WHERE (e.kind = 'guest_token' AND _guest_token IS NOT NULL AND e.value = _guest_token)
       OR (e.kind = 'profile' AND _profile_id IS NOT NULL AND e.value = _profile_id::text)
       OR (e.kind = 'email' AND _profile_id IS NOT NULL AND lower(e.value) = (
             SELECT lower(p.email) FROM public.profiles p WHERE p.id = _profile_id
           ))
  )
$$;

CREATE OR REPLACE FUNCTION public.sync_participant_test_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_is_test boolean;
BEGIN
  SELECT is_test INTO session_is_test FROM public.sessions WHERE id = NEW.session_id;

  IF public.identity_is_test(NEW.profile_id, NEW.guest_token) THEN
    IF session_is_test IS DISTINCT FROM true THEN
      UPDATE public.sessions SET is_test = true WHERE id = NEW.session_id;
    END IF;
  ELSIF session_is_test IS true THEN
    IF NEW.guest_token IS NOT NULL THEN
      INSERT INTO public.excluded_identities (kind, value, note)
      VALUES ('guest_token', NEW.guest_token, 'joined a test room')
      ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.profile_id IS NOT NULL THEN
      INSERT INTO public.excluded_identities (kind, value, note)
      VALUES ('profile', NEW.profile_id::text, 'joined a test room')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_participants_test_sync ON public.session_participants;
CREATE TRIGGER session_participants_test_sync
AFTER INSERT OR UPDATE OF profile_id, guest_token ON public.session_participants
FOR EACH ROW EXECUTE FUNCTION public.sync_participant_test_status();
