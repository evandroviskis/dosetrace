'use strict';
// S-26 book layout, My Body (docs/specs/book-layout.md, founder-signed 2026-10-01).
// The right-page rules are pure functions inside screens/BodyScreen.js; they are lifted out of
// the source with @babel/parser and run here. The layout wiring is checked on the parsed tree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const BODY = read('screens', 'BodyScreen.js');
const VAX = read('screens', 'components', 'VaccinesSection.js');
const ast = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });

function walk(node, ancestors, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  const next = ancestors.concat([node]);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, next, visit));
    else if (v && typeof v.type === 'string') walk(v, next, visit);
  }
}
function findFn(src, name) {
  let hit = null;
  walk(ast(src), [], (n, anc) => {
    if (!hit && n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = { n, anc };
  });
  assert.ok(hit, `function ${name} exists`);
  return { ...hit, code: src.slice(hit.n.start, hit.n.end) };
}
function jsxByName(src, name) {
  const out = [];
  walk(ast(src), [], (n, anc) => {
    if (n.type === 'JSXElement' && n.openingElement.name.name === name) out.push({ n, anc });
  });
  return out;
}
const isIdent = (n, name) => n && n.type === 'Identifier' && n.name === name;

// The pure rules, run as written in BodyScreen.js.
const pure = new Function(
  ['newestReportKey', 'buildReport', 'bodyRightPage', 'bodyFoldPlan', 'bodyUnfoldSel'].map((f) => findFn(BODY, f).code).join('\n')
  + '\nreturn { newestReportKey, buildReport, bodyRightPage, bodyFoldPlan, bodyUnfoldSel };',
)();

const ROWS = [
  { id: 1, report_date: '2026-07-01', created_at: '2026-07-02T10:00:00Z', marker: 'Testosterone', value: 600, unit: 'ng/dL' },
  { id: 2, report_date: '2026-09-20', created_at: '2026-09-21T08:00:00Z', marker: 'Estradiol', value: 30, unit: 'pg/mL' },
  { id: 3, report_date: '2026-09-20', created_at: '2026-09-22T09:00:00Z', marker: 'Estradiol', value: 31, unit: 'pg/mL' },
  { id: 4, report_date: '2026-09-20', created_at: '2026-09-22T09:00:00Z', marker: 'Hematocrit', value: 48, unit: '%' },
  { id: 5, report_date: '2026-08-15', created_at: '', marker: 'Hematocrit', value: 46, unit: '%' },
];
const keyOf = (r) => r.report_date + '|' + (r.created_at || '');

test('BK-6: the default right page is the newest upload (the first By date card, newest first)', () => {
  // The journal's own order: date, then upload time, newest first.
  const cards = [...new Set(ROWS.map(keyOf))].map((k) => ({ key: k, date: k.split('|')[0], createdAt: k.split('|')[1] }));
  cards.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1)));
  assert.equal(pure.newestReportKey(ROWS), cards[0].key);
  assert.equal(pure.newestReportKey(ROWS), '2026-09-20|2026-09-22T09:00:00Z', 'a second upload on the same date is its own, newer test');
  assert.equal(pure.newestReportKey([]), null);
  assert.equal(pure.newestReportKey([{ report_date: '2026-01-01', created_at: null }]), '2026-01-01|', 'missing created_at keyed like the journal');
  // Wired through the shared default rule, with the same per-upload key the cards use.
  assert.match(BODY, /useBookSelection\('Body', defaultSelection\('Body', \{ newestReportKey: newestKey \}\)\)/);
  assert.match(BODY, /const newestKey = useMemo\(\(\) => newestReportKey\(rows\), \[rows\]\)/);
  assert.match(BODY, /const reportKeys = useMemo\(\(\) => new Set\(rows\.map\(r => r\.report_date \+ '\|' \+ \(r\.created_at \|\| ''\)\)\), \[rows\]\)/);
});

test('BK-6: the right page shows the tapped test, the tapped marker, or the Curve for Premium', () => {
  const reportKeys = new Set(ROWS.map(keyOf));
  const markerKeys = new Set(['testosterone', 'estradiol', 'hematocrit']);
  const newestKey = pure.newestReportKey(ROWS);
  const page = (sel, premium = true) => pure.bodyRightPage({ sel, reportKeys, markerKeys, premium, newestKey });

  assert.deepEqual(page(null), { type: 'report', key: newestKey, id: newestKey }, 'nothing chosen → newest test');
  assert.deepEqual(page('2026-07-01|2026-07-02T10:00:00Z'), { type: 'report', key: '2026-07-01|2026-07-02T10:00:00Z', id: '2026-07-01|2026-07-02T10:00:00Z' });
  assert.deepEqual(page('marker:estradiol'), { type: 'marker', key: 'estradiol', id: 'marker:estradiol' });
  assert.deepEqual(page('curve'), { type: 'curve', id: 'curve' });
  assert.deepEqual(page('curve', false), { type: 'report', key: newestKey, id: newestKey }, 'BK-11: never the Curve page for a free user');
  assert.deepEqual(page('2026-01-01|gone'), { type: 'report', key: newestKey, id: newestKey }, 'a deleted test falls back to the newest');
  assert.deepEqual(page('marker:renamed-away'), { type: 'report', key: newestKey, id: newestKey });
  assert.equal(pure.bodyRightPage({ sel: null, reportKeys: new Set(), markerKeys: new Set(), premium: true, newestKey: null }), null, 'no test yet');

  const rep = pure.buildReport(ROWS, '2026-09-20|2026-09-22T09:00:00Z');
  assert.deepEqual(rep.markers.map((m) => m.id), [3, 4], 'one upload = only its own values');
  assert.equal(pure.buildReport(ROWS, 'nope'), null);
});

test('BK-1/BK-2: BookPanes only under `book`; one column keeps today\'s hub → journal → detail', () => {
  const panes = jsxByName(BODY, 'BookPanes');
  assert.equal(panes.length, 1, 'one BookPanes');
  const cond = [...panes[0].anc].reverse().find((a) => a.type === 'ConditionalExpression');
  assert.ok(cond && isIdent(cond.test, 'book'), 'BookPanes sits in a `book ?` branch');
  assert.equal(cond.consequent, panes[0].n, 'BookPanes is the book branch itself');
  // The one-column branch is today's: the hub when no section, then the nav row + journal/detail.
  const alt = cond.alternate;
  assert.equal(alt.type, 'ConditionalExpression');
  assert.equal(BODY.slice(alt.test.start, alt.test.end), 'section === null');
  const phone = BODY.slice(alt.start, alt.end);
  assert.match(phone, /<View style=\{s\.hubHero\}>/);
  assert.match(phone, /<View style=\{s\.navRow\}>/);
  assert.match(phone, /onPress=\{\(\) => \{ if \(detail\) \{ setDetail\(null\); return; \} setSection\(null\); fetchReports\(\); \}\}/, 'the "‹ back" row');
  assert.match(phone, /renderReportDetail\(reportDetail\)/);
  assert.match(phone, /renderMarkerDetail\(markerDetail, CHART_WIDTH, false\)/);
  assert.match(phone, /\{renderJournalBody\(false\)\}/);
  assert.match(phone, /\{renderDoseCard\(false\)\}/);
  assert.doesNotMatch(phone, /renderBook(Left|Right)|selectReport|selectMarker/, 'no book wiring on the phone path');
  // The phone journal still opens the detail screen; the book journal opens the right page.
  const journal = findFn(BODY, 'renderJournalBody').code;
  assert.match(journal, /onPress=\{\(\) => \(inBook \? selectReport\(key\) : openReport\(key\)\)\}/);
  assert.match(journal, /onPress=\{\(\) => \(inBook \? selectMarker\(mk\.key\) : openMarker\(mk\.key\)\)\}/);
});

// Runs openDoseAccumulation as written, with the screen's state passed in.
function runDose({ premium, book }) {
  const code = findFn(BODY, 'openDoseAccumulation').code;
  const calls = [];
  const fn = new Function('Analytics', 'premium', 'book', 'select', 'navigation', 'setShowSerumPreview', `${code}\nreturn openDoseAccumulation;`)(
    { viewed: () => {}, previewSheetViewed: () => {} },
    premium,
    book,
    (v) => calls.push(['select', v]),
    { navigate: (r) => calls.push(['navigate', r]) },
    (v) => calls.push(['preview', v]),
  );
  fn();
  return calls;
}

test('BK-6: Dose accumulation stays reachable from the left page and opens the Curve on the right (Premium)', () => {
  const left = findFn(BODY, 'renderBookLeft').code;
  assert.match(left, /\{renderDoseCard\(rightPage\?\.type === 'curve'\)\}/, 'the Dose accumulation row is on the left page');
  assert.match(left, /<VaccinesSection inline draftRef=\{vaxDraft\} onSheetChange=\{setVaxSheetOpen\} \/>/, 'the vaccines are on the left page');
  assert.match(left, /onPress=\{handleUploadPress\}/, '+ Upload on the left page');
  assert.match(left, /onPress=\{handleExport\}/, 'Export on the left page');
  assert.match(left, /\{renderJournalBody\(true\)\}/, 'the By date / By marker journal with search and sort');
  assert.deepEqual(runDose({ premium: true, book: true }), [['select', 'curve']]);
  const right = findFn(BODY, 'renderBookRight').code;
  assert.match(right, /if \(rightPage\?\.type === 'curve'\) return <SerumCurveScreen embedded \/>;/);
  assert.match(BODY, /import SerumCurveScreen from '\.\/SerumCurveScreen';/);
});

test('BK-11/BK-2: free users keep today\'s preview sheet → Paywall; a phone pushes the Curve as today', () => {
  assert.deepEqual(runDose({ premium: false, book: true }), [['preview', true]], 'book, free: the preview sheet, not the right page');
  assert.deepEqual(runDose({ premium: false, book: false }), [['preview', true]], 'phone, free: unchanged');
  assert.deepEqual(runDose({ premium: true, book: false }), [['navigate', 'SerumCurve']], 'phone, Premium: pushed as today');
  // The preview sheet still leads to the full-screen Paywall.
  assert.match(BODY, /navigation\.navigate\('Paywall', \{ source: 'serum_preview_sheet' \}\)/);
});

test('BK-8: the open item on the left page has a 2 pt ink outline (theme token)', () => {
  const selCard = BODY.match(/selCard: \{([^}]*)\}/);
  const selLi = BODY.match(/selLi: \{([^}]*)\}/);
  assert.ok(selCard && selLi);
  for (const m of [selCard[1], selLi[1]]) {
    assert.match(m, /borderWidth: 2/);
    assert.match(m, /borderColor: c\.ink\b/);
  }
  assert.match(selLi[1], /borderTopColor: c\.ink\b/, 'the row divider never paints the top edge in another color');
  const journal = findFn(BODY, 'renderJournalBody').code;
  assert.match(journal, /inBook && rightPage\?\.type === 'report' && rightPage\.key === key && s\.selCard/);
  assert.match(journal, /inBook && rightPage\?\.type === 'marker' && rightPage\.key === mk\.key && s\.selLi/);
  assert.match(findFn(BODY, 'renderDoseCard').code, /selected && s\.selCard/);
});

test('BK-10: folding shows the chosen test as the phone detail; unfolding moves an open detail to the right page', () => {
  const fold = pure.bodyFoldPlan;
  assert.deepEqual(fold({ sel: '2026-09-20|t', explicit: true }), { section: 'labs', detail: { type: 'report', key: '2026-09-20|t' } });
  assert.deepEqual(fold({ sel: 'marker:estradiol', explicit: true }), { section: 'labs', detail: { type: 'marker', key: 'estradiol' } });
  assert.deepEqual(fold({ sel: 'curve', explicit: true }), { section: null, detail: null, push: 'SerumCurve' }, 'the Curve is pushed with "‹ back"');
  assert.equal(fold({ sel: '2026-09-20|t', explicit: false }), null, 'a default nobody chose changes nothing');
  assert.deepEqual(fold({ sel: 'curve', explicit: true, vaxSheetOpen: true }), { section: 'vaccines', detail: null }, 'an open vaccine sheet wins');

  const unfold = pure.bodyUnfoldSel;
  assert.equal(unfold({ section: 'labs', detail: { type: 'report', key: 'k1' } }), 'k1');
  assert.equal(unfold({ section: 'labs', detail: { type: 'marker', key: 'estradiol' } }), 'marker:estradiol');
  assert.equal(unfold({ section: 'labs', detail: null }), null);
  assert.equal(unfold({ section: null, detail: null }), null);
  assert.equal(unfold({ section: 'vaccines', detail: { type: 'report', key: 'k1' } }), null);
  // Round trip: unfold a detail, fold again → the same detail.
  const d = { type: 'marker', key: 'hematocrit' };
  assert.deepEqual(fold({ sel: unfold({ section: 'labs', detail: d }), explicit: true }).detail, d);

  // Wiring: the transition effect runs on `book` changes and uses both plans.
  assert.match(BODY, /const plan = bodyFoldPlan\(\{ sel, explicit, vaxSheetOpen \}\);/);
  assert.match(BODY, /const next = bodyUnfoldSel\(\{ section, detail \}\);\s*\n\s*if \(next\) select\(next\);/);
  assert.match(BODY, /if \(plan\.push\) navigation\.navigate\(plan\.push\);/);
});

test('BK-10: sheets keep their typed values across a fold/unfold', () => {
  // Nothing in My Body is keyed on `book` (a key change would remount and drop typed values).
  assert.doesNotMatch(BODY, /key=\{[^}]*\bbook\b/);
  // Every BodyScreen sheet (upload upsell, review, export, edit value, Curve preview) lives
  // outside the layout branch, in BodyScreen's own state, so the fold never unmounts it.
  const modals = jsxByName(BODY, 'Modal');
  assert.ok(modals.length >= 5);
  for (const { anc } of modals) {
    const gated = anc.some((a) => a.type === 'ConditionalExpression' && isIdent(a.test, 'book'));
    assert.equal(gated, false, 'a sheet inside the book/phone branch would be lost on fold');
  }
  // The add/edit vaccine sheet lives in VaccinesSection, which moves between the layouts: its
  // values are kept in BodyScreen's ref while it is open and restored by the next instance.
  assert.match(BODY, /const vaxDraft = useRef\(null\);/);
  assert.match(BODY, /<VaccinesSection draftRef=\{vaxDraft\} onSheetChange=\{setVaxSheetOpen\} \/>/, 'phone instance');
  assert.match(VAX, /const \[carried\] = useState\(\(\) => \(draftRef && draftRef\.current\) \|\| null\);/);
  for (const f of ['name', 'dateGiven', 'nextDue', 'notes', 'manufacturer', 'doseNumber', 'batchLot', 'provider', 'location', 'pickerFor', 'editingId']) {
    assert.match(VAX, new RegExp(`useState\\(carried \\? carried\\.${f} : `), `${f} restored`);
    assert.match(VAX, new RegExp(`\\? \\{ modalOpen, [^}]*\\b${f}\\b[^}]*\\}`), `${f} kept`);
  }
  assert.match(VAX, /const \[modalOpen, setModalOpen\] = useState\(!!carried\);/);
  // Kept on every render while open (the new instance renders before the old one unmounts).
  assert.match(VAX, /useEffect\(\(\) => \{\s*\n\s*if \(!draftRef\) return;\s*\n\s*draftRef\.current = modalOpen/);
});

test('BK-2: on a phone the vaccine journal keeps its own scroll; inline only inside the book page', () => {
  assert.match(VAX, /export default function VaccinesSection\(\{ inline = false, draftRef = null, onSheetChange = null \} = \{\}\)/);
  const js = findFn(VAX, 'JournalScroll').code;
  assert.match(js, /if \(inline\) return <View style=\{s\.inlineList\}>\{children\}<\/View>;/);
  assert.match(js, /<ScrollView showsVerticalScrollIndicator=\{false\} style=\{s\.scroll\} contentContainerStyle=\{\[s\.centered, s\.scrollPad\]\} keyboardShouldPersistTaps="handled">/);
  // A tapped vaccine opens its sheet, on a phone and in the book (no read-only vaccine view exists).
  assert.match(VAX, /onPress=\{\(\) => openEdit\(v\)\}/);
});

test('BK-12: theme tokens only, no emoji, no new strings', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const [name, src] of [['BodyScreen', BODY], ['VaccinesSection', VAX]]) {
    const code = strip(src);
    assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, `${name}: theme tokens only`);
    assert.doesNotMatch(code, /\p{Extended_Pictographic}/u, `${name}: no emoji`);
  }
  const tr = read('i18n', 'translations.js');
  const keys = new Set([...BODY.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]));
  for (const k of ['renderBookLeft', 'renderBookRight', 'renderDoseCard', 'renderMarkerDetail'].flatMap((f) => [...findFn(BODY, f).code.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]))) {
    assert.ok(keys.has(k));
  }
  for (const k of keys) {
    const n = (tr.match(new RegExp(`\\n\\s+${k}: `, 'g')) || []).length;
    assert.ok(n >= 6, `${k} exists in all 6 languages (found ${n})`);
  }
});
