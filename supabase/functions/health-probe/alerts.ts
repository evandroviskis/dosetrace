// health-probe alert rules — pure, no I/O (docs/specs/admin-panel.md Phase 5, rows SA1–SA2; founder
// 2026-11-03 "alerta de lentidão … notificação no aplicativo do ADM", limit 1 s). The edge function
// (./index.ts) imports this file; the Node tests load the same file (__tests__/systemHealth.test.js).
//
// Per probe:
//   - a run is "healthy" (ok and <= 1000 ms), "slow" (ok and > 1000 ms) or "down" (failed or timed out);
//   - no episode open (no alert yet, or the last one was "recovered"): 2 consecutive non-healthy runs open
//     one — "down" when both failed, otherwise "slow";
//   - an open episode stays quiet (no spam) until 2 consecutive healthy runs → "recovered"; the one
//     exception: a "slow" episode whose last 2 runs both failed escalates once to "down";
//   - after "recovered" a new episode can open.

export const SLOW_MS = 1000;
export const PROBE_TIMEOUT_MS = 10000;
export const PROBES = ['rest', 'auth', 'db'];
export const TIME_ZONE = 'America/New_York';

export const PROBE_LABEL: Record<string, string> = {
  rest: 'A leitura de dados',
  auth: 'O login',
  db: 'O banco de dados',
};

export const ALERT_TITLE: Record<string, string> = {
  slow: 'DoseTrace: lentidão no sistema',
  down: 'DoseTrace: sistema fora do ar',
  recovered: 'DoseTrace: sistema normalizado',
};

export type Check = { ok: boolean; ms: number | null } | null | undefined;
export type Kind = 'slow' | 'down' | 'recovered';
export type Alert = { kind: Kind; probe: string; ms: number | null; message: string };

export function statusOf(c: Check): 'healthy' | 'slow' | 'down' {
  if (!c || !c.ok) return 'down';
  return Number(c.ms || 0) > SLOW_MS ? 'slow' : 'healthy';
}

// recent: this probe's runs, newest first (the run just written included). lastAlert: the kind of this
// probe's most recent alert, or null when it never had one.
export function decide(recent: Check[], lastAlert: string | null): Kind | null {
  if (!Array.isArray(recent) || recent.length < 2) return null;
  const a = statusOf(recent[0]);
  const b = statusOf(recent[1]);
  const open = lastAlert === 'slow' || lastAlert === 'down';
  if (!open) {
    if (a === 'down' && b === 'down') return 'down';
    if (a !== 'healthy' && b !== 'healthy') return 'slow';
    return null;
  }
  if (a === 'healthy' && b === 'healthy') return 'recovered';
  if (lastAlert === 'slow' && a === 'down' && b === 'down') return 'down';
  return null;
}

// "2,4" (one decimal, comma: the founder reads Portuguese).
export function seconds(ms: number | null): string {
  return (Math.max(0, Number(ms || 0)) / 1000).toFixed(1).replace('.', ',');
}

// "14:05" in New York (the founder's clock), 24 h.
export function clock(at: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

// The message is built from the newest run of the probe.
export function alertMessage(kind: Kind, probe: string, newest: Check, at: Date): string {
  const label = PROBE_LABEL[probe] || probe;
  const time = clock(at);
  if (kind === 'recovered') return `${label} voltou ao normal às ${time} (${seconds(newest ? newest.ms : null)} s).`;
  if (statusOf(newest) === 'down') return `${label} não respondeu às ${time}.` + (kind === 'down' ? ' Duas verificações seguidas falharam.' : '');
  return `${label} levou ${seconds(newest ? newest.ms : null)} s às ${time} (limite 1 s).`;
}

// recentByProbe: { probe: runs newest first }, lastByProbe: { probe: last alert kind | null }.
export function plan(recentByProbe: Record<string, Check[]>, lastByProbe: Record<string, string | null>, at: Date): Alert[] {
  const out: Alert[] = [];
  for (const probe of PROBES) {
    const recent = (recentByProbe && recentByProbe[probe]) || [];
    const kind = decide(recent, (lastByProbe && lastByProbe[probe]) || null);
    if (!kind) continue;
    const newest = recent[0];
    out.push({ kind, probe, ms: newest && newest.ms != null ? Math.round(Number(newest.ms)) : null, message: alertMessage(kind, probe, newest, at) });
  }
  return out;
}
