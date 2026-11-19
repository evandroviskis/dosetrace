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

// Reminder-time slots for a protocol as {hour, minute}. No time set → no reminder ([]), never a
// time the app picked (founder 2026-11-04, manual-form-no-default-time MF-17); same as the app.
export function reminderSlots(protocol: Protocol): { hour: number; minute: number; invalid?: boolean }[] {
  const raw = protocol.reminder_time;
  if (!raw) return [];
  return String(raw).split(',').filter(Boolean).map((t) => {
    const [h, m] = t.split(':').map((x) => (String(x).trim() === '' ? NaN : Number(x)));
    const hour = h, minute = Number.isFinite(m) ? m : 0;
    // Same as the app (lib/notificationPlan reminderTimes): a time off the clock is marked, never sent.
    const ok = Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59;
    return ok ? { hour, minute } : { hour, minute, invalid: true };
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

// ── Meal reminders (docs/specs/meal-reminders.md MR-14) ─────────────────────────
// Port of lib/mealReminders.js: the same choices, the same 1-hour delay, the same "logged since
// halfway from the previous meal" rule and the same text — parity in __tests__/serverPlanParity.test.js.
// The server computes the day's totals at SEND time from food_logs (exact); it has no plan engine,
// so its text carries the totals without "of <plan>" (the app's local text carries the plan).
export interface Meal { at: string; kind: string }
const MEAL_PLANS = ['three', 'five', 'every3h', 'custom'];
const MEAL_KINDS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal'];
const MAX_MEALS = 8;
const MEAL_DELAY_MIN = 60;
const LAST_FIRE_MIN = 23 * 60 + 59;
const DAY_MIN = 24 * 60;
const PRESETS: Record<string, [string, string][]> = {
  three: [['07:30', 'breakfast'], ['12:30', 'lunch'], ['19:30', 'dinner']],
  five: [['07:30', 'breakfast'], ['10:00', 'snack'], ['12:30', 'lunch'], ['16:00', 'snack'], ['19:30', 'dinner']],
  every3h: [['07:00', 'meal'], ['10:00', 'meal'], ['13:00', 'meal'], ['16:00', 'meal'], ['19:00', 'meal'], ['22:00', 'meal']],
};
const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
function toMin(at: unknown): number | null {
  const m = HM.exec(String(at || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function cleanMeals(list: unknown): Meal[] {
  const seen = new Set<string>();
  const out: Meal[] = [];
  for (const m of Array.isArray(list) ? list : []) {
    const at = m && typeof m === 'object' ? (m as { at?: string }).at : m;
    if (toMin(at) == null || seen.has(String(at))) continue;
    seen.add(String(at));
    const kind = m && typeof m === 'object' && MEAL_KINDS.includes((m as { kind?: string }).kind as string) ? (m as { kind: string }).kind : 'meal';
    out.push({ at: String(at), kind });
  }
  out.sort((a, b) => (toMin(a.at) as number) - (toMin(b.at) as number));
  return out.slice(0, MAX_MEALS);
}
export function normalizeMeals(stored: unknown): { plan: string; meals: Meal[] } | null {
  if (!stored || typeof stored !== 'object') return null;
  const plan = (stored as { plan?: string }).plan as string;
  if (!MEAL_PLANS.includes(plan)) return null;
  if (plan !== 'custom') return { plan, meals: PRESETS[plan].map(([at, kind]) => ({ at, kind })) };
  const meals = cleanMeals((stored as { meals?: unknown }).meals);
  return meals.length ? { plan, meals } : null;
}
export function mealFireMin(at: string): number | null {
  const m = toMin(at);
  return m == null ? null : Math.min(m + MEAL_DELAY_MIN, LAST_FIRE_MIN);
}
export function mealWindowStartMin(meals: Meal[], i: number): number | null {
  const mins = (meals || []).map((m) => toMin(m.at) as number);
  if (i < 0 || i >= mins.length) return null;
  const prev = i === 0 ? mins[mins.length - 1] - DAY_MIN : mins[i - 1];
  return Math.max(0, Math.floor((prev + mins[i]) / 2));
}
// logged: the day's real food rows as the user's local { key (created day), minute (created) , entryKey }.
export function loggedForMeal(logged: { entryKey: string; key: string; minute: number }[], dayKey: string, meals: Meal[], i: number): boolean {
  const start = mealWindowStartMin(meals, i);
  if (start == null) return false;
  return (logged || []).some((r) => r.entryKey === dayKey && r.key === dayKey && r.minute >= start);
}
// The meals whose reminder falls in this run's window [nowMin - runWindowMin, nowMin].
export function mealsDueNow(meals: Meal[], nowMin: number, runWindowMin: number): number[] {
  const out: number[] = [];
  (meals || []).forEach((m, i) => {
    const f = mealFireMin(m.at);
    if (f != null && f <= nowMin && f > nowMin - runWindowMin) out.push(i);
  });
  return out;
}
function fillVars(str: string, vars: Record<string, unknown>): string {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '')).replace(/\s{2,}/g, ' ').trim();
}
// lib/localeFormat formatInt: no-break space in French; Spanish and Italian leave 4 digits ungrouped.
const GROUP: Record<string, string> = { en: ',', es: '.', pt: '.', fr: ' ', de: '.', it: '.' };
const MIN_GROUPED: Record<string, number> = { es: 10000, it: 10000 };
function intText(v: number, lang: string): string {
  const s = String(Math.round(Math.abs(v)));
  if (s.length < 4 || Number(s) < (MIN_GROUPED[lang] || 1000)) return (v < 0 ? '-' : '') + s;
  return (v < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[lang] || ',');
}
// The meal's clock time as the app shows it by default (lib/timeFormat 'auto'): "4:00 PM" in English,
// "16:00" / "7:00" (hour not padded) otherwise.
export function mealTimeLabel(at: string, lang: string): string {
  const m = toMin(at);
  if (m == null) return '—';
  const h = Math.floor(m / 60), mm = pad2(m % 60);
  if (lang !== 'en') return `${h}:${mm}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
export function mealPushContent(t: (k: string) => string, lang: string, meals: Meal[], i: number, totals: { kcal: number; protein_g: number }): { title: string; body: string; category: string } {
  const meal = meals[i];
  const named = ['breakfast', 'lunch', 'dinner'].includes(meal.kind);
  const kind = named ? meal.kind : 'any';
  const title = kind === 'any' ? fillVars(t('notif_meal_title_at'), { time: mealTimeLabel(meal.at, lang) }) : t(`notif_meal_title_${kind}`);
  const since = kind === 'lunch' && i > 0 && meals[i - 1].kind === 'breakfast';
  const ask = t(since ? 'notif_meal_body_lunch_since' : `notif_meal_body_${kind}`);
  let line = '';
  if ((totals && totals.kcal > 0) || (totals && totals.protein_g > 0)) {
    const protein = fillVars(t('notif_meal_protein'), { v: intText(totals.protein_g || 0, lang) });
    const calories = fillVars(t('notif_meal_kcal'), { v: intText(totals.kcal || 0, lang) });
    line = fillVars(t('notif_meal_so_far'), { protein, calories });
  }
  return { title, body: line ? `${ask} ${line}` : ask, category: i === meals.length - 1 ? 'food-evening' : 'food-meal' };
}
