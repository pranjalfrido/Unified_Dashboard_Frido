-- Security batch 1: weak-password flag (run once in the Supabase SQL editor; the app works without it, the flag just stays unsaved).
-- weak_password: set at login when Supabase reports the password no longer meets the rules; cleared when a strong one is set.
-- weak_skips: how many times the person pressed "Remind me later" on the set-a-stronger-password screen (max 3).
-- Members already update their own user_profiles row (name, avatar), so no policy change is needed. Admins read it with the rest of the row.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS weak_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS weak_skips integer NOT NULL DEFAULT 0;
