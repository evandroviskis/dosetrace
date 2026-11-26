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
  // A-125: drawn by the shared tile at 22 pt (screens/components/DashTile.js).
  assert.match(read('screens/JourneyScreen.js'), /icon="curve_loose"\s+iconColor=\{colors\.data\}/);
  assert.match(read('screens/components/DashTile.js'), /<FeatureIcon name=\{icon\} size=\{22\} color=\{iconColor \|\| colors\.ink2\} \/>/);
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
  assert.match(src, /width=\{levelW != null \? levelW : numW\(heroParts\.num\)\}/); // DB-9: the body number
});

// Founder 2026-11-26 (docs/specs/food-log-recent-receipt.md FR-12, amends FL-4): the day question after each
// entry was replaced by the goodbye. The prototype rule stays: nothing is said on open by itself — the
// goodbye only follows a log in this visit, and the day question comes from the reminders.
test('part 21: no day question bubble and no goodbye on open — the app speaks only after a log', () => {
  const { buildThread } = require('../lib/foodThread');
  const today = '2026-10-02';
  const meal = [{ id: 1, source: 'ai', entry_date: today, parse_status: 'done', created_at: new Date(2026, 9, 2, 8).toISOString(), raw_text: 'eggs', parsed_items: JSON.stringify([{ food: 'eggs', kcal: 140, category: 'meal', msg: 'm' }]) }];
  const th = buildThread(meal, { todayISO: today });
  assert.equal(th.filter((x) => x.type === 'question' || x.type === 'bye').length, 0, 'reopened: no question, no goodbye');
  const src = read('screens/FoodChatScreen.js');
  assert.doesNotMatch(src, /resumableQuestion|threadQuestion|askNext/, 'the day question is gone');
  assert.match(src, /const \[bye, setBye\] = useState\(null\);/, 'the goodbye is not kept across visits');
  const load = src.slice(src.indexOf('  async function load() {'), src.indexOf('  // Retry what waited for the network'));
  assert.doesNotMatch(load, /setBye\(|sayBye\(/, 'opening the chat never says goodbye');
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
