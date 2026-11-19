'use strict';
// Food: the plan beside what was logged (docs/specs/food-plan-actual.md, founder 2026-11-18 20:40 EST
// "Pode construir o resto"; picture docs/design/food-goals-progress.html parts 1-3). The ONE math for the
// three places that show it — Progress › Your daily plan (today's bars + Plan and actual), the food chat
// after a log, and the food card on Today / Journey. Pure (node --test).
//
// Hard line (AI / Apple 1.4.1): numbers side by side only. Nothing here judges, recommends or explains a
// cause: "above" and "to go" are arithmetic, never "too much", "eat more" or "why".
const { macroTargets } = require('./energyCalc');
const { dayFoodTotal, shiftDay } = require('./foodThread');

// PA-5: "on plan" = within 10% either way, the margin of the AI estimates (picture part 1).
const ON_PLAN_BAND = 0.1;
// The chart's top is at least 1.5 x the plan (the picture's scale), and never below the highest day.
const CHART_HEADROOM = 1.5;
// What the food log totals (lib/nutrition dayTotals): calories, protein, carbs. Fat is stored per item but
// never totalled, and fiber has no target (FW-1), so neither gets a bar (spec, decided by logic).
const METRICS = [
  { key: 'kcal', field: 'kcal', unit: 'kcal' },
  { key: 'protein', field: 'protein_g', unit: 'g' },
  { key: 'carbs', field: 'carb_g', unit: 'g' },
];

const round10 = (n) => Math.round(n / 10) * 10;
const round5 = (n) => Math.round(n / 5) * 5;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// PA-1: the plan the Progress card shows for the chosen goal. goalKcal = the chosen goal's calories (the
// tile's mid, off the measured burn once a reality check exists — goalsForTdee), proteinG = the card's
// protein (energyPlan protein.rec, capped), weightKg = the plan's weight (for the fat floor). Rounded as the
// card prints them: calories to 10, grams to 5. Null without a calorie goal.
function planTargets({ goalKcal, proteinG, weightKg } = {}) {
  if (!(goalKcal > 0)) return null;
  const hasProtein = Number.isFinite(proteinG) && proteinG > 0;
  const m = hasProtein ? macroTargets({ targetCalories: goalKcal, weightKg, proteinG }) : null;
  const carbs = m ? round5(m.carbsG) : 0;
  return {
    kcal: round10(goalKcal),
    protein_g: hasProtein ? round5(proteinG) : null,
    carb_g: carbs > 0 ? carbs : null,
    fat_g: m ? round5(m.fatG) : null,
  };
}

// PA-2: today's bars. total = { kcal, protein_g, carb_g } (lib/foodThread dayFoodTotal) or null when nothing
// was logged (empty bars at 0). plan = planTargets() or null (then each row is only the number).
// → [{ key, unit, value, plan, fill (0..1, never past the plan), over, diff, state: 'to_go'|'above'|'at'|null }]
function todayBars(total, plan) {
  return METRICS.map((m) => {
    const value = total ? Math.round(num(total[m.field])) : 0;
    const target = plan && plan[m.field] > 0 ? plan[m.field] : null;
    if (target == null) return { key: m.key, unit: m.unit, value, plan: null, fill: 0, over: false, diff: null, state: null };
    const over = value > target;
    return {
      key: m.key, unit: m.unit, value, plan: target,
      fill: Math.max(0, Math.min(1, value / target)),
      over,
      diff: Math.abs(target - value),
      state: value === target ? 'at' : over ? 'above' : 'to_go',
    };
  });
}

// PA-3: a bar's text in two parts — "120 of 180 g" and the difference "60 g to go" / "20 g above" (null when
// equal, in the short form, or without a plan). t = the app's translator, fmt = the integer formatter of the
// app language, isOne(n) = the singular rule (lib/plural). short: the food card's "1,400 of 2,200 kcal".
function barParts(row, { t, fmt = String, isOne = (n) => n === 1, short = false } = {}) {
  const g = row.unit === 'g';
  if (row.plan == null) return { of: `${fmt(row.value)} ${g ? 'g' : t('cal_kcal')}`, diff: null, above: false };
  const of = t(g ? 'pa_of_g' : 'pa_of_kcal').replace('{v}', fmt(row.value)).replace('{p}', fmt(row.plan));
  if (short || row.state === 'at') return { of, diff: null, above: false };
  const base = row.state === 'above' ? (g ? 'pa_above_g' : 'pa_above_kcal') : (g ? 'pa_to_go_g' : 'pa_to_go_kcal');
  const key = isOne(row.diff) ? `${base}_one` : base;
  return { of, diff: t(key).replace('{n}', fmt(row.diff)), above: row.state === 'above' };
}
function barText(row, opts) {
  const p = barParts(row, opts);
  return p.diff ? `${p.of} · ${p.diff}` : p.of;
}

// A past day against the plan: within 10% either way = on plan.
function dayStatus(value, plan) {
  if (value == null) return 'none';
  if (value > plan * (1 + ON_PLAN_BAND)) return 'above';
  if (value < plan * (1 - ON_PLAN_BAND)) return 'below';
  return 'on';
}

// PA-6: one column, in the metric's own units — the part eaten up to the plan, the part above the plan
// (hatched) and the shortfall to the plan (dashed outline; not for today, whose day is not over).
function columnParts(value, plan, today = false) {
  if (value == null) return { fill: 0, over: 0, short: 0 };
  return {
    fill: Math.min(value, plan),
    over: value > plan ? value - plan : 0,
    short: !today && value < plan ? plan - value : 0,
  };
}

// PA-5: the last `days` local days (today and the ones before), one chart per metric with a target.
// rows = food_logs rows; plan = planTargets(); today's column is drawn but left out of the counts.
// → { days, dates, metrics: [{ key, unit, plan, top, cols: [{ date, today, value|null, status }], counts }] }
function planVsActual(rows, plan, todayISO, days = 14) {
  if (!plan || !todayISO) return null;
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(shiftDay(todayISO, -i));
  const totals = dates.map((d) => dayFoodTotal(rows, d));
  const metrics = METRICS.filter((m) => plan[m.field] > 0).map((m) => {
    const p = plan[m.field];
    const cols = dates.map((d, i) => {
      const value = totals[i] ? Math.round(num(totals[i][m.field])) : null;
      const today = d === todayISO;
      return { date: d, today, value, status: today ? (value == null ? 'none' : 'today') : dayStatus(value, p) };
    });
    const counts = { on: 0, above: 0, below: 0, n: 0 };
    for (const c of cols) {
      if (c.today || c.value == null) continue;
      counts.n++;
      counts[c.status]++;
    }
    const top = Math.max(p * CHART_HEADROOM, ...cols.map((c) => c.value || 0));
    return { key: m.key, unit: m.unit, plan: p, top, cols, counts };
  });
  return { days, dates, metrics };
}

// PA-7: the line under the entry just logged — "+50 g protein in your day". Null under 1 g.
function addedProtein(entry) {
  const g = Math.round(num(entry && entry.protein_g));
  return g >= 1 ? g : null;
}

module.exports = { ON_PLAN_BAND, CHART_HEADROOM, METRICS, planTargets, todayBars, barParts, barText, dayStatus, columnParts, planVsActual, addedProtein };
