'use strict';
// Weight and body fat: lean mass, and the measured burn redone with body fat (docs/specs/body-fat-burn.md,
// founder 2026-11-19 10:42 "Siga. Aprovo tudo."; picture docs/design/food-goals-progress.html part 5).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  fatReadings, bodyComposition, measuredBurn, resultMathPatch, resultMath,
  FAT_KCAL_PER_KG, LEAN_KCAL_PER_KG, MIN_FAT_READINGS, FAT_WINDOW_DAYS,
} = require('../lib/bodyFatBurn');
const { realityCheckTDEE } = require('../lib/energyCalc');
const { mergeCalcInputs } = require('../lib/realityCheckStore');
const { calcInputsChanges } = require('../lib/calcInputsSync');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// A weigh-in whose fat and lean are exactly fatKg / leanKg.
const reading = (date, fatKg, leanKg) => ({ date, weightKg: fatKg + leanKg, bodyFatPct: (fatKg / (fatKg + leanKg)) * 100 });

test('BF-1: fat readings, one per day, fat kg and lean', () => {
  const rows = [
    { date: '2026-11-03', weightKg: 90, bodyFatPct: 20 },
    { date: '2026-11-01', weightKg: 88, bodyFatPct: 22 },
    { date: '2026-11-03', weightKg: 89, bodyFatPct: 21 }, // the last row of a day wins
    { date: '2026-11-02', weightKg: 88.5, bodyFatPct: null }, // weight only: not a fat reading
    { date: '2026-11-04', weightKg: null, bodyFatPct: 20 }, // no weight
    { date: '2026-11-05', weightKg: 88, bodyFatPct: 0 }, // out of range
    { date: '2026-11-06', weightKg: 88, bodyFatPct: 100 },
    null,
  ];
  const r = fatReadings(rows);
  assert.deepEqual(r.map((x) => x.date), ['2026-11-01', '2026-11-03']);
  assert.ok(near(r[0].fatKg, 88 * 0.22));
  assert.ok(near(r[0].leanKg, 88 - 88 * 0.22));
  assert.equal(r[1].weightKg, 89);
  assert.ok(near(r[1].fatKg, 89 * 0.21));
  assert.deepEqual(fatReadings([]), []);
  assert.deepEqual(fatReadings(null), []);
});

test('BF-2: the composition table, now and the change between two averages', () => {
  assert.equal(MIN_FAT_READINGS, 2);
  assert.equal(FAT_WINDOW_DAYS, 7);
  // No fat reading: nothing (the hero stays as today).
  assert.equal(bodyComposition({ snapshots: [{ date: '2026-11-18', weightKg: 89, bodyFatPct: null }] }), null);
  // One reading: the now column only.
  let c = bodyComposition({ snapshots: [reading('2026-11-18', 18.1, 71.3)] });
  assert.equal(c.now.date, '2026-11-18');
  assert.ok(near(c.now.fatKg, 18.1));
  assert.ok(near(c.now.leanKg, 71.3));
  assert.ok(near(c.now.weightKg, 89.4));
  assert.equal(c.change, null);
  // Two at the start (11-01, 11-03) and two at the end (11-15, 11-18): averages.
  const snaps = [
    reading('2026-11-01', 18.7, 69.9), reading('2026-11-03', 18.5, 70.1),
    reading('2026-11-15', 18.2, 71.2), reading('2026-11-18', 18.0, 71.4),
    { date: '2026-11-16', weightKg: 95, bodyFatPct: null }, // weight only: ignored here
  ];
  c = bodyComposition({ snapshots: snaps });
  assert.equal(c.now.date, '2026-11-18');
  assert.equal(c.change.since, '2026-11-01');
  assert.ok(near(c.change.fatKg, 18.1 - 18.6, 1e-9));
  assert.ok(near(c.change.leanKg, 71.3 - 70.0, 1e-9));
  assert.ok(near(c.change.weightKg, c.change.fatKg + c.change.leanKg, 1e-9), 'weight = fat + lean');
  assert.ok(near(c.change.weightKg, 0.8, 1e-9));
  // Only one reading at the end window: no change.
  c = bodyComposition({ snapshots: snaps.filter((r) => r.date !== '2026-11-15') });
  assert.equal(c.change, null);
  // Windows that would overlap (all four within 10 days): no change.
  c = bodyComposition({ snapshots: [reading('2026-11-10', 18, 70), reading('2026-11-12', 18, 70), reading('2026-11-14', 18, 70), reading('2026-11-16', 18, 70)] });
  assert.equal(c.change, null);
  // A reading of 11-05 sits in the reference window (11-01 … 11-07), not in the now window (11-12 … 11-18).
  c = bodyComposition({ snapshots: [...snaps, reading('2026-11-05', 18.6, 70.0)] });
  assert.ok(near(c.change.fatKg, 18.1 - 18.6, 1e-9));
});

const CALC = read('screens/components/CalculatorSection.js');
const heroSrc = () => {
  const i = CALC.indexOf('const heroPart = (');
  return CALC.slice(i, CALC.indexOf('// Your target (PO-4)', i));
};

test('BF-3: the Progress hero shows the table under the weight and burn, only with a fat reading', () => {
  assert.match(CALC, /import \{ bodyComposition, measuredBurn, resultMathPatch, resultMath \} from '\.\.\/\.\.\/lib\/bodyFatBurn';/);
  assert.match(CALC, /const comp = useMemo\(\(\) => bodyComposition\(\{ snapshots \}\), \[snapshots\]\);/);
  const hero = heroSrc();
  const pair = hero.indexOf('</View>\n      </View>');
  const table = hero.indexOf('{comp ? (');
  assert.ok(table > pair, 'the table comes after the weight / burn pair');
  assert.ok(table < hero.indexOf('{progressSummary ? ('), 'and before the since line');
  const block = hero.slice(table, hero.indexOf('{progressSummary ? ('));
  assert.match(block, /t\(comp\.now\.date === todayISO\(\) \? 'cal_bc_today' : 'cal_bc_on'\)/);
  assert.match(block, /comp\.change \?/);
  assert.match(block, /t\('cal_bc_since'\)\.replace\('\{date\}', fmtShort\(comp\.change\.since\)\)/);
  assert.match(block, /t\('cal_snap_weight'\)/);
  assert.match(block, /t\('cal_bc_fat'\)/);
  assert.match(block, /t\('cal_bc_lean'\)/);
  assert.match(block, /comp\.now\.bodyFatPct/);
  assert.match(block, /t\('cal_bc_note'\)/);
  // The weight column, burn column and since line are untouched (WT-2 / PO-2 hold their own tests).
  assert.match(hero, /trend\.avg7 != null \? t\('cal_weight_avg7'\) : t\('cal_weight'\)/);
});

test('BF-4: the measured burn with body fat (Hall 2008), the design example', () => {
  assert.equal(FAT_KCAL_PER_KG, 9400);
  assert.equal(LEAN_KCAL_PER_KG, 1800);
  // Start readings on 11-01 and 11-03 (mean 11-02), end readings on 11-15 and 11-17 (mean 11-16): 14 days.
  const snapshots = [
    reading('2026-11-01', 18.6, 70.0), reading('2026-11-03', 18.6, 70.0),
    { date: '2026-11-08', weightKg: 89, bodyFatPct: 20 }, // in the middle: not a start or end reading
    reading('2026-11-15', 18.1, 71.3), reading('2026-11-17', 18.1, 71.3),
  ];
  const r = measuredBurn({ startISO: '2026-11-01', endISO: '2026-11-17', snapshots, avgDailyCalories: 2200, weightChangeKg: -0.8, days: 14 });
  assert.equal(r.method, 'fat');
  assert.equal(r.status, 'ok');
  assert.equal(r.reason, null);
  assert.equal(r.withFat.startN, 2);
  assert.equal(r.withFat.endN, 2);
  assert.ok(near(r.withFat.spanDays, 14));
  assert.ok(near(r.withFat.fatChangeKg, -0.5, 1e-9));
  assert.ok(near(r.withFat.leanChangeKg, 1.3, 1e-9));
  // 2200 − (−0.5 × 9400 + 1.3 × 1800) ÷ 14 = 2368.6 → 2,370 as the card prints it.
  assert.ok(near(r.tdee, 2200 + 2360 / 14, 1e-6));
  assert.equal(Math.round(r.tdee / 10) * 10, 2370);
  assert.equal(r.withFat.tdee, r.tdee);
  // The weight-only number, for the comparison row: exactly today's math.
  assert.deepEqual(r.weightOnly, realityCheckTDEE({ avgDailyCalories: 2200, weightChangeKg: -0.8, days: 14 }));
  assert.equal(Math.round(r.weightOnly.tdee), 1760);
});

test('BF-5: the rule fails → weight only, exactly as today, with the reason', () => {
  const base = { startISO: '2026-11-01', endISO: '2026-11-22', avgDailyCalories: 2200, weightChangeKg: 0.6, days: 21 };
  const today = realityCheckTDEE({ avgDailyCalories: 2200, weightChangeKg: 0.6, days: 21 });
  // Only one reading at the start (11-08 is outside the first 7 days: 11-01 … 11-07).
  let r = measuredBurn({ ...base, snapshots: [reading('2026-11-01', 18, 70), reading('2026-11-08', 18, 70), reading('2026-11-20', 17.8, 70), reading('2026-11-22', 17.8, 70)] });
  assert.equal(r.method, 'weight');
  assert.equal(r.reason, 'readings');
  assert.equal(r.status, today.status);
  assert.equal(r.tdee, today.tdee);
  assert.equal(r.withFat, null);
  // Only one at the end (11-15 is outside the last 7 days: 11-16 … 11-22).
  r = measuredBurn({ ...base, snapshots: [reading('2026-11-01', 18, 70), reading('2026-11-02', 18, 70), reading('2026-11-15', 17.8, 70), reading('2026-11-22', 17.8, 70)] });
  assert.equal(r.method, 'weight');
  assert.equal(r.reason, 'readings');
  // No fat readings at all.
  r = measuredBurn({ ...base, snapshots: [{ date: '2026-11-01', weightKg: 88 }, { date: '2026-11-22', weightKg: 87.4 }] });
  assert.equal(r.method, 'weight');
  assert.equal(r.tdee, today.tdee);
  // With body fat the result falls outside 1,000–5,000 → weight only, reason 'range'.
  r = measuredBurn({ ...base, snapshots: [reading('2026-11-01', 18, 70), reading('2026-11-02', 18, 70), reading('2026-11-21', 8, 80), reading('2026-11-22', 8, 80)] });
  assert.equal(r.method, 'weight');
  assert.equal(r.reason, 'range');
  assert.equal(r.tdee, today.tdee);
  // The weight-only math out of range, with-fat in range: the with-fat result.
  r = measuredBurn({ ...base, weightChangeKg: -6, snapshots: [reading('2026-11-01', 18, 70), reading('2026-11-02', 18, 70), reading('2026-11-21', 18, 70.5), reading('2026-11-22', 18, 70.5)] });
  assert.equal(realityCheckTDEE({ avgDailyCalories: 2200, weightChangeKg: -6, days: 21 }).status, 'implausible');
  assert.equal(r.method, 'fat');
  assert.equal(r.status, 'ok');
  // No food, or under 14 days: no result, as today.
  r = measuredBurn({ ...base, avgDailyCalories: 0, snapshots: [] });
  assert.equal(r.status, 'too_short');
  r = measuredBurn({ ...base, days: 13, snapshots: [reading('2026-11-01', 18, 70), reading('2026-11-02', 18, 70), reading('2026-11-21', 17.8, 70), reading('2026-11-22', 17.8, 70)] });
  assert.equal(r.status, 'too_short');
  assert.equal(r.method, 'weight');
});

test('BF-6: downstream — the chosen burn is what completion writes; Today runs the same function', () => {
  // Progress: the outcome result comes from measuredBurn with each weigh-in's body fat; completion writes res.tdee.
  const i = CALC.indexOf('const outcomeResult = useMemo(');
  const block = CALC.slice(i, CALC.indexOf('}, [outcome', i));
  assert.match(block, /measuredBurn\(\{ startISO: String\(rcStart\.date\)\.slice\(0, 10\), endISO: outcome\.weighIn\.date, snapshots, avgDailyCalories: outcome\.avgDailyCalories, weightChangeKg: outcome\.weightChangeKg, days: outcome\.days \}\)/);
  assert.ok(!/realityCheckTDEE\(/.test(block), 'not the weight-only math directly');
  assert.match(CALC, /upsertRealityCheck\(uid, \{ entry_date: res\.weighIn\.date, tdee: Math\.round\(res\.tdee\)/);
  // snapRowToUI carries the body fat of each weigh-in.
  assert.match(CALC, /const snapRowToUI = \(r\) => \(\{ date: r\.entry_date, weightKg: r\.weight_kg, waistCm: r\.waist_cm, bodyFatPct: r\.body_fat_pct/);
  // Today's alert: the same function, with body fat.
  const now = read('lib/realityCheckNow.js');
  assert.match(now, /import \{ measuredBurn \} from '\.\/bodyFatBurn';/);
  assert.match(now, /\(\{ date: r\.entry_date, weightKg: r\.weight_kg, bodyFatPct: r\.body_fat_pct \}\)/);
  assert.match(now, /result = measuredBurn\(\{ startISO, endISO: outcome\.weighIn\.date, snapshots, avgDailyCalories: outcome\.avgDailyCalories, weightChangeKg: outcome\.weightChangeKg, days: outcome\.days \}\);/);
  assert.ok(!/realityCheckTDEE/.test(now));
  // Everything downstream reads the saved reality_checks.tdee (unchanged): hero, plan, tile.
  assert.match(CALC, /if \(scoreCheck && plan\.tdeeVal\) return goalsForTdee\(scoreCheck\.tdee, \{ bmr: plan\.bmr, sex \}\);/);
  const tile = read('lib/progressTile.js');
  assert.match(tile, /const measured = done\.length \? done\[done\.length - 1\]\.tdee : null;/);
});

test('BF-7: the math used is saved per weigh-in date, merged, never clobbered', () => {
  const fat = { status: 'ok', tdee: 2368.6, method: 'fat', reason: null, weightOnly: { status: 'ok', tdee: 1760 }, withFat: { status: 'ok', tdee: 2368.6, startN: 2, endN: 3, spanDays: 14 } };
  const p = resultMathPatch('2026-11-17', fat, { days: 16, avgKcal: 2200 });
  assert.deepEqual(p, { rcResultMath: { '2026-11-17': { method: 'fat', weightOnly: 1760, withFat: 2369, startN: 2, endN: 3, days: 16, avgKcal: 2200, reason: null } } });
  const w = resultMathPatch('2026-12-10', { status: 'ok', tdee: 2100, method: 'weight', reason: 'readings', weightOnly: { status: 'ok', tdee: 2100 }, withFat: null }, { days: 21, avgKcal: 2000 });
  assert.deepEqual(w.rcResultMath['2026-12-10'], { method: 'weight', weightOnly: 2100, withFat: null, startN: null, endN: null, days: 21, avgKcal: 2000, reason: 'readings' });
  // Merge keeps the other dates (and the rest of the payload).
  const saved = mergeCalcInputs(mergeCalcInputs({ unit: 'metric', rcResultSources: { '2026-11-17': 'food' } }, p), w);
  assert.deepEqual(Object.keys(saved.rcResultMath).sort(), ['2026-11-17', '2026-12-10']);
  assert.equal(saved.unit, 'metric');
  assert.deepEqual(saved.rcResultSources, { '2026-11-17': 'food' });
  // Reading it back.
  assert.equal(resultMath(saved, '2026-11-17').method, 'fat');
  assert.equal(resultMath(saved, '2026-12-10').reason, 'readings');
  assert.equal(resultMath(saved, '2026-10-01'), null, 'a result saved before this version');
  assert.equal(resultMath(null, '2026-11-17'), null);
  assert.equal(resultMath({ rcResultMath: { '2026-11-17': { method: 'other' } } }, '2026-11-17'), null);
  // Only the changed dates go up.
  const ch = calcInputsChanges(saved, { rcResultMath: { '2026-11-17': saved.rcResultMath['2026-11-17'], '2027-01-05': { method: 'weight' } } });
  assert.deepEqual(Object.keys(ch.rcResultMath), ['2027-01-05']);
  assert.deepEqual(calcInputsChanges(saved, { rcResultMath: { '2026-11-17': saved.rcResultMath['2026-11-17'] } }), {});
  // Completion saves it next to the result source.
  const i = CALC.indexOf('async function completeRealityCheck(res)');
  const fn = CALC.slice(i, CALC.indexOf('\n  }\n', i));
  assert.match(fn, /resultMathPatch\(res\.weighIn\.date, res, \{ days: res\.days, avgKcal: res\.avgDailyCalories \}\)/);
  assert.match(fn, /mergeCalcInputs\(srcPatch, mathPatch\)/);
});

test('BF-8: the result view says which math was used', () => {
  const i = CALC.indexOf(') : scoreCheck ? (');
  const view = CALC.slice(i, CALC.indexOf("foldRow('rcLog'", i));
  assert.match(CALC, /const latestMath = realityLog\.length \? resultMath\(rcInputs, realityLog\[realityLog\.length - 1\]\.date\) : null;/);
  assert.match(view, /latestMath && latestMath\.method === 'fat' \?/);
  assert.match(view, /t\('cal_bfm_weight_only'\)/);
  assert.match(view, /t\('cal_bfm_with_fat'\)/);
  assert.match(view, /t\('cal_bfm_fat_line'\)\.replace\('\{a\}', String\(latestMath\.startN\)\)\.replace\('\{b\}', String\(latestMath\.endN\)\)\.replace\('\{n\}', String\(latestMath\.days\)\)\.replace\('\{kcal\}', fmtInt\(latestMath\.avgKcal\)\)/);
  assert.match(view, /t\('cal_bfm_why'\)/);
  assert.match(view, /latestMath && latestMath\.method === 'weight' \?/);
  assert.match(view, /t\(latestMath\.reason === 'range' \? 'cal_bfm_weight_line_range' : 'cal_bfm_weight_line_readings'\)/);
  // The weight-only number is the smaller one.
  assert.match(view, /<Text style=\{\[s\.foot2, s\.grow\]\}>\{t\('cal_bfm_weight_only'\)\}<\/Text>/);
  // A result saved before this version: no record, nothing new shows (the sentence and source as before).
  assert.match(view, /t\('cal_rc_result_prefix'\)/);
});

test('BF-9: the hint by the body fat field of Log today\'s weight', () => {
  const i = CALC.indexOf('<SheetModal visible={wiOpen}');
  const sheet = CALC.slice(i, CALC.indexOf('</SheetModal>', i));
  const bf = sheet.indexOf('value={wiBf}');
  const hint = sheet.indexOf("t('cal_bf_hint')");
  assert.ok(bf > 0 && hint > bf, 'under the body fat field');
  assert.ok(hint < sheet.indexOf("t('cal_waist')"), 'before the waist field');
});

const FORBIDDEN = {
  en: [/don'?t worry/i, /normal/i, /it'?s (just )?water/i, /you (have )?gained muscle/i, /you (are losing|lost) fat/i, /trust the process/i, /the app is right/i, /\bgood\b/i, /\bbad\b/i, /\bshould\b/i, /great/i],
  es: [/no te preocupes/i, /normal/i, /es (solo )?agua/i, /ganaste músculo/i, /perdiste grasa/i, /\bbien\b/i, /\bmal[oa]?\b/i, /deberías/i],
  pt: [/não se preocupe/i, /normal/i, /é (só )?água/i, /você ganhou músculo/i, /você perdeu gordura/i, /\bbom\b/i, /\bruim\b/i, /deveria/i, /dá para/i, /a gente/i],
  fr: [/ne vous inquiétez pas/i, /normal/i, /c'est (juste )?de l'eau/i, /vous avez pris du muscle/i, /vous avez perdu de la graisse/i, /\bbon\b/i, /mauvais/i, /devriez/i],
  de: [/keine sorge/i, /normal/i, /ist (nur )?wasser/i, /du hast muskeln/i, /du hast fett verloren/i, /\bgut\b/i, /schlecht/i, /solltest/i],
  it: [/non preoccuparti/i, /normale/i, /è (solo )?acqua/i, /hai preso muscoli/i, /hai perso grasso/i, /\bbuon[oa]?\b/i, /cattiv/i, /dovresti/i],
};
const KEYS = ['cal_bc_today', 'cal_bc_on', 'cal_bc_since', 'cal_bc_fat', 'cal_bc_lean', 'cal_bc_note', 'cal_bf_hint',
  'cal_bfm_weight_only', 'cal_bfm_with_fat', 'cal_bfm_fat_line', 'cal_bfm_why', 'cal_bfm_weight_line_readings', 'cal_bfm_weight_line_range'];

test('BF-10: the strings in 6 languages, native, no judgement, Hall cited', () => {
  for (const l of LANGS) {
    const d = tr[l];
    for (const k of KEYS) assert.ok(typeof d[k] === 'string' && d[k].trim().length > 0, `${l}: ${k}`);
    assert.match(d.cal_bc_on, /\{date\}/, `${l}: cal_bc_on`);
    assert.match(d.cal_bc_since, /\{date\}/, `${l}: cal_bc_since`);
    for (const p of ['{a}', '{b}', '{n}', '{kcal}']) assert.ok(d.cal_bfm_fat_line.includes(p), `${l}: fat line ${p}`);
    assert.match(d.cal_bfm_why, /Hall, 2008/, `${l}: Hall`);
    const all = KEYS.map((k) => d[k]).join(' ');
    for (const re of FORBIDDEN[l]) assert.ok(!re.test(all), `${l}: forbidden ${re}`);
    assert.ok(!/testost|estradiol|semaglut|tirzepat|GLP|peptide|péptid|peptíd|peptid|hormon|ormon|steroid|esteroid|stéroïd/i.test(all), `${l}: no compound`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all), `${l}: no emoji`);
  }
  // Numbers in each language's style.
  assert.match(tr.en.cal_bfm_why, /7,700 kcal/);
  assert.match(tr.en.cal_bfm_why, /9,400/);
  assert.match(tr.pt.cal_bfm_why, /7\.700 kcal/);
  assert.match(tr.pt.cal_bfm_why, /1\.800/);
  assert.match(tr.es.cal_bfm_why, /7700 kcal/);
  assert.match(tr.fr.cal_bfm_why, /7 700 kcal/);
  assert.match(tr.de.cal_bfm_why, /7\.700 kcal/);
  assert.match(tr.it.cal_bfm_why, /7\.700 kcal/);
  // As in the picture (pt).
  assert.equal(tr.pt.cal_bc_note, 'Massa magra = músculo, água, glicogênio, ossos. Sobe com treino pesado e com água retida; nem toda subida é músculo.');
  assert.equal(tr.pt.cal_bfm_fat_line, 'Calculado com peso e gordura: média de {a} pesagens com gordura no início e {b} no fim dos {n} dias. Comida: média de {kcal} kcal por dia.');
  assert.match(tr.pt.cal_bf_hint, /mesma balança, ao acordar, antes de comer/);
});

test('BF-11: the goal by body fat is unchanged; theme tokens only, no emoji, no raw colour', () => {
  assert.match(CALC, /current: currentBF, target: target\.target_body_fat_pct, start: target\.start_body_fat_pct,/);
  assert.match(CALC, /\{target && bfProj \? renderTargetMetric\('bodyfat', bfProj, currentBF, target\.target_body_fat_pct, usableBfRate, premium\) : null\}/);
  const hero = heroSrc();
  const t0 = hero.indexOf('{comp ? (');
  const tableSrc = hero.slice(t0, hero.indexOf('{progressSummary ? ('));
  const i = CALC.indexOf(') : scoreCheck ? (');
  const viewSrc = CALC.slice(i, CALC.indexOf("foldRow('rcLog'", i));
  const st = CALC.slice(CALC.indexOf('  bcRow:'), CALC.indexOf('\n', CALC.indexOf('  bcCell:')));
  for (const src of [tableSrc, viewSrc, st]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/.test(src), 'no raw colour');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), 'no emoji');
  }
  assert.ok(st.includes('bcRow') && st.includes('bcCell'));
  assert.ok(!/color:/.test(st), 'the table styles set no colour (text styles come from the tokens)');
  const lib = read('lib/bodyFatBurn.js');
  assert.ok(!/require\('react|from 'react/.test(lib), 'pure lib');
});
