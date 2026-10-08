'use strict';
// S-26 book layout, the Today tab (docs/specs/book-layout.md, founder-signed 2026-10-01):
// BK-3 (left = Today, right = Dose log or the tapped dose with the syringe, Mark taken /
// Skip through Today's own handlers), BK-2 (one column = today's app), BK-8 (ink outline on
// the selected dose), BK-9 (nothing on the fold), BK-10 (fold / unfold), BK-12 (tokens only,
// no emoji, no new strings). Source tests: the files are parsed with @babel/parser, as the
// other screen tests do (no React Native renderer in plain Node).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const parse = (src) => parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });

const TODAY = read('screens/TodayScreen.js');
const LOG = read('screens/LogScreen.js');
const todayAst = parse(TODAY);
const logAst = parse(LOG);

// Visit every node with its ancestor chain.
function walk(ast, fn) {
  (function go(node, anc) {
    if (!node || typeof node.type !== 'string') return;
    fn(node, anc);
    const next = anc.concat([node]);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => go(c, next));
      else if (v && typeof v.type === 'string') go(v, next);
    }
  })(ast.program, []);
}
const code = (src, node) => src.slice(node.start, node.end);
function jsx(ast, name) {
  const out = [];
  walk(ast, (n, anc) => { if (n.type === 'JSXElement' && n.openingElement.name.name === name) out.push({ n, anc }); });
  return out;
}
function attr(el, name) {
  return el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name) || null;
}
function calls(ast, name) {
  const out = [];
  walk(ast, (n) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name) out.push(n); });
  return out;
}
function fnDecl(ast, name) {
  let hit = null;
  walk(ast, (n) => { if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = n; });
  return hit;
}
function varInit(ast, name) {
  let hit = null;
  walk(ast, (n) => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name) hit = n.init; });
  return hit;
}

// ── Today ──────────────────────────────────────────────────────

test('BK-2/BK-3: Today renders BookPanes only under `book`; one column is the unchanged Today scroll', () => {
  assert.equal(calls(todayAst, 'useBook').length, 1, 'Today asks useBook() once');
  const panes = jsx(todayAst, 'BookPanes');
  assert.equal(panes.length, 1, 'exactly one <BookPanes>');
  const { n, anc } = panes[0];
  const cond = anc[anc.length - 1];
  assert.equal(cond.type, 'ConditionalExpression', 'BookPanes sits in a `book ? … : …`');
  assert.equal(cond.test.type, 'Identifier');
  assert.equal(cond.test.name, 'book');
  assert.equal(cond.consequent, n, 'BookPanes is the book branch');
  assert.equal(cond.alternate.type, 'Identifier');
  assert.equal(cond.alternate.name, 'leftPage', 'one column renders the same left page');
  // The conditional is the first child of Today's SafeAreaView (the old ScrollView spot).
  const sav = anc.slice().reverse().find((a) => a.type === 'JSXElement');
  assert.equal(sav.openingElement.name.name, 'SafeAreaView');
  // leftPage is the Today ScrollView itself — the same element the phone always rendered.
  const lp = varInit(todayAst, 'leftPage');
  assert.ok(lp && lp.type === 'JSXElement' && lp.openingElement.name.name === 'ScrollView', 'leftPage is the Today ScrollView');
  const leftSrc = code(TODAY, lp);
  for (const piece of ['alerts.length > 0', 'pendingYest.length > 0', '<TodayTracker', '<FoodLogHero', 'todayCards.filter(p => !focusCard || p.id !== focusCard.id).map(p => renderDoseCard(p))', 'takenNames.length > 0', "foldRow('tom'", "foldRow('n5'"]) {
    assert.ok(leftSrc.includes(piece), `the left page keeps ${piece}`);
  }
  // Both pages: left = leftPage, right = the right page, keyed by the open item.
  assert.equal(code(TODAY, attr(n, 'left').value.expression), 'leftPage');
  assert.equal(code(TODAY, attr(n, 'right').value.expression), 'renderRightPage()');
  assert.equal(code(TODAY, attr(n, 'rightKey').value.expression), 'bookSel');
});

test('BK-2: every Today tap that changed for the book keeps the phone navigation when book is false', () => {
  assert.match(TODAY, /onPress=\{\(\) => \(book \? openDoseOnPage\(p\) : navigation\.navigate\('Protocols', \{ openProtocolId: p\.id \}\)\)\}/,
    'the dose card: book → dose page, phone → the protocol screen as before');
  assert.match(TODAY, /onHistory=\{\(\) => \(book \? bookSelect\('log'\) : navigation\.navigate\('Log'\)\)\}/,
    'View history: book → Dose log on the right page, phone → push Log as before');
  // No other navigate('Log') call sneaks into the book branch.
  assert.equal((TODAY.match(/navigate\('Log'\)/g) || []).length, 1);
  // BK-16: an upcoming row opens on the right page in the book; on the phone it still opens
  // the protocol screen.
  assert.match(TODAY, /onPress=\{\(\) => \(book \? openUpcomingOnPage\(p, at\) : navigation\.navigate\('Protocols', \{ openProtocolId: p\.id \}\)\)\}/);
  // BK-16: yesterday's pending row is tappable only in the book; the phone keeps the plain row.
  const pendIdx = TODAY.indexOf('const pickedPend = (book && isPickedDose(item.protocolId, item.dayKey, item.slotMs)) || isFocusPend(item);');
  assert.ok(pendIdx > 0);
  const pend = TODAY.slice(pendIdx, TODAY.indexOf('</View>\n                  )}', pendIdx));
  assert.match(pend, /\{book \? \(\s*<TouchableOpacity[\s\S]*onPress=\{\(\) => openDoseSlot\(item\.protocolId, item\.dayKey, item\.slotMs\)\}[\s\S]*\) : \(\s*<View style=\{s\.pendRow\}>/);
});

test('BK-3: the right page is the Dose log by default and the tapped dose otherwise', () => {
  const sel = calls(todayAst, 'useBookSelection');
  assert.equal(sel.length, 1);
  assert.deepEqual(sel[0].arguments.map((a) => a.value), ['Today', 'log'], "useBookSelection('Today', 'log')");
  const right = fnDecl(todayAst, 'renderRightPage');
  assert.ok(right, 'renderRightPage exists');
  const rsrc = code(TODAY, right);
  assert.match(rsrc, /<LogScreen embedded refreshKey=\{logRev\} onChanged=\{afterLogChange\} popupGate=\{logPopupGate\} \/>/, 'the default right page is the embedded Dose log');
  // A-115 (founder 2026-10-07): the tapped dose opens its protocol's page (no copy of the card).
  assert.match(rsrc, /if \(!p\) \{/, 'nothing tapped: the Dose log');
  assert.match(rsrc, /<ProtocolDetail/);
  // BK-16: a tapped dose is ONE slot — protocol, day and scheduled time (lib/dosePageState.js).
  const slotOpen = code(TODAY, fnDecl(todayAst, 'openDoseSlot'));
  assert.match(slotOpen, /bookSelect\(dosePageKey\(protocolId, dayKey, slotMs, ti\), \{ protocolId, dayKey, slotMs, ti \}\)/);
  const open = code(TODAY, fnDecl(todayAst, 'openDoseOnPage'));
  assert.match(open, /cardSlot\(\{ protocol: p, logs: pageLogs, nowMs: Date\.now\(\) \}\)/, 'the card opens today\'s earliest open slot');
  assert.match(open, /openDoseSlot\(p\.id, slot\.dayKey, slot\.slotMs, slot\.ti\)/);
  assert.equal(fnDecl(todayAst, 'doseSlot'), null, 'the old count-based slot guess is gone');
  assert.equal(fnDecl(todayAst, 'doseSlotState'), null, 'the old count-based state is gone');
});


test('BK-3: the Today card draws from computeDraw (A-115: the right page shows the protocol page\'s own syringe)', () => {
  assert.equal(calls(todayAst, 'computeDraw').length, 1, 'computeDraw is called once, inside doseDraw');
  const dd = code(TODAY, fnDecl(todayAst, 'doseDraw'));
  assert.match(dd, /computeDraw\(/);
  assert.match(dd, /syr: p\.syringe_size \|\| 100/);
  assert.match(code(TODAY, fnDecl(todayAst, 'renderDoseCard')), /const \{ draw, syr \} = doseDraw\(p\);/);

});

test('BK-8: the dose open on the right page has a 2 pt ink outline (book only, theme token)', () => {
  assert.match(TODAY, /style=\{\[s\.dose, \(picked \|\| opts\.highlight\) && s\.dosePicked\]\}/); // A-44 reuses the outline for a reminder tap
  assert.match(TODAY, /const picked = book && isPickedDose\(p\.id, todayKey\);/, 'the card = today\'s dose of its protocol');
  assert.match(TODAY, /style=\{\[s\.pend, pickedPend && s\.pendPicked\]\}/, 'yesterday\'s pending row');
  assert.match(TODAY, /style=\{\[s\.upRow, pickedUp && s\.upRowPicked\]\}/, 'an upcoming row');
  for (const name of ['dosePicked', 'pendPicked', 'upRowPicked']) {
    const m = TODAY.match(new RegExp(`\\n\\s*${name}: \\{([^}]*)\\}`));
    assert.ok(m, `${name} style exists`);
    assert.match(m[1], /borderWidth: 2/);
    assert.match(m[1], /borderColor: c\.ink\b/);
  }
});

test('BK-9: in the book the Undo toast and the notice stay on the left page, off the fold', () => {
  assert.match(TODAY, /const toastOnLeftPage = book \? \{ right: undefined, width: paneWidths\(winW\)\.left - 24 \} : null;/);
  assert.match(TODAY, /undoBar: \[s\.undoBar, toastOnLeftPage\], takeNoticeBar: \[s\.takeNoticeBar, toastOnLeftPage\]/);
  assert.match(TODAY, /\n\s*: s;/, 'one column keeps the old toast styles');
  assert.match(TODAY, /style=\{toast\.undoBar\}/);
  assert.match(TODAY, /style=\{toast\.takeNoticeBar\}/);
});

test('BK-10: Today pushes an opened Dose log as the Log screen when the device folds', () => {
  const fp = calls(todayAst, 'useFoldPush');
  assert.equal(fp.length, 1);
  assert.equal(fp[0].arguments[0].value, 'Today');
});

// ── BK-16: one slot per dose, the planner, Undo ────────────────




// ── BK-19: the two pages update each other ─────────────────────

test('BK-19: a change in the embedded Dose log refreshes Today\'s cards, rings, Pending block and dose page', () => {
  const a = code(TODAY, fnDecl(todayAst, 'afterLogChange'));
  for (const f of ['fetchTodayLogs()', 'fetchPendingYesterday()', 'fetchStreakData()', 'fetchProtocolStreaks()']) assert.ok(a.includes(f), f);
  // fetchTodayLogs is where the counts and the rings are read back.
  const ftl = code(TODAY, fnDecl(todayAst, 'fetchTodayLogs'));
  assert.match(ftl, /setTakenCounts\(taken\)/);
  assert.match(ftl, /fetchRings\(user\.id\)/);
  assert.match(ftl, /fetchPageLogs\(\)/);
  // The Log calls onChanged after every row it writes (Missed → Taken / Skipped, a site), embedded only.
  const wo = code(LOG, fnDecl(logAst, 'writeOutcome'));
  assert.match(wo, /if \(embedded && onChanged\) onChanged\(\);/);
});

test('BK-19: a dose taken, skipped or undone on the left page refreshes the dose page and the embedded Dose log', () => {
  const fpl = code(TODAY, fnDecl(todayAst, 'fetchPageLogs'));
  assert.match(fpl, /if \(!bookRef\.current\) return;/, 'one column reads nothing new (BK-2)');
  assert.match(fpl, /setPageLogs\(getLogsSince\(/);
  assert.match(fpl, /setDataRev\(\(n\) => n \+ 1\)/);
  const mt = TODAY.slice(TODAY.indexOf('async function markTaken('), TODAY.indexOf('async function askSite('));
  assert.match(mt, /fetchPageLogs\(\)/, 'after a take');
  assert.match(code(TODAY, fnDecl(todayAst, 'skipDose')), /fetchPageLogs\(\)/, 'after a skip');
  assert.match(code(TODAY, fnDecl(todayAst, 'fetchPendingYesterday')), /fetchPageLogs\(\)/, 'after a pending write and every undo (applyUndo → fetchPendingYesterday)');
  assert.match(code(TODAY, fnDecl(todayAst, 'applyUndo')), /fetchPendingYesterday\(\)/);
  const rsrc = code(TODAY, fnDecl(todayAst, 'renderRightPage'));
  assert.match(rsrc, /const logRev = JSON\.stringify\(\[takenCounts, skippedCounts, undoData \? undoData\.logId : null, pendingYest\.length, dataRev\]\);/);
});

test('BK-19: the dose page reloads when the app returns to the foreground and follows the clock', () => {
  assert.match(TODAY, /AppState\.addEventListener\('change', \(st\) => \{\s*\n\s*if \(st !== 'active' \|\| !bookRef\.current \|\| !focusedRef\.current\) return;\s*\n\s*fetchProtocols\(\);\s*\n\s*fetchTodayLogs\(\);\s*\n\s*fetchPendingYesterday\(\);/);
  assert.match(TODAY, /return \(\) => sub\.remove\(\);/);
  assert.match(TODAY, /useEffect\(\(\) => \{ if \(book\) fetchPageLogs\(\); \}, \[book\]\);/);
  assert.match(TODAY, /const id = setInterval\(\(\) => setPageTick\(\(n\) => n \+ 1\), 60000\);/);
});

// ── BK-20: one popup at a time across both pages ───────────────

test('BK-20: Today\'s site question, vial prompt and "still going?" wait while the embedded Log\'s site editor is open', () => {
  const open = TODAY.slice(TODAY.indexOf('async function openNextQuestion('), TODAY.indexOf('function commitQuestion('));
  // + the Skip sheet (Today redesign part 14): one popup at a time.
  assert.match(open, /if \(!focusedRef\.current \|\| bodyMapOpenRef\.current \|\| vialPromptOpenRef\.current \|\| inactivePromptOpenRef\.current \|\| logPopupOpenRef\.current \|\| skipSheetOpenRef\.current \|\| todaySheetOpenRef\.current\) return;/);
  assert.match(open, /if \(!q\) \{ runLogPopupWaiter\(\); return; \}/, 'with no question left, a waiting Log editor opens');
  assert.match(TODAY, /if \(bodyMapOpenRef\.current \|\| siteQueueRef\.current\.length \|\| logPopupOpenRef\.current\) return;/, '"still going?" never over the editor');
  const vp = code(TODAY, fnDecl(todayAst, 'showVialPromptFor'));
  assert.match(vp, /if \(logPopupOpenRef\.current\) \{ vialDeferredRef\.current = true; return; \}/, 'the vial prompt waits for the editor');
  assert.ok(vp.indexOf('vialPromptOpenRef.current = true') < vp.indexOf('if (logPopupOpenRef.current)'), 'the prompt still counts as open, so questions keep waiting');
  assert.match(code(TODAY, fnDecl(todayAst, 'closeVialPrompt')), /vialDeferredRef\.current = false;/);
});

test('BK-20: the embedded Log\'s site editor waits while a popup of Today\'s is open or queued, and frees Today\'s queue when it closes', () => {
  const gate = TODAY.slice(TODAY.indexOf('const logPopupGate = {'), TODAY.indexOf('};', TODAY.indexOf('const logPopupGate = {')));
  assert.match(gate, /busy: \(\) => todayPopupBusy\(\) \|\| siteQueueRef\.current\.length > 0,/);
  assert.match(gate, /wait: \(open\) => \{ logPopupWaiterRef\.current = open; \},/);
  assert.match(gate, /opened: \(\) => \{ logPopupOpenRef\.current = true; \},/);
  assert.match(gate, /logPopupOpenRef\.current = false;/);
  assert.match(gate, /setTimeout\(\(\) => setShowVialPrompt\(true\), 450\)/, 'a deferred vial prompt opens after the editor');
  assert.match(gate, /setTimeout\(openNextQuestion, 450\)/, 'a waiting question opens after the editor');
  assert.match(code(TODAY, fnDecl(todayAst, 'todayPopupBusy')), /bodyMapOpenRef\.current \|\| vialPromptOpenRef\.current \|\| inactivePromptOpenRef\.current/);
  // The Log: checks the gate BEFORE opening and claims it before its first await.
  const ose = code(LOG, fnDecl(logAst, 'openSiteEditor'));
  const busy = ose.indexOf('if (gate.busy()) { gate.wait(() => openSiteEditor(log, mode)); return; }');
  const claim = ose.indexOf('gate.opened();');
  const firstAwait = ose.indexOf('await ');
  const show = ose.indexOf('setBodyMapVisible(true)');
  assert.ok(busy > 0 && claim > busy && firstAwait > claim && show > firstAwait);
  assert.match(code(LOG, fnDecl(logAst, 'siteAction')), /releasePopup\(\);/, 'every close of the editor tells Today');
  assert.match(LOG, /const gate = embedded && popupGate \? popupGate : null;/, 'the pushed Log (phone) has no gate');
  assert.match(LOG, /useEffect\(\(\) => \(\) => \{\s*\n\s*if \(gateRef\.current\) gateRef\.current\.wait\(null\);[^\n]*\n\s*releasePopup\(\);/, 'leaving the page with the editor open never blocks Today');
  // The focus cleanup drops a waiting editor (Today is gone with it).
  assert.match(TODAY, /logPopupWaiterRef\.current = null; \/\/ the embedded Log is gone with Today/);
});

// ── BK-21: selection and reading order ─────────────────────────

test('BK-21: the selected dose card, pending row and upcoming row report themselves as selected (book only)', () => {
  assert.match(TODAY, /accessibilityState=\{book \? \{ selected: picked \} : undefined\}/);
  assert.match(TODAY, /accessibilityState=\{\{ selected: pickedPend \}\}/);
  assert.match(TODAY, /accessibilityState=\{book \? \{ selected: pickedUp \} : undefined\}/);
});


// ── DosePage ───────────────────────────────────────────────────




// ── LogScreen ──────────────────────────────────────────────────

test('BK-3: LogScreen embedded has no back row and no top safe-area edge', () => {
  assert.match(LOG, /export default function LogScreen\(\{ embedded = false, refreshKey, onChanged, popupGate \} = \{\}\)/);
  assert.match(LOG, /<SafeAreaView style=\{s\.container\} edges=\{embedded \? \['left', 'right', 'bottom'\] : undefined\}>/,
    'embedded: no top edge; not embedded: the default edges, as before');
  // navigation.goBack only inside {!embedded && …}
  let back = null;
  walk(logAst, (node, anc) => {
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'goBack') back = anc;
  });
  assert.ok(back, 'the back row still exists for the pushed screen');
  const guard = back.find((a) => a.type === 'LogicalExpression' && a.operator === '&&'
    && a.left.type === 'UnaryExpression' && a.left.operator === '!' && a.left.argument.name === 'embedded');
  assert.ok(guard, 'the back row renders only when not embedded');
});

test('BK-10: the pushed Log screen moves onto Today\'s right page on unfold', () => {
  const u = calls(logAst, 'useUnfoldToPage');
  assert.equal(u.length, 1);
  assert.equal(u[0].arguments[0].value, 'Log');
  assert.equal(code(LOG, u[0].arguments[1]), '{ embedded }');
});

// ── Both themes / strings ──────────────────────────────────────

function loadTranslations() {
  const src = read('i18n/translations.js');
  const transformed = src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', transformed)(mod, mod.exports);
  return mod.exports.translations;
}

