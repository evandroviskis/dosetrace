-- Admin panel Phase 5 — system slowness alert (docs/specs/admin-panel.md Phase 5, rows SA4; founder
-- 2026-11-03 "coloca um alerta de lentidão lá no ADM … notificação no aplicativo do ADM, não no DoseTrace",
-- limit 1 s). NOT APPLIED: the lead applies it after review, then deploys supabase/functions/health-probe.
--
--   system_health_checks — one row per probe per run (rest, auth, db), written by the health-probe edge
--                          function every 5 minutes; kept 14 days (daily cron below).
--   system_alerts        — slow / down / recovered, raised by the probe's rules (health-probe/alerts.ts).
--   admin_alert_tokens   — the DT Admin phone job's alerts-only token: sha256 of the secret, one per admin
--                          device (admin_devices), minted by POST /api/adm-health on the device path. It
--                          reads alert rows only; a revoked device's token stops working at once.
-- RLS on, no policies, nothing for public/anon/authenticated: only the service role (Vercel /api/adm-health,
-- the probe's PostgREST fallback) and postgres (the probe's direct connection, pg_cron) reach them.
-- The 5-minute call copies the live version-notice pattern (20261027010000_version_notice_cron.sql): the
-- Bearer is the Vault secret dosetrace_cron_secret (generated in the database; nobody sees or types it).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.system_health_checks (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  probe text not null check (probe in ('rest', 'auth', 'db')),
  ms integer,
  ok boolean not null,
  detail text check (detail is null or char_length(detail) <= 200)
);
create index if not exists system_health_checks_probe_time on public.system_health_checks (probe, checked_at desc, id desc);
create index if not exists system_health_checks_time on public.system_health_checks (checked_at desc);

create table if not exists public.system_alerts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('slow', 'down', 'recovered')),
  probe text not null check (probe in ('rest', 'auth', 'db')),
  ms integer,
  message text not null check (char_length(message) <= 300)
);
create index if not exists system_alerts_probe_id on public.system_alerts (probe, id desc);
create index if not exists system_alerts_time on public.system_alerts (created_at desc);

create table if not exists public.admin_alert_tokens (
  device_id uuid primary key references public.admin_devices (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.system_health_checks enable row level security;
alter table public.system_alerts enable row level security;
alter table public.admin_alert_tokens enable row level security;

revoke all on table public.system_health_checks from public, anon, authenticated;
revoke all on table public.system_alerts from public, anon, authenticated;
revoke all on table public.admin_alert_tokens from public, anon, authenticated;
revoke all on sequence public.system_health_checks_id_seq from public, anon, authenticated;
revoke all on sequence public.system_alerts_id_seq from public, anon, authenticated;

-- Supabase's default privileges give service_role everything on a new public table; take it back and grant
-- only what each path needs. No delete for anyone but postgres (the retention job).
revoke insert, update, delete, truncate, references, trigger on table public.system_health_checks from service_role;
revoke insert, update, delete, truncate, references, trigger on table public.system_alerts from service_role;
revoke insert, update, delete, truncate, references, trigger on table public.admin_alert_tokens from service_role;
grant select, insert on table public.system_health_checks to service_role;
grant select, insert on table public.system_alerts to service_role;
-- update (device_id, …): a PostgREST upsert (on_conflict=device_id) sets every column it was sent, the key too.
grant select, insert, update (device_id, token_hash, created_at, last_used_at) on table public.admin_alert_tokens to service_role;
grant usage on sequence public.system_health_checks_id_seq to service_role;
grant usage on sequence public.system_alerts_id_seq to service_role;

-- The shared cron secret (already live since 2026-10-26 for version-notice; created here only if missing).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'dosetrace_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dosetrace_cron_secret', 'pg_cron calls to DoseTrace edge functions');
  end if;
end;
$$;

create or replace function public.health_probe_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_secret is not null and char_length(p_secret) >= 32
    and exists (select 1 from vault.decrypted_secrets where name = 'dosetrace_cron_secret' and decrypted_secret = p_secret)
$$;
revoke all on function public.health_probe_secret_ok(text) from public, anon, authenticated;
grant execute on function public.health_probe_secret_ok(text) to service_role;

-- Every 5 minutes: the probe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dosetrace-health-probe') then
    perform cron.unschedule('dosetrace-health-probe');
  end if;
  if exists (select 1 from cron.job where jobname = 'dosetrace-health-retention') then
    perform cron.unschedule('dosetrace-health-retention');
  end if;
end;
$$;
select cron.schedule(
  'dosetrace-health-probe',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://mqfvnqfusqyhqhowfweh.supabase.co/functions/v1/health-probe',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dosetrace_cron_secret')
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ); $$
);

-- Once a day (03:17 UTC): checks older than 14 days go. Alerts are kept (a few rows a month).
select cron.schedule(
  'dosetrace-health-retention',
  '17 3 * * *',
  $$ delete from public.system_health_checks where checked_at < now() - interval '14 days'; $$
);
