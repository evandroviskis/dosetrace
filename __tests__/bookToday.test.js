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
  for (const piece of ['alerts.length > 0', 'pendingYest.length > 0', '<TodayTracker', '<FoodLogHero', 'todayCards.map(p => renderDoseCard(p))', 'takenNames.length > 0', "foldRow('tom'", "foldRow('n5'"]) {
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
});

test('BK-3: the right page is the Dose log by default and the tapped dose otherwise', () => {
  const sel = calls(todayAst, 'useBookSelection');
  assert.equal(sel.length, 1);
  assert.deepEqual(sel[0].arguments.map((a) => a.value), ['Today', 'log'], "useBookSelection('Today', 'log')");
  const right = fnDecl(todayAst, 'renderRightPage');
  assert.ok(right, 'renderRightPage exists');
  const rsrc = code(TODAY, right);
  assert.match(rsrc, /<LogScreen embedded refreshKey=\{logRev\} \/>/, 'the default right page is the embedded Dose log');
  assert.match(rsrc, /<DosePage/);
  // A tapped dose is 'dose:<id>' and carries its slot when the protocol has several doses a day.
  const open = code(TODAY, fnDecl(todayAst, 'openDoseOnPage'));
  assert.match(open, /`dose:\$\{p\.id\}`/);
  assert.match(open, /`dose:\$\{p\.id\}:\$\{slot\}`/);
  assert.match(code(TODAY, fnDecl(todayAst, 'doseSlot')), /if \(dpd <= 1\) return null;/, 'a once-a-day dose has no slot suffix');
});

test('BK-3 / S-25: the dose page uses Today\'s own handlers — Mark taken = handleTake, Skip = skipDose, site question first', () => {
  const [{ n }] = jsx(todayAst, 'DosePage');
  const val = (name) => code(TODAY, attr(n, name).value.expression);
  assert.equal(val('onTake'), '(rect) => handleTake(p, rect)', 'the same call as the Today card\'s TakeButton');
  assert.equal(val('onSkip'), '() => skipDose(p)', 'the same call as the Today card\'s Skip');
  assert.equal(val('askFirst'), 'needsSiteQuestion(p.type)', 'the same site-first rule as the Today card');
  // The Today card uses exactly these calls too (one path, two places).
  assert.match(TODAY, /onTake=\{\(rect\) => handleTake\(p, rect\)\}\s*\n\s*askFirst=\{needsSiteQuestion\(p\.type\)\}/);
  assert.match(TODAY, /onPress=\{\(\) => skipDose\(p\)\}/);
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
  assert.match(TODAY, /style=\{\[s\.dose, picked && s\.dosePicked\]\}/);
  assert.match(TODAY, /const picked = book && pickedDoseId != null/);
  const m = TODAY.match(/\n\s*dosePicked: \{([^}]*)\}/);
  assert.ok(m, 'dosePicked style exists');
  assert.match(m[1], /borderWidth: 2/);
  assert.match(m[1], /borderColor: c\.ink\b/);
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
  // A taken dose offers no second Mark taken.
  assert.match(DOSE, /\{state === 'taken' \? \(/);
  const takenBranch = DOSE.slice(DOSE.indexOf("{state === 'taken' ? ("), DOSE.indexOf(') : (', DOSE.indexOf("{state === 'taken' ? (")));
  assert.ok(!takenBranch.includes('TakeAction') && !takenBranch.includes('onSkip'), 'the taken state has no actions');
});

test('BK-3: DosePage draws the same SyringeScale as the Today card', () => {
  assert.match(DOSE, /import SyringeScale from '\.\/SyringeScale';/);
  const [{ n }] = jsx(doseAst, 'SyringeScale');
  assert.equal(code(DOSE, attr(n, 'units').value.expression), 'Number(draw.drawUnits)');
  assert.equal(code(DOSE, attr(n, 'size').value.expression), 'syringeSize');
  // Same guards as the card: only with a draw, no unit mismatch, warning when over capacity.
  assert.match(DOSE, /draw && draw\.drawUnits && !draw\.unitMismatch/);
  assert.match(DOSE, /draw\.exceedsSyringe \?/);
  assert.match(DOSE, /t\('protocols_syringe_draw_to'\)/);
});

// ── LogScreen ──────────────────────────────────────────────────

test('BK-3: LogScreen embedded has no back row and no top safe-area edge', () => {
  assert.match(LOG, /export default function LogScreen\(\{ embedded = false, refreshKey \} = \{\}\)/);
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
