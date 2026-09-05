REVOKE EXECUTE ON FUNCTION public.profile_participants(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profile_data(uuid, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profile_id_for_handle(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_impression_questions(boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_impression_exhaustion() FROM anon, authenticated;