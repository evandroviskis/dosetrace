'use strict';
// Layout bugs found on the simulator during the Graduated redesign pass (2026-10-01).
// A-68: the AI food log chat opens as an iOS modal sheet that already starts below the
//   status bar, but its SafeAreaView also padded the top inset, leaving an empty band
//   of about 60 pt above the header. iOS skips the top edge; Android (full-screen
//   modal) keeps it.
// A-69: the example accumulation card (onboarding, Body preview, paywall) drew its
//   number in an 84 pt box, so "3.3" sat far from its "mg". The example never passes
//   9.9 (peak ≈ 8.2), so the box fits one digit, the point and one decimal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// Journey redesign part 21 (founder 2026-10-02) replaces the iOS sheet of A-68 with a
// full-screen chat: there is no sheet below the status bar any more, so the chat pads the top
// inset itself on both platforms (no empty band, no header under the status bar).
test('A-68 / part 21: the full-screen food chat pads the top safe-area inset (it is no sheet any more)', () => {
  const src = read('screens/FoodChatScreen.js');
  const m = src.match(/<SafeAreaView style=\{s\.container\} edges=\{([^}]+)\}/);
  assert.ok(m, 'chat root SafeAreaView found');
  assert.match(src, /const edges = embedded \? \['left', 'right'\] : \['top', 'left', 'right', 'bottom'\];/);
  const app = read('App.js');
  assert.doesNotMatch(app.match(/<Stack\.Screen name="FoodChat"[^\n]*/)[0], /presentation: 'modal'/, 'not an iOS modal sheet');
});

test('A-69: the example accumulation number sits next to its unit', () => {
  const src = read('components/AccumulationHero.js');
  const m = src.match(/<AnimatedNumber[^>]*width=\{(\d+)\}/);
  assert.ok(m, 'AnimatedNumber with a fixed width found');
  assert.ok(Number(m[1]) <= 60, `number box is ${m[1]} pt, must be ≤ 60 so "3.3" sits next to "mg"`);
});

// A-70: on iOS the native Switch ignores thumbColor, so in dark theme an "on" switch
//   was a white knob on the near-white ink track — on and off were hard to tell apart.
//   Every switch is now the drawn Graduated switch (prototype .switch: ink track when on,
//   line when off, raised knob), which resolves from theme tokens in both themes.
const SWITCH_FILES = ['screens/SettingsScreen.js', 'screens/SerumCurveScreen.js', 'screens/components/NutritionLogger.js'];
for (const f of SWITCH_FILES) {
  test(`A-70: ${f} uses the drawn switch, not the native one`, () => {
    const src = read(f);
    assert.doesNotMatch(src, /<Switch\b/, 'no native <Switch>');
    assert.match(src, /import GradSwitch from '(\.\.\/)+components\/GradSwitch'/);
  });
}

test('A-70: the drawn switch takes its colors from theme tokens only', () => {
  const src = read('components/GradSwitch.js');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/);
  assert.match(src, /colors\.ink\b/);
  assert.match(src, /colors\.line\b/);
  assert.match(src, /colors\.raised\b/);
  assert.match(src, /accessibilityRole="switch"/);
  assert.match(src, /accessibilityState=\{\{[^}]*checked/);
});

// A-71: in Settings, a row's label + subtitle sat in a View with no flex, so a long
//   subtitle ("Repeat reminders every 5 min until acknowledged") ran under the switch.
//   Every label block in a Settings row takes the remaining width and wraps.
test('A-71: Settings row text blocks shrink and wrap instead of running under the control', () => {
  const src = read('screens/SettingsScreen.js');
  const bare = src.match(/<View>\s*\n\s*<Text style=\{s\.rowLabel\}>/g) || [];
  assert.equal(bare.length, 0, `${bare.length} row label block(s) without flex`);
});

// A-72: Dose accumulation screen. (a) The title had its own 20 pt side padding inside a
//   scroll that already pads 16, so it sat 36 pt in while every other title is at 20.
//   (b) The Est. level number box was sized as at least three full digits, so "0.0" sat
//   far from its "mg". The box is now measured per character (a point is narrow).
const { numberWidth } = require('../lib/numberWidth');
test('A-72: a number box fits its text, with the decimal point counted narrow', () => {
  const w = numberWidth('0.0', 34, 1);
  assert.ok(w >= 48 && w <= 58, `"0.0" at 34 pt → ${w}`);
  assert.ok(numberWidth('5', 34, 1) <= 28);
  assert.ok(numberWidth('12.5', 34, 1) > numberWidth('2.5', 34, 1));
  assert.ok(numberWidth('0.0', 34, 1.35) > w, 'grows with the text size setting');
});
test('A-72: the curve screen uses the measured box and aligns its title with other screens', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /numberWidth\(/);
  assert.doesNotMatch(src, /Math\.max\(3, String\(str\)\.length\)/);
  const m = src.match(/\n\s+title: \{[^}]*paddingHorizontal: (\d+)/);
  assert.ok(m && Number(m[1]) <= 4, 'title adds at most 4 pt to the 16 pt scroll padding');
});

// A-73: the curve's "NOW" marker was still all caps after the sentence-case sweep.
test('A-73: the curve "now" marker is sentence case in every language', () => {
  const src = read('i18n/translations.js');
  const vals = [...src.matchAll(/curve_now: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(vals.length, 6);
  for (const v of vals) assert.notEqual(v, v.toUpperCase(), `${v} is all caps`);
});

// A-74: My Body said "1 test" while the Lab test journal listed 4 tests on the same date.
//   The journal shows one card per upload (report_date + created_at, so a duplicate upload
//   can be deleted on its own); the hub counted distinct dates. Both count uploads now.
test('A-74: the My Body lab count uses the same key as the journal cards', () => {
  const src = read('screens/BodyScreen.js');
  assert.doesNotMatch(src, /new Set\(rows\.map\(r => r\.report_date\)\)\.size/);
  assert.match(src, /const testCount = new Set\(rows\.map\(r => r\.report_date \+ '\|' \+ \(r\.created_at \|\| ''\)\)\)\.size/);
});

// A-75: wide screens (unfolded Z Fold, landscape). Your progress capped its cards at
//   CONTENT_MAX_WIDTH but not its back row and title, so on a wide screen the title sat at
//   the far left and the cards in the centre.
test('A-75: the Progress back row and title sit in the same capped column as the cards', () => {
  const src = read('screens/ProgressScreen.js');
  assert.match(src, /CONTENT_MAX_WIDTH/);
  assert.match(src, /<View style=\{s\.column\}>\s*\n\s*<View style=\{s\.nav\}>/);
  assert.match(src, /column: \{[^}]*maxWidth: CONTENT_MAX_WIDTH[^}]*alignSelf: 'center'/);
});

// A-76: the enlarged syringe sheet is at most 560 wide, but the ruler was sized and
//   centred on the whole window, so on a wide screen the draw mark opened off-centre.
test('A-76: the enlarged syringe ruler is sized and centred on the visible sheet width', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /const zoomView = Math\.min\(windowWidth - 72, 520\);/);
  // My Protocols part 7 (founder 2026-10-02): the ruler is the prototype's 1640-wide drawing;
  // it still opens with the dose centred on the visible sheet width.
  assert.match(src, /rulerX\(units, syringeMax\) - zoomView \/ 2\)/);
});
