// health-probe — the system slowness alert (docs/specs/admin-panel.md Phase 5; founder 2026-11-03 "coloca
// um alerta de lentidão lá no ADM … notificação no aplicativo do ADM, não no DoseTrace", limit 1 s).
// pg_cron calls it every 5 minutes (migration 20261103010000_system_health.sql, the version-notice pattern:
// the Bearer is the Vault secret dosetrace_cron_secret, checked by health_probe_secret_ok; nobody types it).
//
// Each run measures three probes for real and writes one system_health_checks row per probe:
//   rest — a PostgREST read through the app's own path (db_pre_request = dt_pre_request runs on it) and the
//          app's own read shape: dose_logs filtered by user_id, for the nil uuid (no account can have it), so
//          it reads no user data and still costs what the app's per-user read costs;
//   auth — GET /auth/v1/health;
//   db   — one Postgres round trip (select 1) on an already open connection (SUPABASE_DB_URL, set by
//          Supabase for every function), so the time is the database's, not the TLS handshake's.
// Then the rules in ./alerts.ts (shared with the Node tests) decide the alerts: "slow" after 2 runs over
// 1 s, "down" after 2 failures, quiet until 2 healthy runs → "recovered". Under one advisory lock, so two
// overlapping runs never raise the same alert twice. The DT Admin phone app reads the alerts through
// GET /api/adm-health (an alerts-only token) and shows them as notifications.
//
// NOT DEPLOYED. Deploy (after the migration), with no new secret:
//   supabase functions deploy health-probe --no-verify-jwt
// --no-verify-jwt because the cron call carries no user JWT; the function refuses any call without
// "Authorization: Bearer <Vault secret, CRON_SECRET or the service-role key>".
// Logs carry probe names and error codes only — never a header, key, secret or address.
import postgres from 'npm:postgres@3.4.5';
import { PROBES, PROBE_TIMEOUT_MS, plan } from './alerts.ts';

type Run = { probe: string; ms: number; ok: boolean; detail: string | null };
type Row = { ok: boolean; ms: number | null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// A failure we describe ourselves (safe to store); anything else is reduced to its name or code.
class ProbeError extends Error {}
function short(e: unknown): string {
  const x = e as { name?: string; code?: string; message?: string } | null;
  if (x instanceof ProbeError) return String(x.message).slice(0, 200);
  if (x && (x.name === 'TimeoutError' || x.name === 'AbortError')) return 'timeout';
  return String((x && (x.code || x.name)) || 'error').slice(0, 200);
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let t: number | undefined;
  const timer = new Promise<T>((_, rej) => { t = setTimeout(() => rej(new ProbeError('timeout')), PROBE_TIMEOUT_MS); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

async function timed(probe: string, fn: () => Promise<string | null>): Promise<Run> {
  const t0 = performance.now();
  try {
    const detail = await fn();
    return { probe, ms: Math.round(performance.now() - t0), ok: true, detail };
  } catch (e) {
    return { probe, ms: Math.round(performance.now() - t0), ok: false, detail: short(e) };
  }
}

Deno.serve(async (req) => {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || serviceKey;
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') || '';
  const auth = req.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const rest = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  // One connection for the whole run. Its first query (the secret check) also opens it, so the db probe
  // below times a warm round trip.
  const sql = dbUrl ? postgres(dbUrl, { max: 1, prepare: false, connect_timeout: PROBE_TIMEOUT_MS / 1000, idle_timeout: 2 }) : null;
  let warm = false;
  let warmErr: unknown = dbUrl ? null : new ProbeError('no SUPABASE_DB_URL');
  const tConnect = performance.now();
  let vaultOk = false;
  const needsVault = !!bearer && bearer !== serviceKey && !(cronSecret && bearer === cronSecret);
  if (sql) {
    try {
      const r = await withTimeout(sql`select public.health_probe_secret_ok(${needsVault ? bearer : null}) as ok`);
      warm = true;
      vaultOk = needsVault && r[0] && r[0].ok === true;
    } catch (e) { warmErr = e; }
  }
  const connectMs = Math.round(performance.now() - tConnect);
  if (needsVault && !warm) {
    try {
      const r = await rest('rpc/health_probe_secret_ok', { method: 'POST', body: JSON.stringify({ p_secret: bearer }) });
      vaultOk = r.ok && (await r.json()) === true;
    } catch (_e) { vaultOk = false; }
  }
  if (!(serviceKey && bearer === serviceKey) && !(cronSecret && bearer === cronSecret) && !vaultOk) {
    if (!bearer) console.error('[health-probe] refused: no Authorization header (is the Vault secret dosetrace_cron_secret missing?)');
    else console.error('[health-probe] refused: the Authorization header matches neither the Vault secret nor CRON_SECRET');
    if (sql) await sql.end({ timeout: 1 }).catch(() => {});
    return json({ error: 'unauthorized' }, 401);
  }

  const runs: Run[] = [];
  runs.push(await timed('rest', async () => {
    const r = await fetch(`${url}/rest/v1/dose_logs?select=id&user_id=eq.00000000-0000-0000-0000-000000000000&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const text = await r.text();
    if (!r.ok) throw new ProbeError(`http ${r.status}`);
    let rows: unknown = null;
    try { rows = JSON.parse(text); } catch (_e) { /* below */ }
    if (!Array.isArray(rows) || rows.length !== 0) throw new ProbeError('unexpected answer');
    return null;
  }));
  runs.push(await timed('auth', async () => {
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    await r.body?.cancel();
    if (!r.ok) throw new ProbeError(`http ${r.status}`);
    return null;
  }));
  if (sql && warm) {
    runs.push(await timed('db', async () => {
      await withTimeout(sql`select 1`);
      return `connect ${connectMs} ms`;
    }));
  } else {
    runs.push({ probe: 'db', ms: connectMs, ok: false, detail: `connect: ${short(warmErr)}` });
  }

  const now = new Date();
  let alerts: ReturnType<typeof plan> = [];
  try {
    if (sql && warm) {
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('dosetrace-health-probe'))`;
        await tx`insert into public.system_health_checks ${tx(runs.map((r) => ({ probe: r.probe, ms: r.ms, ok: r.ok, detail: r.detail })), 'probe', 'ms', 'ok', 'detail')}`;
        const recent: Record<string, Row[]> = {};
        const last: Record<string, string | null> = {};
        for (const p of PROBES) {
          const rows = await tx`select ok, ms from public.system_health_checks where probe = ${p} order by checked_at desc, id desc limit 2`;
          recent[p] = Array.from(rows, (x: Row) => ({ ok: x.ok, ms: x.ms }));
          const a = await tx`select kind from public.system_alerts where probe = ${p} order by id desc limit 1`;
          last[p] = a.length ? String(a[0].kind) : null;
        }
        alerts = plan(recent, last, now);
        if (alerts.length) await tx`insert into public.system_alerts ${tx(alerts, 'kind', 'probe', 'ms', 'message')}`;
      });
    } else {
      // The direct connection failed: write through PostgREST so the "db down" run (and its alert) is kept.
      const ins = await rest('system_health_checks', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(runs) });
      if (!ins.ok) throw new ProbeError(`checks insert http ${ins.status}`);
      const recent: Record<string, Row[]> = {};
      const last: Record<string, string | null> = {};
      for (const p of PROBES) {
        const r = await rest(`system_health_checks?select=ok,ms&probe=eq.${p}&order=checked_at.desc,id.desc&limit=2`);
        if (!r.ok) throw new ProbeError(`checks read http ${r.status}`);
        recent[p] = await r.json();
        const a = await rest(`system_alerts?select=kind&probe=eq.${p}&order=id.desc&limit=1`);
        if (!a.ok) throw new ProbeError(`alerts read http ${a.status}`);
        const rows = await a.json();
        last[p] = Array.isArray(rows) && rows.length ? String(rows[0].kind) : null;
      }
      alerts = plan(recent, last, now);
      if (alerts.length) {
        const w = await rest('system_alerts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(alerts) });
        if (!w.ok) throw new ProbeError(`alerts insert http ${w.status}`);
      }
    }
  } catch (e) {
    console.error('[health-probe] could not store the run:', short(e));
    if (sql) await sql.end({ timeout: 1 }).catch(() => {});
    return json({ ok: false, runs: runs.map((r) => ({ probe: r.probe, ms: r.ms, ok: r.ok })) }, 500);
  }
  if (sql) await sql.end({ timeout: 1 }).catch(() => {});
  return json({ ok: true, runs: runs.map((r) => ({ probe: r.probe, ms: r.ms, ok: r.ok })), alerts: alerts.map((a) => ({ kind: a.kind, probe: a.probe })) });
});
