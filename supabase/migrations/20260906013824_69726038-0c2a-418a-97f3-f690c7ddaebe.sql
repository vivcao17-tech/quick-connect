-- guest_token is a credential: no client-visible read path may include it.
DROP POLICY IF EXISTS participants_member_read ON public.session_participants;
-- invites.token is a capability (whoever holds it can answer as that recipient).
DROP POLICY IF EXISTS invites_member_read ON public.invites;

-- Belt and braces: the Data API roles hold no privileges in public today; make that explicit and future-proof.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;