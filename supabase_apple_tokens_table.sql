-- apple_tokens — Sign in with Apple refresh tokens, stored server-side ONLY so we
-- can revoke a user's Apple credential on account deletion (Apple Guideline
-- 5.1.1(v) / TN3194). Written and read exclusively by edge functions using the
-- service-role key. RLS is ENABLED with NO policies, so the anon/authenticated
-- client can never select, insert, update, or delete a row here — the refresh
-- token never reaches a device.
--
-- One row per user. Backfilled on the user's next Sign in with Apple (the app
-- historically discarded the authorization code, so pre-existing Apple accounts
-- have no row until they sign in again). Deleted with the account.

create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  apple_sub text,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
-- Intentionally NO policies: only the service role (which bypasses RLS) may touch
-- this table. Do not add anon/authenticated policies — the token must stay server-side.

revoke all on public.apple_tokens from anon, authenticated;
