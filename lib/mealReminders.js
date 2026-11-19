'use strict';
// Food reminders at the person's own meal times (docs/specs/meal-reminders.md, food goals design
// part 4, founder 2026-11-17 / 2026-11-18 "Pode construir o resto"). Pure — no React Native, no
// database — so the rules run under `node --test`; lib/notifications.js turns the plan into
// scheduled notifications and supabase/functions/send-reminders/plan.ts mirrors the timing rules
// (parity: __tests__/serverPlanParity.test.js).
//
// Numbers only: the text repeats what the user logged and the plan the Progress card already
// shows. Never a judgement, never "eat more", never a food suggestion (AI hard line).

const { dayTotals, foodOnly } = require('./nutrition');
const { formatInt } = require('./localeFormat');
const { formatTime } = require('./timeFormat');
const { localISO } = require('./localDate');

const MEAL_PLANS = ['three', 'five', 'every3h', 'custom'];
const MEAL_KINDS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal'];
const MAX_MEALS = 8;         // "Choose the times": at most 8 meals a day (iPhone budget, MR-12)
const MEAL_DELAY_MIN = 60;   // MR-5: a reminder comes 1 hour after the meal time
const LAST_FIRE_MIN = 23 * 60 + 59; // a late meal's reminder stays on its own day (MR-5)
const DAY_MIN = 24 * 60;

// The design's starting times (part 4 a): breakfast 07:30, lunch 12:30, dinner 19:30; snacks
// 10:00 and 16:00; every 3 hours from 07 to 22.
const PRESETS = {
  three: [['07:30', 'breakfast'], ['12:30', 'lunch'], ['19:30', 'dinner']],
  five: [['07:30', 'breakfast'], ['10:00', 'snack'], ['12:30', 'lunch'], ['16:00', 'snack'], ['19:30', 'dinner']],
  every3h: [['07:00', 'meal'], ['10:00', 'meal'], ['13:00', 'meal'], ['16:00', 'meal'], ['19:00', 'meal'], ['22:00', 'meal']],
};

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (at) => { const m = HM.exec(String(at || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const pad2 = (n) => String(n).padStart(2, '0');
const fromMin = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

function presetMeals(plan) {
  const p = PRESETS[plan] || PRESETS.three;
  return p.map(([at, kind]) => ({ at, kind }));
}

// Clean list of meals: valid "HH:MM" only, one per time, in clock order, at most MAX_MEALS.
function cleanMeals(list) {
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const at = m && typeof m === 'object' ? m.at : m;
    if (toMin(at) == null || seen.has(at)) continue;
    seen.add(at);
    out.push({ at, kind: m && MEAL_KINDS.includes(m.kind) ? m.kind : 'meal' });
  }
  out.sort((a, b) => toMin(a.at) - toMin(b.at));
  return out.slice(0, MAX_MEALS);
}

// The stored choice (user_metadata.food_meals) → { plan, meals } or null. Null — nothing chosen,
// "Not now", or anything unreadable — keeps today's single 20:00 question (MR-3, MR-7).
function normalizeMeals(stored) {
  if (!stored || typeof stored !== 'object' || !MEAL_PLANS.includes(stored.plan)) return null;
  if (stored.plan !== 'custom') return { plan: stored.plan, meals: presetMeals(stored.plan) };
  const meals = cleanMeals(stored.meals);
  return meals.length ? { plan: 'custom', meals } : null;
}

// What is written to the account (MR-2): ONE top-level key, so the Supabase metadata merge keeps
// every other key (food_reminders, calc_inputs…). The whole choice is replaced, never a list
// computed from a stale read.
function mealChoicePayload(plan, meals, nowIso = new Date().toISOString()) {
  const n = normalizeMeals({ plan, meals });
  if (!n) return null;
  return { food_meals: { plan: n.plan, meals: n.meals, at: nowIso } };
}

// MR-5: minutes after midnight the reminder of a meal fires.
function mealFireMin(at) {
  const m = toMin(at);
  return m == null ? null : Math.min(m + MEAL_DELAY_MIN, LAST_FIRE_MIN);
}

// MR-6: food logged for the day from halfway between the previous meal and this one silences this
// meal's reminder. The first meal's "previous" is the day's last meal of the night before (so a
// breakfast logged at 06:50 counts, a dinner logged at 20:45 does not count for lunch). Halfway,
// not "since the previous meal": a breakfast logged at 08:45, after its own reminder, must not
// silence lunch.
function mealWindowStartMin(meals, i) {
  const mins = (meals || []).map((m) => toMin(m.at));
  if (i < 0 || i >= mins.length) return null;
  const prev = i === 0 ? mins[mins.length - 1] - DAY_MIN : mins[i - 1];
  return Math.max(0, Math.floor((prev + mins[i]) / 2));
}

const createdLocal = (e) => {
  const d = e && e.created_at ? new Date(e.created_at) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
};

// True when a real food entry for dayKey was typed on that day at or after the meal's window start.
function loggedForMeal(entries, dayKey, meals, i) {
  const start = mealWindowStartMin(meals, i);
  if (start == null) return false;
  for (const e of foodOnly(entries)) {
    if (String(e.entry_date || '').slice(0, 10) !== dayKey) continue;
    const d = createdLocal(e);
    if (!d || localISO(d) !== dayKey) continue;
    if (d.getHours() * 60 + d.getMinutes() >= start) return true;
  }
  return false;
}

const keyDate = (dayKey) => { const [y, m, d] = String(dayKey).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

// The ids: the day's LAST meal keeps the old 20:00 id (food-log-<day>, MR-7) — the "anything else
// today?" role, the id the close-day path cancels; the others carry their time.
function mealReminderId(dayKey, meal, last) {
  return last ? `food-log-${dayKey}` : `food-log-${dayKey}-${String(meal.at).replace(':', '')}`;
}

// The reminders to schedule. days: the food days still open (foodNudgeDays → remindersForAccess:
// closed days and locked days already out). horizonMs (MR-12): meal reminders other than the day's
// last are scheduled only that far ahead (iPhone: 24 h; Android: the whole window). Today's are
// left out once food was logged in their window (MR-6).
//   → [{ id, dayKey, fireMs, index, meal, last, prev }]
function mealReminderPlan({ meals, days, todayKey, nowMs, entries = [], horizonMs = Infinity }) {
  const list = cleanMeals(meals);
  if (!list.length) return [];
  const out = [];
  for (const dayKey of days || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) continue;
    for (let i = 0; i < list.length; i++) {
      const fire = keyDate(dayKey);
      const fm = mealFireMin(list[i].at);
      fire.setHours(Math.floor(fm / 60), fm % 60, 0, 0);
      const fireMs = fire.getTime();
      if (fireMs <= nowMs) continue;
      const last = i === list.length - 1;
      if (!last && fireMs - nowMs > horizonMs) continue;
      if (dayKey === todayKey && loggedForMeal(entries, dayKey, list, i)) continue;
      out.push({ id: mealReminderId(dayKey, list[i], last), dayKey, fireMs, index: i, meal: list[i], last, prev: i > 0 ? list[i - 1] : null });
    }
  }
  return out;
}

// MR-12: the most pending food notifications this plan can hold on an iPhone — the last reminder
// of each of the 7 days, plus each other meal once inside the next 24 hours. No choice: 7 (20:00).
function iosFoodPendingMax(meals, windowDays = 7) {
  const n = cleanMeals(meals).length;
  return n ? windowDays + (n - 1) : windowDays;
}

// ── Text (MR-9) ──────────────────────────────────────────────────────────────
const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : '')).replace(/\s{2,}/g, ' ').trim();
const NAMED = new Set(['breakfast', 'lunch', 'dinner']);

// The day's totals so far (real food of that day only; markers carry none).
function mealDayTotals(entries, dayKey) {
  return dayTotals(foodOnly(entries).filter((e) => String(e.entry_date || '').slice(0, 10) === dayKey));
}

// "Today so far: protein 45 of 180 g · calories 650 of 2,200." — or without a plan
// "protein 45 g · calories 650". Nothing logged yet: no line (zeros say nothing).
function soFarLine(t, language, totals, plan) {
  const tt = totals || {};
  if (!(tt.kcal > 0) && !(tt.protein_g > 0)) return '';
  const p = plan || {};
  const n = (v) => formatInt(v, language);
  const protein = p.proteinG > 0
    ? fill(t('notif_meal_protein_of'), { v: n(tt.protein_g || 0), plan: n(p.proteinG) })
    : fill(t('notif_meal_protein'), { v: n(tt.protein_g || 0) });
  const kcal = p.kcal > 0
    ? fill(t('notif_meal_kcal_of'), { v: n(tt.kcal || 0), plan: n(p.kcal) })
    : fill(t('notif_meal_kcal'), { v: n(tt.kcal || 0) });
  return fill(t('notif_meal_so_far'), { protein, calories: kcal });
}

// The notification of one meal: { title, body, category }. The last of the day keeps the evening
// question's buttons (Log · Nothing else today); the others add "Skip this meal" (MR-7).
function mealReminderContent({ t, language = 'en', timeFormat = 'auto', item, totals, plan }) {
  const meal = (item && item.meal) || {};
  const kind = NAMED.has(meal.kind) ? meal.kind : 'any';
  const time = formatTime(meal.at, language, timeFormat);
  const title = kind === 'any' ? fill(t('notif_meal_title_at'), { time }) : t(`notif_meal_title_${kind}`);
  const since = kind === 'lunch' && item && item.prev && item.prev.kind === 'breakfast';
  const ask = t(since ? 'notif_meal_body_lunch_since' : `notif_meal_body_${kind}`);
  const line = soFarLine(t, language, totals, plan);
  return { title, body: line ? `${ask} ${line}` : ask, category: item && item.last ? 'food-evening' : 'food-meal' };
}

// The chat's first question when "Log" opens it from a meal reminder (MR-11).
function mealChatAsk(t, meal, language = 'en', timeFormat = 'auto') {
  const m = meal || {};
  if (NAMED.has(m.kind)) return t(`nutri_meal_ask_${m.kind}`);
  return fill(t('nutri_meal_ask_at'), { time: formatTime(m.at, language, timeFormat) });
}

// A meal from a notification's data (an Android push hands a string over): { at, kind } or null.
function mealFromData(data) {
  const m = data && data.meal;
  if (!m || typeof m !== 'object' || toMin(m.at) == null) return null;
  return { at: m.at, kind: MEAL_KINDS.includes(m.kind) ? m.kind : 'meal' };
}

// The next time for "+ Add a meal": 3 hours after the latest, kept on the clock (≤ 22:00), else
// the first free half hour from 06:00.
function nextMealTime(meals) {
  const list = cleanMeals(meals);
  const used = new Set(list.map((m) => m.at));
  const lastMin = list.length ? toMin(list[list.length - 1].at) : null;
  const cand = lastMin == null ? 12 * 60 : Math.min(lastMin + 180, 22 * 60);
  if (!used.has(fromMin(cand))) return fromMin(cand);
  for (let m = 6 * 60; m < DAY_MIN; m += 30) if (!used.has(fromMin(m))) return fromMin(m);
  return null;
}

module.exports = {
  MEAL_PLANS, MEAL_KINDS, MAX_MEALS, MEAL_DELAY_MIN, PRESETS,
  presetMeals, cleanMeals, normalizeMeals, mealChoicePayload, mealFireMin, mealWindowStartMin, loggedForMeal,
  mealReminderId, mealReminderPlan, iosFoodPendingMax, mealDayTotals, soFarLine, mealReminderContent, mealChatAsk,
  mealFromData, nextMealTime,
};
