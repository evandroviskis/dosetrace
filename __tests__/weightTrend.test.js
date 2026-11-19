'use strict';
// Weight: the 7-day average is the big number (docs/specs/weight-trend.md, founder 2026-11-18
// "Pode executar a parte 6"; picture docs/design/food-goals-progress.html part 6).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { weightTrend, AVG_MIN_WEIGHINS } = require('../lib/weightTrend');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];

const rows = (list) => list.map(([date, kg]) => ({ date, weightKg: kg }));

test('WT-1: the 7-day average needs at least 4 weigh-ins in the last 7 days', () => {
  assert.equal(AVG_MIN_WEIGHINS, 4);
  const today = '2026-11-18';
  // 3 weigh-ins in the window: no average.
  let r = weightTrend({ snapshots: rows([['2026-11-18', 89.4], ['2026-11-16', 88.6], ['2026-11-13', 88.9]]), today });
  assert.equal(r.avg7, null);
  assert.deepEqual(r.latest, { date: '2026-11-18', kg: 89.4 });
  // 4 in the window (11-12 to 11-18), one older outside it.
  r = weightTrend({ snapshots: rows([['2026-11-18', 89.4], ['2026-11-17', 88.8], ['2026-11-15', 88.6], ['2026-11-12', 88.8], ['2026-11-11', 95]]), today });
  assert.ok(Math.abs(r.avg7 - 88.9) < 1e-9);
  assert.equal(r.count7, 4);
  // A window with nothing recent: the latest is old, no average.
  r = weightTrend({ snapshots: rows([['2026-11-01', 90], ['2026-11-02', 90], ['2026-11-03', 90], ['2026-11-04', 90]]), today });
  assert.equal(r.avg7, null);
  assert.equal(r.latest.date, '2026-11-04');
  // One weigh-in per day (the last write of a day wins), nulls ignored.
  r = weightTrend({ snapshots: [...rows([['2026-11-18', 89], ['2026-11-18', 89.4], ['2026-11-17', 89], ['2026-11-16', 89]]), { date: '2026-11-15', weightKg: null }], today });
  assert.equal(r.avg7, null, 'three distinct days only');
  // Week change: both windows need 4.
  const both = rows([
    ['2026-11-18', 88.8], ['2026-11-17', 88.8], ['2026-11-15', 88.8], ['2026-11-13', 88.8],
    ['2026-11-11', 89], ['2026-11-10', 89], ['2026-11-08', 89], ['2026-11-06', 89],
  ]);
  r = weightTrend({ snapshots: both, today });
  assert.ok(Math.abs(r.weekChange - -0.2) < 1e-9);
  r = weightTrend({ snapshots: both.slice(0, 7), today });
  assert.equal(r.weekChange, null);
  // The chart series: each weigh-in with its own trailing average (or null).
  r = weightTrend({ snapshots: both, today });
  const byDate = Object.fromEntries(r.series.map((p) => [p.date, p.avg]));
  assert.equal(byDate['2026-11-06'], null);
  assert.equal(byDate['2026-11-11'], 89);
  assert.equal(byDate['2026-11-18'], 88.8);
  assert.equal(r.series.length, 8);
  assert.ok(r.series.every((p, i, a) => i === 0 || a[i - 1].date < p.date), 'oldest first');
  // Nothing at all.
  r = weightTrend({ snapshots: [], today });
  assert.equal(r.latest, null);
  assert.equal(r.avg7, null);
});

const CALC = read('screens/components/CalculatorSection.js');

test('WT-2: the Progress hero shows the average big and the scale small', () => {
  assert.match(CALC, /import \{ weightTrend \} from '\.\.\/\.\.\/lib\/weightTrend';/);
  assert.match(CALC, /const trend = useMemo\(\(\) => weightTrend\(\{ snapshots, today: todayISO\(\) \}\), \[snapshots\]\);/);
  const i = CALC.indexOf('const heroPart = (');
  const hero = CALC.slice(i, CALC.indexOf('// Your target (PO-4)', i));
  assert.match(hero, /trend\.avg7 != null \? t\('cal_weight_avg7'\) : t\('cal_weight'\)/);
  assert.match(CALC, /const heroWeight = fmtW\(trend\.avg7 != null \? trend\.avg7 : currentWeightKg\);/);
  assert.match(hero, /t\(trend\.latest\.date === todayISO\(\) \? 'cal_scale_today' : 'cal_scale_last'\)/);
  assert.match(hero, /trend\.weekChange != null/);
  assert.match(hero, /t\('cal_week_change'\)/);
});

test('WT-3: the Journey tile shows the same number and label', () => {
  const tile = read('lib/progressTile.js');
  assert.match(tile, /const \{ weightTrend \} = require\('\.\/weightTrend'\);/);
  assert.match(tile, /avg7: trend\.avg7 != null/);
  const j = read('screens/JourneyScreen.js');
  assert.match(j, /t\(tile\.avg7 \? 'cal_weight_avg7' : 'cal_weight'\)/);
  // Pure: with 4 weigh-ins this week the tile weight is the average.
  const { progressTile } = require('../lib/progressTile');
  const snaps = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'].map((d, k) => ({ entry_date: d, weight_kg: 88 + k }));
  const out = progressTile({
    saved: { unit: 'metric', height: '180', weight: '88', bfSource: 'unknown', goal: 'lose', weightAt: '2026-11-01' },
    meta: { gender: 'male', birth_year: 1985 }, snapshots: snaps, checks: [], now: new Date('2026-11-18T12:00:00'),
  });
  assert.equal(out.avg7, true);
  assert.equal(out.weight, '89.5');
});

test('WT-4: the chart draws the average strong and each weigh-in faint', () => {
  const chart = read('screens/components/ProgressChart.js');
  assert.match(chart, /const avgPts = weight && weight\.avg/);
  assert.match(chart, /opacity=\{avgOn \? 0\.35 : 1\}/);
  assert.match(chart, /t\('cal_chart_avg7'\)|avgLabel/);
  assert.match(CALC, /const avg = weightTrend\(\{ snapshots, today: todayISO\(\) \}\)\.series\.filter\(p => p\.avg != null\)/);
});

test('WT-5: the estimated burn says when it is measured', () => {
  const i = CALC.indexOf('const heroPart = (');
  const hero = CALC.slice(i, CALC.indexOf('// Your target (PO-4)', i));
  assert.match(hero, /plan && !scoreCheck \? \(\s*<Text style=\{s\.foot2\}>\{t\('cal_burn_measured_when'\)\}<\/Text>/);
});

test('WT-6: a fixed link opens the FAQ at Your weight', () => {
  const i = CALC.indexOf('const heroPart = (');
  const hero = CALC.slice(i, CALC.indexOf('// Your target (PO-4)', i));
  assert.match(hero, /heroWeight != null \? \(\s*<TouchableOpacity onPress=\{openWeightFaq\}/);
  assert.match(hero, /t\('cal_weight_faq_link'\)/);
  assert.match(CALC, /navigation\.navigate\('FAQ', \{ openGroup: 'weight' \}\)/);
  // The link never depends on the user's numbers going up or down.
  assert.ok(!/weekChange > 0[^\n]*cal_weight_faq_link/.test(hero));
});

const FORBIDDEN = {
  en: [/don'?t worry/i, /it'?s normal/i, /is normal/i, /it'?s (just )?water/i, /you (have )?gained muscle/i, /you are losing fat/i, /trust the process/i, /the app is right/i],
  pt: [/não se preocupe/i, /é normal/i, /é (só )?água/i, /você ganhou músculo/i, /você está perdendo gordura/i, /confie no processo/i, /o app está certo/i],
  es: [/no te preocupes/i, /es normal/i, /es (solo )?agua/i, /ganaste músculo/i, /estás perdiendo grasa/i, /confía en el proceso/i],
  fr: [/ne vous inquiétez pas/i, /c'est normal/i, /c'est (juste )?de l'eau/i, /vous avez pris du muscle/i, /vous perdez de la graisse/i],
  de: [/keine sorge/i, /ist normal/i, /ist (nur )?wasser/i, /du hast muskeln/i, /du verlierst fett/i],
  it: [/non preoccuparti/i, /è normale/i, /è (solo )?acqua/i, /hai preso muscoli/i, /stai perdendo grasso/i],
};

test('WT-7: the FAQ group Your weight, 8 sourced questions, no forbidden phrase', () => {
  const ids = ['weight_up_eating_less', 'weight_day_to_day', 'weight_glycogen', 'weight_training', 'weight_average', 'weight_bia', 'weight_how_to_weigh', 'weight_professional'];
  for (const l of LANGS) {
    const g = tr[l].faq_categories.find((c) => c.id === 'weight');
    assert.ok(g, `${l}: group weight`);
    assert.deepEqual(g.questions.map((q) => q.id), ids, `${l}: the 8 questions in order`);
    const all = g.questions.map((q) => `${q.q} ${q.a}`).join(' ');
    for (const re of FORBIDDEN[l]) assert.ok(!re.test(all), `${l}: forbidden ${re}`);
    assert.ok(!/testost|estradiol|semaglut|tirzepat|GLP|peptide|péptid|peptíd|peptid|hormon|ormon|steroid|esteroid|stéroïd/i.test(all), `${l}: no compound`);
    const a = Object.fromEntries(g.questions.map((q) => [q.id, q.a]));
    assert.match(a.weight_glycogen, /Kreitzman/);
    assert.match(a.weight_glycogen, /3/);
    assert.match(a.weight_training, /Clarkson/);
    assert.match(a.weight_average, /Turicchi/);
    assert.match(a.weight_bia, /Kyle/);
    assert.match(a.weight_up_eating_less, /Kreitzman/);
    assert.match(a.weight_day_to_day, /Turicchi/);
    assert.ok(a.weight_professional.length > 40);
    assert.ok(tr[l].cal_weight_faq_link && tr[l].cal_weight_avg7 && tr[l].cal_scale_today && tr[l].cal_scale_last && tr[l].cal_week_change && tr[l].cal_burn_measured_when && tr[l].cal_chart_avg7 && tr[l].cal_chart_weighin, `${l}: the strings`);
  }
  // The group sits after Journey (food and the reality check), before Premium.
  const order = tr.en.faq_categories.map((c) => c.id);
  assert.ok(order.indexOf('weight') === order.indexOf('journey') + 1);
});

test('WT-8: the math keeps reading the latest weigh-in', () => {
  assert.match(CALC, /const currentWeightKg = latestSnap\?\.weightKg != null \? latestSnap\.weightKg : metric\.weightKg;/);
  assert.match(CALC, /current: currentWeightKg, target: target\.target_weight_kg/);
  const tile = read('lib/progressTile.js');
  assert.match(tile, /weightKg: w == null \? null : \(imperial \? lbToKg\(w\) : w\),\s*heightCm/);
});

test('WT-9: no raw colour, no emoji in the new parts', () => {
  const lib = read('lib/weightTrend.js');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba\(/.test(lib));
  const chart = read('screens/components/ProgressChart.js');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/.test(chart));
  for (const l of LANGS) {
    const g = tr[l].faq_categories.find((c) => c.id === 'weight');
    assert.ok(!/\p{Extended_Pictographic}/u.test(JSON.stringify(g)));
  }
});

test('WT-4 (simulator 2026-11-18): the middle date under the chart is dropped when it would touch an end date', () => {
  // Weigh-ins Oct 9 … Nov 18 with the median on Nov 10 printed "Nov 10Nov 18" glued together.
  const chart = read('screens/components/ProgressChart.js');
  assert.match(chart, /const MIN_LABEL_GAP = 64;/);
  assert.match(chart, /const midOk = X\(mid\) - X\(allDates\[0\]\) >= MIN_LABEL_GAP && X\(allDates\[allDates\.length - 1\]\) - X\(mid\) >= MIN_LABEL_GAP;/);
  assert.match(chart, /const labels = \[\.\.\.new Set\(\[allDates\[0\], \.\.\.\(midOk \? \[mid\] : \[\]\), allDates\[allDates\.length - 1\]\]\)\];/);
});
