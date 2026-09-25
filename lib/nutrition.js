// Pure nutrition-logger math — no React Native / Expo imports, so it runs under
// plain Node's test runner (CommonJS, like lib/schedule.js). All deterministic
// given their args. See docs/nutrition-logger-conversation-spec.md.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Sum a set of food_logs entries into a day total (Cal / Carbs / Protein — the
// three surfaced per the founder's decision; fat is stored but not totaled here).
function dayTotals(entries) {
  const t = { kcal: 0, protein_g: 0, carb_g: 0 };
  for (const e of entries || []) {
    t.kcal += num(e.kcal);
    t.protein_g += num(e.protein_g);
    t.carb_g += num(e.carb_g);
  }
  return { kcal: Math.round(t.kcal), protein_g: Math.round(t.protein_g), carb_g: Math.round(t.carb_g) };
}

// Average daily calories over the last `days` calendar days, counting only days
// that were actually logged (an unlogged day is unknown, not zero — counting it
// as 0 would understate intake and poison the reality-check). Returns null if no
// day in the window was logged. This is the value that feeds realityCheckTDEE's
// avgDailyCalories input, replacing the "recall 3 weeks from memory" field.
function rollingAvgKcal(entries, endDateISO, days = 7) {
  const end = new Date(endDateISO + 'T00:00:00');
  if (isNaN(end)) return null;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const byDay = {};
  for (const e of entries || []) {
    if (!e.entry_date) continue;
    const d = new Date(e.entry_date + 'T00:00:00');
    if (isNaN(d) || d < start || d > end) continue;
    byDay[e.entry_date] = (byDay[e.entry_date] || 0) + num(e.kcal);
  }
  const keys = Object.keys(byDay);
  if (!keys.length) return null;
  const sum = keys.reduce((a, k) => a + byDay[k], 0);
  return { avgKcal: Math.round(sum / keys.length), loggedDays: keys.length };
}

// Intake across a reality check (founder 2026-09-24: "what matters is the food
// intake during the time needed for the reality check — we won't track day by
// day"). Sums every entry dated from the check's start through today and divides
// by the SAME elapsed-day count the reality-check TDEE uses (daysBetween(start,
// today)), so a catch-up ("an ice cream 3 days ago") or three days logged in one
// go all land in the total. Anything not logged counts as nothing — the UI says so
// and shows its working. Returns null until the check has run minDays and has
// something logged.
// The window is the check's COMPLETED days — start through yesterday — the same
// span daysBetween(start, today) counts for the TDEE (today's weigh-in follows
// yesterday's food). includeToday: the logger's running view, which also shows
// today's food; its day count then includes today (pass elapsedDays + 1).
function checkIntake(entries, startISO, todayISO, elapsedDays, minDays = 5, includeToday = false) {
  if (!startISO || !todayISO || !(elapsedDays >= minDays)) return null;
  let total = 0, count = 0;
  for (const e of entries || []) {
    if (!e.entry_date || e.entry_date < startISO || e.entry_date > todayISO) continue;
    if (!includeToday && e.entry_date === todayISO) continue;
    total += num(e.kcal);
    count++;
  }
  if (!count || total <= 0) return null;
  // Coverage: how many of the window's days have any food logged — so a gap (a
  // day that silently counts as zero) is visible, never hidden in the average.
  const loggedDays = new Set((entries || []).filter((e) => e.entry_date && e.entry_date >= startISO && e.entry_date <= todayISO && (includeToday || e.entry_date !== todayISO) && num(e.kcal) > 0).map((e) => e.entry_date)).size;
  return { totalKcal: Math.round(total), days: elapsedDays, avgKcal: Math.round(total / elapsedDays), entries: count, loggedDays };
}

// Day key an entry belongs to: the day it was typed, moved back when the user
// said when they ate it ("3 days ago" → days_ago 3). Clamped to 0…365.
function entryDateFor(typedISO, daysAgo) {
  const n = Math.max(0, Math.min(365, Math.round(Number(daysAgo) || 0)));
  if (!n) return typedISO;
  const d = new Date(typedISO + 'T12:00:00');
  if (isNaN(d)) return typedISO;
  d.setDate(d.getDate() - n);
  const p = (v) => (v < 10 ? '0' + v : '' + v);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// One message can cover several days ("Monday pizza, Tuesday a salad"): split
// the parsed items into one entry per day eaten. An item's own days_ago wins,
// then the message-level one, else the day typed. Returns [{ entry_date, items,
// totals }] — totals include fat (stored, not shown).
function splitByDay(items, typedISO, topDaysAgo) {
  const groups = {};
  for (const it of items || []) {
    const d = entryDateFor(typedISO, it && it.days_ago != null ? it.days_ago : topDaysAgo);
    (groups[d] = groups[d] || []).push(it);
  }
  return Object.keys(groups).sort().map((entry_date) => {
    const its = groups[entry_date];
    const sum = (k) => Math.round(its.reduce((a, it) => a + num(it[k]), 0));
    return { entry_date, items: its, totals: { kcal: sum('kcal'), protein_g: sum('protein_g'), carb_g: sum('carb_g'), fat_g: sum('fat_g') } };
  });
}

// The gentle "capture the whole day" nudge: pick the next un-asked gap, one at a
// time, never a checklist. Time-aware — a meal already in the past is asked in
// past tense; one still ahead, forward. drinks/snacks are tense-neutral. Returns
// null once every gap has been offered (then the app stops nudging).
const NUDGE_ORDER = ['lunch', 'dinner', 'snacks', 'drinks'];
function pickNudge(shownIds, date) {
  const hour = (date instanceof Date ? date : new Date(date)).getHours();
  const shown = new Set(shownIds || []);
  for (const id of NUDGE_ORDER) {
    if (shown.has(id)) continue;
    let tense = 'neutral';
    if (id === 'lunch') tense = hour >= 14 ? 'past' : 'forward';
    else if (id === 'dinner') tense = hour >= 19 ? 'past' : 'forward';
    return { id, tense };
  }
  return null;
}

// Group food_logs entries into days, newest first, each with its own totals — for
// the day-grouped, collapse-by-day list.
function groupByDay(entries) {
  const map = {};
  for (const e of entries || []) {
    if (!e.entry_date) continue;
    (map[e.entry_date] = map[e.entry_date] || []).push(e);
  }
  return Object.keys(map)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => ({ date, entries: map[date], totals: dayTotals(map[date]) }));
}

module.exports = { dayTotals, rollingAvgKcal, checkIntake, entryDateFor, splitByDay, pickNudge, groupByDay, NUDGE_ORDER };
