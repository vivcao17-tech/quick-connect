REVOKE EXECUTE ON FUNCTION public.question_tally(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_tally(uuid) TO service_role;