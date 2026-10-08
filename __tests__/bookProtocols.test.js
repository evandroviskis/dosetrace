'use strict';
// S-26 book layout on foldables (docs/specs/book-layout.md, founder-signed 2026-10-01):
// the My Protocols tab (BK-4) and the shared rows as they apply to it (BK-2, BK-8,
// BK-9, BK-10, BK-11, BK-12). The pure rules are lifted out of screens/ProtocolsScreen.js
// with @babel/parser and run directly; the layout is checked on the parsed source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const { defaultSelection, foldPlan } = require('../lib/bookLayout');

const FILE = path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js');
const src = fs.readFileSync(FILE, 'utf8');
const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
const slice = (n) => src.slice(n.start, n.end);

function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn));
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}
// A-115: ProtocolDetail and noteDraftKey are exported (Today's right page uses them) — unwrap exports.
const topFn = (name) => ast.program.body.map((n) => (n.type === 'ExportNamedDeclaration' && n.declaration ? n.declaration : n)).find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === name);
const jsxName = (n) => n.openingElement && n.openingElement.name && n.openingElement.name.name;

// The pure rules, loaded from the screen source.
const RULES = ['protocolListOrder', 'bookProtocolId', 'protocolsFoldView', 'protocolsUnfoldSelection'];
const rules = new Function(`${RULES.map((n) => { const f = topFn(n); assert.ok(f, `${n} exists`); return slice(f); }).join('\n')}
return { ${RULES.join(', ')} };`)();

const screen = ast.program.body.find((n) => n.type === 'ExportDefaultDeclaration').declaration;
assert.equal(screen.id.name, 'ProtocolsScreen');

// The book ternary inside the screen's root SafeAreaView.
let root = null;
walk(screen, (n) => {
  if (!root && n.type === 'JSXElement' && jsxName(n) === 'SafeAreaView' && /style=\{s\.container\}/.test(slice(n.openingElement))) root = n;
});
assert.ok(root, 'root SafeAreaView found');
const rootKids = root.children.filter((c) => c.type === 'JSXElement' || (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression'));
const bookSwitch = rootKids.find((c) => c.type === 'JSXExpressionContainer' && c.expression.type === 'ConditionalExpression'
  && c.expression.test.type === 'Identifier' && c.expression.test.name === 'book');
assert.ok(bookSwitch, 'the root switches on `book`');
const bookBranch = slice(bookSwitch.expression.consequent);
const phoneBranch = slice(bookSwitch.expression.alternate);

test('BK-4: BookPanes renders only under `book`, once, with the list left and the protocol right', () => {
  assert.equal((src.match(/<BookPanes\b/g) || []).length, 1, 'one BookPanes');
  assert.match(bookBranch, /^<BookPanes\b/, 'the book branch is the two pages');
  assert.doesNotMatch(phoneBranch, /<BookPanes\b/);
  assert.match(src, /const book = useBook\(\);/);
  assert.match(src, /import BookPanes, \{ useBook, useBookSelection \} from '\.\.\/components\/BookPanes'/);
  // Left page: large title, + Add, sort pills, cards (or the empty state).
  const left = bookBranch.slice(bookBranch.indexOf('left={'), bookBranch.indexOf('right={'));
  assert.match(left, /t\('protocols_title'\)/);
  assert.match(left, /\{addButton\}/);
  assert.match(left, /sortPills/);
  assert.match(left, /listCards/);
  assert.match(left, /emptyState/);
  // Right page: the same protocol screen as the phone, with Edit and without the back button.
  const right = bookBranch.slice(bookBranch.indexOf('right={'));
  assert.match(right, /renderDetail\(bookProtocol, true\)/);
  assert.match(right, /t\('protocols_edit'\)/);
  assert.match(right, /openEdit\(bookProtocol\)/);
  assert.doesNotMatch(bookBranch, /backBtn|today_protocols/, 'no "‹ Protocols" back button in the book');
  assert.match(right, /rightKey|: null/, 'nothing on the right when there is no protocol');
  assert.match(bookBranch, /rightKey=\{bookProtocol \? String\(bookProtocol\.id\) : 'none'\}/);
});

test('BK-2: one column is today\'s tab: heroes, the list with "‹ My Protocols", the protocol with "‹ Protocols"', () => {
  assert.match(phoneBranch, /view === 'heroes' && protocols\.length > 0/, 'heroes still render when !book');
  assert.match(phoneBranch, /onPress=\{\(\) => setShowList\(true\)\}/, 'the Protocols hero opens the list');
  assert.match(phoneBranch, /navigation\.navigate\('Log'\)/, 'the Dose log hero still pushes Log');
  // The back arrow is drawn (My Protocols parts 2 and 5, founder 2026-10-02), not a ‹ glyph.
  assert.match(phoneBranch, /<RowChevron color=\{colors\.ink\} \/><\/View>\s*<Text style=\{s\.backText\}>\{t\('today_protocols'\)\}/, 'protocol screen back button');
  assert.match(phoneBranch, /<RowChevron color=\{colors\.ink\} \/><\/View>\s*<Text style=\{s\.backText\}>\{t\('protocols_title'\)\}/, 'list back button');
  assert.match(phoneBranch, /view === 'detail' && renderDetail\(openProtocol, false\)/);
  assert.match(phoneBranch, /view === 'list' && protocols\.length > 0 && sortPills/);
  assert.match(phoneBranch, /view === 'list' && protocols\.length > 0 && listCards/);
  assert.match(phoneBranch, /<ScrollView ref=\{scrollRef\}/, 'the phone column keeps its scroll-to-top');
  assert.doesNotMatch(bookBranch, /view === 'heroes'|s\.heroes/, 'no heroes in the book');
  // The card style is untouched on the phone.
  assert.match(src, /style=\{book \? \[s\.pcard, s\.pcardBook, selected && s\.pcardSel\] : s\.pcard\}/);
  // The book selection list order is only computed in the book.
  assert.match(src, /const listOrderIds = book \? protocolListOrder\(sortBy, sortedProtocols\(\)\)\.map\(p => p\.id\) : \[\];/);
});

test('BK-4: the default right page is the protocol opened from Today / a notification, else the first card in the sort order', () => {
  assert.match(src, /useBookSelection\('Protocols', defaultSelection\('Protocols', \{\s*protocolIds: listOrderIds,\s*openProtocolId: route\.params\?\.openProtocolId,\s*\}\)\)/);
  const ids = ['a', 'b', 'c'];
  assert.equal(defaultSelection('Protocols', { protocolIds: ids, openProtocolId: 'c' }), 'c', 'deep link first');
  assert.equal(defaultSelection('Protocols', { protocolIds: ids }), 'a', 'else the first card');
  assert.equal(defaultSelection('Protocols', { protocolIds: [] }), null, 'no protocols: nothing on the right');
  // "First card" follows the list as shown: the 'type' sort shows recon, then RTU, then oral.
  const ps = [{ id: 'o', type: 'oral' }, { id: 'r', type: 'rtu' }, { id: 'l', type: 'recon' }];
  assert.deepEqual(rules.protocolListOrder('type', ps).map((p) => p.id), ['l', 'r', 'o']);
  assert.deepEqual(rules.protocolListOrder('az', ps).map((p) => p.id), ['o', 'r', 'l'], 'other sorts are already in order');
  // The chosen protocol while it exists, else the default, else the first, else nothing.
  assert.equal(rules.bookProtocolId('b', 'a', ids), 'b');
  assert.equal(rules.bookProtocolId('gone', 'a', ids), 'a', 'a deleted choice falls back to the default');
  assert.equal(rules.bookProtocolId('gone', 'gone2', ids), 'a');
  assert.equal(rules.bookProtocolId(null, null, []), null);
  // A deep link opens it on the right page (explicit) and in the phone column.
  assert.match(src, /const openId = route\.params\?\.openProtocolId;\s*if \(openId != null\) \{\s*openProtocolById\(openId\);/);
  const open = slice(screen.body.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'openProtocolById'));
  assert.match(open, /bookSel\.select\(id\)/);
  assert.match(open, /setOpenId\(id\)/);
  assert.match(open, /setShowList\(true\)/);
});

test('BK-8: tapping a card selects it; the selected card has a 2 pt ink outline (no shift: every book card reserves it)', () => {
  assert.match(src, /onOpen=\{openProtocolById\}/);
  assert.match(src, /book=\{book\} selected=\{book && p\.id === bookOpenId\}/);
  assert.match(src, /pcardBook: \{ borderWidth: 2, borderColor: 'transparent' \}/);
  assert.match(src, /pcardSel: \{ borderColor: c\.ink \}/);
  assert.match(src, /accessibilityState=\{book \? \{ selected \} : undefined\}/);
  // Kept while the app is open: the selection lives in lib/bookSelection (shared module state).
  assert.match(src, /useBookSelection\('Protocols'/);
});

test('BK-9: the two pages come from BookPanes (equal halves, 22 pt gutter, nothing on the fold)', () => {
  const panes = fs.readFileSync(path.join(__dirname, '..', 'components', 'BookPanes.js'), 'utf8');
  assert.match(panes, /width: GUTTER/);
  assert.match(panes, /pointerEvents="none"/);
  assert.doesNotMatch(bookBranch, /GUTTER|paneWidths|width:/, 'the tab adds no layout of its own over the fold');
});

test('BK-10: folding with a chosen protocol shows its protocol screen; a default nobody chose keeps the one-column place', () => {
  assert.deepEqual(rules.protocolsFoldView({ sel: 'b', explicit: true, openId: null, showList: false }), { openId: 'b', showList: true });
  assert.deepEqual(rules.protocolsFoldView({ sel: 'a', explicit: false, openId: null, showList: false }), { openId: null, showList: false }, 'heroes stay heroes');
  assert.deepEqual(rules.protocolsFoldView({ sel: 'a', explicit: false, openId: null, showList: true }), { openId: null, showList: true }, 'the list stays the list');
  assert.deepEqual(rules.protocolsFoldView({ sel: null, explicit: false, openId: 'x', showList: true }), { openId: 'x', showList: true });
  // A protocol is shown by the tab itself, not pushed on the stack.
  assert.equal(foldPlan({ tab: 'Protocols', sel: 'b', explicit: true }), null);
});

test('BK-10: unfolding with a protocol screen open puts it on the right page', () => {
  assert.equal(rules.protocolsUnfoldSelection({ openId: 'b', showList: true }), 'b');
  assert.equal(rules.protocolsUnfoldSelection({ openId: null, showList: true }), null, 'from the list: keep the right page');
  assert.equal(rules.protocolsUnfoldSelection({ openId: null, showList: false }), null, 'from the heroes: keep the right page');
  // Wired: a layout effect on `book` applies both rules.
  assert.match(src, /useLayoutEffect\(\(\) => \{\s*if \(wasBook\.current === book\) return;/);
  assert.match(src, /const id = protocolsUnfoldSelection\(\{ openId, showList \}\);\s*if \(id != null\) bookSel\.select\(id\);/);
  assert.match(src, /protocolsFoldView\(\{ sel: cur \? cur\.sel : null, explicit: !!\(cur && cur\.explicit\), openId, showList \}\)/);
  // Back ("‹ Protocols") and Delete close the protocol in both layouts.
  const close = slice(screen.body.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === 'closeProtocol'));
  assert.match(close, /setOpenId\(null\)/);
  assert.match(close, /clearSelection\('Protocols'\)/);
  assert.match(src, /onPress=\{closeProtocol\}/);
  assert.match(src, /closeProtocol\(\); \/\/ back to the list/);
  // Working on the right page's default (Edit, enlarge, typing a note) makes it the user's choice.
  assert.match(src, /onZoom=\{\(id\) => \{ if \(inBook\) claimBookProtocol\(id\);/);
  assert.match(src, /onDraft=\{\(id, text\) => \{ if \(inBook && text != null\) claimBookProtocol\(id\);/);
});

test('BK-10, BK-11: every sheet sits outside the book switch, so a fold or unfold never closes it', () => {
  // A conditional sheet ({cond && <X />}) counts by the element it renders.
  const kidName = (c) => (c.type === 'JSXElement' ? jsxName(c)
    : c.type === 'JSXExpressionContainer' && c.expression.type === 'LogicalExpression' && c.expression.right.type === 'JSXElement' ? jsxName(c.expression.right) : null);
  const after = rootKids.slice(rootKids.indexOf(bookSwitch) + 1).map(kidName).filter(Boolean);
  // + the free-feature explainer (Today redesign part 18), a sheet like the others.
  assert.deepEqual(after, ['DTSheet', 'FeatureExplainerGate', 'SyringeZoomSheet', 'Modal'], 'delete/limit sheet, explainer, enlarged syringe, add/edit wizard');
  assert.equal(rootKids.indexOf(bookSwitch), 0, 'the switch is the first child, so the sheets keep their place');
  for (const branch of [bookBranch, phoneBranch]) {
    assert.doesNotMatch(branch, /<Modal\b|<DTSheet\b|<DTPickerSheet\b|<DTActionSheet\b|<SyringeZoomSheet\b/);
  }
  // The wizard (Edit, + Add, its pickers and popups) opens as today: a page sheet.
  const wizard = rootKids.find((c) => c.type === 'JSXElement' && jsxName(c) === 'Modal');
  const w = slice(wizard);
  assert.match(w, /visible=\{showModal\}/);
  assert.match(w, /presentationStyle="pageSheet"/);
  assert.match(w, /<DTSheet config=\{wizSheet\}/);
  assert.match(w, /<DTPickerSheet visible=\{showModal && showStartPicker\}/);
  assert.match(w, /<DTPickerSheet visible=\{showModal && showTimePicker\}/);
  // The enlarged syringe left the protocol screen (it remounts on a fold) for the screen.
  assert.doesNotMatch(slice(topFn('ProtocolDrawHero')), /<Modal\b|useState\(false\)/);
  assert.match(slice(topFn('SyringeZoomSheet')), /<Modal visible=\{visible && ok\} transparent animationType="fade"/);
  // Nothing that holds a sheet is keyed on `book`.
  assert.doesNotMatch(src, /key=\{[^}]*\bbook\b/);
});

test('BK-10: a typed protocol note survives the protocol screen moving between the column and the right page', () => {
  const detail = slice(topFn('ProtocolDetail'));
  assert.doesNotMatch(detail, /useState\(p\.note/, 'the draft is not local to the protocol screen');
  assert.match(detail, /const noteDraft = draft != null \? draft : \(p\.note \|\| ''\);/);
  assert.match(detail, /if \(lastNote\.current !== p\.note\)/, 'a remount does not reset it, a changed stored note does');
  // BK-14 / A-77: the draft now lives per protocol in lib/draftStore (see below).
  assert.match(src, /draft=\{getDraft\(noteDraftKey\(p\.id\)\)\}/);
});

// ── BK-14 / A-77: the unsaved protocol note is kept per protocol until Save or Cancel ──
// Bug (A-77): opening another protocol or going back to the list set the screen's single
// note draft to null, so a note typed and not yet saved was lost. The screen's own handlers
// are lifted from the source and run against the real lib/draftStore.
function innerFn(name) {
  let f = null;
  walk(screen, (n) => { if (!f && n.type === 'FunctionDeclaration' && n.id && n.id.name === name) f = n; });
  assert.ok(f, `${name} exists`);
  return slice(f);
}

test('A-77 / BK-14: a typed note survives opening another protocol, going back to the list and a remount; Save and Cancel clear it', () => {
  const store = require('../lib/draftStore');
  store.clearAllDrafts();
  const keyFn = topFn('noteDraftKey');
  assert.ok(keyFn, 'noteDraftKey is a top-level function');
  const NAMES = ['onNoteDraft', 'openProtocolById', 'closeProtocol', 'saveProtocolNote'];
  const updates = [];
  const sels = [];
  const make = new Function(
    'getDraft', 'setDraft', 'clearDraft', 'setDraftTick', 'bookSel', 'setOpenId', 'setShowList',
    'clearSelection', 'updateProtocol', 'fetchProtocols', 'requestSync',
    `${slice(keyFn)}\n${NAMES.map(innerFn).join('\n')}\nreturn { ${NAMES.join(', ')}, noteDraftKey };`,
  );
  const f = make(
    store.getDraft, store.setDraft, store.clearDraft, () => {}, { select: (id) => sels.push(id) }, () => {}, () => {},
    () => {}, (id, patch) => updates.push([id, patch]), () => {}, () => {},
  );
  assert.equal(f.noteDraftKey(1), 'protocolNote:1');
  f.onNoteDraft(1, 'take with food');                 // typing on protocol 1
  f.openProtocolById(2);                              // tap another protocol (left page / list)
  assert.equal(store.getDraft('protocolNote:1'), 'take with food', 'kept when another protocol opens');
  f.onNoteDraft(2, 'evening');
  f.closeProtocol();                                  // "‹ Protocols" / leaving the protocol
  assert.equal(store.getDraft('protocolNote:1'), 'take with food', 'kept when going back to the list');
  assert.equal(store.getDraft('protocolNote:2'), 'evening', 'each protocol keeps its own draft');
  f.saveProtocolNote(1, 'take with food');            // Save
  assert.deepEqual(updates, [[1, { note: 'take with food' }]], 'the save itself is unchanged');
  assert.equal(store.getDraft('protocolNote:1'), undefined, 'Save clears that draft');
  assert.equal(store.getDraft('protocolNote:2'), 'evening', 'and only that one');
  f.onNoteDraft(2, null);                             // Cancel
  assert.equal(store.getDraft('protocolNote:2'), undefined, 'Cancel clears the draft (discard on purpose)');
  store.clearAllDrafts();
});

test('A-77 / BK-14: the protocol screen reads the draft from the store, so a remount (fold, unfold, coming back) shows it', () => {
  assert.match(src, /import \{[^}]*\bgetDraft\b[^}]*\} from '\.\.\/lib\/draftStore'/);
  assert.match(src, /draft=\{getDraft\(noteDraftKey\(p\.id\)\)\}/);
  assert.doesNotMatch(src, /useState\(null\);\s*const \[zoom/, 'no single screen-state note draft left');
  assert.doesNotMatch(src, /setNoteDraft\(null\)/, 'nothing throws a draft away except Save / Cancel');
  const detail = slice(topFn('ProtocolDetail'));
  assert.match(detail, /const noteDraft = draft != null \? draft : \(p\.note \|\| ''\);/);
  assert.match(detail, /onPress=\{\(\) => onDraft\(p\.id, null\)\}/, 'Cancel discards on purpose, as today');
});

test('BK-12: theme tokens only, no emoji, no new strings in the book code', () => {
  const bookCode = [
    bookBranch,
    slice(topFn('SyringeZoomSheet')),
    ...RULES.map((n) => slice(topFn(n))),
    (src.match(/pcardBook:[^\n]*\n[^\n]*/) || [''])[0],
    (src.match(/headerEnd:[^\n]*/) || [''])[0],
  ].join('\n');
  assert.doesNotMatch(bookCode, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.doesNotMatch(bookCode, /\p{Extended_Pictographic}/u);
  const tr = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8');
  const keys = [...bookCode.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
  assert.ok(keys.length > 0);
  for (const k of keys) {
    const n = (tr.match(new RegExp(`\\b${k}:`, 'g')) || []).length;
    assert.ok(n >= 6, `${k} exists in all 6 languages (found ${n})`);
  }
});
