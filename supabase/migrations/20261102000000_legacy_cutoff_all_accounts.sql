-- Founder 2026-10-26 ("não permitir mais acesso à versão antiga"): once device_policy.legacy_until has
-- passed, every request without a device id (1.3.0) is refused with DT002 — also from an account that
-- never opened 1.3.1 (no account_devices row). The first version refused only accounts with a row
-- (12 of 166 on 2026-11-02). Nothing else changes: while legacy_until is null this behaves exactly as
-- before. A refused 1.3.0 keeps its unsent rows on the phone; 1.3.1 sends them after the update.
-- ROLLBACK: re-run the dt_require_active_device of 20261021010000_one_active_device.sql.
create or replace function public.dt_require_active_device(p_lock boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_dev text := public.dt_header('x-dt-device');
  v_ver text := public.dt_header('x-dt-app-version');
  v_min text;
  v_legacy timestamptz;
  v_active text;
  v_found boolean;
begin
  if v_uid is null or coalesce(auth.role(), '') = 'service_role' then return; end if;
  -- claim_device's own writes (it removes the other devices' push tokens).
  if coalesce(current_setting('dt.in_claim', true), '') = '1' then return; end if;
  select min_app_version, legacy_until into v_min, v_legacy from public.device_policy where id;
  if v_min is not null and v_ver is not null and public.dt_version_below(v_ver, v_min) then
    raise exception using errcode = 'DT003', message = 'update_required', hint = v_min;
  end if;
  -- An older version (no device id) keeps working until the founder's cutoff, then is refused.
  if v_dev is null then
    if v_legacy is not null and now() >= v_legacy then raise exception using errcode = 'DT002', message = 'device_required'; end if;
    return;
  end if;
  if p_lock then
    select active_device into v_active from public.account_devices where user_id = v_uid for share;
  else
    select active_device into v_active from public.account_devices where user_id = v_uid;
  end if;
  v_found := found;
  if not v_found or v_active is distinct from v_dev then
    raise exception using errcode = 'DT001', message = 'device_not_active';
  end if;
end;
$$;
