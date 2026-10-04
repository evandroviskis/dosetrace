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
const DOSE = read('screens/components/DosePage.js');
const todayAst = parse(TODAY);
const logAst = parse(LOG);
const doseAst = parse(DOSE);

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
  assert.match(rsrc, /if \(!p \|\| plan\.kind === 'none'\) \{/, 'a dose no longer in the schedule falls back to the Dose log');
  assert.match(rsrc, /<DosePage/);
  // BK-16: a tapped dose is ONE slot — protocol, day and scheduled time (lib/dosePageState.js).
  const slotOpen = code(TODAY, fnDecl(todayAst, 'openDoseSlot'));
  assert.match(slotOpen, /bookSelect\(dosePageKey\(protocolId, dayKey, slotMs, ti\), \{ protocolId, dayKey, slotMs, ti \}\)/);
  const open = code(TODAY, fnDecl(todayAst, 'openDoseOnPage'));
  assert.match(open, /cardSlot\(\{ protocol: p, logs: pageLogs, nowMs: Date\.now\(\) \}\)/, 'the card opens today\'s earliest open slot');
  assert.match(open, /openDoseSlot\(p\.id, slot\.dayKey, slot\.slotMs, slot\.ti\)/);
  assert.equal(fnDecl(todayAst, 'doseSlot'), null, 'the old count-based slot guess is gone');
  assert.equal(fnDecl(todayAst, 'doseSlotState'), null, 'the old count-based state is gone');
});

test('BK-3 / BK-16 / S-25: the dose page uses Today\'s own write paths — today: handleTake / skipDose; yesterday\'s pending: takePending / skipPending (writePending); site question first', () => {
  const [{ n }] = jsx(todayAst, 'DosePage');
  const val = (name) => code(TODAY, attr(n, name).value.expression);
  // A-78: today's write carries the page's slot (plan.write: slotMs, ti, and flipRowId for a
  // skipped slot), so it lands on THAT slot.
  assert.equal(val('onTake'), 'pending ? () => takePending(item) : (rect) => handleTake(p, rect, 0, { slot: plan.write })',
    'today\'s due dose = the Today card\'s TakeButton call; yesterday\'s pending dose = the Pending block\'s Taken');
  assert.equal(val('onSkip'), 'pending ? () => skipPending(item) : () => skipDose(p, plan.write)',
    'today\'s due dose = the Today card\'s Skip; yesterday\'s pending dose = the Pending block\'s Skipped');
  assert.equal(val('askFirst'), 'needsSiteQuestion(p.type)', 'the same site-first rule as the Today card');
  // The pending item carries yesterday's day and slot from the planner, never today's.
  const rsrc = code(TODAY, fnDecl(todayAst, 'renderRightPage'));
  assert.match(rsrc, /const pending = plan\.kind === 'pending';/);
  assert.match(rsrc, /const item = \{ protocolId: p\.id, dayKey: plan\.dayKey, slotMs: plan\.slotMs \};/);
  // takePending asks the site first for an injectable (S-25) and else writes through writePending.
  const tp = code(TODAY, fnDecl(todayAst, 'takePending'));
  assert.ok(tp.indexOf('askSite(') > 0 && tp.indexOf('askSite(') < tp.indexOf('writePending('));
  assert.match(code(TODAY, fnDecl(todayAst, 'writePending')), /recordDoseTaken\(protocolId, write\)/);
  // No new write path on the page: the page code calls no database / dose-action writer.
  for (const id of ['insertDoseLog', 'updateDoseLog', 'deleteDoseLog', 'recordDoseTaken', 'recordSkipPending']) {
    assert.ok(!rsrc.includes(id), `renderRightPage mentions ${id}`);
  }
  // The Today card uses exactly these calls too (one path, two places).
  assert.match(TODAY, /onTake=\{\(rect\) => handleTake\(p, rect, 0, \{ slot: cp\.next \}\)\}\s*\n\s*askFirst=\{needsSiteQuestion\(p\.type\)\}/);
  assert.match(TODAY, /onPress=\{\(\) => skipDose\(p, cp\.next\)\}/);
  // handleTake still asks the site BEFORE any write for an injectable (S-25 unchanged).
  const ht = code(TODAY, fnDecl(todayAst, 'handleTake'));
  const ask = ht.indexOf('askSite(newQuestion(');
  const write = ht.indexOf('markTaken(p');
  assert.ok(ask > 0 && write > ask, 'askSite comes before markTaken in handleTake');
});

test('BK-3: the dose page draws from the same computeDraw as the Today card', () => {
  assert.equal(calls(todayAst, 'computeDraw').length, 1, 'computeDraw is called once, inside doseDraw');
  const dd = code(TODAY, fnDecl(todayAst, 'doseDraw'));
  assert.match(dd, /computeDraw\(/);
  assert.match(dd, /syr: p\.syringe_size \|\| 100/);
  assert.match(code(TODAY, fnDecl(todayAst, 'renderDoseCard')), /const \{ draw, syr \} = doseDraw\(p\);/);
  assert.match(code(TODAY, fnDecl(todayAst, 'renderRightPage')), /const \{ draw, syr \} = doseDraw\(p\);/);
  const [{ n }] = jsx(todayAst, 'DosePage');
  assert.equal(code(TODAY, attr(n, 'draw').value.expression), 'draw');
  assert.equal(code(TODAY, attr(n, 'syringeSize').value.expression), 'syr');
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

test('BK-16: the dose page is planned by lib/dosePageState.js for the tapped slot (day + time), with Today\'s Pending list', () => {
  const rsrc = code(TODAY, fnDecl(todayAst, 'renderRightPage'));
  assert.match(rsrc, /planDosePage\(\{\s*protocol: p, logs: pageLogs, dayKey: pickedDose\.dayKey, slotMs: pickedDose\.slotMs, ti: pickedDose\.ti,\s*nowMs: Date\.now\(\), pending: pendingYest,\s*\}\)/);
  const [{ n }] = jsx(todayAst, 'DosePage');
  const val = (name) => code(TODAY, attr(n, name).value.expression);
  assert.equal(val('kind'), 'plan.kind');
  assert.equal(val('canTake'), 'plan.canTake', 'Mark taken only when the planner allows (due / pending, earliest open slot)');
  assert.equal(val('canSkip'), 'plan.canSkip');
  assert.equal(val('canUndo'), 'canUndo');
  assert.equal(val('onUndo'), '() => undoFromPage(record)');
  assert.equal(val('onOpenLog'), "() => bookSelect('log')", 'a row Today cannot undo links to the Dose log');
  // Undo only with THIS row's own record, never twice.
  assert.match(rsrc, /const record = plan\.logId != null \? undoRecordsRef\.current\.get\(plan\.logId\) : null;/);
  assert.match(rsrc, /const canUndo = plan\.canUndo && !!record && !undoneIdsRef\.current\.has\(plan\.logId\);/);
});

test('BK-16: Undo on the dose page is the app\'s own undo (applyUndo → planUndoTake) with the record of that row', () => {
  const u = code(TODAY, fnDecl(todayAst, 'undoFromPage'));
  assert.match(u, /applyUndo\(record\);/);
  assert.match(u, /fetchTodayLogs\(\);/);
  // Every dose Today writes keeps its undo record: the card / site answer (markTaken), the
  // pending Taken (writePending), the pending Skipped (skipPending) and the card's Skip.
  const mt = TODAY.slice(TODAY.indexOf('async function markTaken('), TODAY.indexOf('async function askSite('));
  assert.match(mt, /setUndoData\(record\);\s*\n\s*keepUndo\(record\);/);
  assert.match(code(TODAY, fnDecl(todayAst, 'writePending')), /setUndoData\(record\);\s*\n\s*keepUndo\(record\);/);
  assert.match(code(TODAY, fnDecl(todayAst, 'skipPending')), /setUndoData\(record\);\s*\n\s*keepUndo\(record\);/);
  // The card's Skip: a Skipped row's undo deletes that row only — no Taken count, no supply.
  const sk = code(TODAY, fnDecl(todayAst, 'skipDose'));
  // A-78: the Skipped row is written for the card's slot, at that slot's time.
  assert.match(sk, /const res = recordSkipToday\(protocol\.id, \{ slotMs: slot \? slot\.slotMs : null \}\);/);
  assert.match(sk, /const logId = res\.logId;/);
  assert.match(sk, /keepUndo\(\{ logId, flipped: false, protocolId: protocol\.id, pending: true, extraDeleteIds: \[\], vialId: null, prevDosesTaken: null, oralPrevUnitsTaken: null, timer: null, fx: null \}\);/);
  assert.doesNotMatch(sk, /setUndoData\(/, 'the phone Undo bar is unchanged for a Skip (BK-2)');
  const { planUndoTake } = require('../lib/markTaken');
  const plan = planUndoTake({ logId: 5, flipped: false, protocolId: 1, pending: true, vialId: null, oralPrevUnitsTaken: null, fx: null });
  assert.deepEqual(plan.deleteIds, [5]);
  assert.equal(plan.todayCount, 'none');
  assert.equal(plan.vialRestore, null);
  assert.equal(plan.oralRestore, null);
});

test('BK-16: a logged dose\'s state label uses existing strings; pending and upcoming have their own labels', () => {
  const rsrc = code(TODAY, fnDecl(todayAst, 'renderRightPage'));
  assert.match(rsrc, /const stateLabel = plan\.kind === 'taken' \? takenLabel : plan\.kind === 'skipped' \? t\('today_pending_skip'\) : t\('log_missed'\);/);
  assert.match(rsrc, /sub=\{pending \? t\('today_pending_title'\) : partial\}/);
  assert.match(code(TODAY, fnDecl(todayAst, 'slotTimeLabel')), /t\('today_yesterday'\)[\s\S]*t\('today_section_tomorrow'\)[\s\S]*WEEKDAY_KEYS/);
});

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

test('BK-21: DosePage\'s title is the first element a screen reader reaches on the page', () => {
  const fn = doseAst.program.body.find((s) => s.type === 'ExportDefaultDeclaration').declaration;
  const focusable = [];
  walk({ program: fn }, (node, anc) => {
    if (node.type !== 'JSXElement') return;
    const hidden = anc.some((a) => a.type === 'JSXElement' && attr(a, 'importantForAccessibility'));
    if (hidden) return;
    const nm = node.openingElement.name.name;
    if (attr(node, 'accessible') || nm === 'TouchableOpacity' || nm === 'TakeAction') focusable.push(node);
  });
  const first = focusable[0];
  assert.equal(first.openingElement.name.name, 'Text');
  assert.equal(attr(first, 'accessibilityRole').value.value, 'header');
  assert.equal(code(DOSE, attr(first, 'accessibilityLabel').value.expression), 'titleA11y');
  assert.match(DOSE, /const titleA11y = \[name, time, due \? t\('today_due'\) : null\]\.filter\(Boolean\)\.join\(', '\);/);
  // The time / Due row above the title is read with the title, not before it.
  assert.match(DOSE, /<View style=\{s\.when\} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">/);
});

// ── DosePage ───────────────────────────────────────────────────

test('BK-3: DosePage never writes — no database, dose-action, sync or storage imports', () => {
  const sources = doseAst.program.body.filter((s) => s.type === 'ImportDeclaration').map((s) => s.source.value);
  for (const src of sources) {
    assert.doesNotMatch(src, /database|doseActions|markTaken|siteQuestion|sync|supabase|async-storage|notifications/, `DosePage imports ${src}`);
  }
  for (const id of ['insertDoseLog', 'updateDoseLog', 'deleteDoseLog', 'recordDoseTaken', 'recordSkipPending', 'AsyncStorage', 'requestSync', 'saveQuestion']) {
    assert.ok(!DOSE.includes(id), `DosePage mentions ${id}`);
  }
});

test('BK-3: DosePage Mark taken and Skip call the passed-in handlers; an injectable only opens the site question', () => {
  // Skip button → the onSkip prop, as is.
  assert.match(DOSE, /onPress=\{onSkip\}/);
  // Mark taken → onTake(null); for an injectable the button does not turn into "Taken"
  // (the answer writes the dose; Cancel leaves it as it was).
  const ta = code(DOSE, fnDecl(doseAst, 'TakeAction'));
  assert.match(ta, /if \(!askFirst\) setOk\(true\);\s*\n\s*onTake\(null\);/);
  // BK-16: a Taken / Skipped / Missed dose offers no Skip — its state and Undo (when Today can
  // undo that row), else a Dose log link. A-78 (amends BK-16, founder 2026-10-01): only a
  // Skipped slot the planner allows (today) adds Mark taken; a Taken slot never does.
  assert.match(DOSE, /const logged = kind === 'taken' \|\| kind === 'skipped' \|\| kind === 'missed';/);
  const start = DOSE.indexOf('{logged ? (');
  assert.ok(start > 0);
  const loggedBranch = DOSE.slice(start, DOSE.indexOf(') : null}', start));
  assert.ok(!loggedBranch.includes('TakeAction') && !loggedBranch.includes('onSkip') && !loggedBranch.includes('onTake'), 'the logged state row has no Mark taken / Skip');
  assert.match(loggedBranch, /\{canUndo && onUndo \? \(/);
  assert.match(loggedBranch, /onPress=\{onUndo\}/);
  assert.match(loggedBranch, /t\('today_undo'\)/);
  assert.match(loggedBranch, /onPress=\{onOpenLog\}/);
  assert.match(loggedBranch, /t\('log_title'\)/);
  const skipTake = DOSE.slice(DOSE.indexOf("{kind === 'skipped' && canTake && ("), DOSE.indexOf('{logged ? null : (canTake || canSkip) ? ('));
  assert.ok(skipTake.length > 0 && skipTake.includes('<TakeAction') && skipTake.includes('onTake={onTake}'), 'a skipped slot today: Mark taken');
  assert.ok(!skipTake.includes('onSkip'), 'a skipped slot has no second Skip');
  // Upcoming (canTake / canSkip false): no actions at all; each button only when allowed.
  const actsAt = DOSE.indexOf('{logged ? null : (canTake || canSkip) ? (');
  assert.ok(actsAt > 0);
  const acts = DOSE.slice(actsAt, DOSE.indexOf(') : null}', actsAt));
  assert.match(acts, /\{canSkip && \(/);
  assert.match(acts, /\{canTake && \(/);
});

test('BK-3: DosePage draws the same SyringeScale as the Today card', () => {
  assert.match(DOSE, /import SyringeScale from '\.\/SyringeScale';/);
  const [{ n }] = jsx(doseAst, 'SyringeScale');
  assert.equal(code(DOSE, attr(n, 'units').value.expression), 'Number(draw.drawUnits)');
  assert.equal(code(DOSE, attr(n, 'size').value.expression), 'syringeSize');
  // Same guards as the card: only with a draw, no unit mismatch; over capacity the syringe
  // stays drawn (in risk, Today redesign part 6) and the warning follows it.
  assert.match(DOSE, /draw && draw\.drawUnits && !draw\.unitMismatch/);
  assert.match(DOSE, /\{draw\.exceedsSyringe && \(/);
  assert.match(DOSE, /t\('protocols_syringe_draw_to'\)/);
});

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

test('BK-12: DosePage uses theme tokens only, no emoji, and only existing strings in all 6 languages', () => {
  assert.doesNotMatch(DOSE, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(|'transparent'/, 'no hardcoded color');
  assert.doesNotMatch(DOSE, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
  const tr = loadTranslations();
  const keys = [...new Set([...DOSE.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 5);
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of keys) assert.ok(tr[lang][k], `${lang} has ${k}`);
  }
  // The Today additions use tokens only as well.
  const todayBook = code(TODAY, fnDecl(todayAst, 'renderRightPage'));
  assert.doesNotMatch(todayBook, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
});
