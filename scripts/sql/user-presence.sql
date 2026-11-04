-- Live users (admin-only "● N live"). One row per user, overwritten on every heartbeat (no history).
-- Written and read only by api/presence.js with the service key; RLS on with no policies, so the
-- browser (anon / authenticated roles) can neither read nor write it.
create table if not exists public.user_presence (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  page             text not null default '',
  last_seen        timestamptz not null default now(),
  session_started  timestamptz not null default now()
);

alter table public.user_presence enable row level security;
-- No policies on purpose. Belt and braces: no table grants to the browser roles either.
revoke all on table public.user_presence from anon, authenticated;
-- The server endpoint (service key) needs these explicitly: this project doesn't grant new tables to
-- service_role by default.
grant select, insert, update, delete on table public.user_presence to service_role;

create index if not exists user_presence_last_seen_idx on public.user_presence (last_seen desc);
