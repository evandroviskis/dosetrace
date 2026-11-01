-- A-174 (founder on his iPhone 2026-10-22; go "Pode nos três" 2026-11-01): a team message pushed to an app older
-- than 1.3.1 (no messages screen) opens the app with nothing to read. api/adm-messages.js now pushes only to tokens
-- on 1.3.1 or newer, so admin_message_info hands each token its app version (push_tokens.app_version, written by
-- 1.3.1+ through lib/notifications.js). Read through to_jsonb(p) so the function never fails on a database where
-- the column does not exist (the token then reads as "version not reported" = waiting).
-- Function body only: no table, no data, no auth change. Same grants as before. Mirrors supabase_admin_rpcs.sql
-- (__tests__/admMessages.test.js keeps the two bodies identical).
--
-- STATUS: APPLIED in production 2026-11-01 (founder go "Pode nos três").
--
-- Rollback: re-run the admin_message_info body of 20261022200000_admin_users_tab.sql (the API reads a missing
-- app_version as waiting, so roll the API back first or no push goes out).
begin;

create or replace function public.admin_message_info(p_user_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public', 'auth'
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'email', lower(u.email),
    'language', case when lower(left(u.raw_user_meta_data->>'language', 2)) in ('en', 'es', 'pt', 'fr', 'de', 'it')
                     then lower(left(u.raw_user_meta_data->>'language', 2)) end,
    'silent', coalesce(u.raw_user_meta_data->>'silent_mode', '') = 'true',
    'tokens', coalesce((select jsonb_agg(jsonb_build_object('token', p.expo_token, 'platform', lower(coalesce(p.platform, '')), 'app_version', to_jsonb(p)->>'app_version') order by p.updated_at desc)
                          from public.push_tokens p where p.user_id = u.id
                           and not exists (select 1 from public.push_tokens q where q.expo_token = p.expo_token and q.user_id <> u.id and q.updated_at > p.updated_at)), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (
                  select m.id, m.body, m.created_at, m.read_at, m.withdrawn_at, l.devices, l.accepted, l.failed,
                         coalesce(l.result->'body'->>'silent', '') = 'true' as silent, coalesce(l.translated, false) as translated
                    from public.team_messages m
                    left join public.admin_actions_log l on l.message_id = m.id and l.action = 'message_send'
                   where m.user_id = u.id
                   order by m.created_at desc limit 50) h), '[]'::jsonb)
  )
    from auth.users u where u.id = p_user_id;
$$;

revoke execute on function public.admin_message_info(uuid) from public, anon, authenticated;
grant execute on function public.admin_message_info(uuid) to service_role;

commit;
