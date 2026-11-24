-- Admin panel — "Decisões" tab (founder approved 2026-11-24: "cria esse painel lá no admin, essa aba decisões,
-- onde eu consigo decidir tudo que é visual... alteração por escrito também"). Usage for the Claude sessions:
-- docs/decisoes.md. API: api/adm-decisions.js (GET list / one, PATCH status + choice + note only).
--
-- STATUS: NOT APPLIED (written 2026-11-24). Apply as ONE transaction with the founder's go, BEFORE deploying
-- api/adm-decisions.js. Until then the tab answers "not configured" and nothing is written.
--
-- What it does:
--   1. public.founder_decisions: one row per decision the founder must take (written by the Claude sessions
--      with SQL as the database owner). RLS on, NO policies: anon/authenticated get nothing (42501).
--      service_role (the panel API) may only SELECT; the panel writes only through founder_decision_save.
--   2. public.founder_decision_events: one row per save from the panel (who, when, what) — the history of
--      what he chose and the counter for the limit (60 saves per hour per admin). Append-only.
--   3. founder_decision_save(...): the ONLY write path of the panel. Writes status, choice, note and
--      decided_at; never title, context, executed_at or anything else. Refuses an executed decision (409),
--      a choice outside the options, an unknown id, and more than 60 saves per hour.
--   4. Storage bucket "founder-decisions": PRIVATE (no storage policy exists on this project, checked
--      2026-11-24: pg_policies on storage.objects = 0 rows), so only the service role reads it; the panel
--      shows the pictures through signed URLs valid for 10 minutes.
-- It changes NO Supabase Auth setting and nothing in the auth schema.
-- Rollback: bottom of this file.

begin;

create table if not exists public.founder_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  area text not null default 'app' check (area in ('app', 'painel', 'site', 'divulgacao', 'outro')),
  kind text not null default 'visual' check (kind in ('visual', 'texto', 'regra', 'outro')),
  title text not null check (char_length(title) between 1 and 200),
  question text not null check (char_length(question) between 1 and 4000),
  context text check (context is null or char_length(context) <= 40000),
  founder_said text check (founder_said is null or char_length(founder_said) <= 20000),
  recommendation text check (recommendation is null or char_length(recommendation) <= 10000),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'ajustar')),
  choice text check (choice is null or char_length(choice) <= 300),
  note text check (note is null or char_length(note) <= 4000),
  decided_at timestamptz,
  executed_at timestamptz,
  executed_note text check (executed_note is null or char_length(executed_note) <= 4000),
  source text check (source is null or char_length(source) <= 300),
  sort int not null default 0,
  constraint founder_decisions_decided check ((status = 'pendente') = (decided_at is null)),
  constraint founder_decisions_executed check (executed_at is null or decided_at is not null)
);
create index if not exists founder_decisions_status on public.founder_decisions (status, executed_at);

create or replace function public.founder_decisions_touch()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists founder_decisions_touch on public.founder_decisions;
create trigger founder_decisions_touch before update on public.founder_decisions
  for each row execute function public.founder_decisions_touch();

create table if not exists public.founder_decision_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  decision_id uuid not null references public.founder_decisions (id) on delete cascade,
  actor uuid not null,
  status text not null check (status in ('aprovado', 'recusado', 'ajustar')),
  choice text check (choice is null or char_length(choice) <= 300),
  note text check (note is null or char_length(note) <= 4000)
);
create index if not exists founder_decision_events_actor_at on public.founder_decision_events (actor, at desc);

alter table public.founder_decisions enable row level security;
alter table public.founder_decision_events enable row level security;
revoke all on table public.founder_decisions from public, anon, authenticated, service_role;
revoke all on table public.founder_decision_events from public, anon, authenticated, service_role;
grant select on table public.founder_decisions to service_role;
grant select on table public.founder_decision_events to service_role;
revoke all on sequence public.founder_decision_events_id_seq from public, anon, authenticated, service_role;
revoke all on function public.founder_decisions_touch() from public, anon, authenticated;

-- The panel's only write. p_actor = the admin's user_id (api/_admAuth.js has already checked the session,
-- the admin role and the step-up or the registered device).
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
  if p_status is null or p_status not in ('aprovado', 'recusado', 'ajustar') then
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
  v_choice := nullif(btrim(coalesce(p_choice, '')), '');
  if v_choice is not null and not (r.options ? v_choice) then return jsonb_build_object('state', 'bad_choice'); end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 4000 then return jsonb_build_object('state', 'bad_note'); end if;
  update public.founder_decisions
     set status = p_status, choice = v_choice, note = v_note, decided_at = now()
   where id = p_id
   returning * into r;
  insert into public.founder_decision_events (decision_id, actor, status, choice, note)
    values (p_id, p_actor, p_status, v_choice, v_note);
  return jsonb_build_object('state', 'saved', 'id', r.id, 'status', r.status, 'choice', r.choice, 'note', r.note, 'decided_at', r.decided_at);
end;
$$;
revoke all on function public.founder_decision_save(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.founder_decision_save(uuid, uuid, text, text, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('founder-decisions', 'founder-decisions', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'text/html'])
on conflict (id) do update set public = false;

commit;

-- Proof after applying (read only; expected values on the right):
--   select relrowsecurity from pg_class where oid = 'public.founder_decisions'::regclass;            -- true
--   select count(*) from pg_policies where tablename in ('founder_decisions', 'founder_decision_events'); -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('founder_decisions', 'founder_decision_events') and grantee in ('anon', 'authenticated', 'service_role');
--                                                                       -- service_role SELECT only (two rows)
--   select public from storage.buckets where id = 'founder-decisions';                                -- false
--   curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/founder_decisions?select=id" -H "apikey: $ANON"
--                                                                       -- 401 (42501 permission denied)
--
-- Rollback (one transaction; deletes the decisions and their history — export them first):
--   begin;
--   drop function if exists public.founder_decision_save(uuid, uuid, text, text, text);
--   drop table if exists public.founder_decision_events;
--   drop table if exists public.founder_decisions;
--   drop function if exists public.founder_decisions_touch();
--   -- the bucket: empty it in the Storage page first, then: delete from storage.buckets where id = 'founder-decisions';
--   commit;
