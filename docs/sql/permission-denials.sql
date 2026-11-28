-- Security batch 2: log of requests the page-permission check would refuse (PERMISSION_ENFORCE=log) or refused (enforce).
-- Written by middleware.js as the signed-in person (insert-own only), read by admins through /api/permission-denials.
-- Not run. Safe to re-run. Without this table the check still works; only the admin list stays empty (Vercel logs keep the lines).
CREATE TABLE IF NOT EXISTS public.permission_denials (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  user_id  uuid NOT NULL,
  route    text NOT NULL,
  required text NOT NULL,
  mode     text NOT NULL CHECK (mode IN ('log', 'enforce'))
);
ALTER TABLE public.permission_denials ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.permission_denials TO authenticated;
GRANT SELECT, DELETE ON public.permission_denials TO service_role;

DROP POLICY IF EXISTS "Own denials can be inserted" ON public.permission_denials;
CREATE POLICY "Own denials can be inserted" ON public.permission_denials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- No select / update / delete policy for members: only the service role (the admin API) reads it.

CREATE INDEX IF NOT EXISTS permission_denials_at_idx ON public.permission_denials (at DESC);

-- Optional housekeeping: keep 30 days.
-- DELETE FROM public.permission_denials WHERE at < now() - interval '30 days';

-- Rollback:
-- DROP TABLE IF EXISTS public.permission_denials;
