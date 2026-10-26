'use strict';
// A-152 (founder 2026-10-20: "the keyboard sometimes covers the field I'm typing in"; on the Fold,
// and on the iPhone the protocol's notes field). Found screen by screen on the Fold (build 54) and
// the iPhone simulator:
//   - Journey › Progress › Your numbers (body fat, waist): a page with no keyboard handling at all —
//     the field stayed under the keyboard (Fold);
//   - the protocol page's note: lifted, but before the page's keyboard-tall spacer had laid out, so
//     the scroll stopped short and most of the note stayed under the keyboard (Fold);
//   - the protocol editor on iPhone: in its page sheet the KeyboardAvoidingView made no room at all —
//     the notes field AND the Back / Next / Save footer under the keyboard (simulator);
//   - sign in / create account, reset password and the intro's About you (name, birth year): pages
//     with no keyboard handling (code; iPhone and Android).
// The rules:
//   1. every field on a page (not inside a Modal / sheet, which modalKeyboard.test.js guards) is
//      wired to a keyboard lift (useKeyboardLift fieldProps / liftField) or listed below with why
//      it cannot be covered;
//   2. the lift runs again once the page's spacer has laid out (the ScrollView's
//      onContentSizeChange) and while a multiline field grows;
//   3. the protocol editor keeps its footer and the focused field above the keyboard on iPhone too
//      (useSheetKeyboard on both platforms, no KeyboardAvoidingView, the home bar not counted twice);
//   4. a sheet follows a multiline field that grows while typing (useSheetKeyboard).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (/\.js$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Fields (TextInput, AuthField) not inside an open Modal / BottomSheet / SheetModal. DTSheet is not a
// container: it takes a config, never children, so its self-closing tag must not open a scope (DV-003
// put one inside the food editor's Modal and every field after it read as "inside a sheet").
const CONTAINER = /<(Modal|BottomSheet|SheetModal)\b|<\/(Modal|BottomSheet|SheetModal)>/g;
const FIELD = /<(TextInput|AuthField)\b/g;
function pageFields(src) {
  const events = [];
  let m;
  while ((m = CONTAINER.exec(src))) events.push({ at: m.index, open: !m[0].startsWith('</') });
  CONTAINER.lastIndex = 0;
  const out = [];
  while ((m = FIELD.exec(src))) {
    let depth = 0;
    for (const e of events) { if (e.at >= m.index) break; depth += e.open ? 1 : -1; }
    if (depth <= 0) {
      const end = src.indexOf('/>', m.index);
      out.push({ at: m.index, line: src.slice(0, m.index).split('\n').length, tag: src.slice(m.index, end < 0 ? m.index + 400 : end + 2) });
    }
  }
  FIELD.lastIndex = 0;
  return out;
}

// Wired: the field's own props carry the lift.
const WIRED = /fieldProps\(|liftField|onNoteFocus/;

// Fields that cannot be covered, each with its reason (a stable piece of the field's props).
const ALLOW = [
  { file: 'screens/BodyScreen.js', has: "t('blood_tag_ph')", why: 'Labels field at the top of a lab report page (above any keyboard)' },
  { file: 'screens/BodyScreen.js', has: "t('blood_search_ph')", why: 'Search field at the top of the lab journal' },
  { file: 'screens/components/VaccinesSection.js', has: "t('vax_search_ph')", why: 'Search field at the top of the vaccine journal' },
  { file: 'screens/FoodChatScreen.js', has: 'value={fuText}', why: 'The chat composer row sits on the keyboard (FoodChatScreen layout; Fold and iPhone 2026-10-20)' },
  { file: 'screens/FoodChatScreen.js', has: 'value={text}', why: 'The chat composer sits on the keyboard (FoodChatScreen layout; Fold and iPhone 2026-10-20)' },
  { file: 'screens/components/ProtocolAssistant.js', has: 'TextInput', why: 'The composer: the protocol editor around it sits it on the keyboard (editorKb, both platforms)' },
  { file: 'screens/components/FoodEntryEditor.js', has: 'TextInput', why: 'Rendered only inside the food entry editor sheet (its own useKeyboardLift)' },
  { file: 'screens/ProtocolsScreen.js', has: 'placeholderTextColor={c.ink3}\n      {...props}', why: 'WInput, the editor field component: rendered only inside the protocol editor Modal (editorKb)' },
  { file: 'components/AuthField.js', has: '{...inputProps}', why: 'The field component: each page passes its lift through inputProps (sign in, reset password)' },
  { file: 'screens/components/NewVialPrompt.js', has: "placeholder={t('protocols_day_dd')}", why: 'MixDateField, the vial windows\' day field: rendered only inside the New vial / Edit vial Modals (their useSheetKeyboard; A-132, AD-80)' },
];

test('A-152 (1): every field on a page is wired to a keyboard lift, or listed with its reason', () => {
  const files = [...jsFiles('screens'), ...jsFiles('components')];
  const unwired = [];
  const used = new Set();
  for (const f of files) {
    const src = read(f);
    for (const fld of pageFields(src)) {
      if (WIRED.test(fld.tag)) continue;
      const a = ALLOW.find((x) => x.file === f && fld.tag.includes(x.has));
      if (a) { used.add(a); continue; }
      unwired.push(`${f}:${fld.line}`);
    }
  }
  assert.deepEqual(unwired, [], 'a page field with no keyboard lift (wire fieldProps, or add it to ALLOW with why)');
  for (const a of ALLOW) assert.ok(used.has(a), `stale allow-list entry: ${a.file} ${a.has}`);
});

test('A-152 (1): the pages found are wired — Progress, sign in, reset password, About you', () => {
  const calc = read('screens/components/CalculatorSection.js');
  assert.match(calc, /const pageLift = useKeyboardLift\(scrollRef\);/);
  assert.match(calc, /<ScrollView \{\.\.\.pageLift\.scrollProps\}/);
  for (const k of ['weight', 'height', 'age', 'bodyFat', 'waist']) assert.match(calc, new RegExp(`pageLift\\.fieldProps\\('${k}'`));
  assert.match(calc, /\{pageLift\.spacer\}/);
  for (const f of ['screens/AuthScreen.js', 'screens/ResetPasswordScreen.js', 'screens/OnboardingFlowScreen.js']) {
    const src = read(f);
    assert.match(src, /const kb = useKeyboardLift\(\);/, f);
    assert.match(src, /\{\.\.\.kb\.scrollProps\}/, f);
    assert.match(src, /\{kb\.spacer\}/, f);
  }
  assert.match(read('components/AuthField.js'), /<TextInput\n\s+\{\.\.\.inputProps\}/);
});

test('A-152 (2): the lift runs again once the spacer has laid out, and while a field grows', () => {
  const hook = read('components/useKeyboardLift.js');
  assert.match(hook, /onContentSizeChange: \(\) => \{ if \(enabled && kbTop\.current != null\) lift\(\); \}/);
  assert.match(hook, /const fieldProps = \(key, extra = \{\}\) =>/);
  assert.match(hook, /onContentSizeChange: \(e\) => \{ if \(field\.current === box && kbTop\.current != null\) lift\(\);/);
});

test('A-152 (3): the protocol editor keeps footer and field above the keyboard on iPhone too', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /const editorKb = useSheetKeyboard\(showModal, \{ gap: 0, topRoom: 0 \}\);/, 'both platforms');
  assert.doesNotMatch(src, /<KeyboardAvoidingView/, 'its KeyboardAvoidingView made no room in the page sheet');
  assert.match(src, /editorKb\.lift\.bottom - \(Platform\.OS === 'ios' \? insets\.bottom : 0\)/, 'the home bar is not counted twice');
  assert.doesNotMatch(read('screens/components/ProtocolAssistant.js'), /<KeyboardAvoidingView/, 'no second padding inside the editor');
});

test('A-152 (4): a sheet follows a multiline field that grows while typing', () => {
  const hook = read('components/useSheetKeyboard.js');
  assert.match(hook, /onContentSizeChange: \(\) => \{ if \(kbRef\.current\) focusScroll\(\); \}/);
});
