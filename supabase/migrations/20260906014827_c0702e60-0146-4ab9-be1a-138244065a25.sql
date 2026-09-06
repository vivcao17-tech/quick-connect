-- EXECUTE on functions is granted to PUBLIC by default, and anon/authenticated
-- inherit it — so an earlier revoke aimed at those two roles left them reachable.
-- Revoke from PUBLIC across public schema, keeping only the helpers that RLS
-- policies must call as the querying role.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname NOT IN (
         'is_my_participant',          -- called inside RLS policies
         'is_session_member',          -- called inside RLS policies
         'current_guest_token',        -- called inside RLS policies
         'session_question_revealed',  -- called inside RLS policies
         'update_updated_at_column'    -- trigger function
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

-- Future functions are locked on creation instead of after the fact.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;