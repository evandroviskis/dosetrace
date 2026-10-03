'use strict';
// Journey follows the approved prototype in everything (founder 2026-10-02, "Sam Carter" version,
// docs/design/prototype.html): the differences found on the comparison page, each checked
// against the prototype source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const proto = () => read('docs/design/prototype.html');
function translations() {
  const src = read('i18n/translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  return mod.exports.translations;
}

test('part 2: the Dose accumulation tile icon is the prototype\'s loose curve (JI.curve), not a chart with axes', () => {
  assert.match(proto(), /curve: '<path d="M3 19c3 0 4-12 7-12s3 8 6 8 3-5 5-5"\/><path d="M3 21h18"\/>'/);
  const data = read('components/featureIconsData.js');
  const m = data.match(/curve_loose: `([\s\S]*?)`/);
  assert.ok(m, 'curve_loose glyph');
  // the 24-grid prototype paths scaled to the 1024 set (× 1024 / 24), monoline stroke 54 (72 drawn)
  assert.match(m[1], /M128 810\.7c128 0 170\.7-512 298\.7-512s128 341\.3 256 341\.3 128-213\.3 213\.3-213\.3/);
  assert.match(m[1], /M128 896h768/);
  assert.doesNotMatch(m[1], /V220|M170 800V/, 'no y-axis');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets/feature-icons/curve_loose.svg')), 'source SVG in the set');
  assert.match(read('screens/JourneyScreen.js'), /<FeatureIcon name="curve_loose" size=\{22\} color=\{colors\.data\} \/>/);
});

test('part 8: the Reality check title icon is the balance scale (prototype JX.scale), not three bars', () => {
  const src = read('screens/components/CalculatorSection.js');
  const head = src.match(/const rcHead = \(([\s\S]*?)\n  \);/)[1];
  assert.match(head, /<FeatureIcon name="type_glp1" size=\{22\} color=\{colors\.ink2\} \/>/, 'the set\'s balance scale (also the Today reality-check alert)');
  assert.doesNotMatch(head, /calc_bars/);
});

test('part 8: "nothing logged" in the so-far list is lowercase like the rows around it, all 6 languages', () => {
  const tr = translations();
  assert.equal(tr.en.nutri_nothing_logged, 'nothing logged');
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) {
    const v = tr[l].nutri_nothing_logged;
    assert.equal(v[0], v[0].toLowerCase(), `${l}: ${v}`);
  }
});

test('part 13: Save weigh-in looks active like the prototype (btn p), an empty weight still saves nothing', () => {
  const src = read('screens/components/CalculatorSection.js');
  const sheet = src.match(/\{\/\* Add a past weigh-in[\s\S]*?<\/SheetModal>/)[0];
  const btn = sheet.match(/<TouchableOpacity style=\{[^}]*\}[^>]*onPress=\{saveBackfillWeighIn\}[^>]*>/)[0];
  assert.doesNotMatch(btn, /btnDim|disabled=/, 'never dimmed or disabled');
  const fn = src.match(/function saveBackfillWeighIn\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /if \(w == null \|\| !bfDate\) return;/, 'validation kept: nothing is written without a weight');
});

test('part 17: grid lines follow the prototype rule (0, half the peak, the peak; one decimal) and the half line sits on its own label', () => {
  const { curveTicks, axisLabel } = require('../lib/serumModel');
  const t = curveTicks(0.5);
  assert.equal(t.top, 0.5 * 1.12);
  assert.deepEqual(t.ticks.map(axisLabel), ['0.0', '0.2', '0.5'], 'the prototype\'s 0.0 / 0.2 / 0.5');
  assert.equal(t.ticks[1], 0.2, 'the half line is drawn at the value it is labelled with');
  assert.deepEqual(curveTicks(122.4).ticks.map(axisLabel), ['0.0', '61', '122']);
  assert.deepEqual(curveTicks(0.04).ticks, [0, 0.02, 0.04], 'a tiny peak keeps its true half');
  assert.deepEqual(curveTicks(0), { top: 1, ticks: [] });
});

test('part 18: the unit sits right next to the Est. level number (the stat field is as wide as the number drawn)', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /onLayout=\{\(e\) => setLevelW\(Math\.ceil\(e\.nativeEvent\.layout\.width\) \+ 2\)\}/, 'measured, not guessed');
  assert.match(src, /width=\{levelW != null \? levelW : numW\(mgLabel\(singleNow\)\)\}/);
});

test('part 21: no day question bubble on open unless it still applies — the prototype asks only after a log', () => {
  const { resumableQuestion } = require('../lib/foodThread');
  const today = '2026-10-02';
  const now = new Date('2026-10-02T12:00:00');
  const cur = { id: 'drink', tense: 'neutral' };
  assert.equal(resumableQuestion(cur, [], today, ['meal', 'snack', 'drink'], now), null, 'nothing logged today: no question on open');
  const meal = [{ id: 1, entry_date: today, parse_status: 'done', parsed_items: [{ name: 'eggs', category: 'meal' }] }];
  assert.deepEqual(resumableQuestion(cur, meal, today, ['meal', 'snack', 'drink'], now), cur, 'still open after a meal: kept (FL-32 resumes the thread)');
  const drank = [...meal, { id: 2, entry_date: today, parse_status: 'done', parsed_items: [{ name: 'coffee', category: 'drink' }] }];
  assert.equal(resumableQuestion(cur, drank, today, ['meal', 'snack', 'drink'], now), null, 'answered by a later log');
  assert.equal(resumableQuestion(null, meal, today, [], now), null);
  const src = read('screens/FoodChatScreen.js');
  assert.match(src, /const keep = resumableQuestion\(cur, r, localISO\(\), askedRef\.current\.ids, new Date\(\)\);/);
});

test('part 21: the send button is ink (prototype .send2) even when the box is empty, and still disabled then', () => {
  const src = read('screens/FoodChatScreen.js');
  assert.match(src, /<TouchableOpacity style=\{s\.send\} onPress=\{onSubmit\} disabled=\{!canSend\}/);
  assert.match(src, /<FeatureIcon name="ai_spark" size=\{20\} color=\{colors\.onAct\} \/>/);
  assert.doesNotMatch(src, /sendOff/);
});

test('food card title: the same 19 pt Geist 600 on Today and Journey (prototype food(): r-title at 19)', () => {
  assert.match(proto(), /\.r-title \{ font: 600 calc\(22px/);
  const src = read('screens/components/FoodLogHero.js');
  assert.match(src, /line: \{ fontSize: 19, fontFamily: fontFamilyFor\('600'\)/);
  assert.doesNotMatch(src, /lineJourney/, 'one style for both screens');
});
