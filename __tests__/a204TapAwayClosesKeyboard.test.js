// A-204 (founder on the Fold 2026-10-31, sign-up "About you"): after typing the name, a tap on a
// birth month chose the month but the name kept the cursor and the keyboard stayed open over the
// rest of the step. On every page that lifts its fields (components/useKeyboardLift scrollProps),
// a tap away from the field being typed ends the typing there and closes the keyboard. A tap on
// the field's own row (the password eye, a unit beside it) keeps it; a tap on another field moves
// the typing there (the keyboard stays); a drag (scrolling) changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tapLeavesField } = require('../lib/keyboardLift');

const field = { fieldTop: 300, fieldBottom: 350 };

test('A-204: a tap below or above the field being typed leaves it', () => {
  assert.equal(tapLeavesField({ startX: 200, startY: 480, endX: 202, endY: 482, ...field }), true, 'a month pill below the name');
  assert.equal(tapLeavesField({ startX: 200, startY: 120, endX: 200, endY: 120, ...field }), true);
});

test('A-204: a tap on the field\'s own row keeps the typing (the password eye, a unit beside it)', () => {
  assert.equal(tapLeavesField({ startX: 900, startY: 320, endX: 900, endY: 321, ...field }), false);
});

test('A-204: a drag is scrolling, never a tap; unknown positions change nothing', () => {
  assert.equal(tapLeavesField({ startX: 200, startY: 700, endX: 200, endY: 520, ...field }), false);
  assert.equal(tapLeavesField({ startX: 200, startY: 480, endX: 200, endY: 480, fieldTop: NaN, fieldBottom: 350 }), false);
  assert.equal(tapLeavesField({ startY: 480, endX: 200, endY: 480, ...field }), false);
});

// Founder 2026-10-31: "Execute essa mudança no aplicativo inteiro" (Android and iPhone): one owner,
// spread on the app's root view and inside every Modal (each Modal is its own root).
test('A-204: the whole app — the root view and every Modal — closes the keyboard on a tap away', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const tap = read('components/tapAwayKeyboard.js');
  assert.match(tap, /tapLeavesField\(/);
  assert.match(tap, /if \(focusedInput\(\) === input\) Keyboard\.dismiss\(\)/, 'never closes when another field took the typing');
  const app = read('App.js');
  assert.match(app, /<View style=\{\{ flex: 1 \}\} \{\.\.\.tapAwayProps\}>\s*<NavigationContainer ref=\{navigationRef\}/);
  const modal = read('components/PresenceModal.js');
  assert.match(modal, /<RNModal \{\.\.\.props\}>\s*<View style=\{s\.fill\} \{\.\.\.tapAwayProps\}>\{children\}<\/View>/);
  // Every Modal in the app comes from PresenceModal (no screen opens React Native's own).
  const { execSync } = require('node:child_process');
  const raw = execSync("grep -rln \"Modal } from 'react-native'\\|Modal, \\|, Modal\" screens components App.js || true", { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((p) => !p.endsWith('PresenceModal.js'));
  for (const p of raw) assert.doesNotMatch(read(p), /import \{[^}]*\bModal\b[^}]*\} from 'react-native'/, p);
});

// Fold 2026-10-31 (new protocol, keyboard open): a tap on "Oral" only closed the keyboard and the
// choice needed a second tap — a list left at React Native's default swallows the first tap. Every
// list beside a field lets the first tap through (the tap-away view closes the keyboard).
test('A-204: every scrolling list beside a field takes the first tap while the keyboard is open', () => {
  const { execSync } = require('node:child_process');
  const root = path.join(__dirname, '..');
  const lift = fs.readFileSync(path.join(root, 'components/useKeyboardLift.js'), 'utf8');
  assert.match(lift.slice(lift.indexOf('scrollProps: {')), /keyboardShouldPersistTaps: 'handled'/);
  // Fold 2026-10-31: the new-protocol window scrolls with useSheetKeyboard — on and off (iPhone).
  const sheet = fs.readFileSync(path.join(root, 'components/useSheetKeyboard.js'), 'utf8');
  assert.match(sheet, /const NO_PROPS = Object\.freeze\(\{ keyboardShouldPersistTaps: 'handled' \}\);/);
  assert.match(sheet.slice(sheet.indexOf('const scrollProps = useMemo')), /keyboardShouldPersistTaps: 'handled',/);
  const files = execSync("grep -rl '<TextInput\\|<AuthField' screens components", { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const re = /<(ScrollView|FlatList)\b/g;
    let m;
    while ((m = re.exec(src))) {
      const tag = src.slice(m.index, m.index + 900);
      const end = tag.search(/\n\s*\/?>|[^=]>\s*\n/);
      const head = tag.slice(0, end < 0 ? 900 : end + 1);
      assert.ok(/keyboardShouldPersistTaps="handled"|\.\.\.\w+\.scrollProps/.test(head), `${f}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
});
