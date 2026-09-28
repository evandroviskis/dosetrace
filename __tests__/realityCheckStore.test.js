'use strict';
// S-03 (FX-8 migration, FX-9 sync + Stop-wins) — docs/specs/fixes-1.2.5.md.
// Written BEFORE the store exists: todo (red) until S-03 builds lib/realityCheckStore.js.
// The planners are pure (no RN/Expo imports), so the migration can be proven offline
// and idempotent here; the caller commits the planned rows to local SQLite and only
// then clears the old storage.
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => require('../lib/realityCheckStore');
const TODO = { todo: 'S-03 (synced reality-check storage) — 1.2.5' };

const OPEN = { date: '2026-09-20', weightKg: 88.4 };
const INPUTS = { unit: 'metric', weight: '88.4', bfSource: 'known', bodyFat: '21', sex: 'male', age: '41', height: '181', activity: 1.55, goal: 'lose', waist: '94' };

test('FX-8: old storage (AsyncStorage start + user_metadata open check + calc_inputs) → every value planned into the new tables', TODO, () => {
  const { planLegacyMigration } = load();
  const p = planLegacyMigration({ asyncStart: OPEN, metaOpen: OPEN, metaInputs: INPUTS, existingOpen: [], existingInputs: null, userId: 'u1' });
  assert.equal(p.openInserts.length, 1);
  assert.equal(p.openInserts[0].start_date, '2026-09-20');
  assert.equal(p.openInserts[0].start_weight_kg, 88.4);
  assert.equal(p.openInserts[0].stopped_at, null);
  assert.deepEqual(JSON.parse(p.inputsUpsert.payload), INPUTS, 'calc inputs arrive unchanged');
  assert.equal(p.clearLegacyAfterCommit, true, 'old storage is cleared only after the rows are committed');
});

test('FX-8: idempotent — running the migration again plans nothing new and loses nothing', TODO, () => {
  const { planLegacyMigration } = load();
  const first = planLegacyMigration({ asyncStart: OPEN, metaOpen: OPEN, metaInputs: INPUTS, existingOpen: [], existingInputs: null, userId: 'u1' });
  const committedOpen = first.openInserts.map((r, i) => ({ id: i + 1, ...r }));
  const committedInputs = { id: 1, ...first.inputsUpsert };
  const again = planLegacyMigration({ asyncStart: OPEN, metaOpen: OPEN, metaInputs: INPUTS, existingOpen: committedOpen, existingInputs: committedInputs, userId: 'u1' });
  assert.equal(again.openInserts.length, 0);
  assert.equal(again.inputsUpsert, null);
});

test('FX-8: local and cloud copies disagree (offline write never reached the cloud) → the local AsyncStorage start wins, nothing dropped silently', TODO, () => {
  const { planLegacyMigration } = load();
  const newer = { date: '2026-09-25', weightKg: 87.9 };
  const p = planLegacyMigration({ asyncStart: newer, metaOpen: OPEN, metaInputs: null, existingOpen: [], existingInputs: null, userId: 'u1' });
  assert.equal(p.openInserts.length, 1);
  assert.equal(p.openInserts[0].start_date, '2026-09-25');
  assert.equal(p.inputsUpsert, null, 'no inputs saved → nothing invented');
});

test('FX-8: nothing in old storage → plans nothing and does not clear anything', TODO, () => {
  const { planLegacyMigration } = load();
  const p = planLegacyMigration({ asyncStart: null, metaOpen: null, metaInputs: null, existingOpen: [], existingInputs: null, userId: 'u1' });
  assert.equal(p.openInserts.length, 0);
  assert.equal(p.inputsUpsert, null);
  assert.equal(p.clearLegacyAfterCommit, false);
});

test('FX-9: Stop wins — a stopped check never reopens when the other device (offline) still has it open', TODO, () => {
  const { mergeOpenCheck } = load();
  const stoppedHere = { remote_id: 'r1', start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: '2026-09-27T10:00:00Z', updated_at: '2026-09-27T10:00:00Z' };
  const stillOpenThere = { remote_id: 'r1', start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: null, updated_at: '2026-09-27T11:00:00Z' };
  assert.ok(mergeOpenCheck(stoppedHere, stillOpenThere).stopped_at, 'later open edit does not undo the stop');
  assert.ok(mergeOpenCheck(stillOpenThere, stoppedHere).stopped_at, 'order does not matter');
});

test('FX-9: the current open check is the newest row not stopped; none → no check', TODO, () => {
  const { currentOpenCheck } = load();
  const rows = [
    { id: 1, start_date: '2026-08-01', start_weight_kg: 90, stopped_at: '2026-08-22T09:00:00Z' },
    { id: 2, start_date: '2026-09-20', start_weight_kg: 88.4, stopped_at: null },
  ];
  assert.equal(currentOpenCheck(rows).id, 2);
  assert.equal(currentOpenCheck([rows[0]]), null);
});
