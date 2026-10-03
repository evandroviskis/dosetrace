'use strict';
// Fix or delete a weigh-in (founder 2026-10-02, pictures https://claude.ai/artifact/KaiJ32iFntgG66woPQoe5S;
// docs/specs/progress-one-card.md PO-19..PO-26). The date never changes; Save corrects that
// day's row in place; Delete leaves a synced tombstone so the row never comes back; the
// weigh-in that started the open reality check can be fixed but not deleted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const W = () => require('../lib/weighInEdit');
const { pushPending, pullChanges, fullImport } = require('../lib/syncCore');
const { makeDb, makeCloud } = require('./helpers/syncHarness');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const USER = 'user-A';

function seed(db, row) {
  const now = new Date().toISOString();
  return db.runSync(
    `INSERT INTO calc_snapshots (user_id, entry_date, weight_kg, waist_cm, body_fat_pct, lbm, bmr, tdee, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [USER, row.entry_date, row.weight_kg, row.waist_cm ?? null, row.body_fat_pct ?? null, row.lbm ?? null, row.bmr ?? null, row.tdee ?? null, now, now],
  ).lastInsertRowId;
}
const live = (db) => db.getAllSync(`SELECT * FROM calc_snapshots WHERE user_id = ? AND sync_status != 'deleted' ORDER BY entry_date`, [USER]);

// ── PO-21: validation (weight required, sane ranges, comma decimals, units) ──

test('PO-21: the form reads comma decimals, requires a weight in range, optional body fat / waist in range', () => {
  const { readWeighInForm } = W();
  assert.deepEqual(readWeighInForm({ weight: '84,6', bodyFat: '21', waist: '92', unit: 'metric' }), { ok: true, weightKg: 84.6, bodyFatPct: 21, waistCm: 92 });
  assert.deepEqual(readWeighInForm({ weight: '84.6', bodyFat: '', waist: '', unit: 'metric' }), { ok: true, weightKg: 84.6, bodyFatPct: null, waistCm: null });
  assert.equal(readWeighInForm({ weight: '', unit: 'metric' }).ok, false, 'weight required');
  assert.equal(readWeighInForm({ weight: '5', unit: 'metric' }).ok, false, 'below 25 kg');
  assert.equal(readWeighInForm({ weight: '450', unit: 'metric' }).ok, false, 'above 300 kg');
  assert.equal(readWeighInForm({ weight: '84', bodyFat: '90', unit: 'metric' }).ok, false, 'body fat 3–70 %');
  assert.equal(readWeighInForm({ weight: '84', waist: '5', unit: 'metric' }).ok, false, 'waist 30–250 cm');
  assert.equal(readWeighInForm({ weight: 'abc', unit: 'metric' }).ok, false);
});

test('PO-21: imperial round-trips — the sheet shows lb / in, saves kg / cm, an untouched value saves unchanged', () => {
  const { weighInFormValues, readWeighInForm } = W();
  const row = { entry_date: '2026-09-28', weight_kg: 84.6, body_fat_pct: 21, waist_cm: 92 };
  const shown = weighInFormValues(row, 'imperial');
  assert.deepEqual(shown, { weight: '186.5', bodyFat: '21', waist: '36.2' });
  const back = readWeighInForm({ ...shown, unit: 'imperial', original: row });
  assert.ok(back.ok);
  assert.equal(back.weightKg, 84.6, 'an unchanged display value keeps the stored kg exactly');
  assert.equal(back.waistCm, 92);
  const edited = readWeighInForm({ ...shown, weight: '185', unit: 'imperial', original: row });
  assert.ok(Math.abs(edited.weightKg - 83.91) < 0.01);
  assert.deepEqual(weighInFormValues({ entry_date: 'x', weight_kg: 84.6, body_fat_pct: null, waist_cm: null }, 'metric'), { weight: '84.6', bodyFat: '', waist: '' });
  assert.equal(weighInFormValues({ entry_date: 'x', weight_kg: 86 }, 'metric').weight, '86.0', 'one decimal, as the table shows it');
});

// ── PO-20: Save corrects that day's row in place (one write, merge, never a new row) ──

test('PO-20: Save writes the correction in place for that day — the same row, no new row, the date unchanged', () => {
  const { correctWeighIn } = W();
  const db = makeDb();
  const id = seed(db, { entry_date: '2026-09-28', weight_kg: 84.6, body_fat_pct: 21, waist_cm: 92, lbm: 66.8, bmr: 1810, tdee: 2800 });
  seed(db, { entry_date: '2026-09-21', weight_kg: 85.3 });
  correctWeighIn(db, USER, '2026-09-28', { weightKg: 84.2, bodyFatPct: 20.5, waistCm: null }, '2026-10-02T12:00:00.000Z');
  const rows = live(db);
  assert.equal(rows.length, 2, 'never a new row');
  const r = rows.find((x) => x.entry_date === '2026-09-28');
  assert.equal(r.id, id, 'the same row');
  assert.equal(r.weight_kg, 84.2);
  assert.equal(r.body_fat_pct, 20.5);
  assert.equal(r.waist_cm, null, 'a cleared optional field is cleared — the user corrected it');
  assert.equal(r.lbm, 66.8, 'computed fields are kept');
  assert.equal(r.sync_status, 'pending', 'goes to the synced tables');
});

// ── PO-22 / PO-23: Delete tombstones and stays deleted after sync ──

test('PO-23: Delete tombstones every row of that day; it is pushed as a cloud delete and never comes back', async () => {
  const { deleteWeighIn } = W();
  const cloud = makeCloud();
  const dbA = makeDb();
  seed(dbA, { entry_date: '2026-10-02', weight_kg: 86 });
  seed(dbA, { entry_date: '2026-09-28', weight_kg: 84.6 });
  await pushPending(dbA, cloud, USER);
  assert.equal(cloud.rows('calc_snapshots', USER).length, 2);
  const dbB = makeDb();
  await fullImport(dbB, cloud, USER);

  deleteWeighIn(dbA, USER, '2026-10-02', '2026-10-02T13:00:00.000Z');
  assert.deepEqual(live(dbA).map((r) => r.entry_date), ['2026-09-28'], 'hidden at once');
  const tomb = dbA.getFirstSync(`SELECT sync_status FROM calc_snapshots WHERE entry_date = '2026-10-02'`);
  assert.equal(tomb.sync_status, 'deleted', 'a tombstone, not a local-only removal');

  await pushPending(dbA, cloud, USER);
  assert.deepEqual(cloud.rows('calc_snapshots', USER).map((r) => r.entry_date), ['2026-09-28'], 'deleted in the cloud');
  await pullChanges(dbA, cloud, USER);
  await fullImport(dbA, cloud, USER);
  assert.deepEqual(live(dbA).map((r) => r.entry_date), ['2026-09-28'], 'a later sync does not resurrect it');

  // The other device: its copy goes on the next full import, and its own push never re-creates it.
  await pushPending(dbB, cloud, USER);
  await fullImport(dbB, cloud, USER);
  assert.deepEqual(live(dbB).map((r) => r.entry_date), ['2026-09-28']);
  assert.deepEqual(cloud.rows('calc_snapshots', USER).map((r) => r.entry_date), ['2026-09-28']);
});

test('PO-23: a duplicate row of the same day (two devices) is deleted too, so no older copy shows up', () => {
  const { deleteWeighIn } = W();
  const db = makeDb();
  seed(db, { entry_date: '2026-10-02', weight_kg: 86 });
  seed(db, { entry_date: '2026-10-02', weight_kg: 85.9 });
  deleteWeighIn(db, USER, '2026-10-02', '2026-10-02T13:00:00.000Z');
  assert.equal(live(db).length, 0);
});

// ── PO-24: the reality-check start weigh-in has no delete ──

test('PO-24: the weigh-in that started the open reality check can be fixed but not deleted', () => {
  const { weighInActions } = W();
  const start = { date: '2026-09-28', weightKg: 83.8 };
  assert.deepEqual(weighInActions('2026-09-28', start), { canDelete: false, isCheckStart: true });
  assert.deepEqual(weighInActions('2026-09-28T00:00:00', start), { canDelete: false, isCheckStart: true });
  assert.deepEqual(weighInActions('2026-10-02', start), { canDelete: true, isCheckStart: false });
  assert.deepEqual(weighInActions('2026-09-28', null), { canDelete: true, isCheckStart: false }, 'no open check');
  assert.throws(() => W().deleteWeighIn(makeDb(), USER, '2026-09-28', 'x', start), /starts the reality check/, 'refused below the UI too');
});

test('PO-24: fixing the start weigh-in also corrects the open check\'s start weight', () => {
  const { checkStartPatch } = W();
  assert.deepEqual(checkStartPatch({ date: '2026-09-28', weightKg: 83.8 }, '2026-09-28', 83.5), { date: '2026-09-28', weightKg: 83.5 });
  assert.equal(checkStartPatch({ date: '2026-09-28', weightKg: 83.8 }, '2026-10-02', 83.5), null);
  assert.equal(checkStartPatch(null, '2026-09-28', 83.5), null);
});

// ── The screen ──

test('PO-19: every weigh-in row has a chevron and opens the sheet; the hint sits under the table', () => {
  const src = read('screens/components/CalculatorSection.js');
  const part = src.match(/const weighPart = \(([\s\S]*?)\n  \);\n/)[1];
  assert.match(part, /<TouchableOpacity key=\{r\.date\} style=\{s\.histRow\} onPress=\{\(\) => openWeighInEdit\(r\.date\)\}/);
  assert.match(part, /<RowChevron color=\{colors\.ink3\} \/>/);
  assert.match(part, /t\('cal_wedit_hint'\)/);
});

test('PO-20 / PO-22 / PO-24: the sheet — Cancel, "Weigh-in", fixed date, fields, note, Save, red Delete or the check note; Delete asks first', () => {
  const src = read('screens/components/CalculatorSection.js');
  const sheet = src.match(/\{\/\* Fix or delete a weigh-in[\s\S]*?<\/SheetModal>/);
  assert.ok(sheet, 'the sheet');
  const s = sheet[0];
  const order = ["t('cancel')", "t('cal_wi_title')", "t('cal_tgt_backfill_date')", 'fmtDate(weEdit.date)', "t('cal_snap_weight')", "t('cal_snap_bodyfat')", "t('cal_waist')", "t('cal_wi_note')", "t('save')"];
  let at = -1;
  for (const k of order) { const i = s.indexOf(k); assert.ok(i > at, `${k} in order`); at = i; }
  assert.match(s, /weAct\.canDelete \? \(/);
  assert.match(s, /t\('cal_wi_delete'\)/);
  assert.match(s, /t\('cal_wi_rc_start'\)/);
  assert.doesNotMatch(s, /datebtn|DTPickerSheet/, 'the date cannot be changed');
  const del = src.match(/function confirmDeleteWeighIn\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(del, /setConfirm\(\{/);
  assert.match(del, /title: t\('cal_wi_del_title'\)/);
  assert.match(del, /t\('cal_wi_del_body'\)/);
  assert.match(del, /kind: 'danger'/);
  assert.match(del, /t\('nutri_delete'\)/, 'reuses the existing "Delete"');
});

test('PO-25: after Save or Delete everything that reads weigh-ins refreshes (snapshots, tiles, open check)', () => {
  const src = read('screens/components/CalculatorSection.js');
  for (const fn of ['saveWeighInEdit', 'deleteWeighInNow']) {
    const body = src.match(new RegExp(`function ${fn}\\(\\) \\{[\\s\\S]*?\\n  \\}\\n`))[0];
    assert.match(body, /setSnapshots\(getCalcSnapshots\(uid\)\.map\(snapRowToUI\)\)/, fn);
    assert.match(body, /requestSync\?\.\(\)/, fn);
    assert.match(body, /calcChanged\(\)/, fn);
  }
  const save = src.match(/function saveWeighInEdit\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(save, /checkStartPatch\(rcStart, weEdit\.date, read\.weightKg\)/);
  assert.match(save, /setRealityStart\(/);
});

test('PO-26: the new strings exist in all 6 languages', () => {
  const src = read('i18n/translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  const tr = mod.exports.translations;
  const keys = ['cal_wedit_hint', 'cal_wi_title', 'cal_wi_note', 'cal_wi_delete', 'cal_wi_del_title', 'cal_wi_del_body', 'cal_wi_rc_start', 'cal_wi_invalid'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(tr[l][k], `${l}.${k}`);
  assert.equal(tr.en.cal_wedit_hint, 'Tap a weigh-in to fix or delete it.');
  assert.equal(tr.en.cal_wi_del_body, '{date} · {weight}. Your progress, your target and your reality check update without it. This can\'t be undone.');
});
