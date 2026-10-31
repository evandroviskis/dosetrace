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
const VPAGE = read('screens', 'components', 'VaccinePage.js');
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

// The pure rules, run as written in BodyScreen.js; the lab cards from lib/labReports (A-125).
const pure = {
  ...new Function(
    ['bodyRightPage', 'bodyFoldPlan', 'bodyUnfoldSel', 'staleVaccineSel'].map((f) => findFn(BODY, f).code).join('\n')
    + '\nreturn { bodyRightPage, bodyFoldPlan, bodyUnfoldSel, staleVaccineSel };',
  )(),
  buildReport: require('../lib/labReports').buildReport,
};
// The vaccine read page's row rule, run as written in VaccinePage.js.
const vaccineRows = new Function(`${findFn(VPAGE, 'vaccineRows').code}\nreturn vaccineRows;`)();

const ROWS = [
  { id: 1, report_date: '2026-07-01', created_at: '2026-07-02T10:00:00Z', marker: 'Testosterone', value: 600, unit: 'ng/dL' },
  { id: 2, report_date: '2026-09-20', created_at: '2026-09-21T08:00:00Z', marker: 'Estradiol', value: 30, unit: 'pg/mL' },
  { id: 3, report_date: '2026-09-20', created_at: '2026-09-22T09:00:00Z', marker: 'Estradiol', value: 31, unit: 'pg/mL' },
  { id: 4, report_date: '2026-09-20', created_at: '2026-09-22T09:00:00Z', marker: 'Hematocrit', value: 48, unit: '%' },
  { id: 5, report_date: '2026-08-15', created_at: '', marker: 'Hematocrit', value: 46, unit: '%' },
];
const keyOf = (r) => r.report_date + '|' + (r.created_at || '');

test('BK-6 (A-125 MB2-4): the default right page is the lab journal, never blank', () => {
  // Until A-125 the default was the newest test; the founder-approved picture (a125-mybody-closed.html,
  // option A Fold) opens the lab journal on the right page, beside the hub tiles.
  assert.equal(pure.bodyRightPage({ sel: null, reportKeys: new Set(), markerKeys: new Set(), vaxKeys: new Set(), premium: true }).type, 'labs', 'no test yet: still the journal (its empty state)');
  // Wired through the shared default rule.
  assert.match(BODY, /useBookSelection\('Body', defaultSelection\('Body'\)\)/);
  assert.doesNotMatch(BODY, /newestReportKey|newestKey/, 'the newest-test default is gone');
  assert.match(BODY, /const reportKeys = useMemo\(\(\) => new Set\(cards\.map\(c => c\.key\)\), \[cards\]\);/); // one key per lab card
});

test('BK-6: the right page shows the tapped test, the tapped marker, or the Curve for Premium', () => {
  const reportKeys = new Set(ROWS.map(keyOf));
  const markerKeys = new Set(['testosterone', 'estradiol', 'hematocrit']);
  const page = (sel, premium = true) => pure.bodyRightPage({ sel, reportKeys, markerKeys, premium });
  const labs = { type: 'labs', id: 'labs', group: 'labs' };

  assert.deepEqual(page(null), labs, 'nothing chosen → the lab journal');
  assert.deepEqual(page('2026-07-01|2026-07-02T10:00:00Z'), { type: 'report', key: '2026-07-01|2026-07-02T10:00:00Z', id: '2026-07-01|2026-07-02T10:00:00Z', group: 'labs' });
  assert.deepEqual(page('marker:estradiol'), { type: 'marker', key: 'estradiol', id: 'marker:estradiol', group: 'labs' });
  assert.deepEqual(page('curve'), { type: 'curve', id: 'curve', group: 'curve' });
  assert.deepEqual(page('curve', false), labs, 'BK-11: never the Curve page for a free user');
  assert.deepEqual(page('2026-01-01|gone'), labs, 'a deleted test falls back to the journal');
  assert.deepEqual(page('marker:renamed-away'), labs);

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
  assert.match(phone, /\{renderHubItems\(false\)\}/, 'A-125: the hub tiles and Dose accumulation');
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
  assert.match(left, /\{renderHubItems\(true\)\}/, 'the hub (tiles + Dose accumulation) is the left page');
  assert.match(findFn(BODY, 'renderHubItems').code, /\{renderDoseCard\(inBook && rightPage\?\.type === 'curve'\)\}/);
  // A-125: the journals open on the right page (+ Upload, Export, By date / By marker, search, sort).
  const journal = findFn(BODY, 'renderBookJournal').code;
  assert.match(journal, /onPress=\{handleUploadPress\}/, '+ Upload on the lab journal page');
  assert.match(journal, /\{canExportLabs && renderExportButton\(\)\}/, 'Export on the lab journal page');
  assert.match(journal, /\{renderJournalBody\(true\)\}/);
  assert.deepEqual(runDose({ premium: true, book: true }), [['select', 'curve']]);
  const right = findFn(BODY, 'renderBookRight').code;
  assert.match(right, /if \(rightPage\.type === 'curve'\) return <SerumCurveScreen embedded \/>;/);
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
  // A-125: the left page holds the two journal tiles (Evolução's tile draws the outline) and
  // Dose accumulation (selCard).
  const selCard = BODY.match(/selCard: \{([^}]*)\}/);
  assert.ok(selCard);
  assert.match(selCard[1], /borderWidth: 2/);
  assert.match(selCard[1], /borderColor: c\.ink\b/);
  assert.match(findFn(BODY, 'renderDoseCard').code, /selected && s\.selCard/);
  const tile = read('screens', 'components', 'DashTile.js');
  assert.match(tile, /selected: \{ borderWidth: 2, borderColor: c\.ink, borderRadius: 24 \}/);
  assert.match(findFn(BODY, 'renderLabTile').code, /selected=\{rightPage\?\.group === 'labs'\}/);
  assert.match(findFn(BODY, 'renderVaxTile').code, /selected=\{rightPage\?\.group === 'vaccines'\}/);
  assert.doesNotMatch(BODY, /selLi/, 'no outlined rows: a test or marker opens in place on the right page');
});

test('BK-10: folding shows the chosen test as the phone detail; unfolding moves an open detail to the right page', () => {
  const fold = pure.bodyFoldPlan;
  assert.deepEqual(fold({ sel: '2026-09-20|t', explicit: true }), { section: 'labs', detail: { type: 'report', key: '2026-09-20|t' } });
  assert.deepEqual(fold({ sel: 'marker:estradiol', explicit: true }), { section: 'labs', detail: { type: 'marker', key: 'estradiol' } });
  assert.deepEqual(fold({ sel: 'labs', explicit: true }), { section: 'labs', detail: null }, 'A-125: an open journal stays open');
  assert.deepEqual(fold({ sel: 'curve', explicit: true }), { section: null, detail: null, push: 'SerumCurve' }, 'the Curve is pushed with "‹ back"');
  assert.equal(fold({ sel: '2026-09-20|t', explicit: false }), null, 'a default nobody chose changes nothing');
  assert.deepEqual(fold({ sel: 'curve', explicit: true, vaxSheetOpen: true }), { section: 'vaccines', detail: null }, 'an open vaccine sheet wins');

  const unfold = pure.bodyUnfoldSel;
  assert.equal(unfold({ section: 'labs', detail: { type: 'report', key: 'k1' } }), 'k1');
  assert.equal(unfold({ section: 'labs', detail: { type: 'marker', key: 'estradiol' } }), 'marker:estradiol');
  assert.equal(unfold({ section: 'labs', detail: null }), 'labs', 'A-125: the open journal moves to the right page');
  assert.equal(unfold({ section: null, detail: null }), null);
  assert.equal(unfold({ section: 'vaccines', detail: { type: 'report', key: 'k1' } }), 'vaccines');
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
  // Every BodyScreen sheet (upload upsell, export, edit value, Curve preview, the DoseTrace
  // sheets and the source choice — My Body redesign 2026-10-03) lives outside the layout
  // branch, in BodyScreen's own state, so the fold never unmounts it.
  const modals = ['BottomSheet', 'FeaturePreviewSheet', 'DTSheet', 'DTActionSheet', 'DTPickerSheet'].flatMap((n) => jsxByName(BODY, n));
  assert.ok(modals.length >= 5);
  for (const { anc } of modals) {
    const gated = anc.some((a) => a.type === 'ConditionalExpression' && isIdent(a.test, 'book'));
    assert.equal(gated, false, 'a sheet inside the book/phone branch would be lost on fold');
  }
  // The add/edit vaccine sheet lives in VaccinesSection, which moves between the layouts: its
  // values are kept in BodyScreen's ref while it is open and restored by the next instance.
  assert.match(BODY, /const vaxDraft = useRef\(null\);/);
  assert.match(BODY, /<VaccinesSection draftRef=\{vaxDraft\} onSheetChange=\{setVaxSheetOpen\} onListChange=\{onVaxList\} \/>/, 'phone instance');
  assert.match(VAX, /const \[carried\] = useState\(\(\) => \(draftRef && draftRef\.current\) \|\| null\);/);
  for (const f of ['name', 'dateGiven', 'nextDue', 'notes', 'manufacturer', 'doseNumber', 'batchLot', 'provider', 'location', 'pickerFor', 'editingId']) {
    assert.match(VAX, new RegExp(`useState\\(carried \\? carried\\.${f} : `), `${f} restored`);
    assert.match(VAX, new RegExp(`\\? \\{ modalOpen, [^}]*\\b${f}\\b[^}]*\\}`), `${f} kept`);
  }
  assert.match(VAX, /const \[modalOpen, setModalOpen\] = useState\(!!carried\);/);
  // Kept on every render while open (the new instance renders before the old one unmounts).
  assert.match(VAX, /useEffect\(\(\) => \{\s*\n\s*if \(!draftRef\) return;\s*\n\s*draftRef\.current = modalOpen/);
});

test('BK-2: the vaccine journal has its own scroll on a phone and on the book\'s right page (A-125)', () => {
  assert.match(VAX, /export default function VaccinesSection\(\{ draftRef = null, onSheetChange = null, onSelect = null, onListChange = null, controlRef = null \} = \{\}\)/);
  assert.match(VAX, /<ScrollView showsVerticalScrollIndicator=\{false\} style=\{s\.scroll\} contentContainerStyle=\{\[s\.centered, s\.scrollPad\]\} keyboardShouldPersistTaps="handled">/);
  assert.doesNotMatch(VAX, /inline|JournalScroll|selectedId/, 'the left-page (inline) mode left with the left-page journal');
  // A tapped vaccine opens its sheet on a phone (no onSelect); in the book it opens the read
  // page on the right (BK-18, below).
  assert.match(VAX, /onPress=\{\(\) => \(onSelect \? onSelect\(v\) : openEdit\(v\)\)\}/);
});

test('BK-12: theme tokens only, no emoji, no new strings', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const [name, src] of [['BodyScreen', BODY], ['VaccinesSection', VAX], ['VaccinePage', VPAGE]]) {
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

// ── BK-18 (founder decision 6): a tapped vaccine opens a read page on the right ──────────────

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const TR = read('i18n', 'translations.js');
// Every `key:` line of i18n/translations.js (one per language block).
const keyCount = (k) => (TR.match(new RegExp(`\\n\\s+${k}: `, 'g')) || []).length;

test('BK-18: the read page shows only the filled rows, in the sheet order, with the sheet\'s labels', () => {
  const full = {
    id: 7, name: 'Hepatitis B', date_given: '2026-03-02', next_due: '2026-09-02', manufacturer: 'GSK',
    dose_number: 2, batch_lot: 'FF1234', provider: 'City Clinic', location: 'left arm', notes: 'sore arm for a day',
  };
  assert.deepEqual(vaccineRows(full).map((r) => r.label), [
    'vax_date_given', 'vax_next_due', 'vax_manufacturer', 'vax_dose_number', 'vax_batch_lot', 'vax_provider', 'vax_location', 'vax_notes',
  ]);
  assert.deepEqual(vaccineRows(full).find((r) => r.label === 'vax_dose_number'), { label: 'vax_dose_number', value: '2', date: false, long: false });
  assert.equal(vaccineRows(full).find((r) => r.label === 'vax_date_given').date, true, 'dates are formatted by the page');
  assert.equal(vaccineRows(full).find((r) => r.label === 'vax_notes').long, true, 'notes stack under their label');

  // A hand-added vaccine with only a name and date: one row, nothing empty shown.
  const bare = { id: 8, name: 'Tetanus', date_given: '2026-01-10', next_due: null, manufacturer: '', dose_number: null, batch_lot: '  ', provider: undefined, location: null, notes: '' };
  assert.deepEqual(vaccineRows(bare), [{ label: 'vax_date_given', value: '2026-01-10', date: true, long: false }]);
  assert.deepEqual(vaccineRows({ id: 9, name: 'X' }), [], 'name only: no rows (the name is the title)');
  assert.deepEqual(vaccineRows(null), []);
  assert.equal(vaccineRows({ name: 'Y', dose_number: 0 }).length, 1, 'a dose number of 0 is a value');

  // Every label is an existing key the vaccine section already shows, in all 6 languages.
  const labels = [...findFn(VPAGE, 'vaccineRows').code.matchAll(/label: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.equal(labels.length, 8);
  for (const k of labels) {
    assert.match(VAX, new RegExp(`t\\('${k}'\\)`), `${k} is a label the vaccine section already shows`);
    assert.equal(keyCount(k), LANGS.length, `${k} in all 6 languages`);
  }
  const pageKeys = [...VPAGE.matchAll(/\bt\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(pageKeys)].sort(), ['protocols_edit', 'vax_disclaimer']);
  for (const k of pageKeys) assert.equal(keyCount(k), LANGS.length, `${k} in all 6 languages`);
  assert.match(VPAGE, /<Text style=\{s\.editBtnText\}>\{t\('protocols_edit'\)\}<\/Text>/, 'the Edit capsule uses the protocol screen\'s Edit key');
  assert.match(VPAGE, /\{rows\.length > 0 && \(/, 'no empty list card when nothing is filled');
});

test('BK-18: the vaccine is the right page; its key is the vaccine id; a deleted vaccine falls back to the vaccine journal', () => {
  const reportKeys = new Set(ROWS.map(keyOf));
  const vaxKeys = new Set(['7', '8']);
  const page = (sel, keys = vaxKeys) => pure.bodyRightPage({ sel, reportKeys, markerKeys: new Set(), vaxKeys: keys, premium: true });
  const vaccines = { type: 'vaccines', id: 'vaccines', group: 'vaccines' };
  assert.deepEqual(page('vax:7'), { type: 'vaccine', key: '7', id: 'vax:7', group: 'vaccines' });
  assert.deepEqual(page('vax:99'), vaccines, 'unknown: the vaccine journal');
  assert.deepEqual(page('vax:7', new Set(['8'])), vaccines, 'deleted from the sheet: the journal');
  assert.deepEqual(pure.bodyRightPage({ sel: 'vax:7', reportKeys: new Set(), markerKeys: new Set(), vaxKeys, premium: false }),
    { type: 'vaccine', key: '7', id: 'vax:7', group: 'vaccines' }, 'a vaccine opens even before any lab test exists');

  // The chosen vaccine is dropped when a fresh list no longer has it.
  assert.equal(pure.staleVaccineSel('vax:7', [{ id: 7 }, { id: 8 }]), false);
  assert.equal(pure.staleVaccineSel('vax:7', [{ id: 8 }]), true);
  assert.equal(pure.staleVaccineSel('vax:7', []), true);
  assert.equal(pure.staleVaccineSel('2026-09-20|t', []), false, 'a test choice is never touched');
  assert.equal(pure.staleVaccineSel(null, []), false);

  // Wiring: ids as strings, the read page from the same list, the fallback opens the journal.
  assert.match(BODY, /const vaxKeys = useMemo\(\(\) => new Set\(vaccineList\.map\(v => String\(v\.id\)\)\), \[vaccineList\]\);/);
  assert.match(BODY, /bodyRightPage\(\{ sel, reportKeys, markerKeys, vaxKeys, premium \}\)/);
  assert.match(BODY, /const bookVaccine = rightPage\?\.type === 'vaccine' \? vaccineList\.find\(v => String\(v\.id\) === rightPage\.key\) \|\| null : null;/);
  assert.match(BODY, /function selectVaccine\(v\) \{ select\('vax:' \+ v\.id\); \}/);
  assert.match(BODY, /if \(staleVaccineSel\(selRef\.current, list\)\) setSelection\('Body', 'vaccines', \{ explicit: true \}\);/);
  const right = findFn(BODY, 'renderBookRight').code;
  assert.match(right, /<VaccinePage vaccine=\{bookVaccine\} onEdit=\{\(\) => editVaccine\(bookVaccine\)\} \/>/);
  assert.match(BODY, /import VaccinePage from '\.\/components\/VaccinePage';/);
  // The section hands over every fresh list (after add, edit, delete, scan or focus).
  const fetchList = findFn(VAX, 'fetchList').code;
  assert.match(fetchList, /const next = getVaccines\(user\.id\) \|\| \[\];\s*\n\s*setList\(next\);\s*\n\s*if \(onListChange\) onListChange\(next\);/);
  for (const f of ['save', 'deleteVaccineNow', 'persistVaccines']) assert.match(findFn(VAX, f).code, /fetchList\(\);/, `${f} refreshes the list`);
});

test('BK-18: Edit on the read page opens today\'s add/edit sheet for that vaccine', () => {
  // VaccinePage: the capsule calls onEdit.
  assert.match(VPAGE, /<TouchableOpacity style=\{s\.editBtn\} onPress=\{onEdit\} accessibilityRole="button">/);
  // BodyScreen: onEdit goes to the VaccinesSection kept under the read page (A-125), run as written.
  const code = findFn(BODY, 'editVaccine').code;
  const opened = [];
  const vaxControl = { current: { openEdit: (v) => opened.push(v) } };
  new Function('vaxControl', `${code}\nreturn editVaccine;`)(vaxControl)({ id: 7, name: 'Hepatitis B' });
  assert.deepEqual(opened, [{ id: 7, name: 'Hepatitis B' }]);
  assert.doesNotThrow(() => new Function('vaxControl', `${code}\nreturn editVaccine;`)({ current: null })({ id: 7 }), 'no sheet mounted: nothing happens');
  // VaccinesSection exposes its own openEdit, the one the phone tap uses: it fills the fields
  // from the vaccine and opens the same add/edit sheet (titled Edit vaccine; a bottom sheet since
  // the My Body redesign, docs/specs/my-body.md MB-21).
  assert.match(VAX, /controlRef\.current = \{ openEdit \};\s*\n\s*return \(\) => \{ controlRef\.current = null; \};/);
  const openEdit = findFn(VAX, 'openEdit').code;
  assert.match(openEdit, /setEditingId\(v\.id\);/);
  assert.match(openEdit, /setModalOpen\(true\);/);
  assert.match(VAX, /<BottomSheet visible=\{modalOpen\}/);
  assert.match(VAX, /\{editingId \? t\('vax_edit_title'\) : t\('vax_add_title'\)\}/);
  // Only the book instance gets the control; the right page only exists in the book.
  assert.equal((BODY.match(/controlRef=\{vaxControl\}/g) || []).length, 1);
});

test('BK-18/BK-2: the phone keeps today\'s tap-to-edit; no read page or selection on the phone path', () => {
  const panes = jsxByName(BODY, 'BookPanes');
  const cond = [...panes[0].anc].reverse().find((a) => a.type === 'ConditionalExpression');
  const phone = BODY.slice(cond.alternate.start, cond.alternate.end);
  // The phone instance hands its fresh list to BodyScreen (the hub tile, Export and the export
  // sheet count the vaccines that exist, docs/specs/my-body.md MB-9) — still no selection.
  assert.match(phone, /<VaccinesSection draftRef=\{vaxDraft\} onSheetChange=\{setVaxSheetOpen\} onListChange=\{onVaxList\} \/>/, 'phone instance: no onSelect, no selection, no control');
  assert.doesNotMatch(phone, /VaccinePage|onSelect|selectedId|selectVaccine|controlRef/);
  // Without onSelect a tap opens the sheet.
  assert.match(VAX, /onPress=\{\(\) => \(onSelect \? onSelect\(v\) : openEdit\(v\)\)\}/);
  // Folding with a vaccine open shows the vaccine journal with "‹ back" (no read page on a
  // phone); unfolding from there opens the vaccine journal on the right page (A-125).
  assert.deepEqual(pure.bodyFoldPlan({ sel: 'vax:7', explicit: true }), { section: 'vaccines', detail: null });
  assert.equal(pure.bodyFoldPlan({ sel: 'vax:7', explicit: false }), null);
  assert.equal(pure.bodyUnfoldSel({ section: 'vaccines', detail: null }), 'vaccines');
});

test('BK-8/BK-21: every selectable left item outlines and reports itself as selected', () => {
  // A-125: the left page's items are the two tiles and Dose accumulation.
  const tile = read('screens', 'components', 'DashTile.js');
  assert.match(tile, /accessibilityState=\{book \? \{ selected: !!selected \} : undefined\}/);
  for (const f of ['renderLabTile', 'renderVaxTile']) assert.match(findFn(BODY, f).code, /book=\{book\}/);
  assert.match(findFn(BODY, 'renderDoseCard').code, /accessibilityState=\{book \? \{ selected: !!selected \} : undefined\}/);
});

// The first JSX element child of a JSX element (whitespace text skipped).
const elKids = (el) => el.children.filter((c) => c.type === 'JSXElement');
const attr = (el, name) => el.openingElement.attributes.find((a) => a.name && a.name.name === name);

test('BK-21: the right page\'s title is the first focusable element (a header)', () => {
  // Vaccine read page: ScrollView, then the title row, then the name, before the Edit capsule.
  const sv = jsxByName(VPAGE, 'ScrollView')[0].n;
  const row = elKids(sv)[0];
  assert.equal(VPAGE.slice(attr(row, 'style').value.start, attr(row, 'style').value.end), '{s.titleRow}');
  const [title, edit] = elKids(row);
  assert.equal(title.openingElement.name.name, 'Text');
  assert.equal(attr(title, 'accessibilityRole').value.value, 'header');
  assert.match(VPAGE.slice(title.start, title.end), /\{vaccine\.name\}/);
  assert.equal(edit.openingElement.name.name, 'TouchableOpacity', 'Edit comes after the title');
  // Lab test and marker on the right page: the title is a header there (the phone is unchanged).
  assert.match(findFn(BODY, 'renderReportDetail').code, /<Text style=\{s\.screenTitle\} accessibilityRole=\{inBook \? 'header' : undefined\}>\{formatDate\(reportDetail\.date\)\}<\/Text>/);
  assert.match(findFn(BODY, 'renderBookRight').code, /renderReportDetail\(bookReport, true\)/);
  assert.match(findFn(BODY, 'renderMarkerDetail').code, /<Text style=\{\[s\.screenTitle, s\.grow\]\} accessibilityRole="header">\{markerLabel\(markerDetail\.marker, language\)\}<\/Text>/);
  // Each detail's title block comes before anything tappable.
  for (const f of ['renderReportDetail', 'renderMarkerDetail']) {
    const code = findFn(BODY, f).code;
    assert.ok(code.indexOf('<View style={s.titleBlock}>') < code.indexOf('<TouchableOpacity'), `${f}: nothing focusable before the title`);
  }
});
