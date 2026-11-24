-- Admin panel — "Decisões": the state "Alteração em andamento" (founder 2026-11-24: "Quando uma das decisões estão
-- sendo alteradas, preciso que você não deixe ela disponível para eu tomar decisão. Então são: pendentes, decididas e
-- alteração em andamento."). On top of 20261124000000_founder_decisions.sql (applied as committed in 210e1e0a).
--
-- STATUS: NOT APPLIED (written 2026-11-24). Apply as ONE transaction with the go, BEFORE deploying the API that
-- knows 'alterando' (api/adm-decisions.js after 210e1e0a). Until then nothing changes: no row can be 'alterando'.
--
-- What it does:
--   1. status may also be 'alterando': set ONLY by a Claude session by SQL while it reworks a decision after his
--      "Precisa ajustar" (docs/decisoes.md §4); back to 'pendente' with the new version. rework_at = since when.
--      Constraints: 'alterando' ⇔ rework_at set; executed only after his answer (aprovado/recusado/ajustar).
--   2. founder_decision_save refuses a decision being changed ('reworking' → the API answers 409): read only in
--      the panel. Same signature, owner rights, service_role only.
-- Rollback: bottom of this file.

begin;

alter table public.founder_decisions add column if not exists rework_at timestamptz;

-- The inline check of 20261124000000 on "status" carries PostgreSQL's default name <table>_<column>_check.
alter table public.founder_decisions drop constraint if exists founder_decisions_status_check;
alter table public.founder_decisions add constraint founder_decisions_status_check
  check (status in ('pendente', 'aprovado', 'recusado', 'ajustar', 'alterando'));
alter table public.founder_decisions drop constraint if exists founder_decisions_executed;
alter table public.founder_decisions add constraint founder_decisions_executed
  check (executed_at is null or status in ('aprovado', 'recusado', 'ajustar'));
alter table public.founder_decisions drop constraint if exists founder_decisions_rework;
alter table public.founder_decisions add constraint founder_decisions_rework
  check ((status = 'alterando') = (rework_at is not null));

-- Guard: exactly one check on status must remain, and it must accept 'alterando'.
do $$
begin
  if (select count(*) from pg_constraint
       where conrelid = 'public.founder_decisions'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%''pendente''%' and pg_get_constraintdef(oid) like '%''ajustar''%' and pg_get_constraintdef(oid) not like '%alterando%') > 0 then
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
  if r.status = 'alterando' then return jsonb_build_object('state', 'reworking', 'rework_at', r.rework_at); end if;
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

commit;

-- Proof after applying (read only):
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.founder_decisions'::regclass and contype = 'c';
--                    -- founder_decisions_status_check lists 'alterando'; founder_decisions_rework present
--   select position('reworking' in prosrc) > 0 from pg_proc where proname = 'founder_decision_save';   -- true
--   select grantee, privilege_type from information_schema.role_routine_grants where routine_name = 'founder_decision_save';
--                    -- service_role EXECUTE (plus the owner)
--
-- Rollback (one transaction; first move any 'alterando' row back: update ... set status = 'pendente', decided_at = null,
-- choice = null, rework_at = null where status = 'alterando'):
--   begin;
--   alter table public.founder_decisions drop constraint if exists founder_decisions_rework;
--   alter table public.founder_decisions drop constraint if exists founder_decisions_executed;
--   alter table public.founder_decisions add constraint founder_decisions_executed check (executed_at is null or decided_at is not null);
--   alter table public.founder_decisions drop constraint if exists founder_decisions_status_check;
--   alter table public.founder_decisions add constraint founder_decisions_status_check check (status in ('pendente', 'aprovado', 'recusado', 'ajustar'));
--   alter table public.founder_decisions drop column if exists rework_at;
--   -- then re-run the founder_decision_save body of 20261124000000_founder_decisions.sql
--   commit;
