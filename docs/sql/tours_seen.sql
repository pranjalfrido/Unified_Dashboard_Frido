-- Tour seen tracking — per-user JSONB of { tourId: versionSeen }
-- Run once in Supabase SQL Editor.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS tours_seen JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.mark_tour_seen(p_tour_id TEXT, p_version INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.user_profiles
     SET tours_seen = tours_seen || jsonb_build_object(p_tour_id, p_version)
   WHERE user_id = auth.uid()
  RETURNING tours_seen;
$$;

CREATE OR REPLACE FUNCTION public.reset_tours_seen()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.user_profiles SET tours_seen = '{}'::jsonb WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.mark_tour_seen(TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.reset_tours_seen() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_tour_seen(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_tours_seen() TO authenticated;
