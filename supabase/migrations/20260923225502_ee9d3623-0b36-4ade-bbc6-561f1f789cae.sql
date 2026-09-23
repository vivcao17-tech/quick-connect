CREATE POLICY "Meet events are server only"
ON public.meet_events
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "Meet event questions are server only"
ON public.meet_event_questions
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "Meet signups are server only"
ON public.meet_signups
FOR ALL
TO public
USING (false)
WITH CHECK (false);