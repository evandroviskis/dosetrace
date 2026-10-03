'use strict';
// S-26 BK-14 + registry A-77 (founder decision 2026-10-01: "keep the draft per item until
// saved or the app closes"). Text typed and not yet saved is kept per item in lib/draftStore
// (in memory, app lifetime only, never on disk or synced), so tapping another item, folding,
// unfolding (the screen remounts) or leaving the screen and coming back shows it again.
//
// Bug (A-77): the Progress forms (reality-check weigh-in and intake, target sheet, past
// weigh-in sheet) and the food chat's follow-up answer kept typed text only in component
// state, so any remount threw it away. Direct tests of the store plus source tests of the
// screens (they import react-native, so plain Node cannot load them).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ── lib/draftStore ──

test('BK-14: getDraft / setDraft / clearDraft keep a value per key', () => {
  const d = require('../lib/draftStore');
  d.clearAllDrafts();
  assert.equal(d.getDraft('protocolNote:1'), undefined, 'nothing stored yet');
  d.setDraft('protocolNote:1', 'take with food');
  d.setDraft('protocolNote:2', 'second');
  assert.equal(d.getDraft('protocolNote:1'), 'take with food');
  assert.equal(d.getDraft('protocolNote:2'), 'second', 'per item: another key is independent');
  d.setDraft('protocolNote:1', 'take with food, morning');
  assert.equal(d.getDraft('protocolNote:1'), 'take with food, morning', 'latest value wins');
  d.clearDraft('protocolNote:1');
  assert.equal(d.getDraft('protocolNote:1'), undefined);
  assert.equal(d.getDraft('protocolNote:2'), 'second', 'clearing one item leaves the others');
  d.setDraft('protocolNote:2', null);
  assert.equal(d.getDraft('protocolNote:2'), undefined, 'setting null clears');
});

test('BK-14: an empty string is a real draft (the user erased the saved note)', () => {
  const d = require('../lib/draftStore');
  d.clearAllDrafts();
  d.setDraft('protocolNote:7', '');
  assert.equal(d.getDraft('protocolNote:7'), '', 'erasing the stored note is a draft too');
});

test('BK-14: objects are kept by value (a later change to the caller object does not leak in)', () => {
  const d = require('../lib/draftStore');
  d.clearAllDrafts();
  const v = { weight: '82', bf: '' };
  d.setDraft('progress:target', v);
  v.weight = '99';
  assert.deepEqual(d.getDraft('progress:target'), { weight: '82', bf: '' });
  const got = d.getDraft('progress:target');
  got.weight = '1';
  assert.deepEqual(d.getDraft('progress:target'), { weight: '82', bf: '' }, 'a reader cannot change the stored draft');
});

test('BK-14: keepDraft stores typed text and clears when everything is blank', () => {
  const d = require('../lib/draftStore');
  d.clearAllDrafts();
  d.keepDraft('progress:rcIntake', '2100');
  assert.equal(d.getDraft('progress:rcIntake'), '2100');
  d.keepDraft('progress:rcIntake', '');
  assert.equal(d.getDraft('progress:rcIntake'), undefined, 'a blank field is no draft');
  d.keepDraft('progress:rcWeigh', { then: '', now: '81,5', startDate: null });
  assert.deepEqual(d.getDraft('progress:rcWeigh'), { then: '', now: '81,5', startDate: null });
  d.keepDraft('progress:rcWeigh', { then: '', now: '', startDate: null });
  assert.equal(d.getDraft('progress:rcWeigh'), undefined, 'an object with only blank values is no draft');
  d.keepDraft('progress:rcWeigh', { then: '', now: '', startDate: '2026-09-28' });
  assert.ok(d.getDraft('progress:rcWeigh'), 'a chosen past start day is kept');
});

test('BK-14: clearAllDrafts empties everything (for an intentional sign-out)', () => {
  const d = require('../lib/draftStore');
  d.setDraft('protocolNote:1', 'a');
  d.setDraft('foodChat:answer:9:0', 'b');
  d.clearAllDrafts();
  assert.equal(d.getDraft('protocolNote:1'), undefined);
  assert.equal(d.getDraft('foodChat:answer:9:0'), undefined);
});

test('BK-14: the store is in memory only (never on disk, never synced)', () => {
  const src = read('lib/draftStore.js');
  assert.doesNotMatch(src, /AsyncStorage|SecureStore|expo-sqlite|supabase|require\(['"]\.\/(database|sync)/, 'no persistence or sync');
  assert.doesNotMatch(src, /^import /m, 'pure CommonJS so plain Node tests load it');
});

// ── A-77: the Progress forms (CalculatorSection) ──

const calc = () => read('screens/components/CalculatorSection.js');

test('A-77: CalculatorSection reads its unsaved form text back from the draft store on mount', () => {
  const src = calc();
  assert.match(src, /import \{[^}]*\bgetDraft\b[^}]*\} from '\.\.\/\.\.\/lib\/draftStore'/);
  // Reality-check start sheet (start weight, chosen start day). Journey redesign 2026-10-02:
  // the typed phase-2 fields (weight now, kcal/day) are gone — the check finishes from the
  // day-21 weigh-in and the food log — so they have no draft any more.
  assert.match(src, /const \[rcDraft\] = useState\(\(\) => getDraft\('progress:rcWeigh'\)\)/, 'read once, on mount');
  assert.match(src, /useState\(\(\) => \(rcDraft && rcDraft\.then\) \|\| ''\)/, 'start weight');
  // Log today's weight sheet (parts 5-6).
  assert.match(src, /const \[wiDraft\] = useState\(\(\) => getDraft\('progress:todayWeigh'\)\)/);
  assert.match(src, /useState\(\(\) => \(wiDraft && wiDraft\.weight\) \|\| ''\)/);
  // Target sheet: open with its typed values.
  assert.match(src, /const \[tgtDraft\] = useState\(\(\) => getDraft\('progress:target'\)\)/);
  assert.match(src, /const \[targetEditing, setTargetEditing\] = useState\(\(\) => !!tgtDraft\)/);
  assert.match(src, /useState\(\(\) => \(tgtDraft && tgtDraft\.weight\) \|\| ''\)/);
  // Past weigh-in sheet.
  assert.match(src, /const \[bfDraft\] = useState\(\(\) => getDraft\('progress:pastWeighIn'\)\)/);
  assert.match(src, /const \[bfOpen, setBfOpen\] = useState\(\(\) => !!\(bfDraft && bfDraft\.open\)\)/);
  assert.match(src, /useState\(\(\) => \(bfDraft && bfDraft\.weight\) \|\| ''\)/);
});

test('A-77: CalculatorSection writes every change of those fields to the draft store', () => {
  const src = calc();
  assert.match(src, /keepDraft\('progress:rcWeigh', \{ then: rcThen, startDate: rcStartDate, thenAuto: rcThenAuto\.current \}\);\s*\}, \[rcThen, rcStartDate\]\)/);
  assert.match(src, /const rcThenAuto = useRef\(rcDraft && rcDraft\.thenAuto != null \? rcDraft\.thenAuto : null\)/, 'a prefilled start weight stays "prefilled" after a remount');
  assert.match(src, /validStartDate\(rcDraft\.startDate, todayISO\(\)\)/, 'a kept start day that is now more than 7 days back is dropped');
  assert.match(src, /keepDraft\('progress:todayWeigh', typed \? \{ weight: wiWeight, bf: wiBf, waist: wiWaist, open: wiOpen \} : null\);/);
  assert.match(src, /if \(targetEditing\) setDraft\('progress:target', \{ weight: tgtWeight, bf: tgtBF, date: tgtDate \}\);\s*else clearDraft\('progress:target'\);/);
  assert.match(src, /keepDraft\('progress:pastWeighIn', /);
});

test('A-77: a save (or the target Cancel, which discards on purpose today) clears that draft', () => {
  const src = calc();
  const fn = (name) => {
    const m = src.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\n  \\}\\n`));
    assert.ok(m, name);
    return m[0];
  };
  assert.match(src.match(/async function startRealityCheck\(\) \{[\s\S]*?\n  \}\n/)[0], /clearDraft\('progress:rcWeigh'\);/);
  assert.match(fn('saveTodayWeighIn'), /clearDraft\('progress:todayWeigh'\);/);
  // The target sheet: closing it (Cancel, backdrop, Android back) or saving ends targetEditing,
  // and the effect above clears the draft; the past weigh-in save empties its fields.
  assert.match(src, /const closeTarget = \(\) => \{ setTargetEditing\(false\);/);
  assert.match(fn('saveBackfillWeighIn'), /setBfWeight\(''\); setBfBodyFat\(''\); setBfDate\(todayISO\(\)\);/);
});

// ── A-77: the food chat follow-up answer ──

const chat = () => read('screens/FoodChatScreen.js');

test('A-77: the food chat keeps the typed follow-up answer per question', () => {
  const src = chat();
  assert.match(src, /import \{[^}]*\bgetDraft\b[^}]*\} from '\.\.\/lib\/draftStore'/);
  assert.match(src, /function fuDraftKey\(open\) \{\s*return open \? `foodChat:answer:\$\{open\.rowId\}:\$\{open\.index\}` : null;\s*\}/);
  // Typing writes the draft of the open question; a new question loads its own draft.
  assert.match(src, /onChangeText=\{typeFollowup\}/);
  assert.match(src, /function typeFollowup\(v\) \{[^}]*setFuText\(v\);[^}]*if \(fuKey\) \{ if \(v\) setDraft\(fuKey, v\); else clearDraft\(fuKey\); \}/);
  assert.match(src, /useEffect\(\(\) => \{ setFuText\(fuKey \? \(getDraft\(fuKey\) \|\| ''\) : ''\); \}, \[fuKey\]\);/);
  // Answer, Skip and Day done clear it (they end that question on purpose).
  const answer = src.match(/async function answerFollowup\([\s\S]*?\n  \}\n/)[0];
  assert.match(answer, /setFuText\(''\);\s*clearDraft\(fuDraftKey\(open\)\);/);
  const skip = src.match(/function skipFollowup\([\s\S]*?\n  \}\n/)[0];
  assert.match(skip, /setFuText\(''\);\s*clearDraft\(fuDraftKey\(open\)\);/);
  const close = src.match(/async function closeDay\([\s\S]*?\n  \}\n/)[0];
  assert.match(close, /if \(open\) \{ updateItem\([^\n]*\); clearDraft\(fuDraftKey\(open\)\); \}/);
});

test('A-77: the food chat composer draft stays on AsyncStorage as before (FL-36)', () => {
  const src = chat();
  assert.match(src, /const draftKey = \(uid\) => `dosetrace_food_draft:\$\{uid\}`;/);
  assert.match(src, /setText\(\(cur\) => cur \|\| d\)/);
});

test('A-77: fuDraftKey is per question (row + item)', () => {
  const src = chat();
  const m = src.match(/function fuDraftKey\(open\) \{[\s\S]*?\n\}/);
  assert.ok(m);
  const fuDraftKey = new Function(`${m[0]}; return fuDraftKey;`)();
  assert.equal(fuDraftKey({ rowId: 'r1', index: 0 }), 'foodChat:answer:r1:0');
  assert.equal(fuDraftKey({ rowId: 'r1', index: 2 }), 'foodChat:answer:r1:2');
  assert.equal(fuDraftKey(null), null);
});

// ── Hygiene ──

test('BK-12: the draft code parses, uses no raw colours and no emoji', () => {
  const { parse } = require('@babel/parser');
  for (const f of ['lib/draftStore.js', 'screens/components/CalculatorSection.js', 'screens/FoodChatScreen.js', 'screens/ProtocolsScreen.js']) {
    assert.doesNotThrow(() => parse(read(f), { sourceType: 'module', plugins: ['jsx'] }), f);
  }
  const src = read('lib/draftStore.js');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.doesNotMatch(src, /\p{Extended_Pictographic}/u);
});
