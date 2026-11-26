-- Admin panel — "Decisões": (1) "Vou fazer depois" + "Tarefa sua" (founder 2026-11-24: "Eu preciso ter opção em
-- todos, de marcar assim, vou fazer depois"; design docs/specs/desenhos/vou-fazer-depois.html, aba nº 76) and
-- (2) "Atualizar" / "Avisar as sessões" with the signal the Claude sessions' watchers read on the Mac (founder
-- 2026-11-24 ~19:30: "1 sim"; design docs/specs/desenhos/avisar-sessoes.html, aba nº 77). Designs approved
-- 2026-11-24 ~20:00 ("4 aprovo", sessão principal) without an option chosen → the panel session executes the second
-- option: build and show it working BEFORE applying this file.
-- On top of 20261124000000 / 20261124010000 / 20261124020000 (all applied; left untouched).
--
-- STATUS: APPLIED 2026-11-26 in production (supabase_migrations.schema_migrations 20261126161844
-- founder_decisions_depois_avisos), as ONE transaction, after the founder's "Item 81, pode." in the panel session's
-- conversation, BEFORE the API/page that use it were deployed. Do not apply again. Tests: __tests__/admDecisionsLater.test.js (DL2, DA2).
--
-- What it does:
--   1. status may also be 'depois' (kept for later by him): decided_at stays null (not decided), later_at = since
--      when; never executed. kind may also be 'tarefa' (a task only he can do → label "Tarefa sua").
--   2. founder_decision_save also accepts 'depois' (only from 'pendente') and 'pendente' ("Voltar para Pendentes",
--      only from 'depois'); a decision (aprovado/recusado/ajustar) may come straight from 'depois' and clears later_at.
--      The history (founder_decision_events) records both. Same signature, owner rights, service_role only.
--   3. public.founder_decision_pings: one row per "Avisar as sessões" (when, which admin, which session or all).
--      RLS on, no policy; service_role may only SELECT; written only by founder_decision_ping (20 per hour per admin).
--   4. public.founder_decision_signal_keys: one key per Claude session (app / adm / ads), stored only as the sha256
--      (hex) of the key; the key itself stays on the Mac, outside git. RLS on, no grant at all (owner only).
--      Each session inserts its own hash by SQL after this file is applied; revoke = set revoked_at.
--   5. founder_decisions_signal(p_token): for the watchers. Wrong, short or revoked key → null. Right key → per
--      session only { aguardando, ultima_resposta, ultimo_aviso }: how many answers wait to be carried out, when the
--      last answer was given, when the last notice for it went out. No title, no text, no user data.
-- It changes NO Supabase Auth setting and nothing in the auth schema.
-- Rollback: bottom of this file.

begin;

-- 1. Vou fazer depois + Tarefa sua
alter table public.founder_decisions add column if not exists later_at timestamptz;

alter table public.founder_decisions drop constraint if exists founder_decisions_status_check;
alter table public.founder_decisions add constraint founder_decisions_status_check
  check (status in ('pendente', 'aprovado', 'recusado', 'ajustar', 'alterando', 'depois'));
alter table public.founder_decisions drop constraint if exists founder_decisions_decided;
alter table public.founder_decisions add constraint founder_decisions_decided
  check ((status in ('pendente', 'depois')) = (decided_at is null));
alter table public.founder_decisions drop constraint if exists founder_decisions_later;
alter table public.founder_decisions add constraint founder_decisions_later
  check ((status = 'depois') = (later_at is not null));
alter table public.founder_decisions drop constraint if exists founder_decisions_kind_check;
alter table public.founder_decisions add constraint founder_decisions_kind_check
  check (kind in ('visual', 'texto', 'regra', 'outro', 'tarefa'));
alter table public.founder_decision_events drop constraint if exists founder_decision_events_status_check;
alter table public.founder_decision_events add constraint founder_decision_events_status_check
  check (status in ('aprovado', 'recusado', 'ajustar', 'depois', 'pendente'));
-- founder_decisions_executed (executed only after aprovado/recusado/ajustar) and founder_decisions_rework stay as they are.

-- Guard: exactly one check on status must remain, and it must accept 'depois'.
do $$
begin
  if (select count(*) from pg_constraint
       where conrelid = 'public.founder_decisions'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%''alterando''%' and pg_get_constraintdef(oid) like '%''ajustar''%'
         and pg_get_constraintdef(oid) not like '%depois%' and pg_get_constraintdef(oid) not like '%executed_at%') > 0 then
    raise exception 'an old status check is still in place';
  end if;
end;
$$;

create or replace function public.founder_decision_save(p_id uuid, p_actor uuid, p_status text, p_choice text, p_note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  r public.founder_decisions;
  n int;
  t0 timestamptz;
  v_choice text;
  v_note text;
begin
  if p_id is null or p_actor is null then raise exception 'id and actor required'; end if;
  if p_status is null or p_status not in ('aprovado', 'recusado', 'ajustar', 'depois', 'pendente') then
    return jsonb_build_object('state', 'bad_status');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('founder_decisions:' || p_actor::text, 0));
  select count(*), min(at) into n, t0 from public.founder_decision_events where actor = p_actor and at > now() - interval '1 hour';
  if n >= 60 then
    return jsonb_build_object('state', 'limited', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  select * into r from public.founder_decisions where id = p_id for update;
  if not found then return jsonb_build_object('state', 'unknown'); end if;
  if r.executed_at is not null then return jsonb_build_object('state', 'executed', 'executed_at', r.executed_at); end if;
  if r.status = 'alterando' then return jsonb_build_object('state', 'reworking', 'rework_at', r.rework_at); end if;
  if p_status = 'depois' and r.status <> 'pendente' then return jsonb_build_object('state', 'bad_transition'); end if;
  if p_status = 'pendente' and r.status <> 'depois' then return jsonb_build_object('state', 'bad_transition'); end if;
  v_choice := nullif(btrim(coalesce(p_choice, '')), '');
  if p_status in ('depois', 'pendente') then v_choice := null; end if;
  if v_choice is not null and not (r.options ? v_choice) then return jsonb_build_object('state', 'bad_choice'); end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if p_status = 'pendente' then v_note := null; end if;
  if v_note is not null and char_length(v_note) > 4000 then return jsonb_build_object('state', 'bad_note'); end if;
  if p_status = 'depois' then
    update public.founder_decisions
       set status = 'depois', choice = null, note = v_note, decided_at = null, later_at = now()
     where id = p_id
     returning * into r;
  elsif p_status = 'pendente' then
    update public.founder_decisions
       set status = 'pendente', choice = null, note = null, decided_at = null, later_at = null
     where id = p_id
     returning * into r;
  else
    update public.founder_decisions
       set status = p_status, choice = v_choice, note = v_note, decided_at = now(), later_at = null
     where id = p_id
     returning * into r;
  end if;
  insert into public.founder_decision_events (decision_id, actor, status, choice, note)
    values (p_id, p_actor, p_status, v_choice, v_note);
  return jsonb_build_object('state', 'saved', 'id', r.id, 'status', r.status, 'choice', r.choice, 'note', r.note, 'decided_at', r.decided_at, 'later_at', r.later_at);
end;
$$;
revoke all on function public.founder_decision_save(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.founder_decision_save(uuid, uuid, text, text, text) to service_role;

-- 2. Avisar as sessões
create table if not exists public.founder_decision_pings (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid not null,
  origem text check (origem is null or origem in ('app', 'adm', 'ads'))
);
create index if not exists founder_decision_pings_at on public.founder_decision_pings (at desc);
create index if not exists founder_decision_pings_actor_at on public.founder_decision_pings (actor, at desc);
alter table public.founder_decision_pings enable row level security;
revoke all on table public.founder_decision_pings from public, anon, authenticated, service_role;
grant select on table public.founder_decision_pings to service_role;
revoke all on sequence public.founder_decision_pings_id_seq from public, anon, authenticated, service_role;

create table if not exists public.founder_decision_signal_keys (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  label text not null check (label in ('app', 'adm', 'ads')),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  revoked_at timestamptz
);
alter table public.founder_decision_signal_keys enable row level security;
revoke all on table public.founder_decision_signal_keys from public, anon, authenticated, service_role;
revoke all on sequence public.founder_decision_signal_keys_id_seq from public, anon, authenticated, service_role;

-- The panel's only notice write. p_actor = the admin's user_id (api/_admAuth.js has already checked the session,
-- the admin role and the step-up or the registered device). p_origem null = all three sessions.
create or replace function public.founder_decision_ping(p_actor uuid, p_origem text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  n int;
  t0 timestamptz;
  p public.founder_decision_pings;
begin
  if p_actor is null then raise exception 'actor required'; end if;
  if p_origem is not null and p_origem not in ('app', 'adm', 'ads') then return jsonb_build_object('state', 'bad_origem'); end if;
  perform pg_advisory_xact_lock(hashtextextended('founder_decision_pings:' || p_actor::text, 0));
  select count(*), min(at) into n, t0 from public.founder_decision_pings where actor = p_actor and at > now() - interval '1 hour';
  if n >= 20 then
    return jsonb_build_object('state', 'limited', 'retry_after', greatest(1, ceil(extract(epoch from (t0 + interval '1 hour' - now())))::int));
  end if;
  insert into public.founder_decision_pings (actor, origem) values (p_actor, p_origem) returning * into p;
  return jsonb_build_object('state', 'sent', 'at', p.at, 'origem', p.origem);
end;
$$;
revoke all on function public.founder_decision_ping(uuid, text) from public, anon, authenticated;
grant execute on function public.founder_decision_ping(uuid, text) to service_role;

-- What the watchers on the Mac read (anon key + the session's own key). Numbers and times only.
create or replace function public.founder_decisions_signal(p_token text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $$
declare
  out jsonb := '{}'::jsonb;
  o text;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 200 then return null; end if;
  if not exists (select 1 from public.founder_decision_signal_keys k
                  where k.hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and k.revoked_at is null) then
    return null;
  end if;
  foreach o in array array['app', 'adm', 'ads'] loop
    out := out || jsonb_build_object(o, jsonb_build_object(
      'aguardando', (select count(*) from public.founder_decisions d
                      where d.origem = o and d.status in ('aprovado', 'recusado', 'ajustar') and d.executed_at is null),
      'ultima_resposta', (select max(d.decided_at) from public.founder_decisions d
                           where d.origem = o and d.status in ('aprovado', 'recusado', 'ajustar')),
      'ultimo_aviso', (select max(p.at) from public.founder_decision_pings p where p.origem is null or p.origem = o)));
  end loop;
  return out;
end;
$$;
revoke all on function public.founder_decisions_signal(text) from public;
grant execute on function public.founder_decisions_signal(text) to anon, authenticated, service_role;

commit;

-- Proof after applying (read only; expected values on the right):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'founder_decisions_status_check';   -- … 'depois'
--   select count(*) from pg_policies where tablename in ('founder_decision_pings', 'founder_decision_signal_keys'); -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('founder_decision_pings', 'founder_decision_signal_keys') and grantee in ('anon', 'authenticated', 'service_role');
--                                                                       -- service_role SELECT on pings only
--   select public.founder_decisions_signal('x');                        -- null (short key)
--   select public.founder_decisions_signal(repeat('x', 40));            -- null (unknown key)
--   curl -s "$SUPABASE_URL/rest/v1/founder_decision_pings?select=id" -H "apikey: $ANON"   -- 401 (42501)
-- Each session then stores its key (generated on the Mac with openssl rand -hex 32, kept outside git) only as:
--   insert into public.founder_decision_signal_keys (label, hash) values ('app', '<shasum -a 256 of the key, hex>');
-- (never the key itself in SQL). Revoke: update public.founder_decision_signal_keys set revoked_at = now() where label = 'app';
--
-- Rollback (one transaction; run only while no row is 'depois' or kind 'tarefa' — move them back first:
--   update public.founder_decisions set status = 'pendente', later_at = null where status = 'depois';
--   update public.founder_decisions set kind = 'outro' where kind = 'tarefa';):
--   begin;
--   drop function if exists public.founder_decisions_signal(text);
--   drop function if exists public.founder_decision_ping(uuid, text);
--   drop table if exists public.founder_decision_signal_keys;
--   drop table if exists public.founder_decision_pings;
--   delete from public.founder_decision_events where status in ('depois', 'pendente');
--   alter table public.founder_decision_events drop constraint founder_decision_events_status_check;
--   alter table public.founder_decision_events add constraint founder_decision_events_status_check check (status in ('aprovado', 'recusado', 'ajustar'));
--   alter table public.founder_decisions drop constraint founder_decisions_later;
--   alter table public.founder_decisions drop constraint founder_decisions_decided;
--   alter table public.founder_decisions add constraint founder_decisions_decided check ((status = 'pendente') = (decided_at is null));
--   alter table public.founder_decisions drop constraint founder_decisions_kind_check;
--   alter table public.founder_decisions add constraint founder_decisions_kind_check check (kind in ('visual', 'texto', 'regra', 'outro'));
--   alter table public.founder_decisions drop constraint founder_decisions_status_check;
--   alter table public.founder_decisions add constraint founder_decisions_status_check check (status in ('pendente', 'aprovado', 'recusado', 'ajustar', 'alterando'));
--   alter table public.founder_decisions drop column if exists later_at;
--   -- then re-run the founder_decision_save of 20261124010000_founder_decisions_alterando.sql
--   commit;
