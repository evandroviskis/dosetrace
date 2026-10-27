-- A-127 UN-6 hourly version-notice call (founder 2026-10-26 "Sim, pode publicar a version-notice e
-- criar o segredo"). The 20261022000000_app_releases migration was applied WITHOUT its cron job (no
-- secret yet). Here the shared secret is generated INSIDE the database (Vault, 32 random bytes) and the
-- function checks it through version_notice_secret_ok (service role only): nobody sees or types it.
-- Test: __tests__/a127CronSecretVault.test.js.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'dosetrace_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dosetrace_cron_secret', 'A-127 hourly version-notice call');
  end if;
end;
$$;

create or replace function public.version_notice_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_secret is not null and char_length(p_secret) >= 32
    and exists (select 1 from vault.decrypted_secrets where name = 'dosetrace_cron_secret' and decrypted_secret = p_secret)
$$;
revoke all on function public.version_notice_secret_ok(text) from public, anon, authenticated;
grant execute on function public.version_notice_secret_ok(text) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dosetrace-version-notice') then
    perform cron.unschedule('dosetrace-version-notice');
  end if;
end;
$$;
select cron.schedule(
  'dosetrace-version-notice',
  '5 * * * *',
  $$ select net.http_post(
       url := 'https://mqfvnqfusqyhqhowfweh.supabase.co/functions/v1/version-notice',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dosetrace_cron_secret')
       ),
       body := '{}'::jsonb
     ); $$
);
