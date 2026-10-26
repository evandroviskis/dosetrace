'use strict';
// AD-99 review (2026-10-26): the "N de 3 leituras usadas este mês" line under the lab journal title.
//  (a) Two count requests in flight (focus + the journal opening + a scan's answer) could land out
//      of order and leave an OLD count on screen → only the latest request's answer is applied.
//  (b) `premium` started false and the count was asked before `await hasPremium()`, so a Premium
//      account briefly saw the free "3 de 3 … renovam" in attention colour (AD-69: Premium strings
//      carry no scan limit) → premium starts unknown (null) and no line is drawn until it is known.
//  (c) The count was asked on every My Body focus, even with the hub or vaccines on screen → it is
//      asked only while the lab journal is shown (the phone's lab section, or the Fold's right page
//      showing the journal), when it comes into view, and after a scan.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const SU = require('../lib/scanUsage');
const { translations } = require('../i18n/translations');

const BODY = read('screens/BodyScreen.js');
const OCT26 = new Date(Date.UTC(2026, 9, 26, 15, 0, 0));
const tr = (lang) => (k) => (translations[lang][k] != null ? translations[lang][k] : k);

// refreshScanUsage with a fake server whose answers are released by the test, in any order.
function usageHarness() {
  const pending = [];
  const shown = [];
  const fn = loadFn('screens/BodyScreen.js', 'function refreshScanUsage(', 'refreshScanUsage', {
    usageReq: { current: 0 },
    supabase: { functions: { invoke: () => null } },
    fetchScanUsage: () => new Promise((resolve) => pending.push(resolve)),
    setScanUsage: (v) => shown.push(v),
  });
  return { fn, pending, shown };
}
const flush = () => new Promise((r) => setImmediate(r));

test('AD-99 review (a): answers landing out of order — only the latest request is shown, never an older count', async () => {
  const H = usageHarness();
  H.fn(); // asked on focus (before a scan)
  H.fn(); // asked again after the scan
  assert.equal(H.pending.length, 2);
  H.pending[1]({ used: 3, renewsOn: '2026-11-01' }); // the newer answer arrives first
  await flush();
  H.pending[0]({ used: 2, renewsOn: '2026-11-01' }); // the older one arrives late
  await flush();
  assert.deepEqual(H.shown, [{ used: 3, renewsOn: '2026-11-01' }], 'the late, older count is dropped');
});

test('AD-99 review (a): answers in order — the latest is shown; a latest "no answer" (offline) hides the line', async () => {
  const H = usageHarness();
  H.fn(); H.fn();
  H.pending[0]({ used: 1, renewsOn: null });
  await flush();
  H.pending[1](null);
  await flush();
  assert.deepEqual(H.shown, [null], 'only the latest request decides');
});

test('AD-99 review (b): Premium not known yet → no line at all (never the free "3 de 3 … renovam"); known → the right line', () => {
  for (const premium of [null, undefined]) {
    assert.equal(SU.scanUsageLine({ used: 3, renewsOn: '2026-11-01', premium, language: 'pt', t: tr('pt'), now: OCT26 }), null, String(premium));
  }
  assert.equal(SU.scanUsageLine({ used: 3, renewsOn: '2026-11-01', premium: true, language: 'pt', t: tr('pt'), now: OCT26 }).count, '3 leituras usadas este mês');
  assert.equal(SU.scanUsageLine({ used: 3, renewsOn: '2026-11-01', premium: false, language: 'pt', t: tr('pt'), now: OCT26 }).full, true);
  assert.match(BODY, /const \[premium, setPremium\] = useState\(null\);/, 'unknown until hasPremium answers');
  assert.match(sliceBlock(BODY, 'function renderScanUsage('), /scanUsageLine\(\{ used: scanUsage\?\.used, renewsOn: scanUsage\?\.renewsOn, premium, language, t \}\)/);
});

test('AD-99 review (c): the count is asked only while the lab journal is shown', () => {
  const { scanUsageShown } = SU;
  assert.equal(scanUsageShown({ book: false, section: 'labs' }), true, 'phone: the lab journal');
  for (const section of [null, 'vaccines', 'calc']) assert.equal(scanUsageShown({ book: false, section }), false, `phone: ${section}`);
  assert.equal(scanUsageShown({ book: true, section: null, rightPage: 'labs' }), true, 'Fold: the journal on the right page');
  for (const rightPage of ['curve', 'vaccines', 'vaccine', 'report', 'marker', null]) {
    assert.equal(scanUsageShown({ book: true, section: 'labs', rightPage }), false, `Fold: ${rightPage}`);
  }
});

test('AD-99 review (c): a My Body focus asks only while the journal is shown; coming into view asks once; fetchReports never asks', async () => {
  const focus = BODY.slice(BODY.indexOf('useFocusEffect('), BODY.indexOf('async function fetchReports('));
  assert.match(focus, /fetchReports\(\);\s*if \(usageShownRef\.current\) refreshScanUsage\(\);/);
  assert.match(BODY, /const usageShown = scanUsageShown\(\{ book, section, rightPage: rightPage\?\.type \}\);/);
  assert.match(BODY, /useEffect\(\(\) => \{\s*if \(usageShownRef\.current === usageShown\) return;[^\n]*\s*usageShownRef\.current = usageShown;\s*if \(usageShown\) refreshScanUsage\(\);\s*\}, \[usageShown\]\);/);
  assert.doesNotMatch(BODY, /if \(section === 'labs'\) refreshScanUsage\(\)/, 'the old trigger is replaced');
  // fetchReports (called after deletes, uploads, back) asks nothing; it is run for real.
  let asked = 0;
  const fetchReports = loadFn('screens/BodyScreen.js', 'async function fetchReports(', 'fetchReports', {
    refreshScanUsage: () => { asked += 1; }, hasPremium: async () => true, setPremium() {},
    getCachedUser: async () => ({ id: 'u' }), setLoading() {}, getBiomarkers: () => [], setRows() {},
    setVaccineList() {}, getVaccines: () => [], loadLabPrefs: async () => ({ favorites: [], tags: {} }),
    setFavorites() {}, setReportTags() {}, applyLabelMoves: (t) => t, pendingLabelMoves: { current: [] }, saveReportTagOp() {},
  });
  await fetchReports();
  assert.equal(asked, 0);
  // after every lab scan answer it is still asked (the count changed)
  assert.match(sliceBlock(BODY, 'async function extractWithClaude('), /finally \{\s*refreshScanUsage\(\);\s*\}/);
});
