'use strict';
// Recent meals and the goodbye of the food chat (docs/specs/food-log-recent-receipt.md FR-1..FR-7,
// FR-12; founder 2026-11-26, pictures docs/design/refeicoes-recentes.html v2 and
// docs/design/registro-comida-visual.html option A). Pure — no React Native, no database — so the
// rules run under `node --test`.
//
// The row of recent meals is built from the food_logs rows already stored (no new table). One tap
// copies a past meal as a NEW entry, already read ('done'), so it never goes to the AI: same numbers
// as last time, no daily read used, works offline. Names only on the chips; never a judgement about
// the food, never "you usually eat X" (AI hard line).

const { foodOnly, itemLabel, itemTotals, needsEstimateFlag, cleanUnit } = require('./nutrition');
const { safeItems, typedAt, shiftDay } = require('./foodThread');
const { mealReminderPlan, cleanMeals } = require('./mealReminders');
const { remindersForAccess } = require('./notificationPlan');
const { localISO } = require('./localDate');

const RECENT_DAYS = 30;   // FR-1: meals from the last 30 days
const RECENT_MAX = 10;    // FR-1: at most 10 chips
const NEAR_MIN = 120;     // FR-2: "near the current time" = within 2 hours of the clock, on an earlier day
const DAY_MIN = 24 * 60;

// FR-3: two meals are the same when they have the same items and quantities (order, case and spaces
// do not matter).
function mealKey(items) {
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
  const qty = (q) => { const n = Number(q); return q == null || q === '' || !Number.isFinite(n) ? '' : String(Math.round(n * 1000) / 1000); };
  return (items || []).filter((it) => it && it.food)
    .map((it) => `${norm(it.food)}|${qty(it.qty)}|${norm(cleanUnit(it.unit))}`)
    .sort()
    .join('§');
}

// FR-3: a chip names the meal the way a person says it ("2 ovos, bacon, 2 torradas"): a count is a
// plain number before the food and a single item has no number; a measure stays ("150 g de frango").
function chipLabel(it, language, raw) {
  const label = itemLabel(it, language, raw);
  const m = /^(\S+) × (.+)$/.exec(label);
  if (!m) return label;
  return m[1] === '1' ? m[2] : `${m[1]} ${m[2]}`;
}

const minuteOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const clockGap = (a, b) => { const g = Math.abs(a - b) % DAY_MIN; return Math.min(g, DAY_MIN - g); };
const localDay = (ms) => localISO(new Date(ms));

// FR-1..FR-3, FR-7: [{ key, label, items, rowId, lastAt }] — up to 10 distinct meals read ('done',
// kcal > 0) in the last 30 days, never a deleted row. Order (FR-2): first the meals logged near this
// time of day on earlier days, then the rest, most recent first. Each chip repeats its newest copy.
function recentMeals(rows, { todayISO, now = new Date(), language = 'en' } = {}) {
  const from = todayISO ? shiftDay(todayISO, -(RECENT_DAYS - 1)) : null;
  const nowMin = minuteOfDay(now instanceof Date ? now.getTime() : now);
  const byKey = new Map();
  for (const r of foodOnly(rows)) {
    if (r.sync_status === 'deleted' || r.parse_status !== 'done' || !(Number(r.kcal) > 0)) continue;
    if (from && (!r.entry_date || r.entry_date < from || r.entry_date > todayISO)) continue;
    const items = safeItems(r.parsed_items).filter((it) => it && it.food);
    if (!items.length) continue;
    const key = mealKey(items);
    const t = typedAt(r);
    const near = !!t && localDay(t) < todayISO && clockGap(minuteOfDay(t), nowMin) <= NEAR_MIN;
    const cur = byKey.get(key);
    const newer = !cur || t > cur.lastAt || (t === cur.lastAt && (r.id || 0) > (cur.rowId || 0));
    if (newer) byKey.set(key, { key, items, raw: r.raw_text || '', rowId: r.id, lastAt: t, near: (cur && cur.near) || near });
    else if (near) cur.near = true;
  }
  const list = [...byKey.values()];
  const recent = (a, b) => (b.lastAt - a.lastAt) || ((b.rowId || 0) - (a.rowId || 0));
  const ordered = [...list.filter((m) => m.near).sort(recent), ...list.filter((m) => !m.near).sort(recent)];
  return ordered.slice(0, RECENT_MAX).map(({ key, items, raw, rowId, lastAt }) => ({
    key, rowId, lastAt, items,
    label: items.map((it) => chipLabel(it, language, raw)).join(', '),
  }));
}

// FR-4: the copy keeps only the item values; never the old message id, question, offline answer,
// days back or typed text. An estimate the user never fixed stays an estimate (FL-9/27).
const COPY = ['food', 'qty', 'unit', 'kcal', 'carb_g', 'protein_g', 'fat_g', 'fiber_g', 'confidence'];
function copyItem(it, msgId) {
  const out = {};
  for (const k of COPY) if (it && it[k] !== undefined) out[k] = it[k];
  if (needsEstimateFlag(it) && out.confidence !== 'low') out.asked = true;
  out.msg = msgId;
  return out;
}

// FR-4: the food_logs row a tap inserts — on the chat's day, already read, its own message.
function repeatEntry(meal, { userId, day, msgId }) {
  const items = (meal && meal.items ? meal.items : []).map((it) => copyItem(it, msgId));
  const tot = itemTotals(items);
  return {
    user_id: userId, entry_date: day, raw_text: (meal && meal.label) || '',
    parsed_items: JSON.stringify(items), kcal: tot.kcal, protein_g: tot.protein_g, carb_g: tot.carb_g, fat_g: tot.fat_g,
    source: 'ai', parse_status: 'done',
  };
}

// FR-7: a tap logs only while the food log is open (Premium, the 7 free days, the grace week) —
// the same foodLogAccess answer typing uses.
const canRepeat = (access) => !!(access && access.canLog);

// FR-12: after an entry the app says goodbye; it promises to ask about the next meal ONLY when that
// meal's reminder is really on today (reminders on in Settings, meal times chosen, a reality check
// open, logging open, the day not closed, the reminder still ahead and not silenced by food already
// logged in its window, MR-6). → { kind, at: 'HH:MM' (when it comes), fireMs } or null.
function goodbyeFor({ todayISO, entryDay, nowMs, meals, remindersOn, checkOpen, access, closed, entries } = {}) {
  if (!todayISO || entryDay !== todayISO) return null;
  if (!remindersOn || !checkOpen || closed) return null;
  const list = cleanMeals(meals);
  if (!list.length) return null;
  const days = remindersForAccess([todayISO], access);
  if (!days.length) return null;
  const plan = mealReminderPlan({ meals: list, days, todayKey: todayISO, nowMs, entries: entries || [] });
  const next = plan.find((p) => p.dayKey === todayISO);
  if (!next) return null;
  const d = new Date(next.fireMs);
  return { kind: next.meal.kind, at: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, fireMs: next.fireMs };
}

module.exports = { RECENT_DAYS, RECENT_MAX, NEAR_MIN, mealKey, recentMeals, copyItem, repeatEntry, canRepeat, goodbyeFor };
