'use strict';
// DV-004 (S1, AD-91, founder 2026-10-15): "Stop reality check" soft-deleted EVERY saved
// reality_checks row (all the earlier measured daily burns, lib/database.js clearRealityChecks),
// not only the open check, and the Stop link also showed with no check open (the finished-result
// view and the locked view). AD-91: Stop appears only while a check is running and ends only that
// check; earlier results stay. Runs the REAL Stop handler of screens/components/CalculatorSection.js
// over the REAL lib/database.js reality-check functions on an in-memory SQLite (the sync harness),
// then the real sync engine, so a Stop on one phone never removes results from the cloud either.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { pushPending } = require('../lib/syncCore');

const CALC = 'screens/components/CalculatorSection.js';
const USER = 'u1';
const t = (k) => k;

function phone() {
  const db = makeDb();
  const src = read('lib/database.js');
  const dedupeByDate = loadFn('lib/database.js', 'function dedupeByDate(', 'dedupeByDate');
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, dedupeByDate });
  return {
    db,
    upsertRealityCheck: fromDb('upsertRealityCheck'),
    getRealityChecks: fromDb('getRealityChecks'),
    // The old all-rows wipe, while it still exists (the test must fail on it, never crash).
    clearRealityChecks: src.includes('export function clearRealityChecks(') ? fromDb('clearRealityChecks') : () => { throw new Error('clearRealityChecks was removed'); },
  };
}

// The real stopRealityCheck: confirm in the DoseTrace sheet, then the sheet's Stop.
async function stopNow(p, { open = true } = {}) {
  const calls = { confirm: null, rcStart: [], realityLog: [], clearStart: 0, sync: 0, changed: 0, reminders: 0 };
  const stop = loadFn(CALC, 'function stopRealityCheck(', 'stopRealityCheck', {
    t,
    setConfirm: (v) => { calls.confirm = v; },
    setRcStart: (v) => calls.rcStart.push(v),
    setRealityLog: (v) => calls.realityLog.push(v),
    clearRealityStart: async () => { calls.clearStart++; },
    clearRealityChecks: p.clearRealityChecks,
    userIdRef: { current: USER },
    requestSync: () => { calls.sync++; },
    calcChanged: () => { calls.changed++; },
    syncRealityCheckReminder: async () => { calls.reminders++; },
    syncFoodLogReminder: async () => { calls.reminders++; },
    rcStart: open ? { date: '2026-10-15', weightKg: 88 } : null,
  });
  stop();
  assert.ok(calls.confirm, 'Stop asks first');
  const danger = calls.confirm.buttons.find((b) => b.kind === 'danger');
  await danger.onPress();
  return calls;
}

test('DV-004: a saved result (09-01) + an open check → Stop → reality_checks still holds the 09-01 result', async () => {
  const p = phone();
  p.upsertRealityCheck(USER, { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.4 });
  p.upsertRealityCheck(USER, { entry_date: '2026-09-22', tdee: 2380, rate_per_week_kg: 0.3 });
  const calls = await stopNow(p);
  assert.deepEqual(p.getRealityChecks(USER).map((r) => [r.entry_date, r.tdee]), [['2026-09-01', 2450], ['2026-09-22', 2380]], 'earlier results stay');
  const rows = p.db.getAllSync('SELECT sync_status FROM reality_checks');
  assert.ok(rows.every((r) => r.sync_status !== 'deleted'), 'no result is tombstoned');
  assert.equal(calls.clearStart, 1, 'the open check is ended (stopped in reality_check_open)');
  assert.deepEqual(calls.rcStart, [null], 'the open check closes on screen');
  assert.ok(!calls.realityLog.some((v) => Array.isArray(v) && v.length === 0), 'the results list is never blanked');
  assert.equal(calls.reminders, 2, 'both reminders are re-planned (weigh-in and the 8 PM food log)');
});

test('DV-004: after Stop, a sync never deletes the saved results from the cloud', async () => {
  const p = phone();
  const cloud = makeCloud();
  p.upsertRealityCheck(USER, { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.4 });
  await pushPending(p.db, cloud, USER);
  assert.equal(cloud.rows('reality_checks', USER).length, 1);
  await stopNow(p);
  await pushPending(p.db, cloud, USER);
  assert.equal(cloud.rows('reality_checks', USER).length, 1, 'the 09-01 result is still in the cloud (another phone keeps it too)');
});

test('DV-004: with no open check, a Stop reached anyway leaves every saved row', async () => {
  const p = phone();
  p.upsertRealityCheck(USER, { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.4 });
  await stopNow(p, { open: false });
  assert.equal(p.getRealityChecks(USER).length, 1);
});

test('DV-004: lib/database.js has no function that tombstones every reality-check result at once', () => {
  const src = read('lib/database.js');
  assert.doesNotMatch(src, /UPDATE reality_checks SET sync_status = 'deleted'[^`]*WHERE user_id = \?(?! AND entry_date)/);
  assert.doesNotMatch(src, /export function clearRealityChecks\(/);
});

// The card's branches (rcEl): locked (free plan), running, result, not run yet.
function rcCard() {
  const src = read(CALC);
  const a = src.indexOf('  const rcEl = (');
  const b = src.indexOf('  const weighPart = (');
  assert.ok(a > 0 && b > a);
  return src.slice(a, b);
}

test('DV-004: with no open check, the result view and the locked view show no Stop link; the running check keeps it', () => {
  const card = rcCard();
  const locked = card.slice(card.indexOf('{!rcAllowed ? ('), card.indexOf(') : rcStart && !checkSaved ? ('));
  const running = card.slice(card.indexOf(') : rcStart && !checkSaved ? ('), card.indexOf(') : scoreCheck ? ('));
  const result = card.slice(card.indexOf(') : scoreCheck ? ('), card.indexOf('// Part 9: not run yet'));
  assert.match(locked, /\{rcStart \? stopLink : null\}/, 'locked: Stop only while a check is open');
  assert.doesNotMatch(locked, /realityLog\.length > 0\) \? stopLink/, 'saved results alone never show Stop');
  assert.match(running, /\{stopLink\}/, 'a running check keeps Stop');
  assert.doesNotMatch(result, /stopLink/, 'the finished-result view has no Stop');
});

test('DV-004: the Stop sheet no longer says the numbers are cleared; it says earlier results are kept (6 languages)', () => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  const tr = mod.exports.translations;
  const want = {
    en: /earlier results/, es: /mediciones anteriores/, pt: /medições anteriores/,
    fr: /mesures précédentes/, de: /bisherigen Messungen/, it: /misurazioni precedenti/,
  };
  const wiped = { en: /clears your/, es: /Se borrarán/, pt: /apaga seus/, fr: /seront effacés/, de: /werden gelöscht/, it: /vengono cancellati/ };
  for (const lang of Object.keys(want)) {
    const body = tr[lang].cal_rc_stop_body;
    assert.match(body, want[lang], `${lang}: earlier results kept`);
    assert.doesNotMatch(body, wiped[lang], `${lang}: no "clears your numbers"`);
  }
  // The handler itself never calls a results wipe.
  assert.doesNotMatch(sliceBlock(read(CALC), 'function stopRealityCheck('), /clearRealityChecks|setRealityLog\(\[\]\)/);
});
