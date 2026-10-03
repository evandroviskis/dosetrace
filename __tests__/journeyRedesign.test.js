'use strict';
// Journey redesign (founder per-part choices 2026-10-02, the approved page
// scratchpad/proto/journey/jornada.html, 24 parts). Parts 1-3: the Journey dashboard.
// Source / parse tests of the screens plus direct tests of the pure lib helpers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ── Part 1: AI food log card on Journey ──

test('Part 1: on Journey the food card bottom line is only the 7-day run ("0 of 7 days in a row")', () => {
  const src = read('screens/components/FoodLogHero.js');
  // The Journey variant never prefixes "Reality check · day n of 21".
  assert.match(src, /variant === 'journey'\s*\?\s*runShort/, 'journey shows the run line alone');
  // Today keeps its approved line (day of the check + run).
  assert.match(src, /policy\.weighInDue \? t\('nutri_hero_weigh'\)/);
});

test('Part 1: the Journey card headline is 19 pt semibold (prototype r-title, 600), drawn chevron', () => {
  const src = read('screens/components/FoodLogHero.js');
  assert.match(src, /line: \{ fontSize: 19, fontFamily: fontFamilyFor\('600'\)/, 'one 19 pt Geist 600 title on Journey and Today (prototype food())');
  assert.match(src, /<RowChevron color=\{colors\.tick\} \/>/);
});

// ── Part 2: the Progress and Dose accumulation tiles ──

test('Part 2: the tile is called "Progress", with the prompt sentence when there are no numbers', () => {
  const src = read('screens/JourneyScreen.js');
  assert.match(src, /<Text style=\{s\.tileTitle\}>\{t\('cal_snap_title'\)\}<\/Text>/, 'Progress (not "Your progress")');
  assert.match(src, /t\('cal_need_inputs'\)/, 'the prompt sentence instead of "Weight —"');
  assert.doesNotMatch(src, /<Text style=\{s\.foot\}>\{t\('cal_rc_title'\)\}<\/Text>/, 'no loose "Reality check" footer');
  assert.doesNotMatch(src, /\{weight \|\| '—'\}/, 'no "Weight —" placeholder');
});

test('Part 2: with numbers the tile shows Weight + "Since …" and Daily burn (TDEE) with Estimated / Measured', () => {
  const src = read('screens/JourneyScreen.js');
  assert.match(src, /tile\.since \?/, 'the since line when two weigh-ins exist');
  assert.match(src, /t\('cal_tdee'\)/);
  assert.match(src, /tile\.measured \? t\('hy_rc_measured_chip'\) : t\('hy_estimated'\)/);
  assert.match(src, /<FeatureIcon name="curve_loose" size=\{22\} color=\{colors\.data\} \/>/, 'the prototype\'s loose curve (founder 2026-10-02), data blue like its number');
  assert.match(src, /<RowChevron color=\{colors\.tick\} \/>/, 'drawn chevron, not a "›" glyph');
  assert.doesNotMatch(src, /'›'|>›</);
});

test('Part 2: progressTile — no numbers → null; numbers → weight, TDEE estimated', () => {
  const { progressTile } = require('../lib/progressTile');
  assert.equal(progressTile({ saved: null, meta: {}, snapshots: [], checks: [] }), null);
  assert.equal(progressTile({ saved: { unit: 'metric', weight: '84.6' }, meta: {}, snapshots: [], checks: [] }), null, 'weight alone is not enough');
  const r = progressTile({
    saved: { unit: 'metric', weight: '84.6', bfSource: 'gym', bodyFat: '21', height: '181', activity: 1.55, goal: 'lose' },
    meta: { gender: 'male', birth_year: 1988 }, snapshots: [], checks: [], now: new Date(2026, 9, 2),
  });
  assert.ok(r);
  assert.equal(r.unit, 'kg');
  assert.equal(r.weight, '84.6');
  assert.equal(r.measured, false);
  assert.ok(r.tdee > 2000 && r.tdee < 3500 && r.tdee % 10 === 0, 'rounded to 10 kcal like the hero');
  assert.equal(r.since, null, 'one or no weigh-in: no since line');
});

test('Part 2: progressTile — latest weigh-in wins, since-line from the first one, Measured from the latest check', () => {
  const { progressTile } = require('../lib/progressTile');
  const r = progressTile({
    saved: { unit: 'metric', weight: '85', bfSource: 'gym', bodyFat: '21', height: '181', activity: 1.55 },
    meta: { gender: 'male', birth_year: 1988 },
    snapshots: [{ entry_date: '2026-08-31', weight_kg: 88 }, { entry_date: '2026-09-28', weight_kg: 84.6 }, { entry_date: '2026-09-10', waist_cm: 93 }],
    checks: [{ entry_date: '2026-09-01', tdee: 2500 }, { entry_date: '2026-09-28', tdee: 2673 }],
  });
  assert.equal(r.weight, '84.6');
  assert.deepEqual(r.since, { date: '2026-08-31', delta: -3.4 });
  assert.equal(r.measured, true);
  assert.equal(r.tdee, 2670);
});

test('Part 2: progressTile — imperial shows lb, unknown body fat without a profile sex gives no estimate', () => {
  const { progressTile } = require('../lib/progressTile');
  const r = progressTile({
    saved: { unit: 'imperial', weight: '186.5', bfSource: 'gym', bodyFat: '21', height: '71', activity: 1.55 },
    meta: {}, snapshots: [{ entry_date: '2026-08-31', weight_kg: 88 }, { entry_date: '2026-09-28', weight_kg: 84.6 }], checks: [],
  });
  assert.equal(r.unit, 'lb');
  assert.equal(r.weight, '186.5');
  assert.equal(r.since.delta, -7.5);
  const gated = progressTile({ saved: { unit: 'metric', weight: '80', bfSource: 'unknown', height: '180', age: '40' }, meta: {}, snapshots: [], checks: [] });
  assert.equal(gated, null, 'the Mifflin path needs the profile sex (never the male default)');
});

// ── Part 3: Understand the numbers + Sources & references on Journey too ──

test('Part 3: the two folds sit under the Journey tiles and stay at the end of Progress (one shared block)', () => {
  const journey = read('screens/JourneyScreen.js');
  const calc = read('screens/components/CalculatorSection.js');
  const block = read('screens/components/LearnBlock.js');
  assert.match(journey, /<LearnBlock style=\{s\.learn\} \/>/);
  assert.ok(journey.indexOf('<LearnBlock') > journey.indexOf('s.duo'), 'under the tiles');
  assert.match(calc, /<LearnBlock \/>/);
  assert.match(block, /t\('cal_learn'\)/);
  assert.match(block, /t\('cal_sources_title'\)/);
  assert.match(block, /FoldChevron/);
  // Rebuild = replace: the explainer list and references live only in the shared block.
  assert.doesNotMatch(calc, /const REFERENCES = \[/);
  assert.doesNotMatch(calc, /cal_expl_scale_title/);
});
