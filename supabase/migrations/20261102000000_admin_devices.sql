-- Admin panel Phase 4 — "DT Admin" device key (docs/specs/admin-panel.md Phase 4, DA8; founder 2026-11-02
-- "Concordo com a 2, pode registrar e seguir"). The founder's private Android app sends
-- "X-DT-Device: <id>.<secret>"; the server compares sha256(secret) with key_hash for the same admin and,
-- for a registered device, waives the authenticator (aal2), the 12 h password age and the 15 min step-up.
-- The browser keeps the 2026-10-21 rules. Devices are registered / revoked by SQL only, with the founder's go.
-- Applied live 2026-11-02 with the founder's go (see the note at the end).

create extension if not exists pgcrypto;

create table if not exists public.admin_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.admin_devices enable row level security;
revoke all on table public.admin_devices from public, anon, authenticated;
grant select, update (last_used_at) on table public.admin_devices to service_role;

-- Register a device for an allow-listed admin. Returns the plaintext key ONCE (base64url, 32 random
-- bytes); only the sha256 hex is stored. For the postgres role only (run in the SQL editor with the
-- founder's go): never callable by the service role, so no server path can mint a device key.
create or replace function public.admin_device_register(p_user_id uuid, p_name text)
returns table (device_id uuid, device_key text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = p_user_id) then
    raise exception 'not an admin: %', p_user_id;
  end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 60 then
    raise exception 'device name required (1-60 chars)';
  end if;
  v_secret := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.admin_devices (user_id, name, key_hash)
  values (p_user_id, trim(p_name), encode(digest(v_secret, 'sha256'), 'hex'))
  returning id into v_id;
  device_id := v_id;
  device_key := v_id::text || '.' || v_secret;
  return next;
end;
$$;

-- Revoke a device: the next call with its key is refused (401 device_unknown). Nothing is deleted.
create or replace function public.admin_device_revoke(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_devices set revoked_at = coalesce(revoked_at, now()) where id = p_id;
$$;

revoke execute on function public.admin_device_register(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_device_revoke(uuid) from public, anon, authenticated, service_role;

-- Supabase's default privileges give service_role full rights on a new public table; the panel's server
-- must only read and stamp last_used_at (DA8), so the defaults are taken back here (applied live 2026-11-02).
revoke insert, update, delete, truncate, references, trigger on table public.admin_devices from service_role;
grant select, update (last_used_at) on table public.admin_devices to service_role;
