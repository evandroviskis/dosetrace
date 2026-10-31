// A-203 option C (founder 2026-10-31 "1 C"; checklist docs/specs/a203-non-numeric-lab-results.md
// NN-1…NN-7, signed 16:21 EDT). A lab result that is not an exact number keeps what the report wrote:
//   - a sign before the number ("> 2.000", "inferior a 0,01") → qualifier + the number;
//   - a result in words ("Não reagente", "Negativo") → value_text, value null.
// Both are stored, synced, shown (test page, marker list, marker page, chart readout, export) and
// editable; a word result never enters a chart; nothing is ever called high, low or normal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const NB = / /g;
const plain = (s) => String(s).replace(NB, ' ');

const L = require('../lib/labValue');
const { validateExtraction } = require('../lib/bodyScan');
const { toCloudPayload, CLOUD_FIELDS } = require('../lib/syncMappers');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { buildRecordsCSV, buildRecordsHTML } = require('../lib/exportRecords');
const USER = 'user-A';

// ── NN-1 / NN-4: reading a typed or scanned result ────────────────────────────────
test('NN-1/NN-4: a leading sign is read as qualifier + the number, in the app language', () => {
  const cases = [
    ['<0,5', 'pt', '<', 0.5],
    ['> 2.000', 'pt', '>', 2000],
    ['>2000', 'en', '>', 2000],
    ['≤ 1', 'pt', '≤', 1],
    ['≥3,5', 'pt', '≥', 3.5],
    ['<=3', 'en', '≤', 3],
    ['>= 3', 'en', '≥', 3],
    ['inferior a 0,01', 'pt', '<', 0.01],
    ['Inferior a 0,01', 'pt', '<', 0.01],
    ['superior a 10', 'pt', '>', 10],
    ['até 5', 'pt', '≤', 5],
    ['menor que 3', 'pt', '<', 3],
    ['maior que 3', 'pt', '>', 3],
    ['less than 0.5', 'en', '<', 0.5],
    ['greater than 100', 'en', '>', 100],
    ['up to 4', 'en', '≤', 4],
    ['menos de 0,5', 'es', '<', 0.5],
    ['hasta 3', 'es', '≤', 3],
    ['mayor que 7', 'es', '>', 7],
    ['inférieur à 0,1', 'fr', '<', 0.1],
    ['supérieur à 2', 'fr', '>', 2],
    ['unter 0,1', 'de', '<', 0.1],
    ['kleiner als 0,1', 'de', '<', 0.1],
    ['größer als 5', 'de', '>', 5],
    ['über 3', 'de', '>', 3],
    ['inferiore a 0,01', 'it', '<', 0.01],
    ['superiore a 9', 'it', '>', 9],
    ['minore di 2', 'it', '<', 2],
  ];
  for (const [text, lang, q, v] of cases) {
    const r = L.parseLabInput(text, lang);
    assert.ok(r, text);
    assert.equal(r.qualifier, q, text);
    assert.equal(r.value, v, text);
    assert.equal(r.value_text, null, text);
  }
});

test('NN-4: a plain number has no sign; removing the sign removes the qualifier', () => {
  assert.deepEqual(L.parseLabInput('2000', 'pt'), { value: 2000, qualifier: null, value_text: null });
  assert.deepEqual(L.parseLabInput('0,5', 'pt'), { value: 0.5, qualifier: null, value_text: null });
  assert.deepEqual(L.parseLabInput('5.4', 'en'), { value: 5.4, qualifier: null, value_text: null });
  assert.deepEqual(L.parseLabInput('-2,1', 'pt'), { value: -2.1, qualifier: null, value_text: null });
});

test('NN-2/NN-4: text that is not a number after removing a leading sign is kept as words', () => {
  assert.deepEqual(L.parseLabInput('Não reagente', 'pt'), { value: null, qualifier: null, value_text: 'Não reagente' });
  assert.deepEqual(L.parseLabInput('  Negativo ', 'pt'), { value: null, qualifier: null, value_text: 'Negativo' });
  assert.deepEqual(L.parseLabInput('1+', 'pt'), { value: null, qualifier: null, value_text: '1+' });
  assert.deepEqual(L.parseLabInput('1/40', 'pt'), { value: null, qualifier: null, value_text: '1/40' });
  assert.deepEqual(L.parseLabInput('<abc', 'en'), { value: null, qualifier: null, value_text: '<abc' });
  assert.deepEqual(L.parseLabInput('2 cruzes', 'pt'), { value: null, qualifier: null, value_text: '2 cruzes' });
  assert.equal(L.parseLabInput('', 'pt'), null);
  assert.equal(L.parseLabInput('   ', 'pt'), null);
  assert.equal(L.parseLabInput(null, 'pt'), null);
});

test('NN-1/NN-2: the scan JSON — qualifier + number, a signed string, or value_text with no number', () => {
  assert.deepEqual(L.scanResult({ value: 2000, qualifier: '>' }, 'pt'), { value: 2000, qualifier: '>', value_text: null });
  assert.deepEqual(L.scanResult({ value: 0.01, qualifier: '<' }, 'en'), { value: 0.01, qualifier: '<', value_text: null });
  assert.deepEqual(L.scanResult({ value: 3, qualifier: '<=' }, 'en'), { value: 3, qualifier: '≤', value_text: null });
  assert.deepEqual(L.scanResult({ value: 3, qualifier: 'high' }, 'en'), { value: 3, qualifier: null, value_text: null }, 'never anything but a sign');
  assert.deepEqual(L.scanResult({ value: '> 2.000' }, 'pt'), { value: 2000, qualifier: '>', value_text: null });
  assert.deepEqual(L.scanResult({ value: 'inferior a 0,01' }, 'pt'), { value: 0.01, qualifier: '<', value_text: null });
  assert.deepEqual(L.scanResult({ value: null, value_text: 'Não reagente' }, 'pt'), { value: null, qualifier: null, value_text: 'Não reagente' });
  assert.deepEqual(L.scanResult({ value: 'Negativo' }, 'pt'), { value: null, qualifier: null, value_text: 'Negativo' });
  assert.deepEqual(L.scanResult({ value: 5.4, value_text: 'whatever' }, 'en'), { value: 5.4, qualifier: null, value_text: null }, 'a number wins');
  assert.equal(L.scanResult({ value: null }, 'pt'), null);
  assert.equal(L.scanResult({ value: '' , value_text: '  ' }, 'pt'), null);
  // A-26 unchanged: a plain number string keeps the reading service's rule, whatever the app language.
  assert.equal(L.scanResult({ value: '1,234' }).value, 1234);
  assert.equal(L.scanResult({ value: '1,234' }, 'pt').value, 1234);
  assert.equal(L.scanResult({ value: '5,5' }, 'en').value, 5.5);
  // The number after a sign is read in the app language (parseMeasure, the lab-number rule).
  assert.equal(L.scanResult({ value: '< 1,5' }, 'en').value, 1.5);
  assert.equal(L.scanResult({ value: '> 2.000' }, 'de').value, 2000);
});

test('NN-1/NN-2: validateExtraction keeps signed and word results (no longer dropped) and still drops empty ones', () => {
  const r = validateExtraction({
    report_date: '2026-10-28',
    markers: [
      { marker: 'Vitamin B12', value: 2000, qualifier: '>', unit: 'pg/mL' },
      { marker: 'PSA total', value: 'inferior a 0,01', unit: 'ng/mL' },
      { marker: 'Anti-HIV', value: null, value_text: 'Não reagente', unit: '' },
      { marker: 'TSH', value: 2.35, unit: 'µUI/mL' },
      { marker: 'Empty', value: null, unit: '' },
    ],
  }, new Date('2026-10-31T12:00:00'), 'pt');
  assert.equal(r.markers.length, 4);
  assert.equal(r.droppedCount, 1);
  assert.deepEqual(r.markers.map((m) => [m.marker, m.qualifier, m.value, m.value_text]), [
    ['Vitamin B12', '>', 2000, null],
    ['PSA total', '<', 0.01, null],
    ['Anti-HIV', null, null, 'Não reagente'],
    ['TSH', null, 2.35, null],
  ]);
});

// ── NN-1 / NN-2: persistMarkers stores them and counts them ───────────────────────
test('NN-1/NN-2: persistMarkers stores the sign and the words and counts word results as markers', async () => {
  const inserted = [];
  const persistMarkers = loadFn('screens/BodyScreen.js', 'async function persistMarkers(', 'persistMarkers', {
    getCachedUser: async () => ({ id: USER }),
    notice: () => {}, scanErrorSheet: () => ({}), t: (k) => k, language: 'pt',
    insertBiomarkers: (rows) => inserted.push(...rows),
    Analytics: { bloodworkUploaded: () => {} }, fetchReports: () => {}, requestSync: () => {},
    parseMeasure: require('../lib/doseMath').parseMeasure,
    scanResult: L.scanResult,
  });
  const n = await persistMarkers([
    { marker: 'Vitamin B12', value: 2000, qualifier: '>', unit: 'pg/mL' },
    { marker: 'PSA total', value: '< 0,01', unit: 'ng/mL' },
    { marker: 'Anti-HIV', value: null, value_text: 'Não reagente', unit: '' },
    { marker: 'TSH', value: 2.35, unit: 'µUI/mL' },
    { marker: '', value: 1, unit: '' },
  ], '2026-10-28');
  assert.equal(n, 4);
  assert.deepEqual(inserted.map((r) => [r.marker, r.qualifier, r.value, r.value_text]), [
    ['Vitamin B12', '>', 2000, null],
    ['PSA total', '<', 0.01, null],
    ['Anti-HIV', null, null, 'Não reagente'],
    ['TSH', null, 2.35, null],
  ]);
});

// ── NN-1 / NN-2 / NN-3: display ───────────────────────────────────────────────────
test('NN-1: a signed value shows "> 2000 pg/mL" / "< 0,01 ng/mL"; a plain one is unchanged', () => {
  assert.equal(plain(L.labValueText({ value: 2000, qualifier: '>', unit: 'pg/mL' }, 'pt')), '> 2000 pg/mL');
  assert.equal(plain(L.labValueText({ value: 0.01, qualifier: '<', unit: 'ng/mL' }, 'pt')), '< 0,01 ng/mL');
  assert.equal(plain(L.labValueText({ value: 0.01, qualifier: '<', unit: 'ng/mL' }, 'en')), '< 0.01 ng/mL');
  assert.equal(plain(L.labValueText({ value: 2.35, qualifier: null, unit: 'µUI/mL' }, 'pt')), '2,35 µUI/mL');
  assert.equal(plain(L.labNumberText({ value: 2000, qualifier: '>' }, 'pt')), '> 2000');
  assert.match(L.labNumberText({ value: 2000, qualifier: '>' }, 'pt'), /^> 2000$/, 'the sign never wraps away from its number');
});

test('NN-2: a word result shows its words, with no unit unless one was given', () => {
  assert.equal(L.labValueText({ value: null, value_text: 'Não reagente', unit: '' }, 'pt'), 'Não reagente');
  assert.equal(L.labValueText({ value: null, value_text: 'Não reagente', unit: null }, 'pt'), 'Não reagente');
  assert.equal(plain(L.labValueText({ value: null, value_text: 'Traços', unit: 'mg/dL' }, 'pt')), 'Traços mg/dL');
  assert.equal(L.isWordResult({ value: null, value_text: 'Negativo' }), true);
  assert.equal(L.isWordResult({ value: 3, value_text: null }), false);
});

test('NN-4: the Edit value field is prefilled with the sign or the words', () => {
  assert.equal(L.labInputText({ value: 2000, qualifier: '>' }, 'pt'), '> 2000');
  assert.equal(L.labInputText({ value: 0.5, qualifier: '<' }, 'pt'), '< 0,5');
  assert.equal(L.labInputText({ value: 5.2, qualifier: null }, 'pt'), '5,2');
  assert.equal(L.labInputText({ value: null, value_text: 'Não reagente' }, 'pt'), 'Não reagente');
  assert.equal(L.labInputText({ value: null, value_text: null }, 'pt'), '');
  // Round trip: what the field shows reads back to the same stored row.
  for (const row of [{ value: 2000, qualifier: '>', value_text: null }, { value: 0.5, qualifier: '<', value_text: null }, { value: null, qualifier: null, value_text: 'Não reagente' }]) {
    assert.deepEqual(L.parseLabInput(L.labInputText(row, 'pt'), 'pt'), row);
  }
});

test('NN-3: the chart takes only rows with a number; a signed point is labelled with its sign', () => {
  const pts = [
    { date: '2026-01-01', value: 1500, qualifier: null },
    { date: '2026-03-01', value: null, value_text: 'Não reagente' },
    { date: '2026-06-01', value: 2000, qualifier: '>' },
  ];
  const cp = L.chartPoints(pts);
  assert.equal(cp.length, 2);
  assert.equal(plain(L.labNumberText(cp[1], 'pt')), '> 2000');
  assert.equal(L.chartPoints([{ value: null, value_text: 'Negativo' }, { value: null, value_text: 'Positivo' }]).length, 0);
});

test('NN-1/NN-3: every on-screen value goes through lib/labValue — nothing reads .value directly for display', () => {
  const src = read('screens/BodyScreen.js');
  assert.doesNotMatch(src, /decimalText\((m|p|mk\.latest|markerDetail\.latest)\.value/);
  assert.match(src, /labValueText\(m, language\)/, 'test page rows');
  assert.match(src, /labValueText\(p, language\)/, 'marker page readings');
  assert.match(src, /labValueText\(mk\.latest, language\)/, 'marker list latest');
  assert.match(src, /labNumberText\(markerDetail\.latest, language\)/, 'marker page big number');
  // The marker series carries the sign and the words.
  assert.match(src, /qualifier: r\.qualifier \?\? null, value_text: r\.value_text \?\? null/);
  // A series with no number (all words) shows no chart and no "need more" line; only the readings.
  assert.match(src, /chartPoints\(markerDetail\.points\)/);
});

test('NN-3: MarkerChart skips rows without a number, puts the sign before the label, and never judges', () => {
  const src = read('screens/components/MarkerChart.js');
  assert.match(src, /chartPoints\(points\)/);
  assert.match(src, /labNumberText\(/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//, ''), /\b(high|low|normal|abnormal)\b/i);
  assert.doesNotMatch(read('lib/labValue.js'), /['"](high|low|normal|abnormal|alto|baixo)['"]/i);
});

// ── NN-4: the Edit value / Add value window ───────────────────────────────────────
function saveFn(state, calls) {
  return loadFn('screens/BodyScreen.js', 'async function saveMarkerEdit(', 'saveMarkerEdit', {
    mEdit: state.mEdit, mValue: state.mValue, mName: state.mName, mUnit: state.mUnit || '', mDate: state.mDate || '2026-10-28',
    language: state.language || 'pt',
    parseLabInput: L.parseLabInput, parseMeasure: require('../lib/doseMath').parseMeasure,
    setValueSheet: (x) => calls.sheet.push(x), t: (k) => k,
    savingRef: { current: false },
    getCachedUser: async () => ({ id: USER }),
    addBiomarkerToReport: (u, card, row) => { calls.added.push(row); return 1; },
    updateBiomarker: (id, data) => calls.updated.push({ id, data }),
    markerToSave: (name) => name.trim(),
    requestSync: () => {}, setMEdit: () => {}, fetchReports: () => {},
  });
}
const newCalls = () => ({ sheet: [], added: [], updated: [] });

test('NN-4: Edit value saves "<0,5" as sign + number, words as value_text, and a plain number clears both', async () => {
  for (const [typed, want] of [
    ['<0,5', { value: 0.5, qualifier: '<', value_text: null }],
    ['>2000', { value: 2000, qualifier: '>', value_text: null }],
    ['Não reagente', { value: null, qualifier: null, value_text: 'Não reagente' }],
    ['2,35', { value: 2.35, qualifier: null, value_text: null }],
  ]) {
    const calls = newCalls();
    await saveFn({ mEdit: { id: 7, marker: 'PSA total' }, mValue: typed, mName: 'PSA total' }, calls)();
    assert.equal(calls.sheet.length, 0, typed);
    assert.equal(calls.updated.length, 1, typed);
    const d = calls.updated[0].data;
    assert.deepEqual({ value: d.value, qualifier: d.qualifier, value_text: d.value_text }, want, typed);
  }
});

test('NN-4: + Adicionar valor accepts the sign and the words too', async () => {
  const calls = newCalls();
  const card = { date: '2026-10-28', createdAt: 'x', markers: [{ user_id: USER }] };
  await saveFn({ mEdit: { adding: true, card }, mValue: 'inferior a 0,01', mName: 'PSA total', mUnit: 'ng/mL' }, calls)();
  assert.deepEqual(calls.added[0], { marker: 'PSA total', value: 0.01, qualifier: '<', value_text: null, unit: 'ng/mL' });
  const c2 = newCalls();
  await saveFn({ mEdit: { adding: true, card }, mValue: 'Não reagente', mName: 'Anti-HIV' }, c2)();
  assert.deepEqual(c2.added[0], { marker: 'Anti-HIV', value: null, qualifier: null, value_text: 'Não reagente', unit: '' });
});

test('NN-4: the empty check stays — no marker, or no value and no words → blood_edit_invalid', async () => {
  for (const st of [{ mValue: '', mName: 'TSH' }, { mValue: '   ', mName: 'TSH' }, { mValue: '2', mName: '  ' }]) {
    const calls = newCalls();
    await saveFn({ mEdit: { id: 1, marker: 'TSH' }, ...st }, calls)();
    assert.equal(calls.updated.length, 0);
    assert.equal(calls.sheet.length, 1);
    assert.equal(calls.sheet[0].body, 'blood_edit_invalid');
  }
});

test('NN-4: the Valor field takes signs and words (not a decimal-only keypad) and is prefilled by labInputText', () => {
  const src = read('screens/BodyScreen.js');
  const sheet = src.slice(src.indexOf("t('blood_edit_value')"), src.indexOf("t('blood_edit_value')") + 600);
  assert.doesNotMatch(sheet, /keyboardType="decimal-pad"/);
  assert.match(src, /setMValue\(labInputText\(obj, language\)\)/);
});

// ── NN-5: storage + sync ──────────────────────────────────────────────────────────
function dbFns(db) {
  const getDB = () => db;
  const fn = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB });
  return { insertBiomarkers: fn('insertBiomarkers'), addBiomarkerToReport: fn('addBiomarkerToReport'), updateBiomarker: fn('updateBiomarker'), getBiomarkers: fn('getBiomarkers') };
}

test('NN-5: local SQLite has qualifier and value_text (fresh install), value may be null', () => {
  const db = makeDb();
  const cols = db.getAllSync('PRAGMA table_info(biomarkers)').map((c) => c.name);
  assert.ok(cols.includes('qualifier') && cols.includes('value_text'));
  const { insertBiomarkers, addBiomarkerToReport, getBiomarkers } = dbFns(db);
  insertBiomarkers([
    { user_id: USER, report_date: '2026-10-28', marker: 'Vitamin B12', value: 2000, qualifier: '>', unit: 'pg/mL' },
    { user_id: USER, report_date: '2026-10-28', marker: 'Anti-HIV', value: null, value_text: 'Não reagente', unit: '' },
  ]);
  const rows = getBiomarkers(USER);
  const b12 = rows.find((r) => r.marker === 'Vitamin B12');
  const hiv = rows.find((r) => r.marker === 'Anti-HIV');
  assert.equal(b12.qualifier, '>'); assert.equal(b12.value, 2000); assert.equal(b12.value_text, null);
  assert.equal(hiv.value, null); assert.equal(hiv.value_text, 'Não reagente'); assert.equal(hiv.qualifier, null);
  addBiomarkerToReport(USER, { date: '2026-10-28', createdAt: b12.created_at }, { marker: 'PSA total', value: 0.01, qualifier: '<', unit: 'ng/mL' });
  const psa = getBiomarkers(USER).find((r) => r.marker === 'PSA total');
  assert.equal(psa.qualifier, '<'); assert.equal(psa.value, 0.01);
});

test('NN-5: an existing install gets the two columns by a guarded ALTER (safe on every launch)', () => {
  const { upgradeBiomarkersQualifier } = require('../lib/schema');
  const raw = new Database(':memory:');
  raw.exec(`CREATE TABLE biomarkers (id INTEGER PRIMARY KEY AUTOINCREMENT, remote_id TEXT, user_id TEXT, report_date TEXT, marker TEXT, value REAL, unit TEXT, created_at TEXT, updated_at TEXT, sync_status TEXT)`);
  raw.exec(`INSERT INTO biomarkers (user_id, report_date, marker, value, unit) VALUES ('u', '2026-01-01', 'TSH', 2.1, 'mUI/L')`);
  const db = { execSync: (s) => raw.exec(s), getAllSync: (s, p) => raw.prepare(s).all(...(p || [])), runSync: (s, p) => raw.prepare(s).run(...(p || [])) };
  upgradeBiomarkersQualifier(db);
  upgradeBiomarkersQualifier(db);
  const cols = raw.prepare('PRAGMA table_info(biomarkers)').all().map((c) => c.name);
  assert.ok(cols.includes('qualifier') && cols.includes('value_text'));
  const old = raw.prepare('SELECT * FROM biomarkers').get();
  assert.equal(old.value, 2.1); assert.equal(old.qualifier, null); assert.equal(old.value_text, null);
  assert.match(read('lib/database.js'), /upgradeBiomarkersQualifier\(db\);/, 'initDatabase runs it');
});

test('NN-5: the payload carries qualifier and value_text (null included), value may be null; created_at stays insert-only', () => {
  assert.ok(CLOUD_FIELDS.biomarkers.includes('qualifier'));
  assert.ok(CLOUD_FIELDS.biomarkers.includes('value_text'));
  const p = toCloudPayload('biomarkers', { report_date: 'd', marker: 'Anti-HIV', value: null, qualifier: null, value_text: 'Não reagente', unit: '' });
  assert.equal(p.value, null); assert.equal(p.value_text, 'Não reagente'); assert.ok('qualifier' in p && p.qualifier === null);
  const q = toCloudPayload('biomarkers', { report_date: 'd', marker: 'B12', value: 2000, qualifier: '>', unit: 'pg/mL' });
  assert.equal(q.qualifier, '>'); assert.ok('value_text' in q && q.value_text === null, 'a cleared word goes up as null');
  assert.match(read('lib/syncCore.js'), /const INSERT_ONLY = \{ biomarkers: \['created_at'\] \};/);
});

test('NN-5: the sign and the words go to the cloud and come back on a new phone (reinstall)', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const { insertBiomarkers } = dbFns(db);
  insertBiomarkers([
    { user_id: USER, report_date: '2026-10-28', marker: 'Vitamin B12', value: 2000, qualifier: '>', unit: 'pg/mL' },
    { user_id: USER, report_date: '2026-10-28', marker: 'Anti-HIV', value: null, value_text: 'Não reagente', unit: '' },
  ]);
  await pushPending(db, cloud, USER);
  const c = cloud.rows('biomarkers', USER);
  assert.equal(c.find((r) => r.marker === 'Vitamin B12').qualifier, '>');
  assert.equal(c.find((r) => r.marker === 'Anti-HIV').value_text, 'Não reagente');
  assert.equal(c.find((r) => r.marker === 'Anti-HIV').value, null);
  const fresh = makeDb();
  await fullImport(fresh, cloud, USER);
  const rows = dbFns(fresh).getBiomarkers(USER);
  assert.equal(rows.find((r) => r.marker === 'Vitamin B12').qualifier, '>');
  assert.equal(rows.find((r) => r.marker === 'Vitamin B12').value, 2000);
  assert.equal(rows.find((r) => r.marker === 'Anti-HIV').value_text, 'Não reagente');
  assert.equal(rows.find((r) => r.marker === 'Anti-HIV').value, null);
});

test('NN-5: an edit that removes the sign reaches the cloud, and a pulled change updates the phone', async () => {
  const db = makeDb(); const cloud = makeCloud();
  const { insertBiomarkers, updateBiomarker, getBiomarkers } = dbFns(db);
  insertBiomarkers([{ user_id: USER, report_date: '2026-10-28', marker: 'PSA total', value: 0.01, qualifier: '<', unit: 'ng/mL' }]);
  await pushPending(db, cloud, USER);
  const stamp0 = cloud.rows('biomarkers', USER)[0].created_at;
  const id = getBiomarkers(USER)[0].id;
  updateBiomarker(id, { value: 0.02, qualifier: null, value_text: null });
  await pushPending(db, cloud, USER);
  const row = cloud.rows('biomarkers', USER)[0];
  assert.equal(row.qualifier, null); assert.equal(Number(row.value), 0.02);
  assert.equal(row.created_at, stamp0, 'DV-001: created_at untouched by an edit');
  // The cloud row changes (e.g. edited on the phone that replaced this one): the pull takes both columns.
  cloud._store.biomarkers.set(row.id, { ...row, value: null, qualifier: null, value_text: 'Indetectável', updated_at: cloud._stamp() });
  await pullChanges(db, cloud, USER);
  const local = getBiomarkers(USER)[0];
  assert.equal(local.value, null); assert.equal(local.value_text, 'Indetectável');
});

// ── Export (CSV + PDF) ────────────────────────────────────────────────────────────
const LABELS = {
  labsHeading: 'Labs', colMarker: 'Marker', colDate: 'Date', colValue: 'Value', colUnit: 'Unit',
  vaccinesHeading: 'Vaccines', colVaccine: 'Vaccine', colGiven: 'Given', colNextDue: 'Next', colNotes: 'Notes',
  noLabs: 'none', noVaccines: 'none',
};
const EXPORT_DATA = {
  biomarkers: [
    { marker: 'Vitamin B12', report_date: '2026-01-01', value: 1500, qualifier: null, unit: 'pg/mL' },
    { marker: 'Vitamin B12', report_date: '2026-10-28', value: 2000, qualifier: '>', unit: 'pg/mL' },
    { marker: 'Anti-HIV', report_date: '2026-10-28', value: null, value_text: 'Não reagente', unit: '' },
    { marker: 'Anti-HIV', report_date: '2026-01-01', value: null, value_text: 'Não reagente', unit: '' },
  ],
  vaccines: [],
};

test('NN-1/NN-2: the CSV shows the sign and the words', () => {
  const csv = buildRecordsCSV(EXPORT_DATA, { labels: LABELS });
  assert.match(csv, /^Vitamin B12,2026-10-28,> 2000,pg\/mL$/m);
  assert.match(csv, /^Vitamin B12,2026-01-01,1500,pg\/mL$/m);
  assert.match(csv, /^Anti-HIV,2026-10-28,Não reagente,$/m);
});

test('NN-1/NN-2: the PDF shows the sign and the words; its trend line skips word rows', () => {
  const html = buildRecordsHTML(EXPORT_DATA, { labels: LABELS, title: 'T', exportedOn: 'x', disclaimer: 'd' });
  assert.match(html, /<td class="num">&gt; 2000<\/td>/);
  assert.match(html, /<td class="num">Não reagente<\/td>/);
  // One curve only (B12, two numbers); Anti-HIV (words only) has none.
  assert.equal((html.match(/<polyline/g) || []).length, 1);
  const withWord = buildRecordsHTML({ biomarkers: [...EXPORT_DATA.biomarkers, { marker: 'Vitamin B12', report_date: '2026-05-01', value: null, value_text: 'Hemolisado', unit: '' }], vaccines: [] }, { labels: LABELS, title: 'T', exportedOn: 'x', disclaimer: 'd' });
  const poly = withWord.match(/<polyline points="([^"]+)"/)[1];
  assert.equal(poly.split(' ').length, 2, 'the word row is not a point of the line');
  assert.doesNotMatch(withWord, /NaN/);
});

// ── extract-bloodwork: the prompt asks for the sign and the words (deploy waits for the founder) ──
test('NN-1/NN-2: the extract-bloodwork prompt returns qualifier and value_text; ranges stay ignored', () => {
  const src = read('supabase/functions/extract-bloodwork/index.ts');
  const prompt = src.slice(src.indexOf('const EXTRACTION_PROMPT'), src.indexOf('const VACCINE_PROMPT'));
  assert.match(prompt, /"qualifier"/);
  assert.match(prompt, /"value_text"/);
  assert.match(prompt, /< > ≤ ≥|"<", ">", "≤", "≥"/);
  assert.match(prompt, /exactly as printed/);
  assert.doesNotMatch(prompt, /skip that marker entirely/);
  assert.match(prompt, /reference ranges/i);
  // Backward compatible: the markers go back as the model wrote them (old apps skip rows without a number).
  assert.match(src, /payload = \{ report_date: parsed\.report_date \?\? null, markers: parsed\.markers \};/);
});
