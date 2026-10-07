-- A-110 RG-6 (founder 2026-10-07 "pode aplicar o C"): the daily silent wake-up
-- (supabase/functions/wake-refresh, deployed with verify_jwt off). No secret anywhere: the function
-- runs only when claim_wake_refresh() says the last run is at least 20 hours old.

create table if not exists public.wake_refresh_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now()
);
-- No policy: only the service role (the edge function) reaches it.
alter table public.wake_refresh_runs enable row level security;

create or replace function public.claim_wake_refresh()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- one caller at a time
  perform pg_advisory_xact_lock(hashtext('dosetrace-wake-refresh'));
  if exists (select 1 from public.wake_refresh_runs where ran_at > now() - interval '20 hours') then
    return false;
  end if;
  insert into public.wake_refresh_runs default values;
  delete from public.wake_refresh_runs where ran_at < now() - interval '30 days';
  return true;
end;
$$;
revoke all on function public.claim_wake_refresh() from public, anon, authenticated;
grant execute on function public.claim_wake_refresh() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Once a day at 08:00 UTC (every timezone gets one; each phone's own 6-hourly task covers the rest).
select cron.schedule(
  'dosetrace-wake-refresh',
  '0 8 * * *',
  $$ select net.http_post(
       url := 'https://mqfvnqfusqyhqhowfweh.supabase.co/functions/v1/wake-refresh',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
