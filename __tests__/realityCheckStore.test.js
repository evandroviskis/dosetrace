'use strict';
// S-03 (FX-8 migration, FX-9 sync + Stop-wins, FX-5 Stop plan) — docs/specs/fixes-1.2.5.md.
// Rules approved by the founder 2026-09-28 (outside review #023 reply):
//  - migration runs ONCE per account (persisted flag); after it has run,
//    user_metadata is a write-only mirror and is never re-imported;
//  - both old copies hold a check and differ → the NEWER start date wins;
//    only one holds a check → keep it;
//  - rows are committed to local SQLite before the old AsyncStorage key is cleared;
//  - Stop wins: stopped_at never reverts; a new check = a new row.
// The planners are pure (no RN/Expo imports), so this runs offline under node.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  planLegacyMigration, currentOpenCheck, stopRealityCheckPlan,
} = require('../lib/realityCheckStore');

const OPEN = { date: '2026-09-20', weightKg: 88.4 };
const INPUTS = { unit: 'metric', weight: '88.4', bfSource: 'known', bodyFat: '21', sex: 'male', age: '41', height: '181', activity: 1.55, goal: 'lose', waist: '94' };
const base = { asyncStart: null, metaOpen: null, metaInputs: null, existingOpen: [], existingInputs: null, migrated: false, userId: 'u1' };

test('FX-8: old storage (AsyncStorage start + user_metadata open check + calc_inputs) → every value planned into the new tables', () => {
  const p = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: OPEN, metaInputs: INPUTS });
  assert.equal(p.openInserts.length, 1);
  assert.equal(p.openInserts[0].start_date, '2026-09-20');
  assert.equal(p.openInserts[0].start_weight_kg, 88.4);
  assert.equal(p.openInserts[0].stopped_at, null);
  assert.equal(p.openInserts[0].user_id, 'u1');
  assert.deepEqual(JSON.parse(p.inputsUpsert.payload), INPUTS, 'calc inputs arrive unchanged');
  assert.equal(p.markMigrated, true);
  assert.equal(p.clearLegacyAfterCommit, true, 'old key cleared only after the rows are committed');
});

test('FX-8: idempotent — running the migration again plans nothing new and loses nothing', () => {
  const first = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: OPEN, metaInputs: INPUTS });
  const committedOpen = first.openInserts.map((r, i) => ({ id: i + 1, ...r }));
  const committedInputs = { id: 1, ...first.inputsUpsert };
  const again = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: OPEN, metaInputs: INPUTS, existingOpen: committedOpen, existingInputs: committedInputs });
  assert.equal(again.openInserts.length, 0);
  assert.equal(again.inputsUpsert, null);
});

test('FX-8: both old copies hold a check and differ → the one with the NEWER start date is kept', () => {
  const newer = { date: '2026-09-25', weightKg: 87.9 };
  const a = planLegacyMigration({ ...base, asyncStart: newer, metaOpen: OPEN });
  assert.equal(a.openInserts[0].start_date, '2026-09-25', 'newer in AsyncStorage');
  const b = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: newer });
  assert.equal(b.openInserts[0].start_date, '2026-09-25', 'newer in metadata');
  assert.equal(b.openInserts[0].start_weight_kg, 87.9);
  assert.equal(b.openInserts.length, 1, 'still exactly one open check');
});

test('FX-8: only user_metadata holds the check (new device / wiped cache) → it is kept', () => {
  const p = planLegacyMigration({ ...base, metaOpen: OPEN, metaInputs: INPUTS });
  assert.equal(p.openInserts.length, 1);
  assert.equal(p.openInserts[0].start_date, '2026-09-20');
  assert.ok(p.inputsUpsert);
});

test('FX-8: flag already set → user_metadata is ignored (a 1.2.4 device cannot resurrect a stopped check)', () => {
  const stopped = [{ id: 1, start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: '2026-09-27T10:00:00Z' }];
  const p = planLegacyMigration({ ...base, metaOpen: OPEN, metaInputs: INPUTS, migrated: true, existingOpen: stopped });
  assert.equal(p.openInserts.length, 0);
  assert.equal(p.inputsUpsert, null);
  assert.equal(p.markMigrated, false);
  assert.equal(p.clearLegacyAfterCommit, true, 'a stale local key is still cleared');
});

test('FX-8: nothing in old storage → no rows, still marked migrated (runs once), nothing invented', () => {
  const p = planLegacyMigration(base);
  assert.equal(p.openInserts.length, 0);
  assert.equal(p.inputsUpsert, null);
  assert.equal(p.markMigrated, true);
});

test('FX-8: invalid old values are not migrated (no weight / no date)', () => {
  const p = planLegacyMigration({ ...base, asyncStart: { date: '2026-09-20' }, metaOpen: { weightKg: 80 } });
  assert.equal(p.openInserts.length, 0);
});

test('FX-9: the current open check is the newest row not stopped; none → no check', () => {
  const rows = [
    { id: 1, start_date: '2026-08-01', start_weight_kg: 90, stopped_at: '2026-08-22T09:00:00Z' },
    { id: 2, start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: null },
  ];
  assert.equal(currentOpenCheck(rows).id, 2);
  assert.equal(currentOpenCheck([rows[0]]), null);
  assert.equal(currentOpenCheck([]), null);
});

test('FX-5 (store): Stop marks the open row stopped and cancels the day-21 and 8 PM reminders', () => {
  const open = { id: 2, remote_id: 'r2', start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: null };
  const plan = stopRealityCheckPlan({ open, nowIso: '2026-09-28T12:00:00.000Z' });
  assert.equal(plan.open, null);
  assert.deepEqual(plan.update, { id: 2, stopped_at: '2026-09-28T12:00:00.000Z' });
  assert.deepEqual([...plan.cancelReminders].sort(), ['food_evening', 'reality_check_day21']);
  assert.equal(plan.mirror, null, 'the user_metadata mirror is written as null');
});

// Review (Gate B) blocking #1/#3: match on start_date only, including STOPPED rows —
// an old copy of a check that was stopped elsewhere never comes back as open.
test('FX-8: an old copy of a check that is already STOPPED in the table is not re-imported', () => {
  const stopped = [{ id: 1, start_date: '2026-09-20', start_weight_kg: 88.40000152587891, stopped_at: '2026-09-27T10:00:00Z' }];
  const p = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: OPEN, existingOpen: stopped });
  assert.equal(p.openInserts.length, 0);
});

test('FX-8: the same check pulled from the cloud with a rounded weight is a match (no duplicate)', () => {
  const pulled = [{ id: 1, start_date: '2026-09-20', start_weight_kg: 88.40000152587891, stopped_at: null }];
  const p = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: OPEN, existingOpen: pulled });
  assert.equal(p.openInserts.length, 0);
});

// Review blocking #2: after the account migrated, a check started on THIS device by
// 1.2.4 (only in its AsyncStorage) is kept when it is newer than everything known —
// a stopped check can never pass that test, and user_metadata is still never read.
test('FX-8: migrated account + a newer check in this device\'s AsyncStorage (started on 1.2.4) → kept, not lost', () => {
  const rows = [{ id: 1, start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: '2026-09-22T10:00:00Z' }];
  const y = { date: '2026-09-25', weightKg: 87.2 };
  const p = planLegacyMigration({ ...base, asyncStart: y, metaOpen: { date: '2026-09-26', weightKg: 1 }, migrated: true, existingOpen: rows });
  assert.equal(p.openInserts.length, 1);
  assert.equal(p.openInserts[0].start_date, '2026-09-25', 'the local copy, never the metadata one');
});

test('FX-8: migrated account + a local copy NOT newer than a stop → not imported (Stop wins)', () => {
  const rows = [{ id: 1, start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: '2026-09-26T10:00:00Z' }];
  const p = planLegacyMigration({ ...base, asyncStart: { date: '2026-09-25', weightKg: 87.2 }, migrated: true, existingOpen: rows });
  assert.equal(p.openInserts.length, 0);
});

// Review non-blocking #4: duplicate open rows resolve the same way on every device
// (created_at, not the per-device local id).
test('FX-9: duplicates of the same start date resolve by created_at, not local id', () => {
  const rows = [
    { id: 9, start_date: '2026-09-20', created_at: '2026-09-20T08:00:00Z', stopped_at: null },
    { id: 2, start_date: '2026-09-20', created_at: '2026-09-21T08:00:00Z', stopped_at: null },
  ];
  assert.equal(currentOpenCheck(rows).id, 2);
});

// Review non-blocking #6: the Stop plan is what production runs, not a test-only object.
test('FX-5: clearRealityStart executes stopRealityCheckPlan — stops the rows AND re-plans both reminders', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'realityCheck.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function clearRealityStart'), src.indexOf('export async function getCalcInputs'));
  assert.match(body, /stopRealityCheckPlan\(/);
  assert.match(body, /stopOpenRealityChecks\(/);
  assert.match(body, /syncRealityCheckReminder\(/);
  assert.match(body, /syncFoodLogReminder\(/);
});

// Re-review #2: a Stop before this account migrated leaves a STOPPED row behind,
// so a later migration (date-only match) can never re-import that check.
test('FX-5: Stop before migration records the legacy check as a stopped row', () => {
  const { stoppedLegacyRow } = require('../lib/realityCheckStore');
  const r = stoppedLegacyRow({ legacy: OPEN, existingOpen: [], userId: 'u1', nowIso: '2026-09-28T12:00:00.000Z' });
  assert.deepEqual(r, { user_id: 'u1', start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: '2026-09-28T12:00:00.000Z' });
  assert.equal(stoppedLegacyRow({ legacy: OPEN, existingOpen: [{ start_date: '2026-09-20' }], userId: 'u1', nowIso: 'x' }), null, 'already known → nothing');
  assert.equal(stoppedLegacyRow({ legacy: null, existingOpen: [], userId: 'u1', nowIso: 'x' }), null);
  const after = planLegacyMigration({ ...base, asyncStart: OPEN, metaOpen: OPEN, existingOpen: [r] });
  assert.equal(after.openInserts.length, 0, 'the stopped check is not re-imported');
});

// Re-review #4: the plan used by clearRealityStart carries the real open row.
test('FX-5: clearRealityStart builds the plan from the current open row (not null)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'realityCheck.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function clearRealityStart'), src.indexOf('export async function getCalcInputs'));
  assert.doesNotMatch(body, /open:\s*null/);
  assert.match(body, /stoppedLegacyRow\(/);
});

// Re-review blocking: the migration skips when the pull did not succeed.
test('FX-8: runRealityMigration returns before planning unless the reality_check_open pull succeeded', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'realityCheck.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function runRealityMigration'), src.indexOf('export async function getRealityStart'));
  const pull = body.indexOf('pullRealityCheckTable(');
  const plan = body.indexOf('planLegacyMigration(');
  assert.ok(pull > 0 && pull < plan, 'pull happens before planning');
  assert.match(body.slice(pull, plan), /if \(!pulled\) return;/);
});

// #024 reply item 1: display gap on a new device / reinstall of a migrated account.
test('display: migrated account, no local rows, no successful pull yet → the mirror is shown (display only)', () => {
  const { displayOpenCheck } = require('../lib/realityCheckStore');
  const mirror = { date: '2026-09-20', weightKg: 88.4 };
  assert.deepEqual(displayOpenCheck({ rows: [], migrated: true, pulledOnce: false, asyncStart: null, metaOpen: mirror }), mirror);
});

test('display: after the first successful pull the TABLE decides (a stopped check is not shown from the mirror)', () => {
  const { displayOpenCheck } = require('../lib/realityCheckStore');
  const mirror = { date: '2026-09-20', weightKg: 88.4 };
  assert.equal(displayOpenCheck({ rows: [], migrated: true, pulledOnce: true, asyncStart: null, metaOpen: mirror }), null);
  const open = [{ id: 1, start_date: '2026-09-25', start_weight_kg: 87.1, stopped_at: null }];
  assert.deepEqual(displayOpenCheck({ rows: open, migrated: true, pulledOnce: true, metaOpen: mirror }), { date: '2026-09-25', weightKg: 87.1 });
});

test('display: not migrated → old storage (local copy first, then metadata); table row wins when present', () => {
  const { displayOpenCheck } = require('../lib/realityCheckStore');
  const a = { date: '2026-09-21', weightKg: 80 };
  const m = { date: '2026-09-20', weightKg: 81 };
  assert.deepEqual(displayOpenCheck({ rows: [], migrated: false, pulledOnce: false, asyncStart: a, metaOpen: m }), a);
  assert.deepEqual(displayOpenCheck({ rows: [], migrated: false, pulledOnce: false, asyncStart: null, metaOpen: m }), m);
});

test('display: getRealityStart uses displayOpenCheck and runRealityMigration records the first successful pull', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'realityCheck.js'), 'utf8');
  const get = src.slice(src.indexOf('export async function getRealityStart'), src.indexOf('export async function setRealityStart'));
  assert.match(get, /displayOpenCheck\(/);
  const mig = src.slice(src.indexOf('export async function runRealityMigration'), src.indexOf('export async function getRealityStart'));
  assert.ok(mig.indexOf('PULLED_KEY') > mig.indexOf('if (!pulled) return;'), 'flag set only after a successful pull');
});

// #025 reply item 2: sign-out clears the per-device S-03 flags, so after a new
// sign-in (local table wiped) the display falls back to the mirror until the
// first successful pull — never "no check" while one is open in the cloud.
test('sign-out: the per-device S-03 flags are selected for removal (all users on this device), nothing else', () => {
  const { rcDeviceFlagKeys } = require('../lib/realityCheckStore');
  const keys = ['dosetrace_rc_pulled_u1', 'dosetrace_rc_store_migrated_u1', 'dosetrace_rc_pulled_u2', 'dosetrace_rc_start', 'dosetrace_theme', 'other'];
  assert.deepEqual(rcDeviceFlagKeys(keys).sort(), ['dosetrace_rc_pulled_u1', 'dosetrace_rc_pulled_u2', 'dosetrace_rc_store_migrated_u1']);
});

test('sign-out: every App.js wipe path that clears RC_START_KEY also clears the S-03 device flags', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const wipes = src.split('AsyncStorage.removeItem(RC_START_KEY)').length - 1;
  const flagClears = src.split('clearRealityDeviceFlags()').length - 1;
  assert.ok(wipes >= 3, 'three wipe paths expected');
  assert.equal(flagClears, wipes, 'one flag clear per wipe path');
});

test('sign-out → sign-in, before the first pull: flags gone → display falls back to the mirror', () => {
  const { displayOpenCheck } = require('../lib/realityCheckStore');
  const mirror = { date: '2026-09-28', weightKg: 86.5 };
  // Cloud flag still says migrated; the local pulled flag was cleared on sign-out; table wiped.
  assert.deepEqual(displayOpenCheck({ rows: [], migrated: true, pulledOnce: false, asyncStart: null, metaOpen: mirror }), mirror);
});
