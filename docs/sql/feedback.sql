-- Feedback feature: table, indexes, RLS, private screenshot bucket.
-- NOT yet applied anywhere. Run once in the Supabase SQL editor (project the dashboard uses), then
-- switch FEEDBACK_LOCAL off. Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- All writes go through api/feedback.js with the service key (which bypasses RLS); the policies below
-- only let the browser READ: users their own rows, admins every row. No INSERT/UPDATE/DELETE policy
-- exists on purpose, so the browser can never write directly.

CREATE TABLE IF NOT EXISTS public.feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('bug', 'wrong_number', 'suggestion', 'new_feature')),
  message          TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- page, channel, sub-channel, date range, filters, device, app version, time (+ NavAI question/answer)
  screenshot_path  TEXT,                                  -- object path inside the private bucket feedback-screenshots
  urgent           BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'wont_do')),
  admin_reply      TEXT,
  show_in_whats_new BOOLEAN NOT NULL DEFAULT false,
  user_seen_at     TIMESTAMPTZ,                           -- when the user dismissed the "your feedback was closed" notification
  alert_sent_at    TIMESTAMPTZ,                           -- set once the admin e-mail / daily digest covered this row
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS feedback_user_created_idx   ON public.feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_created_idx ON public.feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_type_idx           ON public.feedback (type);
CREATE INDEX IF NOT EXISTS feedback_whatsnew_idx       ON public.feedback (resolved_at DESC) WHERE show_in_whats_new AND status = 'done';
CREATE INDEX IF NOT EXISTS feedback_digest_idx         ON public.feedback (created_at) WHERE alert_sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.feedback_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('done', 'wont_do') AND (OLD.status IS DISTINCT FROM NEW.status) THEN NEW.resolved_at := now(); END IF;
  IF NEW.status IN ('new', 'in_progress') THEN NEW.resolved_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feedback_touch_trg ON public.feedback;
CREATE TRIGGER feedback_touch_trg BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.feedback_touch();

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- The server (api/feedback.js, service key) needs explicit access to the table: on newer Supabase projects new
-- tables are not granted to the API roles automatically ("permission denied for table feedback" otherwise).
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO service_role;

-- Reads only. is_admin_user() is the existing SECURITY DEFINER helper from supabase-schema.sql.
DROP POLICY IF EXISTS "Feedback: own rows or admin" ON public.feedback;
CREATE POLICY "Feedback: own rows or admin" ON public.feedback
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));

-- Private bucket for screenshots. Nothing is public; admins read through signed URLs (made by the
-- server). The server uploads with the service key, so no INSERT policy is needed for users.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-screenshots', 'feedback-screenshots', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Feedback screenshots: admins read" ON storage.objects;
CREATE POLICY "Feedback screenshots: admins read" ON storage.objects
  FOR SELECT USING (bucket_id = 'feedback-screenshots' AND public.is_admin_user(auth.uid()));
