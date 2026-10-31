// A-211 (founder 2026-10-31 17:53 EDT, DV-108 / AD-24 = B2: "Enquanto o número 4, aceita a sua
// recomendação"). A marker's chart is Premium: a free user keeps the latest value and every reading,
// and where the chart would be sees a tile that opens the animated "labs" preview first (A-208 rule);
// the Paywall only from the preview's "Desbloquear com Premium". The chart never shows to a free
// account, and nothing flickers while the plan is still unknown.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const body = read('screens/BodyScreen.js');
const detail = body.slice(body.indexOf('function renderMarkerDetail('), body.indexOf('function renderScanUsage('));

test('A-211: the marker chart draws only for Premium', () => {
  assert.match(detail, /chartCount >= 2 && premium === true \? \(\s*<MarkerChart /);
  assert.equal((body.match(/<MarkerChart /g) || []).length, 1, 'the chart is drawn in one place only');
});

test('A-211: a free account sees the locked chart tile, which opens the labs preview (not the Paywall)', () => {
  assert.match(detail, /chartCount >= 2 && premium === false \? \(\s*<TouchableOpacity[^>]*onPress=\{\(\) => setPreviewKey\('labs'\)\}/);
  const tile = detail.slice(detail.indexOf("premium === false ? ("), detail.indexOf("premium === false ? (") + 1200);
  assert.doesNotMatch(tile, /Paywall/);
  assert.match(tile, /t\('pw_prev_labs_title'\)/);
  assert.match(tile, /t\('cal_rc_sb_locked'\)/);
  assert.match(tile, /accessibilityRole="button"/);
});

test('A-211: the latest value, the "add another test" line and every reading stay free', () => {
  assert.match(detail, /labNumberText\(markerDetail\.latest, language\)/);
  assert.match(detail, /chartCount === 1 \? \(\s*<Text style=\{s\.sec\}>\{t\('blood_need_more'\)\}/);
  assert.match(detail, /markerDetail\.points\.slice\(\)\.reverse\(\)\.map\(/);
});

test('A-211: the preview sheet the tile opens is mounted on the phone and the book', () => {
  assert.match(body, /<FeaturePreviewSheet\s*featureKey=\{previewKey\}/);
  assert.match(read('components/FeaturePreviews.js'), /key: 'labs', icon: 'calc_bars', titleKey: 'pw_prev_labs_title'/);
});

test('A-211: the locked tile takes its colours from theme tokens only', () => {
  const st = body.slice(body.indexOf('chartLock:'), body.indexOf('chartLock:') + 300);
  assert.ok(st.length > 20, 'chartLock style exists');
  assert.doesNotMatch(st, /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/);
});
