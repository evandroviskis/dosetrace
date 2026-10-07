-- A-110 RG-6 (founder 2026-10-07): schedule the daily silent wake-up (supabase/functions/wake-refresh).
-- NOT APPLIED until the founder says go (production change). Prerequisites, in order:
--   1. deploy the edge function wake-refresh (verify_jwt off; it checks the service key / CRON_SECRET);
--   2. store the project URL and the CRON_SECRET in Vault as 'project_url' and 'cron_secret';
--   3. apply this migration.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Once a day at 08:00 UTC (every timezone gets one; the phone's own 6-hourly task covers the rest).
select cron.schedule(
  'dosetrace-wake-refresh',
  '0 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/wake-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
