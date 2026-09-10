ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS sender_read_option text;
ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_sender_read_option_check;
ALTER TABLE public.invites ADD CONSTRAINT invites_sender_read_option_check CHECK (sender_read_option IS NULL OR sender_read_option IN ('a','b','c'));