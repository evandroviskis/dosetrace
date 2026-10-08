'use strict';
// Founder decision 2026-10-02: the reality check KEEPS the option to type the calories by
// hand ("manter a opção de digitar as calorias à mão"). The food-log path stays exactly as
// built; a typed average per day is a second way to finish. With a weigh-in on/after day 21
// and EITHER a food-log 7-day run OR a typed average, the check finishes with the same
// checkOutcome math — the food-log run when it exists, else the typed value. Both present:
// the food run is used and the typed value is kept (never discarded). The typed value lives
// in the durable synced calc_inputs payload (the reality check's own storage), never in
// AsyncStorage alone, and survives a restart and a new device. Old results (saved before a
// source was recorded) still render.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const R = require('../lib/realityCheckRules');
const { mergeCalcInputs } = require('../lib/realityCheckStore');
const { pushPending, fullImport } = require('../lib/syncCore');
const { makeDb, makeCloud } = require('./helpers/syncHarness');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const start = { date: '2026-09-01', weightKg: 88 };
const weighIns = [{ date: '2026-09-22', weightKg: 86.6 }];
const today = '2026-09-23';

// ── the outcome ──

test('typed calories: finishing with ONLY a typed average works (source typed)', () => {
  const r = R.checkOutcome({ start, snapshots: weighIns, run: { ok: false, current: 2 }, typedKcal: 2100, todayISO: today });
  assert.equal(r.state, 'ready');
  assert.equal(r.source, 'typed');
  assert.equal(r.avgDailyCalories, 2100);
  assert.equal(r.days, 21);
  assert.ok(Math.abs(r.weightChangeKg - 1.4) < 1e-9);
  assert.equal(r.typedKept, false);
});

test('typed calories: finishing with ONLY a food-log run works (source food), as before', () => {
  const r = R.checkOutcome({ start, snapshots: weighIns, run: { ok: true, avgKcal: 2400, days: 9 }, typedKcal: null, todayISO: today });
  assert.equal(r.state, 'ready');
  assert.equal(r.source, 'food');
  assert.equal(r.avgDailyCalories, 2400);
});

test('typed calories: with BOTH the food run is used and the typed value is kept', () => {
  const r = R.checkOutcome({ start, snapshots: weighIns, run: { ok: true, avgKcal: 2400, days: 9 }, typedKcal: 2100, todayISO: today });
  assert.equal(r.state, 'ready');
  assert.equal(r.source, 'food');
  assert.equal(r.avgDailyCalories, 2400);
  assert.equal(r.typedKept, true, 'the typed value is reported as kept, never dropped');
});

test('typed calories: neither a run nor a typed value still waits (needs_food); a typed value never finishes before the weigh-in', () => {
  assert.equal(R.checkOutcome({ start, snapshots: weighIns, run: { ok: false, current: 3 }, typedKcal: null, todayISO: today }).state, 'needs_food');
  assert.equal(R.checkOutcome({ start, snapshots: [], run: null, typedKcal: 2100, todayISO: '2026-09-10' }).state, 'running');
  assert.equal(R.checkOutcome({ start, snapshots: [], run: null, typedKcal: 2100, todayISO: today }).state, 'due');
});

test('parseTypedKcal: whole kcal per day, thousands separators allowed, nonsense rejected', () => {
  assert.equal(R.parseTypedKcal('2100'), 2100);
  assert.equal(R.parseTypedKcal(' 2 100 '), 2100);
  assert.equal(R.parseTypedKcal('2,100'), 2100);
  assert.equal(R.parseTypedKcal('2.100'), 2100);
  assert.equal(R.parseTypedKcal('1850,6'), 1851);
  assert.equal(R.parseTypedKcal(''), null);
  assert.equal(R.parseTypedKcal('abc'), null);
  assert.equal(R.parseTypedKcal('0'), null);
  assert.equal(R.parseTypedKcal('120'), null, 'below a whole day of eating');
  assert.equal(R.parseTypedKcal('25000'), null);
});

test('typedIntakeFor: the typed value belongs to the check it was typed for (start date), never a later one', () => {
  const saved = { weight: '88', ...R.typedIntakePatch('2026-09-01', 2100) };
  assert.equal(R.typedIntakeFor(saved, '2026-09-01'), 2100);
  assert.equal(R.typedIntakeFor(saved, '2026-10-01'), null);
  assert.equal(R.typedIntakeFor({ ...saved, ...R.typedIntakePatch('2026-09-01', null) }, '2026-09-01'), null, 'cleared');
  assert.equal(R.typedIntakeFor(null, '2026-09-01'), null);
  assert.equal(R.typedIntakeFor({ rcTypedKcal: { start: '2026-09-01', kcal: 'x' } }, '2026-09-01'), null);
});

// ── storage: merge, never clobber ──

test('mergeCalcInputs: the calculator full-state save keeps the typed calories (merge, never clobber)', () => {
  const withTyped = mergeCalcInputs({ unit: 'metric', weight: '88' }, R.typedIntakePatch('2026-09-01', 2100));
  const afterStateSave = mergeCalcInputs(withTyped, { unit: 'metric', weight: '87.5', goal: 'lose' });
  assert.equal(afterStateSave.weight, '87.5');
  assert.equal(R.typedIntakeFor(afterStateSave, '2026-09-01'), 2100);
  // Changing it replaces; clearing sets null (an explicit user action).
  assert.equal(R.typedIntakeFor(mergeCalcInputs(afterStateSave, R.typedIntakePatch('2026-09-01', 1900)), '2026-09-01'), 1900);
  assert.equal(R.typedIntakeFor(mergeCalcInputs(afterStateSave, R.typedIntakePatch('2026-09-01', null)), '2026-09-01'), null);
  assert.deepEqual(mergeCalcInputs(null, { a: 1 }), { a: 1 });
});

test('result source: recorded per result date, and a second record never drops an earlier one', () => {
  let saved = mergeCalcInputs({ unit: 'metric' }, R.resultSourcePatch('2026-09-22', 'typed'));
  saved = mergeCalcInputs(saved, R.resultSourcePatch('2026-10-14', 'food'));
  assert.equal(R.resultSource(saved, '2026-09-22'), 'typed');
  assert.equal(R.resultSource(saved, '2026-10-14'), 'food');
  assert.equal(R.resultSource(saved, '2026-08-01'), null);
});

test('old results: a result saved with the legacy typed form (no source recorded) still reads and renders', () => {
  // The old typed form wrote only entry_date / tdee / rate_per_week_kg; no source.
  assert.equal(R.resultSource({ unit: 'metric', weight: '88' }, '2026-08-20'), null);
  assert.equal(R.resultSource(null, '2026-08-20'), null);
  const src = read('screens/components/CalculatorSection.js');
  assert.match(src, /const rcRowToUI = \(r\) => \(\{ date: r\.entry_date, tdee: r\.tdee, ratePerWeekKg: r\.rate_per_week_kg \}\);/, 'the result row shape is unchanged');
  // The source line is shown only when a source was recorded.
  assert.match(src, /latestSource \? \(/);
});

test('typed calories persist across an app restart and reach a new device (synced calc_inputs, not AsyncStorage)', async () => {
  const USER = 'user-T';
  const cloud = makeCloud();
  const a = makeDb();
  // The app's write path: merge onto the saved payload, then upsert the one calc_inputs row.
  const write = (db, patch) => {
    const row = db.getFirstSync(`SELECT * FROM calc_inputs WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1`, [USER]);
    const merged = mergeCalcInputs(row ? JSON.parse(row.payload) : null, patch);
    const now = new Date().toISOString();
    if (row) db.runSync(`UPDATE calc_inputs SET payload = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [JSON.stringify(merged), now, row.id]);
    else db.runSync(`INSERT INTO calc_inputs (user_id, payload, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, 'pending')`, [USER, JSON.stringify(merged), now, now]);
  };
  write(a, { unit: 'metric', weight: '88' });
  write(a, R.typedIntakePatch('2026-09-01', 2100));
  write(a, { unit: 'metric', weight: '87.9', goal: 'lose' }); // the debounced calculator save
  // Restart: reopen the same SQLite file contents.
  const reopened = new Database(a._raw.serialize());
  const after = JSON.parse(reopened.prepare(`SELECT payload FROM calc_inputs WHERE user_id = ?`).get(USER).payload);
  assert.equal(R.typedIntakeFor(after, '2026-09-01'), 2100);
  // New device / reinstall: the cloud brings it back.
  await pushPending(a, cloud, USER);
  const b = makeDb();
  await fullImport(b, cloud, USER);
  const onB = JSON.parse(b.getFirstSync(`SELECT payload FROM calc_inputs WHERE user_id = ?`, [USER]).payload);
  assert.equal(R.typedIntakeFor(onB, '2026-09-01'), 2100);
  assert.equal(onB.weight, '87.9');
});

test('saveCalcInputs merges onto the saved inputs (and the pre-migration metadata) with no await between read and write', () => {
  const src = read('lib/realityCheck.js');
  const fn = src.match(/export async function saveCalcInputs\(patch\) \{[\s\S]*?\n\}\n/);
  assert.ok(fn, 'saveCalcInputs(patch)');
  assert.match(fn[0], /mergeCalcInputs\(/);
  const tail = fn[0].slice(fn[0].indexOf('getCalcInputsRow('));
  assert.ok(!/await/.test(tail.slice(0, tail.indexOf('upsertCalcInputs('))), 'read → merge → write is synchronous');
  assert.match(fn[0], /user_metadata\?\.calc_inputs/, 'not migrated yet: merged onto the old metadata, never a row with only the new key');
  assert.doesNotMatch(src, /AsyncStorage\.setItem\([^)]*rcTyped/);
});

// ── the screen ──

const calc = () => read('screens/components/CalculatorSection.js');

test('the running card offers "Type your average calories instead" (underlined link → DoseTrace sheet with one kcal field and Save)', () => {
  const src = calc();
  const a = src.indexOf('const rcHead = (');
  const b = src.indexOf('const weighEl = (');
  const body = src.slice(a, b);
  assert.match(body, /onPress=\{openTypedKcal\}/);
  assert.match(body, /typedKcal != null \? t\('cal_rc_kcal_change'\) : t\('cal_rc_kcal_link'\)/);
  assert.match(body, /style=\{s\.linkU\}/);
  const sheet = src.match(/\{\/\* Reality check typed calories[\s\S]*?<\/SheetModal>/);
  assert.ok(sheet, 'the typed-calories sheet');
  for (const k of ["t('cal_rc_kcal_field')", "t('cal_kcal')", "t('save')", "t('cancel')", 'keyboardType="number-pad"', 'saveTypedKcal', "t('cal_rc_kcal_clear')"]) assert.ok(sheet[0].includes(k), k);
});

test('the outcome is computed with the typed value; a both-present note and the typed line are shown', () => {
  const src = calc();
  assert.match(src, /checkOutcome\(\{ start: rcStart, snapshots, run: foodRun, typedKcal, todayISO: todayISO\(\), days: REALITY_CHECK_DAYS \}\)/);
  assert.match(src, /t\('cal_rc_kcal_both'\)/);
  assert.match(src, /t\('cal_rc_kcal_typed'\)/);
});

test('finishing records the source before the open check closes; a finished result is never rewritten', () => {
  const src = calc();
  const fn = src.match(/async function completeRealityCheck\(res\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /resultSourcePatch\(res\.weighIn\.date, res\.source\)/);
  assert.ok(fn.indexOf('upsertRealityCheck') < fn.indexOf('resultSourcePatch'), 'after the result row');
  assert.ok(fn.indexOf('resultSourcePatch') < fn.indexOf('clearRealityStart'), 'before the check closes');
  assert.match(fn, /if \(getRealityChecks\(uid\)\.some\(r => r\.entry_date >= startDay\)\) return;/, 'still never a second result');
  // The typed sheet is reachable only while the check is open and unsaved.
  assert.match(src, /function openTypedKcal\(\) \{\s*if \(!rcStart \|\| checkSaved\) return;/);
});

test('new strings exist in all 6 languages', () => {
  const { translations } = require('../i18n/translations');
  const keys = ['cal_rc_kcal_link', 'cal_rc_kcal_change', 'cal_rc_kcal_title', 'cal_rc_kcal_field', 'cal_rc_kcal_hint', 'cal_rc_kcal_clear', 'cal_rc_kcal_typed', 'cal_rc_kcal_both', 'cal_rc_src_food', 'cal_rc_src_typed'];
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of keys) assert.ok(typeof translations[lang][k] === 'string' && translations[lang][k].length > 0, `${lang}.${k}`);
    assert.ok(translations[lang].cal_rc_kcal_typed.includes('{kcal}'), `${lang} typed line has {kcal}`);
    assert.ok(translations[lang].cal_rc_kcal_both.includes('{kcal}'), `${lang} both note has {kcal}`);
  }
});

// Founder 2026-10-08: the link reads "Informar minha média de calorias por dia" — the same line in
// every language (first person, "enter/inform", per day); the change / clear / typed lines use the
// same word ("informada" / "entered"), never "digitada" / "typed".
test('FL-48 wording: "Informar minha média de calorias por dia" and the same line in all 6 languages', () => {
  const T2 = require('../i18n/translations.js').translations || require('../i18n/translations.js');
  const link = { pt: 'Informar minha média de calorias por dia', en: 'Enter my average calories per day', es: 'Indicar mi media de calorías por día',
    fr: 'Indiquer ma moyenne de calories par jour', de: 'Meinen Kalorien-Durchschnitt pro Tag angeben', it: 'Indicare la mia media di calorie al giorno' };
  for (const [l, v] of Object.entries(link)) assert.equal(T2[l].cal_rc_kcal_link, v, l);
  assert.equal(T2.pt.cal_rc_kcal_change, 'Mudar a média informada');
  assert.equal(T2.pt.cal_rc_kcal_clear, 'Apagar a média informada');
  for (const k of ['cal_rc_kcal_change', 'cal_rc_kcal_clear', 'cal_rc_kcal_typed', 'cal_rc_kcal_both']) assert.doesNotMatch(T2.en[k], /typed/i, `en ${k}`);
});
