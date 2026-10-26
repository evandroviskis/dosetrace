'use strict';
// A-170 (founder on the Galaxy Fold, 2026-10-22, new account): Intro › About you — with the keyboard
// open on Your name, Birth year sat under the keyboard (only its top edge showing) and the name
// keyboard said Done, so the only way to reach the year was to close the keyboard. The rules:
//   1. on every page with several typed fields, the return key of each field but the last says
//      Next and moves the focus to the next field, keeping the keyboard open (submitBehavior
//      'submit'), so the next field lifts above the keyboard (A-152 lift on focus);
//   2. the last field keeps its own key (Done / submit) — no Next on it;
//   3. the page keeps its keyboard-tall room at the end of the scroll content (useKeyboardLift
//      spacer), so it can be scrolled while the keyboard is open;
//   4. one mechanism: the existing useKeyboardLift (fieldProps(key, { next }) / nextProps(ref)),
//      never a second keyboard handler.
// Pages: About you (name → birth year), sign in / create account (email → password), reset password
// (new → confirm), Edit profile (name → birth year), Progress › Your numbers (weight → height →
// age, skipped when it comes from the profile → body fat → waist).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Load the real hook with a minimal React / React Native stand-in (one render, effects run at once).
function loadHook({ os = 'ios' } = {}) {
  const listeners = {};
  const fakes = {
    react: {
      useRef: (v) => ({ current: v }),
      useState: (v) => [v, () => {}],
      useEffect: (fn) => { fn(); },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': {
      Keyboard: { addListener: (name, fn) => { listeners[name] = fn; return { remove() {} }; } },
      Platform: { OS: os },
      TextInput: { State: { currentlyFocusedInput: () => null } },
      View: 'View',
    },
  };
  const file = path.join(ROOT, 'components', 'useKeyboardLift.js');
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'],
  });
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = (id) => (id in fakes ? fakes[id] : Module.prototype.require.call(m, id));
  m._compile(code, file);
  return { useKeyboardLift: m.exports.default, listeners };
}

// A field that behaves like a TextInput: focus() fires its onFocus, it measures where it sits.
function fakeField(props, rect) {
  const node = {
    focused: 0,
    focus() { node.focused += 1; if (props.onFocus) props.onFocus({}); },
    measureInWindow(cb) { cb(0, rect.top, 300, rect.height); },
  };
  props.ref(node);
  return node;
}

test('A-170 (1): Next on Your name moves to Birth year, keeps the keyboard open and lifts the year above it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); // the hook's delayed re-lift never runs here
  const { useKeyboardLift, listeners } = loadHook();
  const kb = useKeyboardLift();
  const scrolls = [];
  kb.scrollProps.ref({ measureInWindow: (cb) => cb(0, 0), scrollTo: (o) => scrolls.push(o.y) });

  const nameProps = kb.fieldProps('name', { next: 'birthYear' });
  const yearProps = kb.fieldProps('birthYear');
  fakeField(nameProps, { top: 200, height: 52 });
  const year = fakeField(yearProps, { top: 470, height: 52 }); // its top edge just above the keyboard

  assert.equal(nameProps.returnKeyType, 'next', 'the name keyboard says Next, not Done');
  assert.equal(nameProps.submitBehavior, 'submit', 'the keyboard stays open when Next is pressed');
  assert.equal(typeof nameProps.onSubmitEditing, 'function');

  nameProps.onFocus({});
  listeners.keyboardDidShow({ endCoordinates: { screenY: 500, height: 340 } });
  nameProps.onSubmitEditing({});

  assert.equal(year.focused, 1, 'Next focuses Birth year');
  assert.deepEqual(scrolls, [470 + 52 + 16 - 500], 'Birth year is scrolled to sit 16 pt above the keyboard');
});

test('A-170 (2): the last field keeps its own return key (no Next, no forced submit behaviour)', () => {
  const { useKeyboardLift } = loadHook();
  const kb = useKeyboardLift();
  const last = kb.fieldProps('birthYear');
  assert.equal(last.returnKeyType, undefined);
  assert.equal(last.submitBehavior, undefined);
  assert.equal(last.onSubmitEditing, undefined);
});

test('A-170 (4): nextProps(ref) moves the focus with the lift turned off (Edit profile on iPhone)', () => {
  const { useKeyboardLift } = loadHook();
  const kb = useKeyboardLift(null, false);
  const ref = { current: { focused: 0, focus() { this.focused += 1; } } };
  const p = kb.nextProps(ref);
  assert.equal(p.returnKeyType, 'next');
  assert.equal(p.submitBehavior, 'submit');
  p.onSubmitEditing({});
  assert.equal(ref.current.focused, 1);
  // A field not mounted (yet): nothing happens, nothing throws.
  assert.doesNotThrow(() => kb.nextProps({ current: null }).onSubmitEditing({}));
  assert.doesNotThrow(() => kb.fieldProps('a', { next: 'missing' }).onSubmitEditing({}));
});

// The field's own props, from its opening tag to the tag's end.
function tagAt(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, `marker not found: ${marker}`);
  const open = src.lastIndexOf('<', at);
  const end = src.indexOf('/>', at);
  return src.slice(open, end + 2);
}

test('A-170 (1, 2): About you — Your name says Next to Birth year; Birth year is the last field', () => {
  const src = read('screens/OnboardingFlowScreen.js');
  assert.match(tagAt(src, "kb.fieldProps('name'"), /kb\.fieldProps\('name', \{ next: 'birthYear' \}\)/);
  assert.doesNotMatch(tagAt(src, "kb.fieldProps('birthYear'"), /next:|returnKeyType/);
});

test('A-170 (1, 2): sign in / create account — email says Next to password; password keeps its key', () => {
  const src = read('screens/AuthScreen.js');
  assert.match(src, /inputProps=\{kb\.fieldProps\('email', \{ next: 'password' \}\)\}/);
  assert.match(src, /inputProps=\{kb\.fieldProps\('password'\)\}/);
  // AuthField spreads inputProps on its TextInput and sets no return key of its own.
  const field = read('components/AuthField.js');
  assert.match(field, /<TextInput\n\s+\{\.\.\.inputProps\}/);
  assert.doesNotMatch(field, /returnKeyType|onSubmitEditing|submitBehavior/);
});

test('A-170 (1, 2): reset password — new password says Next to confirm; confirm keeps its key', () => {
  const src = read('screens/ResetPasswordScreen.js');
  assert.match(src, /inputProps=\{kb\.fieldProps\('new', \{ next: 'confirm' \}\)\}/);
  assert.match(src, /inputProps=\{kb\.fieldProps\('confirm'\)\}/);
});

test('A-170 (1, 2): Edit profile — Your name says Next to Birth year (both platforms); Birth year keeps its key', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(tagAt(src, 'ref={profileNameRef}'), /\{\.\.\.profileLift\.nextProps\(profileYearRef\)\}/);
  assert.doesNotMatch(tagAt(src, 'ref={profileYearRef}'), /nextProps|returnKeyType/);
});

test('A-170 (1, 2): Progress › Your numbers — weight → height → age (or body fat when age is from the profile) → waist', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.match(tagAt(src, "pageLift.fieldProps('weight'"), /pageLift\.fieldProps\('weight', \{ next: 'height', onFocus:/);
  assert.match(tagAt(src, "pageLift.fieldProps('height'"), /pageLift\.fieldProps\('height', \{ next: ageFromProfile \? 'bodyFat' : 'age' \}\)/);
  assert.match(tagAt(src, "pageLift.fieldProps('age'"), /pageLift\.fieldProps\('age', \{ next: 'bodyFat' \}\)/);
  assert.match(tagAt(src, "pageLift.fieldProps('bodyFat'"), /pageLift\.fieldProps\('bodyFat', \{ next: 'waist' \}\)/);
  assert.doesNotMatch(tagAt(src, "pageLift.fieldProps('waist'"), /next:|returnKeyType/);
});

test('A-170 (3): each of these pages ends its scroll content with the keyboard-tall room', () => {
  for (const f of ['screens/OnboardingFlowScreen.js', 'screens/AuthScreen.js', 'screens/ResetPasswordScreen.js']) {
    assert.match(read(f), /\{kb\.spacer\}\s*<\/ScrollView>/, f);
  }
  assert.match(read('screens/SettingsScreen.js'), /\{profileLift\.spacer\}\s*<\/ScrollView>/);
  assert.match(read('screens/components/CalculatorSection.js'), /\{pageLift\.spacer\}/);
  // The room is the keyboard's height, while the keyboard is open.
  const hook = read('components/useKeyboardLift.js');
  assert.match(hook, /spacer: enabled && kbHeight > 0 \? <View style=\{\{ height: kbHeight \}\} \/> : null/);
});

test('A-170 (4): one keyboard mechanism — no KeyboardAvoidingView or second keyboard listener on these pages', () => {
  for (const f of ['screens/OnboardingFlowScreen.js', 'screens/AuthScreen.js', 'screens/SettingsScreen.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /<KeyboardAvoidingView/, f);
    assert.doesNotMatch(src, /Keyboard\.addListener/, f);
  }
});
