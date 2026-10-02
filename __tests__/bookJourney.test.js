'use strict';
// S-26 book layout, the Journey tab (docs/specs/book-layout.md BK-5, with BK-2/8/9/10/11/12
// as they apply). Source/parse tests of the screens plus direct tests of lib/debouncedSave.
//
// BK-10 bug (CLAUDE.md "NEVER lose user-entered data"): CalculatorSection saved its inputs
// with a 900 ms debounced effect whose cleanup only cleared the timer, so a value typed
// less than 0.9 s before the Progress screen unmounted (leaving Progress, or a fold or
// unfold moving it between a pushed screen and the right page) was never saved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ── BK-10: the calculator never drops a value typed just before the screen goes away ──

test('BK-10: a value typed under 0.9 s before unmount is saved (flush), once, with the latest values', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createDebouncedSave } = require('../lib/debouncedSave');
  const saved = [];
  const saver = createDebouncedSave((p) => { saved.push(p); return Promise.resolve(); }, 900);
  saver.schedule({ weight: '8' });
  t.mock.timers.tick(300);
  saver.schedule({ weight: '82' });          // still typing
  t.mock.timers.tick(400);                   // 0.4 s after the last key, the screen unmounts
  assert.equal(saved.length, 0, 'nothing saved yet: the debounce is still waiting');
  saver.flush();                             // unmount / beforeLeave
  assert.deepEqual(saved, [{ weight: '82' }], 'the latest values are written right away');
  t.mock.timers.tick(5000);
  assert.equal(saved.length, 1, 'the cancelled timer never saves a second time');
  saver.flush();
  assert.equal(saved.length, 1, 'a second flush with nothing pending writes nothing');
});

test('BK-10: the debounce still coalesces typing into one save after 0.9 s', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { createDebouncedSave } = require('../lib/debouncedSave');
  const saved = [];
  const saver = createDebouncedSave((p) => { saved.push(p); }, 900);
  saver.schedule({ weight: '8' });
  t.mock.timers.tick(500);
  saver.schedule({ weight: '81' });
  t.mock.timers.tick(899);
  assert.equal(saved.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(saved, [{ weight: '81' }]);
  saver.flush();
  assert.equal(saved.length, 1, 'nothing pending after the timer fired');
});

test('BK-10: a failing save never throws out of flush (fire-and-forget, as before)', () => {
  const { createDebouncedSave } = require('../lib/debouncedSave');
  const a = createDebouncedSave(() => { throw new Error('offline'); }, 900);
  a.schedule({ weight: '80' });
  assert.doesNotThrow(() => a.flush());
  const b = createDebouncedSave(() => Promise.reject(new Error('offline')), 900);
  b.schedule({ weight: '80' });
  assert.doesNotThrow(() => b.flush());
});

test('BK-10: CalculatorSection flushes pending inputs on unmount instead of dropping them', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.match(src, /createDebouncedSave\(/, 'the inputs go through the flushing debounced save');
  // The old bug: the save effect's cleanup only cleared the timer.
  assert.doesNotMatch(src, /saveCalcInputs\(payload\)[\s\S]{0,120}\}, 900\);\s*return \(\) => clearTimeout\(timer\);/, 'no debounce that only clears its timer');
  assert.match(src, /useEffect\(\(\) => \(\) => [^\n]*\.flush\(\)/, 'an unmount effect flushes the pending save');
  assert.match(src, /flushRef/, 'the screen can flush before it leaves (beforeLeave)');
});

test('BK-10: ProgressScreen flushes the calculator in beforeLeave when it moves to the right page', () => {
  const src = read('screens/ProgressScreen.js');
  assert.match(src, /useUnfoldToPage\('Progress'/, 'route name Progress');
  assert.match(src, /beforeLeave/, 'passes beforeLeave');
  assert.match(src, /flushRef/, 'beforeLeave flushes the calculator');
});

// ── BK-5 / BK-2: the Journey tab as a book, and unchanged on a phone ──

const journey = () => read('screens/JourneyScreen.js');

test('BK-2: on a phone (one column) Journey renders the dashboard alone, no BookPanes', () => {
  const src = journey();
  const phone = src.match(/if \(!book\) \{\s*return \(([\s\S]*?)\);\s*\}/);
  assert.ok(phone, 'a one-column return guarded by !book');
  assert.match(phone[1], /\{dashboard\}/, 'the one column is the existing dashboard');
  assert.doesNotMatch(phone[1], /BookPanes/, 'no pages on a phone');
  assert.match(src, /const book = useBook\(\);/);
  // Phone taps push the stack screens exactly as before.
  assert.match(src, /book \? open\('progress'\) : navigation\.navigate\('Progress'\)/);
  assert.match(src, /if \(book\) open\('curve'\); else navigation\.navigate\('SerumCurve'\);/);
  assert.match(src, /\) : \(\s*<FoodLogHero variant="journey" \/>\s*\)\}/, 'on a phone the food card is used as-is');
});

test('BK-5: BookPanes only under book, left = the dashboard, right keyed by the open page', () => {
  const src = journey();
  const uses = src.match(/<BookPanes\b[^>]*\/>/g) || [];
  assert.equal(uses.length, 1, 'one BookPanes');
  assert.match(uses[0], /left=\{dashboard\}/);
  assert.match(uses[0], /right=\{right\}/);
  assert.match(uses[0], /rightKey=\{page\}/);
  assert.ok(src.indexOf('<BookPanes') > src.search(/if \(!book\) \{/), 'BookPanes comes after the phone return');
  assert.match(src, /useFoldPush\('Journey'\)/, 'folding pushes the open item (BK-10)');
});

test('BK-5: the right page is Your progress by default', () => {
  const src = journey();
  assert.match(src, /useBookSelection\('Journey', 'progress'\)/);
  const { defaultSelection } = require('../lib/bookLayout');
  assert.equal(defaultSelection('Journey'), 'progress');
  // Anything that is not food / curve / wait falls through to Progress.
  assert.match(src, /: <ProgressScreen embedded \/>;/);
  assert.match(src, /page === 'food' \? <FoodChatScreen embedded params=\{selParams\} \/>/);
  assert.match(src, /page === 'curve' \? <SerumCurveScreen embedded \/>/);
});

test('BK-5 / BK-11: a free user tapping Dose accumulation still gets the Paywall full screen', () => {
  const src = journey();
  const press = src.match(/onPress=\{\(\) => \{\s*\/\/ Free users[^\n]*\n([\s\S]*?)\}\}/);
  assert.ok(press, 'the Curve tile press handler');
  const body = press[1];
  const pay = body.indexOf("navigation.navigate('Paywall', { source: 'journey_serum' }); return;");
  assert.ok(pay >= 0, 'free → Paywall with the same source as before');
  assert.match(body, /if \(!premium\) \{ navigation\.navigate\('Paywall'/, 'gated on Premium first');
  assert.ok(pay < body.indexOf("open('curve')"), 'the Paywall check runs before the book opens the Curve');
  // The Curve page itself is never shown without Premium (lapsed Premium falls back).
  assert.match(src, /sel === 'curve' && premium !== true \? \(premium === null \? 'wait' : 'progress'\) : sel/);
  assert.match(src, /if \(premium === false && sel === 'curve'\) clearSelection\('Journey'\)/);
});

test('BK-5: the food log card opens the chat on the right page; other routes (Paywall) pass through', () => {
  const src = journey();
  assert.match(src, /<NavigationContext\.Provider value=\{heroNav\}>\s*<FoodLogHero variant="journey" \/>/);
  const memo = src.match(/const heroNav = useMemo\(\(\) => \{([\s\S]*?)\}, \[book, navigation\]\);/);
  assert.ok(memo, 'heroNav is memoised on book + navigation (stable, so the card does not reload each render)');
  // Run the memo body against a fake navigation to prove the behaviour.
  const calls = [];
  const sets = [];
  const fakeNav = { navigate: (...a) => calls.push(a), isFocused: () => true };
  const make = new Function('book', 'navigation', 'setSelection', memo[1]);
  const nav = make(true, fakeNav, (...a) => sets.push(a));
  nav.navigate('FoodChat', { logIt: 5 });
  assert.deepEqual(sets, [['Journey', 'food', { explicit: true, params: { logIt: 5 } }]]);
  assert.equal(calls.length, 0, 'the chat is not pushed on a book');
  nav.navigate('Paywall', { source: 'food_hero' });
  assert.deepEqual(calls, [['Paywall', { source: 'food_hero' }]], 'a locked log still opens the Paywall full screen (BK-11)');
  assert.equal(nav.isFocused(), true, 'everything else is the real navigation');
  assert.equal(make(false, fakeNav, () => {}), null, 'no override on a phone');
});

test('BK-8: the open card or tile has a 2 pt ink outline, only on a book', () => {
  const src = journey();
  assert.match(src, /selected: \{ borderWidth: 2, borderColor: c\.ink, borderRadius: 24 \}/);
  assert.match(src, /\{book && page === 'progress' \? outline : null\}/);
  assert.match(src, /\{book && page === 'curve' \? outline : null\}/);
  assert.match(src, /\{page === 'food' && heroH > 0 \? outline : null\}/);
  assert.match(src, /pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, s\.selected\]\}/, 'the outline never takes a tap or moves the layout');
});

// ── The embedded screens (right page) ──

const EMBEDDED = [
  { file: 'screens/ProgressScreen.js', route: 'Progress' },
  { file: 'screens/SerumCurveScreen.js', route: 'SerumCurve' },
  { file: 'screens/FoodChatScreen.js', route: 'FoodChat' },
];
for (const { file, route } of EMBEDDED) {
  test(`BK-5 / BK-10: ${file} takes embedded (boolean) and moves to the page on unfold as '${route}'`, () => {
    const src = read(file);
    assert.match(src, /export default function \w+\(\{ embedded = false[,} ]/, 'embedded prop, default false');
    assert.match(src, new RegExp(`useUnfoldToPage\\('${route}', \\{\\s*embedded,`), 'route name + embedded');
  });
}

test('BK-5: embedded Progress has no back row and no top safe-area edge', () => {
  const src = read('screens/ProgressScreen.js');
  assert.match(src, /edges=\{embedded \? \['left', 'right'\] : \['top', 'left', 'right'\]\}/);
  assert.match(src, /<View style=\{s\.nav\}>\s*\{embedded \? null : \(\s*<TouchableOpacity onPress=\{\(\) => navigation\.goBack\(\)\}/);
  assert.match(src, /nav: embedded \? \{ height: 8 \} :/, 'no 44 pt back row on the page');
  assert.match(src, /paneWidth=\{embedded \? paneWidths\(width\)\.right : null\}/, 'the chart fits the page');
});

test('BK-5: embedded Curve has no back row, no top edge, and is sized to the page', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /edges=\{embedded \? \['left', 'right', 'bottom'\] : undefined\}/);
  assert.match(src, /\{embedded \? <View style=\{s\.navEmbedded\} \/> : \(\s*<View style=\{s\.nav\}>/);
  assert.match(src, /const windowWidth = embedded \? paneWidths\(rawWindowWidth\)\.right : rawWindowWidth;/);
  assert.match(src, /if \(embedded\) navigation\.navigate\('Paywall'[^\n]*\n\s*else navigation\.replace\('Paywall'/, 'a tab page has no replace(); the stack screen keeps its guard');
});

test('BK-5: embedded food chat has no Done, no top edge, no auto-close, params from the prop', () => {
  const src = read('screens/FoodChatScreen.js');
  assert.match(src, /const edges = embedded \? \['left', 'right'\] :/);
  assert.match(src, /\{embedded \? null : \(\s*<TouchableOpacity onPress=\{\(\) => navigation\.goBack\(\)\}/);
  assert.match(src, /const routeParams = embedded \? \(paramsProp \|\| null\) : \(\(route && route\.params\) \|\| null\);/);
  assert.match(src, /const eveningParam = routeParams\?\.eveningDay;/);
  assert.match(src, /const logItNonce = routeParams\?\.logIt;/);
  assert.doesNotMatch(src, /route\?\.params/, 'no direct route params left');
  assert.match(src, /if \(!embedded && shouldAutoClose\(\{[^\n]*'idle'\)/, 'idle auto-close would switch tabs on a page');
  assert.match(src, /if \(!embedded && st === 'background' && shouldAutoClose/);
  assert.match(src, /if \(!embedded\) navigation\.setOptions/);
});

test('BK-10: the food chat writes its draft before it moves, and on unmount', () => {
  const src = read('screens/FoodChatScreen.js');
  assert.match(src, /beforeLeave: \(\) => saveDraftNow\(guardRef\.current\.text\)/);
  assert.match(src, /useEffect\(\(\) => \(\) => \{ saveDraftNow\(guardRef\.current\.text\); \}, \[userId\]\);/);
  assert.match(src, /setText\(\(cur\) => cur \|\| d\)/, 'the chat reads the draft back when it opens');
});

// ── BK-17: the food chat on the right page stays until the user picks another item ──

test('BK-17: the embedded food chat has no Done: the only Done button is rendered when not embedded', () => {
  const src = read('screens/FoodChatScreen.js');
  const dones = [...src.matchAll(/t\('done'\)/g)];
  assert.equal(dones.length, 1, 'one Done label');
  const before = src.slice(0, dones[0].index);
  const guard = before.lastIndexOf('{embedded ? null : (');
  assert.ok(guard >= 0 && before.length - guard < 600, 'the Done button sits inside {embedded ? null : ( ... )}');
});

test('BK-17: the embedded food chat never closes itself (every goBack is the Done button or guarded by !embedded)', () => {
  const src = read('screens/FoodChatScreen.js');
  const lines = src.split('\n');
  const backs = lines.map((l, i) => [l, i]).filter(([l]) => /navigation\.goBack\(\)/.test(l));
  assert.ok(backs.length >= 3, 'idle, background and Done');
  for (const [l, i] of backs) {
    const doneButton = lines.slice(Math.max(0, i - 2), i).some((p) => p.includes('{embedded ? null : ('));
    assert.ok(/!embedded &&/.test(l) || doneButton, `line ${i + 1} closes the chat on a page: ${l.trim()}`);
  }
  assert.doesNotMatch(src, /navigation\.(pop|popTo|replace|dispatch)\(/, 'no other way to leave from the page');
});

test('BK-17: Journey keeps the chat on the right page until another item is picked (no timer, no automatic change)', () => {
  const src = journey();
  assert.doesNotMatch(src, /setTimeout|setInterval/, 'nothing on a timer changes the page');
  const clears = src.match(/clearSelection\('Journey'\)/g) || [];
  assert.equal(clears.length, 1, 'the only automatic change is the lapsed-Premium Curve fallback');
  assert.match(src, /if \(premium === false && sel === 'curve'\) clearSelection\('Journey'\)/);
  const expr = src.match(/const page = ([^;]+);/)[1];
  const page = new Function('sel', 'premium', `return ${expr};`);
  for (const premium of [null, false, true]) assert.equal(page('food', premium), 'food', `food stays (premium ${premium})`);
  // The food chat's own params never move the selection either (it reads them as a prop).
  assert.doesNotMatch(read('screens/FoodChatScreen.js'), /setSelection|clearSelection/);
});

// ── BK-19: a change saved on the Progress page updates the Journey tiles right away ──
// Bug: the Journey weight tile read the calculator inputs only on focus. On a book the
// Progress page sits next to the tiles, so nothing refocused and the tile kept the old
// weight until the user switched tabs.

test('BK-19: CalculatorSection announces every saved calculator change (notifyDataChanged calc)', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.match(src, /import \{[^}]*\bnotifyDataChanged\b[^}]*\} from '\.\.\/\.\.\/lib\/sync'/);
  assert.match(src, /function calcChanged\(\) \{ notifyDataChanged\('calc'\); \}/);
  assert.match(src, /createDebouncedSave\(\(payload\) => saveCalcInputs\(payload\)\.then\(calcChanged\), 900\)/, 'after the inputs are written');
  for (const name of ['saveSnapshot', 'saveTarget', 'saveBackfillWeighIn', 'saveRcWeighIn', 'saveRealityCheck', 'startRealityCheck', 'resetRealityCheck', 'startNextRealityCheck']) {
    const m = src.match(new RegExp(`(async )?function ${name}\\(\\) \\{[\\s\\S]*?\\n  \\}\\n`));
    assert.ok(m, name);
    assert.match(m[0], /calcChanged\(\);/, `${name} announces the change`);
  }
});

test('BK-19: Journey refreshes the tiles on a calculator change or a finished sync, while mounted', () => {
  const src = journey();
  assert.match(src, /import \{ addSyncListener \} from '\.\.\/lib\/sync';/);
  assert.match(src, /useEffect\(\(\) => addSyncListener\(\(e\) => \{\s*if \(tilesNeedRefresh\(e\)\) loadTile\(\)\.catch\(\(\) => \{\}\);\s*\}\), \[\]\);/, 'subscribes once, unsubscribes on unmount (addSyncListener returns the unsubscribe)');
  const m = src.match(/function tilesNeedRefresh\(e\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'tilesNeedRefresh');
  const tilesNeedRefresh = new Function(`${m[0]}; return tilesNeedRefresh;`)();
  assert.equal(tilesNeedRefresh({ type: 'data_changed', what: 'calc' }), true, 'a weigh-in or calculator save on the Progress page');
  assert.equal(tilesNeedRefresh({ type: 'sync_complete' }), true, 'a weigh-in pulled from another device');
  assert.equal(tilesNeedRefresh({ type: 'import_complete' }), true);
  assert.equal(tilesNeedRefresh({ type: 'data_changed', what: 'protocol' }), false, 'other data does not reload the tiles');
  assert.equal(tilesNeedRefresh({ type: 'sync_start' }), false);
  assert.equal(tilesNeedRefresh(null), false);
});

// ── BK-12 and hygiene ──

const CHANGED = ['screens/JourneyScreen.js', 'screens/ProgressScreen.js', 'screens/SerumCurveScreen.js', 'screens/FoodChatScreen.js', 'screens/components/CalculatorSection.js', 'lib/debouncedSave.js'];

test('BK-12: every changed file parses (JSX)', () => {
  const { parse } = require('@babel/parser');
  for (const f of CHANGED) {
    assert.doesNotThrow(() => parse(read(f), { sourceType: 'module', plugins: ['jsx'] }), f);
  }
});

test('BK-12: Journey and Progress use theme tokens only, no emoji', () => {
  for (const f of ['screens/JourneyScreen.js', 'screens/ProgressScreen.js', 'lib/debouncedSave.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `${f}: no raw hex`);
    assert.doesNotMatch(src, /'(white|black|transparent)'/, `${f}: no named colors`);
    assert.doesNotMatch(src, /rgba?\(/, `${f}: no rgba`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f}: no emoji`);
  }
});

// BK-14 / A-77 (main session, 2026-10-01): the food entry editor kept its typed values only
// in its own state, so a fold/unfold (the chat remounts) or closing by mistake lost them.
test('BK-14: the food entry editor keeps typed values per entry and reopens after a remount', () => {
  const fs = require('fs');
  const path = require('path');
  const ed = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'FoodEntryEditor.js'), 'utf8');
  assert.match(ed, /editorDraftKey\(/, 'a per-entry draft key');
  assert.match(ed, /getDraft\(key\)/, 'opens from the kept draft');
  assert.match(ed, /setDraft\(key, \{ items, date \}\)/, 'writes every change');
  assert.match(ed, /clearDraft\(key\)/, 'Save and Cancel clear it');
  const chat = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');
  assert.match(chat, /EDITOR_OPEN_KEY/, 'the chat remembers which entry editor was open');
  assert.match(chat, /getDraft\(EDITOR_OPEN_KEY\)/);
});
