// A-202 (founder 2026-10-31, checklist docs/specs/a202-add-missing-lab-value.md AV-1…AV-11): no lab
// test is typed by hand; inside an uploaded test, "+ Adicionar valor" adds the value the AI missed.
// The value joins that test (its card, lib/labReports) on this phone AND on any phone that pulls the
// account later: the cloud stamps created_at itself unless it is sent, so the biomarkers payload now
// carries created_at and the add gives every value of the test the test's own stamp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { toCloudPayload } = require('../lib/syncMappers');
const { reportCards } = require('../lib/labReports');
const { translations } = require('../i18n/translations');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const { pushPending, fullImport } = require('../lib/syncCore');
const USER = 'user-A';
function dbFns(db) {
  const getDB = () => db;
  const fn = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB });
  return { addBiomarkerToReport: fn('addBiomarkerToReport'), updateBiomarker: fn('updateBiomarker'), getBiomarkers: fn('getBiomarkers') };
}
// A test as a phone that PULLED it sees it: the cloud stamped each row itself, a second apart.
function seedPulledTest(db, cloud, date, stamps) {
  stamps.forEach((st, i) => {
    const rid = `b-${i}`;
    cloud._store.biomarkers.set(rid, { id: rid, user_id: USER, report_date: date, marker: 'M' + i, value: i, unit: 'u', created_at: st, updated_at: cloud._stamp() });
    db.runSync(`INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'u', ?, '000000', 'synced')`, [rid, USER, date, 'M' + i, i, st]);
  });
}

// Review 2026-10-31 (DV-001 / TR-SYNC-4): created_at goes up on INSERT only, never on an update, never null.
test('DV-001: a value created offline at T0 and pushed later arrives in the cloud with T0', async () => {
  const db = makeDb(); const cloud = makeCloud();
  db.runSync(`INSERT INTO biomarkers (user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES (?, '2026-10-16', 'TSH', 2.1, 'mUI/L', '2026-10-31T14:23:31.000Z', '2026-10-31T14:23:31.000Z', 'pending')`, [USER]);
  await pushPending(db, cloud, USER);
  const c = cloud.rows('biomarkers', USER);
  assert.equal(c.length, 1);
  assert.equal(c[0].created_at, '2026-10-31T14:23:31.000Z');
});

test('DV-001: an edit never sends created_at (the cloud keeps its stamp even when the phone\'s differs)', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const { updateBiomarker } = dbFns(db);
  seedPulledTest(db, cloud, '2026-10-16', ['2026-10-16T10:00:01.000Z']);
  // The scanning phone kept its own batch stamp, a few seconds before the cloud's.
  db.runSync(`UPDATE biomarkers SET created_at = '2026-10-16T10:00:00.000Z'`);
  const id = db.getFirstSync('SELECT id FROM biomarkers').id;
  updateBiomarker(id, { value: 9 });
  await pushPending(db, cloud, USER);
  const row = cloud.rows('biomarkers', USER)[0];
  assert.equal(Number(row.value), 9);
  assert.equal(row.created_at, '2026-10-16T10:00:01.000Z');
  const upd = toCloudPayload('biomarkers', { report_date: 'd', marker: 'm', value: 1, unit: 'u', created_at: null });
  assert.ok(!('created_at' in upd), 'never a null created_at');
});

test('AV-4: a value added inside a pulled test joins that test, here and after a reimport (one card)', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const { addBiomarkerToReport, getBiomarkers } = dbFns(db);
  seedPulledTest(db, cloud, '2026-10-16', ['2026-10-31T13:58:41.100Z', '2026-10-31T13:58:42.300Z', '2026-10-31T13:58:43.500Z']);
  const card = reportCards(getBiomarkers(USER))[0];
  assert.equal(card.markers.length, 3);
  addBiomarkerToReport(USER, card, { marker: 'TSH', value: 2.1, unit: 'mUI/L' });
  const here = reportCards(getBiomarkers(USER));
  assert.equal(here.length, 1); assert.equal(here[0].markers.length, 4);
  assert.equal(db.getAllSync(`SELECT 1 FROM biomarkers WHERE sync_status = 'pending'`).length, 1, 'only the new value goes up; the old rows are not rewritten');
  await pushPending(db, cloud, USER);
  const fresh = makeDb();
  await fullImport(fresh, cloud, USER);
  const again = reportCards(dbFns(fresh).getBiomarkers(USER));
  assert.equal(again.length, 1, 'one test after a reinstall');
  assert.equal(again[0].markers.length, 4);
});

test('AV-2 / AV-3: "+ Adicionar valor" on the test page opens the Edit value window in add mode, the date held to the test', () => {
  const src = read('screens/BodyScreen.js');
  const detail = src.slice(src.indexOf('function renderReportDetail('), src.indexOf('function renderReportDetail(') + 6000);
  const add = detail.indexOf("t('blood_add_value_btn')");
  const move = detail.indexOf("t('blood_date_move')");
  assert.ok(add > 0 && move > add, 'the add button sits under the values, above "Mudar a data deste exame"');
  assert.match(src, /function openAddValue\(card\) \{/);
  // Sim 2026-10-31: the window must not turn into "Edit value" while it slides away after Save, so
  // the render reads a mode kept until the next open (mAdding), never mEdit (cleared on Save).
  assert.match(src, /const \[mAdding, setMAdding\] = useState\(false\);/);
  assert.match(src, /function openAddValue\(card\) \{\s*setMAdding\(true\);/);
  assert.match(src, /function openMarkerEdit\(obj\) \{\s*setMAdding\(false\);/);
  assert.match(src, /title=\{mAdding \? t\('blood_add_value_title'\) : t\('blood_edit_title'\)\}/);
  assert.match(src, /\{mAdding \? \(/, 'the date row is read-only when adding');
  assert.match(src, /!mAdding && \(\s*<TouchableOpacity style=\{s\.dangerBtn\} onPress=\{askDeleteValue\}/, 'no Delete this value while adding');
});

test('AV-4 / AV-5 / AV-7: Save adds through addBiomarkerToReport with the same checks as Edit value, never a scan', () => {
  const src = read('screens/BodyScreen.js');
  // A-203 (founder 2026-10-31): the value is read by parseLabInput (parseMeasure + a leading sign or
  // the words) and the add carries the sign and the words; the window is longer, so a wider slice.
  const save = src.slice(src.indexOf('function saveMarkerEdit()'), src.indexOf('function saveMarkerEdit()') + 2600);
  assert.match(save, /parseLabInput\(mValue, language\)/);
  assert.match(save, /blood_edit_invalid/);
  assert.match(save, /if \(mEdit\.adding\) \{[\s\S]*addBiomarkerToReport\(userId, mEdit\.card, \{ marker: mName\.trim\(\), value, qualifier, value_text, unit: mUnit\.trim\(\) \}\)/);
  assert.doesNotMatch(save, /extract-bloodwork|ensureAiConsent|scanUsage/);
});

test('AV-6: closing the add window with something typed asks "Discard this value?" first', () => {
  const src = read('screens/BodyScreen.js');
  const close = src.slice(src.indexOf('function closeMarkerEdit()'), src.indexOf('function closeMarkerEdit()') + 900);
  assert.match(close, /mEdit\?\.adding && \(mName\.trim\(\) \|\| mValue\.trim\(\) \|\| mUnit\.trim\(\)\)/);
  assert.match(close, /blood_add_discard_title/);
});

test('AV-10 / AV-11: the explainer stops promising to type reports; the new words exist in 6 languages', () => {
  for (const lang of LANGS) {
    const tr = translations[lang];
    for (const k of ['blood_add_value_btn', 'blood_add_value_title', 'blood_add_discard_title', 'blood_add_value_failed']) assert.equal(typeof tr[k], 'string', `${lang}.${k}`);
    assert.doesNotMatch(tr.xp_labsman_body, /Type in|Escribe los valores|Digite os valores|Saisissez|Tippe|Inserisci i valori/, lang);
  }
  assert.equal(translations.pt.blood_add_value_btn, '+ Adicionar valor');
  assert.equal(translations.pt.blood_add_discard_title, 'Descartar este valor?');
  assert.equal(translations.pt.xp_labsman_body, 'Envie o seu exame e a IA lê os valores. Você pode corrigir qualquer um ou acrescentar o que faltou, tudo guardado por data.');
  assert.equal(translations.en.xp_labsman_body, 'Upload your lab report and the AI reads the values. You can fix any of them or add one it missed, all kept by date.');
});

test('AV-10: "Try it" on the lab explainer opens the upload choice', () => {
  assert.match(read('components/FeatureExplainerGate.js'), /export default function FeatureExplainerGate\(\{ candidates, onTry \}\)/);
  assert.match(read('screens/BodyScreen.js'), /<FeatureExplainerGate candidates=\{labExplainers\} onTry=\{[^}]*handleUploadPress/);
});

// Sim 2026-10-31: with values added by hand the free card read "Você escaneou 5 marcadores" — not
// every value was scanned now. It names what is in the journal.
test('A-202: the free lab card counts the markers in the journal, never "scanned"', () => {
  for (const lang of LANGS) {
    for (const k of ['blood_premium_markers', 'blood_premium_markers_one']) {
      assert.doesNotMatch(translations[lang][k], /scanned|escaneado|escaneou|scanné|gescannt|scansionato/i, `${lang}.${k}`);
    }
  }
  assert.match(translations.pt.blood_premium_markers, /^Você tem \{n\} marcadores no diário\./);
});

test('AV-1: no lab test is created by hand — a new test is written only by the scan (persistMarkers)', () => {
  const src = read('screens/BodyScreen.js');
  const calls = src.match(/insertBiomarkers\(/g) || [];
  assert.equal(calls.length, 1);
  const persist = src.slice(src.indexOf('async function persistMarkers('), src.indexOf('async function persistMarkers(') + 1200);
  assert.match(persist, /insertBiomarkers\(rows\);/);
});

// Review 2026-10-31: offline with an expired token getCachedUser() is null — the typed value must not
// be dropped; a second Save while the first waits must not add it twice; a failed add says so and
// keeps the window open.
test('AV-4 / AV-6: Save never drops a typed value (offline, double tap, failed write)', () => {
  const src = read('screens/BodyScreen.js');
  // A-203 (founder 2026-10-31): the window grew (the sign and the words), so a wider slice, and the
  // add carries qualifier and value_text.
  const save = src.slice(src.indexOf('async function saveMarkerEdit()'), src.indexOf('async function saveMarkerEdit()') + 2400);
  assert.match(save, /if \(savingRef\.current\) return;/);
  assert.match(save, /const userId = mEdit\.card\.markers\?\.\[0\]\?\.user_id \|\| \(await getCachedUser\(\)\)\?\.id;/);
  assert.doesNotMatch(save, /if \(!user\) \{ setMEdit\(null\)/, 'no close before the value is stored');
  assert.match(save, /const added = addBiomarkerToReport\(userId, mEdit\.card, \{ marker: mName\.trim\(\), value, qualifier, value_text, unit: mUnit\.trim\(\) \}\);\s*if \(!added\) \{/);
  assert.match(save, /finally \{ savingRef\.current = false; \}/);
});
