// A-202 (founder 2026-10-31, checklist docs/specs/a202-add-missing-lab-value.md AV-1…AV-11): no lab
// test is typed by hand; inside an uploaded test, "+ Adicionar valor" adds the value the AI missed.
// The value joins that test (its card, lib/labReports) on this phone AND on any phone that pulls the
// account later: the cloud stamps created_at itself unless it is sent, so the biomarkers payload now
// carries created_at and the add gives every value of the test the test's own stamp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CLOUD_FIELDS, toCloudPayload } = require('../lib/syncMappers');
const { reportCards } = require('../lib/labReports');
const { translations } = require('../i18n/translations');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('AV-4: the biomarkers payload carries created_at, so the cloud keeps the test\'s stamp', () => {
  assert.ok(CLOUD_FIELDS.biomarkers.includes('created_at'));
  const p = toCloudPayload('biomarkers', { report_date: '2026-10-16', marker: 'Ferritin', value: 78, unit: 'ng/mL', created_at: '2026-10-31T13:58:40.000Z' });
  assert.equal(p.created_at, '2026-10-31T13:58:40.000Z');
});

test('AV-4: a value added days later with the test\'s stamp stays in that one card (here and after a pull)', () => {
  const stamp = '2026-10-31T13:58:40.000Z';
  // As pulled: the cloud had stamped each scanned row itself, a second apart.
  const pulled = [
    { report_date: '2026-10-16', marker: 'Ferritin', created_at: '2026-10-31T13:58:41.100Z' },
    { report_date: '2026-10-16', marker: 'Glucose', created_at: '2026-10-31T13:58:42.300Z' },
  ];
  const lateAdd = { report_date: '2026-10-16', marker: 'Vitamin D', created_at: '2026-11-04T09:00:00.000Z' };
  assert.equal(reportCards([...pulled, lateAdd]).length, 2, 'the cloud\'s own stamp would split the test');
  const unified = [...pulled.map((r) => ({ ...r, created_at: stamp })), { ...lateAdd, created_at: stamp }];
  const cards = reportCards(unified);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].markers.length, 3);
});

test('AV-4: the database adds the value and gives the whole test one stamp, in one transaction, scoped to that test', () => {
  const db = read('lib/database.js');
  const m = db.match(/export function addBiomarkerToReport\(userId, card, row\) \{[\s\S]*?\n\}/);
  assert.ok(m, 'addBiomarkerToReport exists');
  const fn = m[0];
  assert.match(fn, /BEGIN IMMEDIATE[\s\S]*COMMIT[\s\S]*ROLLBACK/);
  assert.match(fn, /UPDATE biomarkers SET created_at = \?, updated_at = \?, sync_status = 'pending'/);
  assert.match(fn, /report_date = \? AND created_at IN/);
  assert.match(fn, /sync_status != 'deleted'/);
  assert.match(fn, /INSERT INTO biomarkers/);
  assert.match(db, /r\.created_at \|\| now/, 'insertBiomarkers keeps a given stamp');
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
  const save = src.slice(src.indexOf('function saveMarkerEdit()'), src.indexOf('function saveMarkerEdit()') + 1400);
  assert.match(save, /parseMeasure\(mValue, language\)/);
  assert.match(save, /blood_edit_invalid/);
  assert.match(save, /if \(mEdit\.adding\) \{[\s\S]*addBiomarkerToReport\(user\.id, mEdit\.card, \{ marker: mName\.trim\(\), value, unit: mUnit\.trim\(\) \}\)/);
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
    for (const k of ['blood_add_value_btn', 'blood_add_value_title', 'blood_add_discard_title']) assert.equal(typeof tr[k], 'string', `${lang}.${k}`);
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
