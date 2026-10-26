'use strict';
// AD-100 review (2026-10-26): "Mudar a data deste exame" moves the values in one SQLite transaction,
// but the labels are a separate, later save (lib/labPrefs saveLabTags — the DV-006 table, or the 1.3.1
// user_metadata path that is refused offline). When that label save failed, the screen undid the
// labels back onto the OLD date — which may have no test any more (keepFrom false), so the labels
// were hidden on an empty date — and said "Couldn't save your changes", as if the move had failed.
// Now: the label save is tried once more; if it still fails, the labels are never undone onto the old
// date: they stay with the moved test on screen, are sent again with the next label save and the next
// time My Body opens, and the message says what happened ("values moved, labels not saved yet").
// These tests run the real screen functions (screens/BodyScreen.js) over the real label store
// (lib/labPrefsStore) and the real biomarker writes (lib/database), with the server faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { reportCards } = require('../lib/labReports');
const LM = require('../lib/labDateMove');
const LP = require('../lib/labPrefsStore');
const { translations } = require('../i18n/translations');

const USER = 'user-A';
const BODY = read('screens/BodyScreen.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

function dbFns(db) {
  const getDB = () => db;
  const f = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB });
  return { moveBiomarkerReport: f('moveBiomarkerReport'), getBiomarkers: f('getBiomarkers') };
}
function seedTest(db, date, createdAt, markers) {
  markers.forEach((m, i) => db.runSync(
    `INSERT INTO biomarkers (remote_id, user_id, report_date, marker, value, unit, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'mg/dL', ?, '000001', 'synced')`,
    [`b-${date}-${createdAt}-${i}`, USER, date, m, 10 + i, createdAt]));
}

// The account's user_metadata on the server (the 1.3.1 label path, used while the cloud table is not
// read on this phone): `fails` = how many writes are refused next (offline), `throws` = the save throws.
function metaServer(meta) {
  const s = { meta: JSON.parse(JSON.stringify(meta)), fails: 0, writes: 0 };
  s.readFresh = async () => JSON.parse(JSON.stringify(s.meta));
  s.writeMeta = async (data) => {
    s.writes += 1;
    if (s.fails > 0) { s.fails -= 1; return { error: new Error('Network request failed') }; }
    Object.assign(s.meta, JSON.parse(JSON.stringify(data)));
    return { error: null };
  };
  return s;
}

// My Body with one or more tests, its labels as loaded, the real store behind saveLabTags.
function screen({ tests, tags }) {
  const db = makeDb();
  for (const [date, createdAt, markers] of tests) seedTest(db, date, createdAt, markers);
  const srv = metaServer({ report_tags: tags });
  const store = LP.createLabPrefs({
    db, userId: USER, meta: async () => JSON.parse(JSON.stringify(srv.meta)),
    readFresh: srv.readFresh, writeMeta: srv.writeMeta, ready: () => false, requestSync() {},
  });
  const { moveBiomarkerReport, getBiomarkers } = dbFns(db);
  const st = { reportTags: JSON.parse(JSON.stringify(tags)), notices: [], saves: 0, throwNext: 0, rows: [], detail: null };
  const pendingLabelMoves = { current: [] };
  const saveLabTags = async (apply) => {
    st.saves += 1;
    if (st.throwNext > 0) { st.throwNext -= 1; throw new Error('database is locked'); }
    return store.tags(apply);
  };
  const common = {
    saveLabTags, pendingLabelMoves, applyLabelMoves: LM.applyLabelMoves, moveReportTags: LM.moveReportTags,
    setReportTags: (v) => { st.reportTags = typeof v === 'function' ? v(st.reportTags) : v; },
    notice: (cfg) => st.notices.push(cfg),
    saveFailed: () => st.notices.push({ title: 'error', body: 'error_save_failed' }),
    t: (k) => k,
  };
  const saveReportTagOp = loadFn('screens/BodyScreen.js', 'async function saveReportTagOp(', 'saveReportTagOp', common);
  const moveLabels = loadFn('screens/BodyScreen.js', 'async function moveLabels(', 'moveLabels', common);
  const move = (card, toDate) => loadFn('screens/BodyScreen.js', 'async function moveReportDate(', 'moveReportDate', {
    ...common, reportTags: st.reportTags, moveLabels,
    getCachedUser: async () => ({ id: USER }), moveBiomarkerReport, getBiomarkers, requestSync() {},
    movedCardKey: LM.movedCardKey, setRows: (r) => { st.rows = r; }, detail: null, setDetail() {}, book: false, sel: null, select() {},
  })(card, toDate);
  // The next time My Body opens (fetchReports on focus).
  const reopen = () => loadFn('screens/BodyScreen.js', 'async function fetchReports(', 'fetchReports', {
    ...common, saveReportTagOp, refreshScanUsage() {}, usageShownRef: { current: false },
    hasPremium: async () => false, setPremium() {}, getCachedUser: async () => ({ id: USER }), setLoading() {},
    getBiomarkers, setRows() {}, setVaccineList() {}, getVaccines: () => [],
    loadLabPrefs: () => store.load(), setFavorites() {},
  })();
  const card = (date) => reportCards(getBiomarkers(USER)).find((c) => c.date === date);
  return { db, srv, st, pendingLabelMoves, move, reopen, card, saveReportTagOp, getBiomarkers };
}

const flush = () => new Promise((r) => setImmediate(r));

test('AD-100 review: a label save refused twice — values moved, the labels stay with the moved test (never back on the empty old date), an accurate message, nothing lost', async () => {
  const S = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL', 'HDL']]], tags: { '2026-10-19': ['Check-up'], '2026-08-02': ['baseline'] } });
  S.srv.fails = 2; // offline: the first save and the retry are both refused
  await S.move(S.card('2026-10-19'), '2026-10-10');
  assert.equal(S.getBiomarkers(USER).every((r) => r.report_date === '2026-10-10'), true, 'the values moved');
  assert.equal(S.st.saves, 2, 'the label save is tried once more');
  assert.deepEqual(S.st.reportTags, { '2026-08-02': ['baseline'], '2026-10-10': ['Check-up'] }, 'shown with the moved test, never undone onto the empty old date');
  assert.equal(S.st.notices.length, 1);
  assert.equal(S.st.notices[0].title, 'blood_date_move_labels_title', 'not "Couldn\'t save your changes"');
  assert.equal(S.st.notices[0].body, 'blood_date_move_labels_body');
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-19': ['Check-up'], '2026-08-02': ['baseline'] }, 'the stored labels are untouched (never lost)');
  assert.equal(S.pendingLabelMoves.current.length, 1, 'kept to be sent again');

  // Back online: the next time My Body opens, the move is sent and the stored labels follow the test.
  await S.reopen();
  await flush();
  assert.deepEqual(S.srv.meta.report_tags, { '2026-08-02': ['baseline'], '2026-10-10': ['Check-up'] });
  assert.deepEqual(S.st.reportTags, { '2026-08-02': ['baseline'], '2026-10-10': ['Check-up'] });
  assert.equal(S.pendingLabelMoves.current.length, 0, 'sent once, then forgotten');
  assert.equal(S.st.notices.length, 1, 'the retry on open is quiet');
  await S.reopen();
  await flush();
  assert.deepEqual(S.srv.meta.report_tags, { '2026-08-02': ['baseline'], '2026-10-10': ['Check-up'] }, 'sending it again changes nothing');
});

test('AD-100 review: still offline when My Body opens again — the labels are still shown with the moved test, quietly, and kept for the next try', async () => {
  const S = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']]], tags: { '2026-10-19': ['Check-up'] } });
  S.srv.fails = 3;
  await S.move(S.card('2026-10-19'), '2026-10-10');
  await S.reopen();
  await flush();
  assert.deepEqual(S.st.reportTags, { '2026-10-10': ['Check-up'] }, 'the loaded labels are shown with the pending move applied');
  assert.equal(S.pendingLabelMoves.current.length, 1);
  assert.equal(S.st.notices.length, 1, 'no second message');
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-19': ['Check-up'] }, 'nothing lost');
});

test('AD-100 review: the first label save fails and the retry succeeds — saved on the new date, no message', async () => {
  const S = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']]], tags: { '2026-10-19': ['Check-up'] } });
  S.srv.fails = 1;
  await S.move(S.card('2026-10-19'), '2026-10-10');
  assert.equal(S.st.saves, 2);
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-10': ['Check-up'] });
  assert.deepEqual(S.st.reportTags, { '2026-10-10': ['Check-up'] });
  assert.equal(S.st.notices.length, 0);
  assert.equal(S.pendingLabelMoves.current.length, 0);
});

test('AD-100 review: a label save that throws (a local database error) is handled the same way, never an unhandled rejection', async () => {
  const S = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']]], tags: { '2026-10-19': ['Check-up'] } });
  S.st.throwNext = 2;
  await S.move(S.card('2026-10-19'), '2026-10-10');
  assert.deepEqual(S.st.reportTags, { '2026-10-10': ['Check-up'] });
  assert.equal(S.st.notices[0].title, 'blood_date_move_labels_title');
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-19': ['Check-up'] });
});

test('AD-100 review: another test still on the old date — on failure both tests keep showing the labels; the retry stores them on both', async () => {
  const S = screen({
    tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']], ['2026-10-19', '2026-10-19T18:00:00.000Z', ['TSH']]],
    tags: { '2026-10-19': ['Check-up'] },
  });
  S.srv.fails = 2;
  const first = reportCards(S.getBiomarkers(USER)).find((c) => c.batches.includes('2026-10-19T14:03:11.000Z'));
  await S.move(first, '2026-10-10');
  assert.deepEqual(S.st.reportTags, { '2026-10-19': ['Check-up'], '2026-10-10': ['Check-up'] });
  assert.equal(S.st.notices[0].title, 'blood_date_move_labels_title');
  await S.reopen();
  await flush();
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-19': ['Check-up'], '2026-10-10': ['Check-up'] });
});

test('AD-100 review: a label change made while a move is still unsaved is applied after the move (removing a moved label removes it everywhere)', async () => {
  const S = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']]], tags: { '2026-10-19': ['Check-up', 'week 8'] } });
  S.srv.fails = 2;
  await S.move(S.card('2026-10-19'), '2026-10-10');
  // Online again; the person removes "week 8" from the moved test before My Body is reopened.
  const { setReportTag } = require('../lib/bodyPrefs');
  await S.saveReportTagOp((tags) => setReportTag(tags, '2026-10-10', 'week 8', false), (tags) => setReportTag(tags, '2026-10-10', 'week 8', true));
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-10': ['Check-up'] }, 'the move first, then the removal — no label left behind on the old date');
  assert.deepEqual(S.st.reportTags, { '2026-10-10': ['Check-up'] });
  assert.equal(S.pendingLabelMoves.current.length, 0);
});

test('AD-100 review: the first save succeeding is one save and no message (unchanged); a test without labels saves nothing', async () => {
  const S = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']]], tags: { '2026-10-19': ['Check-up'] } });
  await S.move(S.card('2026-10-19'), '2026-10-10');
  assert.equal(S.st.saves, 1);
  assert.deepEqual(S.srv.meta.report_tags, { '2026-10-10': ['Check-up'] });
  assert.equal(S.st.notices.length, 0);
  const N = screen({ tests: [['2026-10-19', '2026-10-19T14:03:11.000Z', ['LDL']]], tags: {} });
  await N.move(N.card('2026-10-19'), '2026-10-10');
  assert.equal(N.st.saves, 0);
});

test('AD-100 review: only the labels that were moved follow a pending move (a label added to the old date\'s other test later stays there)', () => {
  const tags = { '2026-10-19': ['Check-up', 'fasting'] };
  const move = { from: '2026-10-19', to: '2026-10-10', keepFrom: true, labels: ['Check-up'] };
  assert.deepEqual(LM.applyLabelMoves(tags, [move]), { '2026-10-19': ['Check-up', 'fasting'], '2026-10-10': ['Check-up'] });
  assert.deepEqual(LM.applyLabelMoves(tags, [{ ...move, keepFrom: false }]), { '2026-10-19': ['fasting'], '2026-10-10': ['Check-up'] });
  assert.deepEqual(LM.applyLabelMoves(tags, []), tags);
  assert.deepEqual(LM.moveReportTags(tags, '2026-10-19', '2026-10-10', false), { '2026-10-10': ['Check-up', 'fasting'] }, 'without a list: every label, as before');
  assert.deepEqual(tags, { '2026-10-19': ['Check-up', 'fasting'] }, 'never mutates');
});

test('AD-100 review: the message in all six languages, natural, Portuguese formal; the old undo is gone', () => {
  for (const lang of LANGS) {
    for (const k of ['blood_date_move_labels_title', 'blood_date_move_labels_body']) {
      assert.equal(typeof translations[lang][k], 'string', `${lang}.${k}`);
      assert.ok(translations[lang][k].length > 5, `${lang}.${k}`);
    }
  }
  for (const k of ['blood_date_move_labels_title', 'blood_date_move_labels_body']) assert.doesNotMatch(translations.pt[k], /dá para|Não deu|a gente/, k);
  const mv = sliceBlock(BODY, 'async function moveReportDate(');
  assert.doesNotMatch(mv, /beforeTags/, 'never undone to the old date');
});
