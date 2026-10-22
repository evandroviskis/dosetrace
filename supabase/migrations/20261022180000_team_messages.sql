-- A-163 Messages from the DoseTrace team (dosetrace docs/specs/team-messages.md, rows TM-5, TM-7, TM-9,
-- TM-12, TM-18 and TM-21; signed by the founder 2026-10-22). Mirrors supabase_admin_rpcs.sql section
-- "A-163 team messages" (__tests__/admMessages.test.js keeps every function body identical in both files).
--
-- STATUS: NOT APPLIED. Apply only with the founder's go, as ONE transaction, BEFORE deploying the
-- panel code: api/adm-messages.js calls admin_message_info, admin_message_begin, admin_message_finish
-- and admin_message_withdraw. Until it is applied the Mensagem dialog answers "not configured" and
-- nothing is stored or pushed; Premium and reading the panel are unaffected.
--
-- ============================== THE APP CONTRACT (for the app part, 1.3.2) ==============================
-- Table public.team_messages — one row per message the team sent to ONE account:
--   id uuid, user_id uuid, body text (1..200 characters, exactly as typed, ends trimmed),
--   created_at timestamptz, read_at timestamptz (null = unread), withdrawn_at timestamptz (panel only).
-- 1. LIST (sync across phones): with the user's session,
--      supabase.from('team_messages').select('id, body, created_at, read_at').order('created_at', { ascending: false })
--    RLS returns ONLY the signed-in account's messages that were NOT withdrawn. Fetch the whole list (it is
--    small) and REPLACE the local copy: a message missing from the answer was withdrawn by the team (TM-9)
--    and must disappear from the app (no sheet, no list row). Another account on the same phone never sees
--    them (RLS on auth.uid()). Anonymous / signed-out callers get nothing.
-- 2. MARK READ ("Entendi"): supabase.rpc('team_message_mark_read', { p_id: id, p_at: <ISO time of the tap> })
--    Only the owner, only read_at, only once (never un-read), never a withdrawn message. p_at is clamped to
--    [created_at, now()], so a tap made offline keeps its real time when the queued call is sent later.
--    Returns the stored read_at (null = not yours / withdrawn / unknown id → drop it locally).
--    Read on one phone = read on the other: the other phone sees read_at on its next list (step 1).
-- 3. PUSH: the panel (api/adm-messages.js) sends through the Expo push service, one message per row of
--    push_tokens of the account: title = the fixed title in the account's app language, body = the message,
--    data = { type: 'team_message', id: <team_messages.id> } (route a tap on it to that message),
--    sound 'default', priority 'high', Android channelId 'checkin-reminders' (a channel every installed
--    version already creates; a new channel would hide the message on older versions).
--    Fixed title (the app shows the same words on its sheet and list):
--      en "DoseTrace team message" · pt "Mensagem da equipe DoseTrace" · es "Mensaje del equipo de DoseTrace"
--      fr "Message de l'équipe DoseTrace" · de "Nachricht vom DoseTrace-Team" · it "Messaggio dal team di DoseTrace"
-- 4. LANGUAGE: the title uses user_metadata.language (one of en/es/pt/fr/de/it — the same key the
--    send-reminders function already reads). TODAY NO APP VERSION WRITES IT (the app keeps the language only
--    in AsyncStorage 'dosetrace_language'), so until the app part writes user_metadata.language on start and
--    on every change (updateUser({ data: { language } }) merges, never clobbers), the panel shows "not
--    reported" and the title goes in English.
-- 5. SILENT MODE: user_metadata.silent_mode === true (Settings › Pause all notifications, lib/notifications.js)
--    → the panel sends NO push to any device of the account; the message is still stored and shows in the app.
-- 6. DELETE: user_id references auth.users on delete cascade — deleting the account deletes its messages
--    (the app part may also list 'team_messages' in delete-user's userDataTables for an explicit delete).
-- The app never inserts, updates or deletes team_messages directly (no grant); only the panel's server does,
-- through the definer functions below (service_role only).
-- ==========================================================================================================
--
-- What it does:
--   1. team_messages + RLS (one select policy: own and not withdrawn) + index; no write grant to app users.
--   2. team_message_mark_read(p_id, p_at): the app's only write (read_at, owner only).
--   3. admin_actions_log (3.2) is extended, not replaced: actions message_send / message_withdraw,
--      message_id, devices, accepted, failed; reason stays required for Premium rows and is null for
--      message rows (the log keeps the outcome, never the text). Still no e-mail column. The 30-per-hour
--      limit per admin is ONE counter over this table, shared with Premium both ways.
--   4. admin_message_info(user): e-mail, app language, Silent mode, push tokens (server only — the API
--      never sends tokens to the page) and the last 50 messages with their send outcome, newest first.
--   5. admin_message_begin(...): under the same advisory locks as admin_action_begin: same request_id
--      again -> the stored answer (in_progress while pending; conflict for a different send); more than
--      30 rows by this admin in the last hour, or a message_send on this account in the last minute ->
--      limited; otherwise the message row and one pending log row, in one transaction.
--   6. admin_message_finish(...): pending -> ok with devices / accepted / failed / http / the answer.
--   7. admin_message_withdraw(...): replay, the 30-per-hour limit, then withdraw an UNREAD message of the
--      account (refused: already_read / already_withdrawn / message_not_found); one log row either way.
-- It changes NO Supabase Auth setting and nothing in the auth schema.

begin;

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200 and body = btrim(body)),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  withdrawn_at timestamptz,
  constraint team_messages_read_or_withdrawn check (read_at is null or withdrawn_at is null)
);
create index if not exists team_messages_user_created on public.team_messages (user_id, created_at desc);
alter table public.team_messages enable row level security;
revoke all on table public.team_messages from public, anon, authenticated, service_role;
grant select on table public.team_messages to authenticated, service_role;
drop policy if exists "team_messages select own" on public.team_messages;
create policy "team_messages select own" on public.team_messages for select to authenticated using (auth.uid() = user_id and withdrawn_at is null);

-- admin_actions_log: the 3.2 table, extended for messages. The two check constraints on action and reason
-- are found by their column (not by name), so the apply cannot leave the old Premium-only rule in place.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
     where con.conrelid = 'public.admin_actions_log'::regclass and con.contype = 'c' and a.attname in ('action', 'reason')
  loop
    execute format('alter table public.admin_actions_log drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.admin_actions_log alter column reason drop not null;
alter table public.admin_actions_log add constraint admin_actions_log_action_check
  check (action in ('premium_grant', 'premium_revoke', 'premium_change_end', 'message_send', 'message_withdraw'));
alter table public.admin_actions_log add constraint admin_actions_log_reason_check
  check ((action like 'premium\_%' and reason is not null and char_length(reason) between 1 and 200) or (action like 'message\_%' and reason is null));
alter table public.admin_actions_log add column if not exists message_id uuid references public.team_messages (id) on delete set null;
alter table public.admin_actions_log add column if not exists devices int check (devices >= 0);
alter table public.admin_actions_log add column if not exists accepted int check (accepted >= 0);
alter table public.admin_actions_log add column if not exists failed int check (failed >= 0);
create index if not exists admin_actions_log_message on public.admin_actions_log (message_id);

create or replace function public.team_message_mark_read(p_id uuid, p_at timestamptz default null)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  r timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.team_messages
     set read_at = least(now(), greatest(created_at, coalesce(p_at, now())))
   where id = p_id and user_id = auth.uid() and withdrawn_at is null and read_at is null
   returning read_at into r;
  if r is null then
    select m.read_at into r from public.team_messages m where m.id = p_id and m.user_id = auth.uid() and m.withdrawn_at is null;
  end if;
  return r;
end;
$$;

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
    'tokens', coalesce((select jsonb_agg(jsonb_build_object('token', p.expo_token, 'platform', lower(coalesce(p.platform, ''))) order by p.updated_at desc)
                          from public.push_tokens p where p.user_id = u.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (
                  select m.id, m.body, m.created_at, m.read_at, m.withdrawn_at, l.devices, l.accepted, l.failed,
                         coalesce(l.result->'body'->>'silent', '') = 'true' as silent
                    from public.team_messages m
                    left join public.admin_actions_log l on l.message_id = m.id and l.action = 'message_send'
                   where m.user_id = u.id
                   order by m.created_at desc limit 50) h), '[]'::jsonb)
  )
    from auth.users u where u.id = p_user_id;
$$;

create or replace function public.admin_message_begin(p_request_id uuid, p_actor uuid, p_user_id uuid, p_body text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  r public.admin_actions_log;
  n int;
  t0 timestamptz;
  new_id bigint;
  m public.team_messages;
begin
  if p_request_id is null or p_actor is null or p_user_id is null then raise exception 'request_id, actor and user_id required'; end if;
  if p_body is null or char_length(p_body) not between 1 and 200 or p_body <> btrim(p_body) then raise exception 'invalid body'; end if;
  -- The same two locks as admin_action_begin (one per admin, one per account, same order): one counter.
  perform pg_advisory_xact_lock(least(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  select * into r from public.admin_actions_log where request_id = p_request_id;
  if found then
    if r.actor <> p_actor or r.action <> 'message_send' or r.user_id <> p_user_id
       or not exists (select 1 from public.team_messages x where x.id = r.message_id and x.body = p_body) then
      return jsonb_build_object('state', 'conflict');
    end if;
    if r.status = 'pending' then return jsonb_build_object('state', 'in_progress'); end if;
    return jsonb_build_object('state', 'existing', 'http', r.http, 'result', r.result);
  end if;
  select count(*), min(at) into n, t0 from public.admin_actions_log where actor = p_actor and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('state', 'limited', 'scope', 'actor', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  select max(at) into t0 from public.admin_actions_log where user_id = p_user_id and action = 'message_send' and at > now() - interval '1 minute';
  if t0 is not null then
    return jsonb_build_object('state', 'limited', 'scope', 'account', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 minute' - now())))::int));
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then return jsonb_build_object('state', 'not_found'); end if;
  insert into public.team_messages (user_id, body) values (p_user_id, p_body) returning * into m;
  insert into public.admin_actions_log (request_id, actor, action, user_id, message_id)
    values (p_request_id, p_actor, 'message_send', p_user_id, m.id)
    returning id into new_id;
  return jsonb_build_object('state', 'started', 'id', new_id, 'message_id', m.id, 'created_at', m.created_at);
end;
$$;

create or replace function public.admin_message_finish(p_id bigint, p_devices int, p_accepted int, p_failed int, p_http int, p_result jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
begin
  if p_devices is null or p_accepted is null or p_failed is null or p_devices < 0 or p_accepted < 0 or p_failed < 0 or p_accepted + p_failed <> p_devices then
    raise exception 'invalid counts';
  end if;
  update public.admin_actions_log
     set status = 'ok', devices = p_devices, accepted = p_accepted, failed = p_failed, http = p_http, result = p_result
   where id = p_id and status = 'pending' and action = 'message_send';
  return found;
end;
$$;

create or replace function public.admin_message_withdraw(p_request_id uuid, p_actor uuid, p_user_id uuid, p_message_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $$
declare
  r public.admin_actions_log;
  n int;
  t0 timestamptz;
  m public.team_messages;
  st text := 'ok';
  code int := 200;
  res jsonb;
begin
  if p_request_id is null or p_actor is null or p_user_id is null or p_message_id is null then raise exception 'request_id, actor, user_id and message_id required'; end if;
  perform pg_advisory_xact_lock(least(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin_actions:' || p_actor::text, 0), hashtextextended('admin_actions:' || p_user_id::text, 0)));
  select * into r from public.admin_actions_log where request_id = p_request_id;
  if found then
    if r.actor <> p_actor or r.action <> 'message_withdraw' or r.user_id <> p_user_id or r.message_id is distinct from p_message_id then
      return jsonb_build_object('state', 'conflict');
    end if;
    return jsonb_build_object('state', 'existing', 'http', r.http, 'result', r.result);
  end if;
  select count(*), min(at) into n, t0 from public.admin_actions_log where actor = p_actor and at > now() - interval '1 hour';
  if n >= 30 then
    return jsonb_build_object('state', 'limited', 'scope', 'actor', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  update public.team_messages set withdrawn_at = now()
   where id = p_message_id and user_id = p_user_id
     and withdrawn_at is null and read_at is null
   returning * into m;
  if found then
    res := jsonb_build_object('status', 200, 'body', jsonb_build_object('ok', true, 'action', 'withdraw', 'request_id', p_request_id, 'message_id', m.id, 'withdrawn_at', m.withdrawn_at));
  else
    select * into m from public.team_messages where id = p_message_id and user_id = p_user_id;
    st := 'refused'; code := 409;
    res := jsonb_build_object('status', 409, 'body', jsonb_build_object('ok', false, 'action', 'withdraw', 'request_id', p_request_id,
             'code', case when m.id is null then 'message_not_found' when m.withdrawn_at is not null then 'already_withdrawn' else 'already_read' end));
  end if;
  insert into public.admin_actions_log (request_id, actor, action, user_id, message_id, status, http, result)
    values (p_request_id, p_actor, 'message_withdraw', p_user_id, m.id, st, code, res);
  return jsonb_build_object('state', 'done', 'http', code, 'result', res);
end;
$$;

revoke execute on function public.team_message_mark_read(uuid, timestamptz) from public, anon;
grant execute on function public.team_message_mark_read(uuid, timestamptz) to authenticated;
revoke execute on function public.admin_message_info(uuid) from public, anon, authenticated;
revoke execute on function public.admin_message_begin(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_message_finish(bigint, int, int, int, int, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_message_withdraw(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_message_info(uuid) to service_role;
grant execute on function public.admin_message_begin(uuid, uuid, uuid, text) to service_role;
grant execute on function public.admin_message_finish(bigint, int, int, int, int, jsonb) to service_role;
grant execute on function public.admin_message_withdraw(uuid, uuid, uuid, uuid) to service_role;

commit;

-- Checks after apply (expected results in brackets):
--   select relrowsecurity from pg_class where oid = 'public.team_messages'::regclass;              [true]
--   select policyname, cmd, roles, qual from pg_policies where tablename = 'team_messages';        [one: select, {authenticated}, own and not withdrawn]
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'team_messages' and grantee <> 'postgres';                               [authenticated SELECT, service_role SELECT]
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.admin_actions_log'::regclass and contype = 'c';                      [action_check with message_send/message_withdraw; reason_check premium/message; devices/accepted/failed >= 0]
--   select proname, proacl from pg_proc where proname like 'admin_message_%';                      [service_role only]
--   select proacl from pg_proc where proname = 'team_message_mark_read';                           [authenticated, no anon]
--   md5 of each body (pg_get_functiondef) = this file                                               [equal]
--   anon REST GET /rest/v1/team_messages and POST /rest/v1/rpc/admin_message_begin                 [no rows / 401 or 42501]
--   (test account, its own session) select from team_messages                                       [only its rows]
--
-- Rollback (only if the A-163 panel deploy is rolled back BEFORE any message was sent; afterwards keep the
-- table — the app part reads it — and only drop the panel functions):
--   begin;
--   drop function if exists public.admin_message_info(uuid);
--   drop function if exists public.admin_message_begin(uuid, uuid, uuid, text);
--   drop function if exists public.admin_message_finish(bigint, int, int, int, int, jsonb);
--   drop function if exists public.admin_message_withdraw(uuid, uuid, uuid, uuid);
--   -- with no message rows: drop function public.team_message_mark_read(uuid, timestamptz); the four
--   -- added log columns and drop table public.team_messages; restore the two 3.2 checks (action in the
--   -- three premium_* values; reason not null, 1..200) from 20261022120000_admin_actions_log.sql
--   commit;
