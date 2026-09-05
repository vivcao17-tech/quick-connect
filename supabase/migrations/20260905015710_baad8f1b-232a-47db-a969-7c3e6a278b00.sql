GRANT EXECUTE ON FUNCTION public.draw_questions(jsonb, uuid, text[], uuid[], text[], integer, uuid[], uuid[], uuid[], integer, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.room_state(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.selection_persons(uuid, text[], uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.selection_history(uuid, text[], uuid[], text) TO service_role;