-- Analytics: the client writes one row per event and never reads them back.
GRANT INSERT ON public.events TO anon, authenticated;

-- Topic cloud is read straight from the browser; policy already limits it to active rows.
GRANT SELECT ON public.topics TO anon, authenticated;