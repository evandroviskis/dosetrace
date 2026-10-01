// Server-side port of lib/notificationPlan.js — pure, tz-aware planning for the
// scheduled push sender. Kept intentionally identical in logic to the client so a
// device that switches to server push gets the SAME reminders it scheduled locally.
//
// All "day keys" are local-wall-clock "YYYY-MM-DD" in the user's timezone. The
// server computes them from a UTC instant + an IANA zone via Intl, so a 7am fire
// means 7am where the USER is, not on the server.

export interface Protocol {
  id: string;
  name?: string | null;
  dose?: string | number | null;
  dose_unit?: string | null;
  reminder_time?: string | null; // comma-separated "HH:MM"
  interval_days?: number | null;
  schedule_total?: number | null;
  start_date?: string | null; // "YYYY-MM-DD"
}

function pad2(n: number): string { return n < 10 ? '0' + n : '' + n; }

// Local wall-clock parts of a UTC instant in a given IANA zone.
export function localParts(instant: Date, tz: string): { key: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // some ICU builds emit "24" for midnight
  return {
    key: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: parseInt(get('minute'), 10),
  };
}

function parseYmd(key: string): Date {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); // UTC math — day keys are opaque strings
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function dayDiff(aKey: string, bKey: string): number {
  return Math.round((parseYmd(bKey).getTime() - parseYmd(aKey).getTime()) / 86400000);
}

// Due-dose day keys for one protocol within [fromKey, fromKey + horizonDays).
export function dueDateKeys(protocol: Protocol, fromKey: string, horizonDays: number): string[] {
  const interval = Math.max(1, protocol.interval_days || 1);
  const total = protocol.schedule_total || 0; // 0 / null = open-ended
  const start = parseYmd(protocol.start_date || fromKey);
  const from = parseYmd(fromKey);
  const end = addDays(from, horizonDays); // exclusive

  const keys: string[] = [];
  const cursor = new Date(start);
  let idx = 0;
  let guard = 0;
  while (cursor < end && guard++ < 4000) {
    if (total && idx >= total) break;
    if (cursor >= from) keys.push(ymd(cursor));
    idx++;
    cursor.setUTCDate(cursor.getUTCDate() + interval);
  }
  return keys;
}

// Reminder-time slots for a protocol as {hour, minute}, defaulting to 08:00.
export function reminderSlots(protocol: Protocol): { hour: number; minute: number }[] {
  const raw = protocol.reminder_time;
  if (!raw) return [{ hour: 8, minute: 0 }];
  return String(raw).split(',').filter(Boolean).map((t) => {
    const [h, m] = t.split(':').map(Number);
    return { hour: Number.isFinite(h) ? h : 8, minute: Number.isFinite(m) ? m : 0 };
  });
}

// Port of lib/notificationPlan.js foodNudgeDays — keep the two identical (parity test
// __tests__/serverPlanParity.test.js). FL-18/42: while the reality check is OPEN, once a
// day at 20:00, unless the user closed that local day. No day-21 cut-off, no backoff.
export function foodNudgeDays(
  startKey: string, todayKey: string, closedKeys: Set<string> | string[] | null, windowDays: number,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startKey)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayKey))) return [];
  const closed = closedKeys instanceof Set ? closedKeys : new Set(closedKeys || []);
  const firstKey = todayKey < startKey ? startKey : todayKey;
  const out: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = ymd(addDays(parseYmd(firstKey), i));
    if (closed.has(d)) continue;
    out.push(d);
  }
  return out;
}

// Port of lib/notificationPlan.js remindersForAccess (FL-41): none for a locked user,
// and not past the last day logging stays open (end of free days / grace week).
export function remindersForAccess(days: string[], access: { canLog?: boolean; until?: string | null; mode?: string } | null): string[] {
  if (!access || !access.canLog) return [];
  if (!access.until || access.mode === 'premium') return days;
  return (days || []).filter((d) => d <= (access.until as string));
}

export type MorningPlan =
  | { dateKey: string; kind: 'due'; list: string[] }
  | { dateKey: string; kind: 'next'; days: number }
  | { dateKey: string; kind: 'next1' }
  | { dateKey: string; kind: 'none' };

// Per-day morning-summary plan (mirror of the client's morningSummaryPlan).
export function morningSummaryPlan(
  protocols: Protocol[], todayKey: string, windowDays: number, horizonDays: number,
): MorningPlan[] {
  const dueByDay = new Map<string, string[]>();
  for (const p of (protocols || [])) {
    for (const k of dueDateKeys(p, todayKey, horizonDays)) {
      if (!dueByDay.has(k)) dueByDay.set(k, []);
      dueByDay.get(k)!.push(p.name || '');
    }
  }
  const allDueKeys = [...dueByDay.keys()].sort();

  const plans: MorningPlan[] = [];
  for (let i = 0; i < windowDays; i++) {
    const dayKey = ymd(addDays(parseYmd(todayKey), i));
    const names = dueByDay.get(dayKey);
    if (names && names.length) {
      plans.push({ dateKey: dayKey, kind: 'due', list: names.filter(Boolean) });
      continue;
    }
    const next = allDueKeys.find((k) => k > dayKey);
    if (!next) {
      plans.push({ dateKey: dayKey, kind: 'none' });
    } else {
      const days = dayDiff(dayKey, next);
      plans.push(days === 1 ? { dateKey: dayKey, kind: 'next1' } : { dateKey: dayKey, kind: 'next', days });
    }
  }
  return plans;
}
