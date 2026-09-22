
REVOKE ALL ON FUNCTION public.identity_is_test(uuid, text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.sync_participant_test_status() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.identity_is_test(uuid, text) TO service_role;
