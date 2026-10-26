'use strict';
// AD-99 / AD-100 (founder 2026-10-20 "Pode seguir com as suas recomendações em todos", picture
// docs/design/ad99-ad100-labs.html, spec docs/specs/ad99-ad100-labs.md LB-1..):
//  - AD-99 = B: one line under the "Diário de exames" title with the AI scans this account used this
//    month — free "2 de 3 leituras usadas este mês (exames, vacinas e frascos) · renovam em 1º de nov."
//    (the count in attention, bold, at 3 of 3), Premium P2 "5 leituras usadas este mês (exames, vacinas
//    e frascos)". The number is the server's own ai_scan_usage count (extract-bloodwork, UTC month);
//    no answer (offline, old server) → no line, never a guessed number.
//  - AD-100 = B: "Mudar a data deste exame" between the values and "Excluir este exame"; the window
//    with the app's date wheel; Save moves every value of the test and its labels; the test stays open.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { pushPending, pullChanges } = require('../lib/syncCore');
const { reportCards } = require('../lib/labReports');
const { translations } = require('../i18n/translations');

const Q = () => require('../supabase/functions/extract-bloodwork/quota.ts');
const SU = () => require('../lib/scanUsage');
const LM = () => require('../lib/labDateMove');
const BODY = read('screens/BodyScreen.js');
const INDEX = read('supabase/functions/extract-bloodwork/index.ts');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tr = (lang) => (k) => (translations[lang][k] != null ? translations[lang][k] : k);
const OCT26 = new Date(Date.UTC(2026, 9, 26, 15, 0, 0));

// ── LB-1: the server answers how many scans this account used this month ──────────────────────
test('LB-1: the usage reply is the count this month and the next UTC month start; no count → 503, never a number', () => {
  const { scanUsageReply } = Q();
  assert.deepEqual(scanUsageReply({ count: 2, now: OCT26 }), { status: 200, body: { used: 2, renews_on: '2026-11-01' } });
  assert.deepEqual(scanUsageReply({ count: 0, now: new Date(Date.UTC(2026, 11, 31, 23, 0)) }).body, { used: 0, renews_on: '2027-01-01' }, 'December → January 1');
  assert.equal(scanUsageReply({ count: null, now: OCT26 }).status, 503);
  assert.equal(scanUsageReply({ count: null, now: OCT26 }).body.used, undefined);
});

test('LB-1: extract-bloodwork answers mode "usage" before any AI key, file check or reservation, from the same month count', () => {
  const at = INDEX.indexOf("body?.mode === 'usage'");
  assert.ok(at > 0, 'a usage mode exists');
  assert.ok(at < INDEX.indexOf("Deno.env.get('ANTHROPIC_API_KEY')"), 'before the AI key check (no AI involved)');
  assert.ok(at < INDEX.indexOf('Missing pdf_base64 or image_base64'), 'before the file check');
  assert.ok(at < INDEX.indexOf('withScanBudget<Response>('), 'before the scan budget: it never reserves a scan');
  assert.ok(at > INDEX.indexOf('auth.getUser()'), 'only for the signed-in user (JWT verified)');
  const branch = INDEX.slice(at, INDEX.indexOf('\n    }\n', at));
  assert.match(branch, /\.from\('ai_scan_usage'\)\s*\n\s*\.select\('id', \{ count: 'exact', head: true \}\)\s*\n\s*\.eq\('user_id', user\.id\)\s*\n\s*\.gte\('created_at', monthStart\)/, 'this account, this UTC month, every kind');
  assert.doesNotMatch(branch, /\.insert\(|\.delete\(/, 'reads only');
  assert.match(branch, /scanUsageReply\(/);
});

// ── LB-2: the app reads the answer, or shows nothing ──────────────────────────────────────────
test('LB-2: the app keeps only a whole, non-negative count; an error, offline or an old server gives no line', async () => {
  const { readScanUsage, fetchScanUsage } = SU();
  assert.deepEqual(readScanUsage({ data: { used: 2, renews_on: '2026-11-01' }, error: null }), { used: 2, renewsOn: '2026-11-01' });
  assert.deepEqual(readScanUsage({ data: { used: 0 }, error: null }), { used: 0, renewsOn: null });
  for (const bad of [{ data: null, error: { message: 'offline' } }, { data: { used: -1 } }, { data: { used: 1.5 } }, { data: { used: '2' } }, { data: {} }, null, undefined]) {
    assert.equal(readScanUsage(bad), null, JSON.stringify(bad));
  }
  const calls = [];
  const ok = await fetchScanUsage((name, opts) => { calls.push([name, opts]); return Promise.resolve({ data: { used: 3, renews_on: '2026-11-01' }, error: null }); });
  assert.deepEqual(calls, [['extract-bloodwork', { body: { mode: 'usage' } }]], 'asks the scan function in usage mode, sends no file');
  assert.equal(ok.used, 3);
  assert.equal(await fetchScanUsage(() => Promise.reject(new Error('Network request failed'))), null, 'never throws');
  assert.equal(await fetchScanUsage(() => { throw new Error('sync throw'); }), null);
  // An old deployed function answers 400 (no file): no line.
  assert.equal(await fetchScanUsage(() => Promise.resolve({ data: null, error: { context: { status: 400 } } })), null);
});

// ── LB-3 / LB-4: the line's words ─────────────────────────────────────────────────────────────
test('LB-3: free — "2 de 3 leituras usadas este mês (exames, vacinas e frascos) · renovam em 1º de nov." as drawn', () => {
  const { scanUsageLine } = SU();
  const l = scanUsageLine({ used: 2, renewsOn: '2026-11-01', premium: false, language: 'pt', t: tr('pt'), now: OCT26 });
  assert.equal(l.count, '2 de 3 leituras usadas este mês');
  assert.equal(l.rest, '(exames, vacinas e frascos) · renovam em 1º de nov.');
  assert.equal(l.full, false);
  const full = scanUsageLine({ used: 3, renewsOn: '2026-11-01', premium: false, language: 'pt', t: tr('pt'), now: OCT26 });
  assert.equal(full.count, '3 de 3 leituras usadas este mês');
  assert.equal(full.full, true, 'the month is over: the count in attention');
  // More than 3 rows (Premium earlier this month, an uncounted fail-open) never reads "5 de 3".
  assert.equal(scanUsageLine({ used: 5, renewsOn: '2026-11-01', premium: false, language: 'pt', t: tr('pt'), now: OCT26 }).count, '3 de 3 leituras usadas este mês');
  // The renewal date: the server's next month start; without it, the next UTC month from now.
  assert.equal(scanUsageLine({ used: 1, renewsOn: null, premium: false, language: 'pt', t: tr('pt'), now: OCT26 }).rest, '(exames, vacinas e frascos) · renovam em 1º de nov.');
  assert.equal(scanUsageLine({ used: 1, renewsOn: '2027-01-01', premium: false, language: 'en', t: tr('en'), now: OCT26 }).rest, '(labs, vaccines, and vials) · they renew on Jan 1');
  assert.equal(scanUsageLine({ used: 2, renewsOn: '2026-11-01', premium: false, language: 'en', t: tr('en'), now: OCT26 }).count, '2 of 3 scans used this month');
  assert.equal(scanUsageLine(null), null);
  assert.equal(scanUsageLine({ used: null, premium: false, language: 'pt', t: tr('pt') }), null, 'no number → no line');
  assert.equal(SU().FREE_SCANS, Q().FREE_SCAN_LIMIT, 'the free limit shown is the server\'s');
});

test('LB-4: Premium (P2) — only the count, never the 20 and never the renewal', () => {
  const { scanUsageLine } = SU();
  const l = scanUsageLine({ used: 5, renewsOn: '2026-11-01', premium: true, language: 'pt', t: tr('pt'), now: OCT26 });
  assert.equal(l.count, '5 leituras usadas este mês');
  assert.equal(l.rest, '(exames, vacinas e frascos)');
  assert.equal(l.full, false);
  assert.equal(scanUsageLine({ used: 1, premium: true, language: 'pt', t: tr('pt'), now: OCT26 }).count, '1 leitura usada este mês');
  for (const lang of LANGS) {
    const p = scanUsageLine({ used: 20, renewsOn: '2026-11-01', premium: true, language: lang, t: tr(lang), now: OCT26 });
    assert.ok(!(p.count + p.rest).includes('·'), `${lang}: no renewal`);
    assert.equal((p.count.match(/\b20\b/g) || []).length, 1, `${lang}: the count only, never "of 20"`);
  }
});

// ── LB-5: where the line sits and how it looks ────────────────────────────────────────────────
test('LB-5: the line sits right under the "Diário de exames" title (phone journal and Fold right page), hidden without a number', () => {
  const journal = BODY.slice(BODY.indexOf('/* LAB TEST JOURNAL (prototype labsScreen) */'));
  assert.match(journal, /<Text style=\{s\.screenTitle\}>\{t\('body_card_labs_title'\)\}<\/Text>\s*\{renderScanUsage\(\)\}\s*<\/View>/);
  const book = sliceBlock(BODY, 'function renderBookJournal(');
  assert.match(book, /<Text style=\{s\.screenTitle\} accessibilityRole="header">\{t\('body_card_labs_title'\)\}<\/Text>\s*\{renderScanUsage\(\)\}\s*<\/View>/);
  const r = sliceBlock(BODY, 'function renderScanUsage(');
  assert.match(r, /scanUsageLine\(\{ used: scanUsage\?\.used, renewsOn: scanUsage\?\.renewsOn, premium, language, t \}\)/);
  assert.match(r, /if \(!line\) return null;/, 'no number → nothing');
  assert.match(r, /<Text style=\{\[s\.sec, s\.tnum\]\}>\s*<Text style=\{line\.full \? s\.quotaFull : null\}>\{line\.count\}<\/Text>\{' '\}\{line\.rest\}\s*<\/Text>/);
  assert.match(BODY, /quotaFull: \{ fontWeight: '600', color: c\.attention \}/, 'attention token, both palettes');
  const theme = read('lib/theme.js');
  assert.equal((theme.match(/attention: '#/g) || []).length >= 2, true, 'attention exists in light and dark');
});

// ── LB-6: the number stays current ────────────────────────────────────────────────────────────
test('LB-6: the count is asked again on focus, when the lab journal opens and after every lab scan answer', () => {
  assert.match(sliceBlock(BODY, 'async function fetchReports('), /refreshScanUsage\(\);/);
  assert.match(BODY, /useEffect\(\(\) => \{ if \(section === 'labs'\) refreshScanUsage\(\); \}, \[section\]\);/, 'the phone lab journal opening');
  const ex = sliceBlock(BODY, 'async function extractWithClaude(');
  assert.match(ex, /finally \{\s*refreshScanUsage\(\);\s*\}/, 'success, refusal or failure: asked again');
  const r = sliceBlock(BODY, 'function refreshScanUsage(');
  assert.match(r, /fetchScanUsage\(\(name, opts\) => supabase\.functions\.invoke\(name, opts\)\)\.then\(setScanUsage\)/);
});

// ── LB-7: words in all six languages ──────────────────────────────────────────────────────────
const NEW_KEYS = ['blood_scans_used_of', 'blood_scans_used_of_one', 'blood_scans_used', 'blood_scans_used_one', 'blood_scans_kinds', 'blood_scans_renew',
  'blood_date_move', 'blood_date_move_body', 'blood_date_move_body_one'];
test('LB-7: every new string exists in the 6 languages with its placeholders; Portuguese as drawn and formal', () => {
  for (const lang of LANGS) {
    for (const k of NEW_KEYS) assert.equal(typeof translations[lang][k], 'string', `${lang}.${k}`);
    assert.match(translations[lang].blood_scans_used_of, /\{n\}.*\{limit\}|\{limit\}.*\{n\}/s, lang);
    assert.match(translations[lang].blood_scans_renew, /\{month\}/, lang);
    assert.match(translations[lang].blood_date_move_body, /\{n\}/, lang);
  }
  const pt = translations.pt;
  assert.equal(pt.blood_date_move, 'Mudar a data deste exame');
  assert.equal(pt.blood_date_move_body.replace('{n}', '12'), 'Os 12 valores e as etiquetas deste exame passam para a nova data.');
  assert.equal(pt.blood_scans_kinds, '(exames, vacinas e frascos)');
  for (const k of NEW_KEYS) assert.doesNotMatch(pt[k], /dá para|Não deu|a gente/, k);
  // French: singular for 0 and 1 (lib/plural.js).
  const { scanUsageLine } = SU();
  assert.equal(scanUsageLine({ used: 0, premium: true, language: 'fr', t: tr('fr'), now: OCT26 }).count, '0 scan utilisé ce mois-ci');
  assert.equal(scanUsageLine({ used: 2, premium: true, language: 'fr', t: tr('fr'), now: OCT26 }).count, '2 scans utilisés ce mois-ci');
});

// ── LB-8: the button ──────────────────────────────────────────────────────────────────────────
test('LB-8: "Mudar a data deste exame" (calendar icon, well capsule) sits between the values and "Excluir este exame"', () => {
  const d = sliceBlock(BODY, 'function renderReportDetail(');
  const list = d.indexOf('reportDetail.markers.map(');
  const btn = d.indexOf("t('blood_date_move')");
  const del = d.indexOf("t('blood_report_delete')");
  assert.ok(list > 0 && btn > list && del > btn, 'values → change date → delete');
  assert.match(d, /<TouchableOpacity style=\{s\.moveBtn\} onPress=\{\(\) => openDateMove\(reportDetail\)\} accessibilityRole="button">\s*<FeatureIcon name="calendar" size=\{18\} color=\{colors\.ink\} \/>\s*<Text style=\{s\.btnOText\}>\{t\('blood_date_move'\)\}<\/Text>/);
  assert.match(BODY, /moveBtn: \{ minHeight: 50, borderRadius: 25, backgroundColor: c\.well, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 \}/);
});

// ── LB-9: the window ──────────────────────────────────────────────────────────────────────────
test('LB-9: the window — calendar icon, title, "Os {n} valores…", the app\'s date wheel (30 years back, never the future), Cancel | Save', () => {
  const sheet = BODY.slice(BODY.indexOf('{/* AD-100: Change this test\'s date'));
  assert.match(sheet, /<DTSheet\s+config=\{dateMove \? \{/);
  assert.match(sheet, /icon: 'calendar',\s*title: t\('blood_date_move'\),\s*body: t\(pluralKey\('blood_date_move_body', dateMove\.card\.markers\.length, language\)\)\.replace\('\{n\}', String\(dateMove\.card\.markers\.length\)\)/);
  assert.match(sheet, /wheel: \{\s*columns: wheelColumns\(dateMove\.date, new Date\(\), monthLabels, TEST_DATE_RANGE\),\s*onChange: \(col, i\) => setDateMove\(m => \(m \? \{ \.\.\.m, date: wheelAfter\(m\.date, new Date\(\), col, i, \{ \.\.\.TEST_DATE_RANGE, max: today \}\) \} : m\)\),/);
  assert.match(sheet, /buttons: \[\s*\{ label: t\('cancel'\), kind: 'secondary' \},\s*\{ label: t\('save'\), kind: 'primary', onPress: \(\) => moveReportDate\(dateMove\.card, dateMove\.date\) \},\s*\]/);
  assert.match(BODY, /const TEST_DATE_RANGE = \{ back: 30, ahead: 0 \};/);
  // DTSheet draws the wheel under the body (one sheet, the app's own wheel).
  const parts = read('screens/components/ProtocolParts.js');
  const dt = sliceBlock(parts, 'export function DTSheet(');
  assert.match(dt, /\{shown\.wheel \? <DTWheel columns=\{shown\.wheel\.columns\} onChange=\{shown\.wheel\.onChange\} \/> : null\}/);
  assert.ok(dt.indexOf('shown.wheel') > dt.indexOf('shown.body2'), 'under the text');
  // the date opens on the test's own date
  assert.match(sliceBlock(BODY, 'function openDateMove('), /setDateMove\(\{ card, date: card\.date \}\);/);
});

// ── LB-10 / LB-11: the move itself (real SQLite + the real sync engine) ───────────────────────
const USER = 'user-A';
function dbFns(db) {
  const getDB = () => db;
  const f = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB });
  return { moveBiomarkerReport: f('moveBiomarkerReport'), getBiomarkers: f('getBiomarkers') };
}
const MARKERS = ['LDL', 'HDL', 'Triglycerides', 'Glucose', 'TSH', 'Vitamin D', 'ALT', 'AST', 'Creatinine', 'Ferritin', 'B12', 'Hemoglobin'];
function seedSyncedReport(db, cloud, date, createdAt, markers = MARKERS) {
  markers.forEach((m, i) => {
    const rid = `b-${date}-${createdAt}-${i}`;
    cloud._store.biomarkers.set(rid, { id: rid, user_id: USER, report_date: date, marker: m, value: 10 + i, unit: 'mg/dL', created_at: createdAt, updated_at: cloud._stamp() });
    db.runSync(`INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [rid, USER, date, m, 10 + i, 'mg/dL', createdAt, '000000']);
  });
}
const live = (db) => db.getAllSync(`SELECT id, remote_id, report_date, marker, value, created_at FROM biomarkers WHERE sync_status != 'deleted' ORDER BY id`);

test('LB-10: Save moves all 12 values of the test in place (same rows), and the cloud gets 12 updates — never a lost or duplicated value', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const { moveBiomarkerReport, getBiomarkers } = dbFns(db);
  seedSyncedReport(db, cloud, '2026-10-19', '2026-10-19T14:03:11.000Z');
  const before = live(db);
  const card = reportCards(getBiomarkers(USER))[0];
  assert.equal(card.markers.length, 12);
  assert.equal(moveBiomarkerReport(USER, card.date, card.batches, '2026-10-10'), 12, 'every value moved');
  const after = live(db);
  assert.equal(after.length, 12, 'no row added or lost');
  assert.deepEqual(after.map(r => r.id), before.map(r => r.id), 'the same rows (an update, not a copy)');
  assert.ok(after.every(r => r.report_date === '2026-10-10'));
  assert.deepEqual(after.map(r => [r.marker, r.value, r.created_at]), before.map(r => [r.marker, r.value, r.created_at]), 'values and the upload stamp kept');
  await pushPending(db, cloud, USER);
  const c = cloud.rows('biomarkers', USER);
  assert.equal(c.length, 12, 'the cloud still holds 12 values');
  assert.ok(c.every(r => r.report_date === '2026-10-10'), 'every cloud value has the new date');
  await pullChanges(db, cloud, USER);
  assert.equal(live(db).length, 12, 'a pull after the push adds nothing');
  assert.equal(db.getFirstSync(`SELECT COUNT(*) AS n FROM biomarkers WHERE sync_status = 'pending'`).n, 0, 'all synced');
  const moved = reportCards(getBiomarkers(USER));
  assert.equal(moved.length, 1);
  assert.equal(moved[0].markers.length, 12, 'one test, still 12 values');
});

test('LB-10: a test never sent to the cloud moves too and goes up once (12 inserts, no duplicate)', async () => {
  const db = makeDb();
  const cloud = makeCloud();
  const { moveBiomarkerReport, getBiomarkers } = dbFns(db);
  MARKERS.forEach((m, i) => db.runSync(`INSERT INTO biomarkers (user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES (?, '2026-10-19', ?, ?, 'mg/dL', '2026-10-19T14:03:11.000Z', '2026-10-19T14:03:11.000Z', 'pending')`, [USER, m, i]));
  const card = reportCards(getBiomarkers(USER))[0];
  moveBiomarkerReport(USER, card.date, card.batches, '2026-10-10');
  await pushPending(db, cloud, USER);
  const c = cloud.rows('biomarkers', USER);
  assert.equal(c.length, 12);
  assert.ok(c.every(r => r.report_date === '2026-10-10'));
  await pushPending(db, cloud, USER);
  assert.equal(cloud.rows('biomarkers', USER).length, 12, 'a second sync sends nothing more');
});

test('LB-10: a value pulled from the cloud (one stamp per value) and a value deleted before are handled: all live values move, the deleted one stays deleted', () => {
  const db = makeDb();
  const { moveBiomarkerReport, getBiomarkers } = dbFns(db);
  // A pulled upload: one created_at per value, a few ms apart (lib/labReports joins them in one card).
  ['LDL', 'HDL', 'TSH'].forEach((m, i) => db.runSync(`INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES (?, ?, '2026-10-19', ?, 1, 'u', ?, '000001', 'synced')`,
    [`r${i}`, USER, m, `2026-10-19T14:03:11.00${i}Z`]));
  db.runSync(`UPDATE biomarkers SET sync_status = 'deleted' WHERE remote_id = 'r2'`);
  const card = reportCards(getBiomarkers(USER))[0];
  assert.equal(card.markers.length, 2);
  assert.equal(moveBiomarkerReport(USER, card.date, card.batches, '2026-10-10'), 2);
  assert.equal(db.getFirstSync(`SELECT report_date, sync_status FROM biomarkers WHERE remote_id = 'r2'`).report_date, '2026-10-19', 'the deleted value is left alone');
  // The same date, an empty list, or no date: nothing written.
  assert.equal(moveBiomarkerReport(USER, '2026-10-10', card.batches, '2026-10-10'), 0);
  assert.equal(moveBiomarkerReport(USER, '2026-10-10', [], '2026-10-01'), 0);
  assert.equal(moveBiomarkerReport(USER, '2026-10-10', card.batches, ''), 0);
});

test('LB-11: another test on the old date stays there; a test already on the new date stays its own card', () => {
  const db = makeDb();
  const cloud = makeCloud();
  const { moveBiomarkerReport, getBiomarkers } = dbFns(db);
  seedSyncedReport(db, cloud, '2026-10-19', '2026-10-19T14:03:11.000Z');
  seedSyncedReport(db, cloud, '2026-10-19', '2026-10-19T18:00:00.000Z', ['Insulin', 'HbA1c']); // a second upload the same day
  seedSyncedReport(db, cloud, '2026-10-10', '2026-10-10T09:00:00.000Z', ['Iron', 'Zinc']); // already on the new date
  const card = reportCards(getBiomarkers(USER)).find(c => c.markers.length === 12);
  moveBiomarkerReport(USER, card.date, card.batches, '2026-10-10');
  const cards = reportCards(getBiomarkers(USER));
  assert.equal(cards.length, 3, 'three tests, as before');
  const at10 = cards.filter(c => c.date === '2026-10-10').map(c => c.markers.length).sort((a, b) => a - b);
  assert.deepEqual(at10, [2, 12], 'the moved test and the one already there are separate cards');
  assert.deepEqual(cards.filter(c => c.date === '2026-10-19').map(c => c.markers.length), [2], 'the other upload of the old day is untouched');
  // The moved test's new card key (the screen follows it).
  const key = LM().movedCardKey(getBiomarkers(USER), '2026-10-10', card.batches[0]);
  assert.equal(key, '2026-10-10|2026-10-19T14:03:11.000Z');
  assert.equal(cards.find(c => c.key === key).markers.length, 12);
  assert.equal(LM().movedCardKey(getBiomarkers(USER), '2026-10-11', card.batches[0]), null);
});

// ── LB-12: the labels move with the test ──────────────────────────────────────────────────────
test('LB-12: the labels move to the new date (joined with any there); the old date keeps them only while another test is still on it', () => {
  const { moveReportTags } = LM();
  const tags = { '2026-10-19': ['Check-up'], '2026-08-02': ['baseline'] };
  assert.deepEqual(moveReportTags(tags, '2026-10-19', '2026-10-10', false), { '2026-08-02': ['baseline'], '2026-10-10': ['Check-up'] });
  assert.deepEqual(moveReportTags(tags, '2026-10-19', '2026-10-10', true), { '2026-10-19': ['Check-up'], '2026-08-02': ['baseline'], '2026-10-10': ['Check-up'] });
  assert.deepEqual(moveReportTags({ '2026-10-19': ['Check-up', 'week 8'], '2026-10-10': ['check-up', 'fasting'] }, '2026-10-19', '2026-10-10', false),
    { '2026-10-10': ['check-up', 'fasting', 'week 8'] }, 'no duplicate label (case-insensitive), the existing first');
  assert.deepEqual(moveReportTags(tags, '2026-10-20', '2026-10-10', false), tags, 'no labels on the old date: unchanged');
  assert.deepEqual(tags, { '2026-10-19': ['Check-up'], '2026-08-02': ['baseline'] }, 'never mutates');
  const mv = sliceBlock(BODY, 'async function moveReportDate(');
  // AD-100 review: through moveLabels (one retry; a failure keeps the labels with the moved test —
  // behaviour in __tests__/ad100LabelMoveFail.test.js).
  assert.match(mv, /await moveLabels\(\{ from, to: toDate, keepFrom, labels: labels\.slice\(\) \}\);/, 'merged on the fresh server value (DV-006 path)');
});

// ── LB-13 / LB-14: the screen after Save ──────────────────────────────────────────────────────
test('LB-13: after Save the test stays open on its new date (phone detail and Fold right page); the write is synced', () => {
  const mv = sliceBlock(BODY, 'async function moveReportDate(');
  assert.match(mv, /if \(!toDate \|\| toDate === card\.date\) return;/, 'LB-14: the same date writes nothing');
  assert.match(mv, /try \{\s*moveBiomarkerReport\(user\.id, from, card\.batches, toDate\);[^\n]*\s*\} catch \{\s*saveFailed\(\);\s*return;\s*\}\s*requestSync\(\);/, 'a failed write says so and changes nothing on screen');
  assert.match(mv, /const fresh = getBiomarkers\(user\.id\) \|\| \[\];\s*const key = movedCardKey\(fresh, toDate, card\.batches\[0\]\);\s*setRows\(fresh\);/, 'rows and the open test change together (the screen never falls back to the journal)');
  assert.match(mv, /if \(key && detail\?\.type === 'report' && detail\.key === card\.key\) setDetail\(\{ type: 'report', key \}\);/);
  assert.match(mv, /if \(key && book && sel === card\.key\) select\(key\);/);
  assert.match(mv, /const keepFrom = fresh\.some\(r => r\.report_date === from\);/);
  // Cancel / a tap outside: nothing (DTSheet closes; only Save calls moveReportDate).
  assert.equal((BODY.match(/moveReportDate\(/g) || []).length, 2, 'declared once, called only from Save');
});

// ── LB-15: "Exame importado" points to the new action ─────────────────────────────────────────
test('LB-15: when the report date could not be read, the import message names "Mudar a data deste exame" (6 languages)', () => {
  for (const lang of LANGS) {
    const tt = translations[lang];
    assert.ok(tt.blood_imported_date_fallback.includes(tt.blood_date_move), `${lang}: ${tt.blood_imported_date_fallback}`);
  }
  assert.equal(translations.pt.blood_imported_date_fallback, 'A data do exame não pôde ser lida, então usamos a de hoje. Para corrigi-la, abra o exame e toque em "Mudar a data deste exame".');
});

// ── LB-16: theme tokens only in what this item adds ───────────────────────────────────────────
test('LB-16: the new styles and lines use theme tokens only (no raw colour)', () => {
  for (const name of ['quotaFull', 'moveBtn']) {
    const line = BODY.split('\n').find(l => l.trim().startsWith(name + ':'));
    assert.ok(line, name);
    assert.doesNotMatch(line, /#[0-9a-f]{3,8}\b|'white'|'black'|rgba?\(/i, name);
  }
  for (const f of ['lib/scanUsage.js', 'lib/labDateMove.js']) assert.doesNotMatch(read(f), /#[0-9a-f]{6}\b|'white'|'black'/i, f);
});
