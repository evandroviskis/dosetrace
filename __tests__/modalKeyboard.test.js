'use strict';
// Build 54 (founder: "fix everything that's wrong on iPhone and Android"). On Android the app
// draws edge to edge, so a Modal is never resized for the keyboard and every
// KeyboardAvoidingView that pads on iPhone only leaves the Modal's fields under the keyboard
// (confirmed on the folded Fold, build 53: the weigh-in sheet and the food entry editor; fixed in
// sheetKeyboard.test.js / foodEditorKeyboard.test.js). The same structure was left in:
//   - Today's vial prompt (a centred card, day field + Add vial under the keyboard);
//   - Settings › Edit profile (full-screen page sheet; name and birth year fields) and its
//     nested country picker (search on top, the list's end under the keyboard);
//   - the protocol editor (full-screen page sheet: wizard fields + the Back / Next / Save
//     footer, and the protocol assistant's composer at the very bottom).
// Fix: Android only, iPhone unchanged.
//   - Vial prompt: components/useSheetKeyboard. The card sits above the keyboard, capped to the
//     room left; its body scrolls (a ScrollView on Android only) and the actions stay under it.
//   - Protocol editor: useSheetKeyboard on a flex wrapper around the form and the assistant:
//     its bottom padding is the keyboard's overlap, so the footer / composer sit on the keyboard,
//     and the focused wizard field is scrolled into view (merged with the editor's scroll ref).
//   - Edit profile + country picker (a full-screen page with its own ScrollView / FlatList):
//     components/useKeyboardLift — a keyboard-tall spacer ends the content and the focused
//     field is scrolled just above the keyboard.
// Plus a guard: any Modal in screens/ or components/ that holds a text field (directly, through
// a component that renders one, or through caller children) uses one of the two hooks, or is on
// the allow-list with its reason.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KAV_IOS = "behavior={Platform.OS === 'ios' ? 'padding' : undefined}";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Modal parsing (nesting-aware) ──────────────────────────────────────────────────────────
function modalBlocks(src) {
  const re = /<Modal\b|<\/Modal>/g;
  const stack = [];
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    if (m[0] === '</Modal>') {
      const open = stack.pop();
      if (open == null) continue;
      const block = { start: open, end: m.index + m[0].length, depth: stack.length };
      out.push(block);
    } else {
      stack.push(m.index);
    }
  }
  return out.sort((a, b) => a.start - b.start).map((b) => {
    const nested = out.filter((o) => o.start > b.start && o.end < b.end && o.depth === b.depth + 1);
    let own = '';
    let at = b.start;
    for (const n of nested.sort((x, y) => x.start - y.start)) { own += src.slice(at, n.start); at = n.end; }
    own += src.slice(at, b.end);
    const vis = /<Modal\b[\s\S]*?\bvisible=\{([^}]*)\}/.exec(src.slice(b.start, b.end));
    return { ...b, own, visible: vis ? vis[1].trim() : '?' };
  });
}

function jsFiles(dir) {
  const abs = path.join(ROOT, dir);
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel));
    else if (/\.(js|jsx|tsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Components (by name) that render a TextInput, directly or through another such component.
function inputComponents(files) {
  const decls = [];
  for (const f of files) {
    const src = read(f);
    const re = /^(?:export\s+)?(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=\s*(?:forwardRef|memo|React\.forwardRef|React\.memo|\())/gm;
    const hits = [];
    let m;
    while ((m = re.exec(src))) hits.push({ name: m[1] || m[2], at: m.index });
    hits.forEach((h, i) => decls.push({ name: h.name, body: src.slice(h.at, i + 1 < hits.length ? hits[i + 1].at : src.length) }));
  }
  const known = new Set(['TextInput']);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of decls) {
      if (known.has(d.name)) continue;
      if ([...known].some((k) => new RegExp(`<${k}\\b`).test(d.body))) { known.add(d.name); grew = true; }
    }
  }
  return known;
}

const FILES = [...jsFiles('screens'), ...jsFiles('components')];
const INPUTS = inputComponents(FILES);
const holdsInput = (own) => [...INPUTS].some((k) => new RegExp(`<${k}\\b`).test(own)) || /\{children\}/.test(own);
const usesHook = (src, own) => /import use(?:SheetKeyboard|KeyboardLift) from/.test(src) && /\.(?:scrollProps|spacer)\b/.test(own);

// A Modal that holds a text field but needs neither hook — with the reason. Key: file#visible.
const ALLOW = {
  // The wheel sheet renders caller children, and every caller passes a DTWheel only (no text
  // field, no keyboard) — checked below.
  'screens/components/ProtocolParts.js#visible': 'DTPickerSheet: wheel children only',
};

test('modal keyboard guard: DTPickerSheet callers pass wheels, never a text field', () => {
  let uses = 0;
  for (const f of FILES) {
    const src = read(f);
    const re = /<DTPickerSheet\b[\s\S]*?<\/DTPickerSheet>/g;
    let m;
    while ((m = re.exec(src))) {
      uses += 1;
      assert.ok(![...INPUTS].some((k) => new RegExp(`<${k}\\b`).test(m[0])), `${f}: a text field inside DTPickerSheet needs a keyboard hook`);
    }
  }
  assert.ok(uses >= 10, 'the callers are found');
});

test('modal keyboard guard: every Modal holding a text field keeps it above the Android keyboard', () => {
  const found = [];
  const bad = [];
  for (const f of FILES) {
    const src = read(f);
    for (const b of modalBlocks(src)) {
      if (!holdsInput(b.own)) continue;
      const key = `${f}#${b.visible}`;
      found.push(key);
      if (ALLOW[key]) continue;
      if (!usesHook(src, b.own)) bad.push(`${key} (line ${src.slice(0, b.start).split('\n').length})`);
    }
  }
  // the parser sees the known ones (never a vacuous pass)
  for (const k of [
    'screens/components/NewVialPrompt.js#!!visible', // A-132: Today's vial prompt, shared with the protocol page
    'screens/SettingsScreen.js#showEditProfile',
    'screens/SettingsScreen.js#showCountryPicker',
    'screens/ProtocolsScreen.js#showModal',
    'screens/components/CalculatorSection.js#visible',
    'screens/components/BodySheets.js#!!visible',
    'screens/components/FoodEntryEditor.js#!!row',
  ]) assert.ok(found.includes(k), `the guard finds ${k}`);
  assert.ok(found.some((k) => k.startsWith('screens/components/BodyMapModal.js#')), 'the guard finds the body map');
  assert.ok(INPUTS.has('ProtocolAssistant') && INPUTS.has('WInput') && INPUTS.has('EditNum'), 'input components are traced');
  assert.ok(!found.some((k) => k.startsWith('screens/FoodChatScreen.js#')), 'the food demo Modal has no text field');
  for (const k of Object.keys(ALLOW)) assert.ok(found.includes(k), `stale allow-list entry ${k}`);
  assert.deepEqual(bad, [], 'Modals with a text field and no keyboard hook');
});

// ── Today: the vial prompt ─────────────────────────────────────────────────────────────────
test('modal keyboard: Today\'s vial prompt sits above the Android keyboard; iPhone unchanged', () => {
  // A-132: the window moved to screens/components/NewVialPrompt.js (Today + the protocol page).
  assert.match(read('screens/TodayScreen.js'), /<NewVialPrompt\s+visible=\{showVialPrompt\}/);
  const src = read('screens/components/NewVialPrompt.js');
  assert.match(src, /import useSheetKeyboard from '\.\.\/\.\.\/components\/useSheetKeyboard';/);
  assert.match(src, /const vialKb = useSheetKeyboard\(Platform\.OS === 'android' && !!visible, \{ gap: 16 \}\);/);
  const body = src.slice(src.indexOf('<Modal visible={!!visible}'), src.indexOf('</Modal>', src.indexOf('<Modal visible={!!visible}')));
  assert.match(body, /<View style=\{vialKb\.lift \? \[s\.promptOverlay, \{ paddingBottom: vialKb\.lift\.bottom \}\] : s\.promptOverlay\} onLayout=\{vialKb\.onLayout\}>/);
  assert.match(body, /<View style=\{\[s\.promptCard, vialKb\.sheetStyle\]\}>/, 'the cap');
  assert.match(body, /<PromptBody style=\{s\.promptBody\} scrollProps=\{vialKb\.scrollProps\}>[\s\S]*<TextInput[\s\S]*<\/PromptBody>\s*<View style=\{s\.promptActions\}>/, 'the day field scrolls in the body, the actions stay under it');
  const pb = src.slice(src.indexOf('function PromptBody('));
  assert.match(pb, /if \(Platform\.OS !== 'android'\) return <View style=\{style\}>\{children\}<\/View>;/, 'iPhone: a plain View, as before');
  assert.match(pb, /<ScrollView \{\.\.\.scrollProps\} contentContainerStyle=\{style\} keyboardShouldPersistTaps="handled"/);
  assert.match(src, /promptBody: \{ gap: 14 \}/, 'the card\'s gap carries into its body');
});

// ── Settings: Edit profile + the country picker ────────────────────────────────────────────
test('modal keyboard: Edit profile lifts the focused field above the Android keyboard', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /import useKeyboardLift from '\.\.\/components\/useKeyboardLift';/);
  assert.match(src, /const profileLift = useKeyboardLift\(null, Platform\.OS === 'android' && showEditProfile\);/);
  assert.match(src, /const countryLift = useKeyboardLift\(null, Platform\.OS === 'android' && showCountryPicker\);/);
  const start = src.indexOf('{/* EDIT PROFILE MODAL */}');
  const body = src.slice(start, src.indexOf('<Modal visible={showCountryPicker}'));
  assert.match(body, /<ScrollView \{\.\.\.profileLift\.scrollProps\} style=\{s\.modalBody\}/);
  assert.match(body, /ref=\{profileNameRef\}\s+onFocus=\{\(\) => profileLift\.liftField\(profileNameRef\)\}/);
  assert.match(body, /ref=\{profileYearRef\}\s+onFocus=\{\(\) => profileLift\.liftField\(profileYearRef\)\}/);
  assert.match(body, /\{profileLift\.spacer\}\s*<\/ScrollView>/, 'the spacer ends the scroll content');
  const picker = src.slice(src.indexOf('<Modal visible={showCountryPicker}'));
  assert.match(picker.slice(0, picker.indexOf('</Modal>')), /ListFooterComponent=\{countryLift\.spacer\}/, 'the list\'s last countries scroll above the keyboard');
});

// ── Protocols: the editor (wizard + assistant) ─────────────────────────────────────────────
// A-152 (founder, iPhone 2026-10-20): the same on iPhone — its KeyboardAvoidingView made no room in
// this page sheet (notes and footer under the keyboard); a152KeyboardFields.test.js.
test('modal keyboard: the protocol editor\'s footer and composer sit above the keyboard (Android, and iPhone since A-152)', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /import useSheetKeyboard from '\.\.\/components\/useSheetKeyboard';/);
  assert.match(src, /const editorKb = useSheetKeyboard\(showModal, \{ gap: 0, topRoom: 0 \}\);/);
  assert.match(src, /const editorScrollRef = useCallback\(\(n\) => \{ modalScrollRef\.current = n; if \(editorKb\.scrollProps\.ref\) editorKb\.scrollProps\.ref\(n\); \}, \[editorKb\.scrollProps\]\);/, 'one scroll view, both refs');
  const start = src.indexOf('onDismiss={() => setWizardPresented(false)}');
  const body = src.slice(start, src.indexOf('</Modal>', start));
  assert.match(body, /<SafeAreaView style=\{s\.modal\}>\s*<View style=\{editorKb\.lift \? \[EDITOR_FLEX, \{ paddingBottom: editorLiftBottom \}\] : EDITOR_FLEX\} onLayout=\{editorKb\.onLayout\}>\s*\{assistant \? \(/, 'one wrapper around the assistant and the form');
  assert.doesNotMatch(body, /<KeyboardAvoidingView/, 'no KeyboardAvoidingView: the wrapper lifts on both platforms');
  assert.match(body, /\) : \(\n\s+<View style=\{EDITOR_FLEX\}>/, 'the form is a plain flex view');
  assert.match(body, /<ScrollView \{\.\.\.editorKb\.scrollProps\} ref=\{editorScrollRef\} style=\{s\.modalBody\}/);
  assert.match(body, /<\/View>\s*\)\}\s*<\/View>/, 'the wrapper closes after the form');
  assert.match(src, /const EDITOR_FLEX = \{ flex: 1 \};/);
});
