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

module.exports = { dayTotals, rollingAvgKcal, pickNudge, NUDGE_ORDER };
