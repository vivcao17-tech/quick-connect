CREATE INDEX IF NOT EXISTS connections_target_participant_idx ON public.connections (target_participant_id);
CREATE INDEX IF NOT EXISTS person_notes_owner_idx ON public.person_notes (owner_key);
CREATE INDEX IF NOT EXISTS thread_messages_sq_created_idx ON public.thread_messages (session_question_id, created_at DESC);