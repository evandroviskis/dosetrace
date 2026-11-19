'use strict';
// Food: the plan beside what was logged (docs/specs/food-plan-actual.md, founder 2026-11-18 20:40 EST
// "Pode construir o resto"; picture docs/design/food-goals-progress.html parts 1, 2 and 3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PA = require('../lib/planActual');
const { progressTile } = require('../lib/progressTile');
const { energyPlan, goalsForTdee, macroTargets } = require('../lib/energyCalc');
const { activitySource } = require('../lib/activityLevels');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function loadTr() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = loadTr();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (l) => (k) => (tr[l][k] != null ? tr[l][k] : k);
const fmtEn = (n) => Number(n).toLocaleString('en-US');

// A food_logs row as the chat stores it ('done' = read by the AI).
const food = (date, kcal, protein, carbs, extra = {}) => ({ id: `${date}-${kcal}-${protein}`, entry_date: date, parse_status: 'done', kcal, protein_g: protein, carb_g: carbs, parsed_items: [], ...extra });
const PLAN = { kcal: 2200, protein_g: 180, carb_g: 250, fat_g: 60 };

// The saved inputs of a filled Progress card (as the existing progressTile tests use them).
const saved = { unit: 'metric', weight: '90', height: '180', bfSource: 'unknown', bodyFat: '', goal: 'lose', activity: 1.55 };
const meta = { gender: 'male', birth_year: 1985 };
const now = new Date(2026, 10, 18, 12);

test('PA-1: planTargets is the Progress card plan — goal calories to 10, protein to 5, carbs from that goal to 5', () => {
  const p = PA.planTargets({ goalKcal: 2194, proteinG: 181.2, weightKg: 90 });
  assert.equal(p.kcal, 2190);
  assert.equal(p.protein_g, 180);
  const m = macroTargets({ targetCalories: 2194, weightKg: 90, proteinG: 181.2 });
  assert.equal(p.carb_g, Math.round(m.carbsG / 5) * 5);
  assert.equal(p.fat_g, Math.round(m.fatG / 5) * 5);
  assert.equal(PA.planTargets({ goalKcal: 0, proteinG: 150 }), null, 'no calorie goal, no plan');
  assert.equal(PA.planTargets({ goalKcal: 2000, proteinG: null }).protein_g, null, 'no protein, no protein target');
  // The tile carries the same plan: off the formula for the chosen goal …
  const tile = progressTile({ saved, meta, snapshots: [], checks: [], now });
  const plan = energyPlan({ weightKg: 90, heightCm: 180, age: 41, sex: 'male', bodyFatPct: null, activity: activitySource({ meta, saved }).multiplier || 1.375, goal: 'lose' });
  assert.deepEqual(tile.plan, PA.planTargets({ goalKcal: plan.allGoals.lose.mid, proteinG: plan.protein.rec, weightKg: 90 }));
  assert.equal(tile.planKcal, tile.plan.kcal);
  // … and off the measured burn once a reality check exists (the tile the card shows).
  const measured = progressTile({ saved, meta, snapshots: [], checks: [{ entry_date: '2026-11-10', tdee: 2600 }], now });
  const g = goalsForTdee(2600, { bmr: plan.bmr, sex: 'male' });
  assert.deepEqual(measured.plan, PA.planTargets({ goalKcal: g.lose.mid, proteinG: plan.protein.rec, weightKg: 90 }));
  // The goal follows the saved choice.
  const gain = progressTile({ saved: { ...saved, goal: 'gain' }, meta, snapshots: [], checks: [], now });
  assert.ok(gain.plan.kcal > tile.plan.kcal);
  // No fat or fiber bar: the food log totals only calories, protein and carbs.
  assert.deepEqual(PA.METRICS.map((m) => m.field), ['kcal', 'protein_g', 'carb_g']);
  // The Progress card's chip reads the same plan (not the formula goal when a check measured the burn).
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /const planNow = useMemo\(\(\) => \(plan \? planTargets\(\{ goalKcal: \(\(effectiveGoals \|\| plan\.allGoals\)\[goal\] \|\| plan\.target\)\.mid, proteinG: plan\.protein \? plan\.protein\.rec : null, weightKg: metric\.weightKg \}\) : null\), \[plan, effectiveGoals, goal, metric\]\);/);
  assert.match(calc, /\{planNow && planNow\.fat_g != null && \(/);
  assert.match(calc, /\{t\('cal_fat_g'\)\} ≈ \{fmtInt\(planNow\.fat_g\)\} g · \{t\('cal_carbs_g'\)\} ≈ \{fmtInt\(planNow\.carb_g \|\| 0\)\} g/);
  assert.doesNotMatch(calc, /plan\.macros\.carbsG/, 'the formula-only carbs are gone from the card');
});

test('PA-2: todayBars — of the plan, filled up to the plan, over flagged, numbers only without a target', () => {
  const rows = PA.todayBars({ kcal: 1650, protein_g: 120, carb_g: 270 }, PLAN);
  assert.deepEqual(rows.map((r) => r.key), ['kcal', 'protein', 'carbs']);
  assert.deepEqual(rows[0], { key: 'kcal', unit: 'kcal', value: 1650, plan: 2200, fill: 0.75, over: false, diff: 550, state: 'to_go' });
  assert.equal(rows[1].diff, 60);
  assert.equal(rows[2].over, true);
  assert.equal(rows[2].fill, 1, 'never past the plan');
  assert.equal(rows[2].diff, 20);
  assert.equal(rows[2].state, 'above');
  assert.equal(PA.todayBars({ kcal: 2200, protein_g: 0, carb_g: 0 }, PLAN)[0].state, 'at');
  // Nothing logged today: empty bars at 0.
  const empty = PA.todayBars(null, PLAN);
  assert.deepEqual(empty.map((r) => [r.value, r.fill, r.diff]), [[0, 0, 2200], [0, 0, 180], [0, 0, 250]]);
  // No plan: only the numbers.
  const none = PA.todayBars({ kcal: 1650, protein_g: 120, carb_g: 230 }, null);
  assert.deepEqual(none.map((r) => [r.value, r.plan, r.state]), [[1650, null, null], [120, null, null], [230, null, null]]);
  // A plan whose carbs came out at 0: carbs show only the number.
  assert.equal(PA.todayBars({ kcal: 100, protein_g: 1, carb_g: 3 }, { ...PLAN, carb_g: null })[2].plan, null);
});

test('PA-3: barText — "120 of 180 g · 60 g to go", "20 g above", short and plan-less forms, six languages', () => {
  const t = tFor('en');
  const [kcal, protein, carbs] = PA.todayBars({ kcal: 1650, protein_g: 120, carb_g: 270 }, PLAN);
  assert.equal(PA.barText(kcal, { t, fmt: fmtEn }), '1,650 of 2,200 kcal · 550 to go');
  assert.equal(PA.barText(protein, { t, fmt: fmtEn }), '120 of 180 g · 60 g to go');
  assert.equal(PA.barText(carbs, { t, fmt: fmtEn }), '270 of 250 g · 20 g above');
  assert.equal(PA.barText(kcal, { t, fmt: fmtEn, short: true }), '1,650 of 2,200 kcal');
  assert.equal(PA.barText(PA.todayBars({ kcal: 2200, protein_g: 0, carb_g: 0 }, PLAN)[0], { t, fmt: fmtEn }), '2,200 of 2,200 kcal');
  assert.equal(PA.barText(PA.todayBars({ kcal: 1650, protein_g: 0, carb_g: 0 }, null)[0], { t, fmt: fmtEn }), '1,650 kcal');
  assert.equal(PA.barText(PA.todayBars({ kcal: 0, protein_g: 120, carb_g: 0 }, null)[1], { t, fmt: fmtEn }), '120 g');
  // Portuguese, the picture's words; singular for 1.
  const pt = tFor('pt');
  const fmtPt = (n) => Number(n).toLocaleString('pt-BR');
  assert.equal(PA.barText(kcal, { t: pt, fmt: fmtPt }), '1.650 de 2.200 kcal · faltam 550');
  assert.equal(PA.barText(protein, { t: pt, fmt: fmtPt }), '120 de 180 g · faltam 60 g');
  assert.equal(PA.barText(carbs, { t: pt, fmt: fmtPt }), '270 de 250 g · 20 g acima');
  const oneShort = PA.todayBars({ kcal: 0, protein_g: 179, carb_g: 0 }, PLAN)[1];
  assert.equal(PA.barText(oneShort, { t: pt, fmt: fmtPt }), '179 de 180 g · falta 1 g');
  // Every key exists in every language with the same placeholders.
  for (const l of LANGS) {
    for (const k of Object.keys(tr.en).filter((x) => x.startsWith('pa_'))) {
      assert.ok(typeof tr[l][k] === 'string' && tr[l][k].length, `${l}.${k}`);
      const ph = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join();
      assert.equal(ph(tr[l][k]), ph(tr.en[k]), `${l}.${k} placeholders`);
    }
  }
});

test('PA-4: Progress › Your daily plan keeps the tiles and adds "Today · logged so far" with the bars and Log food', () => {
  const calc = read('screens/components/CalculatorSection.js');
  const plan = calc.match(/const planEl = plan \? \(([\s\S]*?)\n  \) : null;/);
  assert.ok(plan, 'the plan card');
  const body = plan[1];
  assert.match(body, /onPress=\{\(\) => setGoal\(g\)\}/, 'the goal tiles stay');
  assert.match(body, /t\('pa_today_logged'\)/);
  assert.match(body, /<PlanBars rows=\{todayRows\} \/>/);
  assert.match(body, /navigation\.navigate\('FoodChat'\)/);
  assert.match(body, /t\('nutri_hero_cta'\)/);
  assert.ok(body.indexOf("t('pa_today_logged')") > body.indexOf('s.chips'), 'under the plan and its chip');
  // The bars follow the goal on screen: today's total against planNow (which follows goal).
  assert.match(calc, /const todayRows = useMemo\(\(\) => todayBars\(dayFoodTotal\(foodRows, todayISO\(\)\), planNow\), \[foodRows, planNow, dayKey\]\);/);
});

test('PA-5: planVsActual — 14 days, empty days not counted, today drawn and not counted, ±10% on plan', () => {
  const today = '2026-11-18';
  const rows = [
    food('2026-11-05', 2150, 140, 290), // 13 days back: inside 14 days, outside 7
    food('2026-11-12', 2500, 150, 310), // kcal +13.6%: above
    food('2026-11-13', 2420, 200, 240), // kcal exactly +10%: on plan
    food('2026-11-14', 1970, 160, 300), // kcal −10.5%: below
    food('2026-11-15', 2100, 120, 225), // carbs −10%: on plan
    food('2026-11-17', 1000, 90, 100),
    food('2026-11-17', 1350, 85, 20), // two entries one day: summed
    food('2026-11-18', 1650, 120, 230), // today
    { id: 'm1', entry_date: '2026-11-16', source: 'day_closed' }, // a marker is no food
    { id: 'm2', entry_date: '2026-11-11', source: 'ate_nothing' },
    food('2026-11-10', 999, 99, 99, { parse_status: 'pending' }), // not read: no food read
  ];
  const r = PA.planVsActual(rows, PLAN, today, 14);
  assert.equal(r.dates.length, 14);
  assert.equal(r.dates[0], '2026-11-05');
  assert.equal(r.dates[13], today);
  const kcal = r.metrics.find((m) => m.key === 'kcal');
  const col = (d) => kcal.cols.find((c) => c.date === d);
  assert.equal(col('2026-11-16').status, 'none', 'a closed day with no food is empty');
  assert.equal(col('2026-11-11').value, null, '"I ate nothing" has no food read: empty');
  assert.equal(col('2026-11-10').status, 'none', 'an unread entry is not food read');
  assert.equal(col('2026-11-17').value, 2350);
  assert.equal(col('2026-11-12').status, 'above');
  assert.equal(col('2026-11-13').status, 'on');
  assert.equal(col('2026-11-14').status, 'below');
  assert.equal(col(today).status, 'today');
  assert.deepEqual(kcal.counts, { on: 4, above: 1, below: 1, n: 6 }, 'today left out');
  const carbs = r.metrics.find((m) => m.key === 'carbs');
  assert.deepEqual(carbs.counts, { on: 2, above: 3, below: 1, n: 6 });
  assert.equal(carbs.cols.find((c) => c.date === '2026-11-15').status, 'on');
  // 7 days: today and the 6 before.
  const w = PA.planVsActual(rows, PLAN, today, 7);
  assert.equal(w.dates[0], '2026-11-12');
  assert.equal(w.metrics[0].counts.n, 5);
  // The top leaves room and never cuts a day off.
  assert.equal(kcal.top, 2200 * 1.5);
  assert.equal(PA.planVsActual([food(today, 5000, 0, 0), food('2026-11-17', 4000, 0, 0)], PLAN, today, 7).metrics[0].top, 5000);
  // A column's parts: up to the plan, above it, the shortfall (never for today).
  assert.deepEqual(PA.columnParts(2350, 2200), { fill: 2200, over: 150, short: 0 });
  assert.deepEqual(PA.columnParts(1800, 2200), { fill: 1800, over: 0, short: 400 });
  assert.deepEqual(PA.columnParts(1650, 2200, true), { fill: 1650, over: 0, short: 0 });
  assert.equal(PA.planVsActual(rows, null, today), null, 'no plan, no chart');
  assert.equal(PA.ON_PLAN_BAND, 0.1);
});

test('PA-6: Progress "Plan and actual" — 7/14 switch, three charts, hatch, dashed shortfall and plan line, counts, legend, note, talk line', () => {
  const card = read('screens/components/PlanActualCard.js');
  assert.match(card, /const \[days, setDays\] = useState\(14\);/, '14 days by default (the picture)');
  assert.match(card, /<SegmentedBar\s+items=\{\[\{ key: 7, label: t\('pa_days_7'\) \}, \{ key: 14, label: t\('pa_days_14'\) \}\]\}/);
  assert.match(card, /planVsActual\(rows, plan, todayISO, days\)/);
  assert.match(card, /<Pattern id=\{hatchId\}/);
  assert.match(card, /fill=\{`url\(#\$\{hatchId\}\)`\}/, 'the part above the plan is hatched');
  assert.match(card, /strokeDasharray="3 2"/, 'the shortfall is a dashed outline');
  assert.match(card, /strokeDasharray="4 3"/, 'the plan is a dashed line');
  assert.match(card, /columnParts\(c\.value, m\.plan, c\.today\)/);
  assert.match(card, /t\(pluralKey\('pa_counts', m\.counts\.n, language\)\)/);
  assert.match(card, /t\('pa_counts_none'\)/);
  assert.match(card, /t\(m\.unit === 'g' \? 'pa_chart_plan_g' : 'pa_chart_plan_kcal'\)/);
  for (const k of ['pa_title', 'pa_legend_in', 'pa_legend_over', 'pa_legend_short', 'pa_note', 'nutri_week_talk']) assert.match(card, new RegExp(`t\\('${k}'\\)`), k);
  assert.match(card, /opacity=\{c\.today \? 0\.4 : 1\}/, 'today faded');
  // On the Progress screen, right under the daily plan.
  const { progressLayout } = require('../lib/progressCard');
  assert.deepEqual(progressLayout({ filled: true, hasPlan: true, weighInCount: 1 }).screen, ['card', 'plan', 'planActual', 'rc']);
  assert.deepEqual(progressLayout({ filled: false, hasPlan: false }).screen, ['card', 'rc']);
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /const planActualEl = planNow \? <PlanActualCard key="planActual" rows=\{foodRows\} plan=\{planNow\} todayISO=\{todayISO\(\)\} \/> : null;/);
  assert.match(calc, /const screenParts = \{ card: cardEl, plan: planEl, planActual: planActualEl, rc: rcEl \};/);
});

test('PA-7: food chat after a log — "+50 g protein in your day" on the latest of today, the day as bars, fiber kept', () => {
  assert.equal(PA.addedProtein({ protein_g: 49.6 }), 50);
  assert.equal(PA.addedProtein({ protein_g: 0.4 }), null);
  assert.equal(tr.en.pa_added_protein.replace('{n}', '50'), '+50 g protein in your day');
  assert.equal(tr.pt.pa_added_protein.replace('{n}', '50'), '+50 g de proteína no seu dia');
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /const lastTodayEntry = useMemo\(\(\) => \{[\s\S]*?x\.type === 'entry' && x\.entry_date === today[\s\S]*?\}, \[thread, today\]\);/);
  assert.match(chat, /x\.key === lastTodayEntry && addedProtein\(x\) != null \? <Text style=\{s\.entryAdded\}>\{t\('pa_added_protein'\)\.replace\('\{n\}', formatInt\(addedProtein\(x\), language\)\)\}<\/Text> : null/);
  assert.match(chat, /<Text style=\{s\.dayTotalHead\}>\{t\('pa_today_plan'\)\}<\/Text>\s*<PlanBars rows=\{todayBars\(x, plan\)\} \/>/);
  assert.match(chat, /x\.fiber_g != null \? <Text style=\{s\.dayFiber\}>/, 'fiber stays as a number');
  assert.match(chat, /t\('nutri_est_note'\)/, 'the AI estimate note stays');
  assert.match(chat, /setPlan\(\(await readProgressTile\(\)\.catch\(\(\) => null\)\)\?\.plan \|\| null\);/);
  // Over plan in grey (ink3), never risk / attention.
  const bars = read('screens/components/PlanBars.js');
  assert.match(bars, /fillOver: \{ backgroundColor: c\.ink3 \}/);
  assert.match(bars, /over: \{ color: c\.ink3 \}/);
});

test('PA-8: food chat without a plan — the numbers as before and "Set up your plan in Progress to compare"', () => {
  const chat = read('screens/FoodChatScreen.js');
  const dt = chat.match(/case 'day_total':([\s\S]*?)case 'echo'/);
  assert.ok(dt);
  assert.match(dt[1], /plan \? \(/);
  assert.match(dt[1], /<Text style=\{s\.dayTotalHead\}>\{t\('nutri_today'\)\}<\/Text>/, 'the day line as before');
  assert.match(dt[1], /<Text style=\{s\.dayNoPlan\}>\{t\('pa_no_plan'\)\}<\/Text>/);
  assert.equal(tr.en.pa_no_plan, 'Set up your plan in Progress to compare');
  assert.equal(tr.pt.pa_no_plan, 'Monte seu plano em Progresso para comparar');
});

test('PA-9: Today and Journey food card — the day line becomes the bars with a plan; without one, as before', () => {
  const hero = read('screens/components/FoodLogHero.js');
  assert.match(hero, /const plan = state\.plan;/);
  assert.match(hero, /\{!locked && plan \? <PlanBars rows=\{todayBars\(state\.dayTotal, plan\)\} short \/> : <Text style=\{s\.line\}>\{locked \? t\(state\.access\.reason === 'premium_ended' \? 'nutri_hero_locked_premium' : 'nutri_hero_locked'\) : todayLine\}<\/Text>\}/);
  assert.match(hero, /dayTotal: dayFoodTotal\(rows, today\), plan: tile && tile\.plan \? tile\.plan : null/);
  assert.match(hero, /const tile = await readProgressTile\(\)\.catch\(\(\) => null\);/);
  // The Journey week block and its plan line (FW-6 / FW-8) are unchanged.
  assert.match(hero, /export default function FoodLogHero\(\{ variant = 'journey', onChanged, onReady, planKcal \}\)/);
  assert.match(hero, /t\('nutri_week_talk'\)/);
});

test('PA-10: one source — the three surfaces share lib/planActual and one plan loader', () => {
  const calc = read('screens/components/CalculatorSection.js');
  const chat = read('screens/FoodChatScreen.js');
  const hero = read('screens/components/FoodLogHero.js');
  const bars = read('screens/components/PlanBars.js');
  assert.match(bars, /import \{ barParts \} from '\.\.\/\.\.\/lib\/planActual';/);
  for (const [n, src] of [['calc', calc], ['chat', chat], ['hero', hero]]) {
    assert.match(src, /import PlanBars from '\.\/?(components\/)?PlanBars';|import PlanBars from '\.\/components\/PlanBars';|import PlanBars from '\.\/PlanBars';/, `${n} uses PlanBars`);
    assert.match(src, /todayBars/, `${n} uses todayBars`);
    assert.doesNotMatch(src, /macroTargets\(/, `${n}: no second plan computation`);
  }
  assert.match(read('lib/progressTileLoad.js'), /export async function readProgressTile\(\)/);
  assert.match(read('screens/JourneyScreen.js'), /setTile\(await readProgressTile\(\)\);/);
  assert.match(read('lib/progressTile.js'), /planTargets\(\{ goalKcal: goalCal\.mid,/);
});

test('PA-11: never advice, judgement or cause; no red; natural six-language copy', () => {
  const words = /\b(eat more|eat less|too much|too little|should|good|bad|great|well done|why)\b|coma mais|coma menos|demais|muito|pouco|deveria|bom|ruim|come más|come menos|demasiad|mangez plus|mangez moins|trop\b|iss mehr|iss weniger|zu viel|zu wenig|mangia di più|mangia meno|troppo/i;
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(tr[l]).filter(([x]) => x.startsWith('pa_'))) assert.doesNotMatch(v, words, `${l}.${k}: ${v}`);
  }
  // Register: pt formal-neutral (seu), fr vous, es/de/it tu/du.
  assert.match(tr.fr.pa_today_plan, /votre/);
  assert.match(tr.es.pa_today_plan, /\btu\b/);
  assert.match(tr.de.pa_today_plan, /\bdein\b/);
  assert.match(tr.it.pa_today_plan, /\btuo\b/);
  assert.match(tr.pt.pa_today_plan, /\bseu\b/);
  // One term per concept: the labels are the food log's own words in the food log languages.
  assert.equal(tr.de.pa_protein, tr.de.nutri_protein);
  assert.equal(tr.pt.pa_kcal, 'Calorias');
  // No warning colours on these parts.
  for (const f of ['screens/components/PlanBars.js', 'screens/components/PlanActualCard.js']) {
    assert.doesNotMatch(read(f), /\bc(olors)?\.(risk|attention|danger|warning|dangerSoftText|warningSoftText)\b/, f);
  }
});

test('PA-12: theme tokens only, no emoji; the hatching uses a theme token', () => {
  const { parse } = require('@babel/parser');
  for (const f of ['screens/components/PlanBars.js', 'screens/components/PlanActualCard.js', 'lib/planActual.js', 'lib/progressTileLoad.js']) {
    const src = read(f);
    assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }), f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `${f}: no raw hex`);
    assert.doesNotMatch(src, /'(white|black)'|"(white|black)"/, `${f}: no named colours`);
    assert.doesNotMatch(src, /rgba?\(/, `${f}: no rgba`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f}: no emoji`);
  }
  const card = read('screens/components/PlanActualCard.js');
  assert.match(card, /<Line x1=\{0\} y1=\{0\} x2=\{0\} y2=\{HATCH\} stroke=\{colors\.ink2\} strokeWidth=\{2\} \/>/);
  for (const l of LANGS) for (const [k, v] of Object.entries(tr[l]).filter(([x]) => x.startsWith('pa_'))) assert.doesNotMatch(v, /\p{Extended_Pictographic}/u, `${l}.${k}`);
});
