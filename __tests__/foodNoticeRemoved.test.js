'use strict';
// A-133 (7) — store capture 2026-10-16 (iOS sim): after "Fix this entry -> Remove entry" in the
// food chat, the transient "Updated — …" bubble for that row stayed on screen with 0 rows left.
// Cause: the notice was screen state with no link to its row, so removing the row never cleared
// it. Fix: an "Updated" notice carries the ids of the rows it reports; liveNotice drops it when
// any of them is gone from the thread's rows (deleted, removed, or removed on another device).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildThread, withNotice, liveNotice } = require('../lib/foodThread');

const T = '2026-10-16';
const iso = new Date(2026, 9, 16, 9).toISOString();
const row = { id: 3, source: 'ai', parse_status: 'done', sync_status: 'synced', raw_text: 'açaí', entry_date: T, created_at: iso, parsed_items: JSON.stringify([{ food: 'açaí', qty: 1, unit: 'porção pequena', kcal: 250, msg: 'm1' }]) };
const updated = { kind: 'updated', text: '1 porção pequena de açaí · ~250 kcal', rowIds: [3] };

test('A-133: the Updated notice shows while its row is there', () => {
  assert.equal(liveNotice(updated, [row]), updated);
});

test('A-133: the Updated notice goes when its row is removed', () => {
  assert.equal(liveNotice(updated, []), null, 'row removed (the chat reloads without it)');
  assert.equal(liveNotice(updated, [{ ...row, sync_status: 'deleted' }]), null, 'row marked deleted');
  assert.equal(liveNotice(updated, [{ ...row, id: 4 }]), null, 'another row only');
  const th = withNotice(buildThread([], { todayISO: T }), liveNotice(updated, []));
  assert.ok(!th.some((x) => x.type === 'notice'), 'no stale bubble in the thread');
});

test('A-133: a notice about several rows goes when any of them is removed', () => {
  const two = { ...updated, rowIds: [3, 5] };
  assert.equal(liveNotice(two, [row, { ...row, id: 5 }]), two);
  assert.equal(liveNotice(two, [row]), null);
});

test('A-133: a notice with no rows (deflect, fix, offline…) is kept; no notice is null', () => {
  const fix = { kind: 'fix' };
  assert.equal(liveNotice(fix, []), fix);
  assert.equal(liveNotice({ kind: 'updated', text: 'x', rowIds: [] }, []).kind, 'updated');
  assert.equal(liveNotice(null, [row]), null);
});

test('A-133: the chat links each Updated notice to its rows and filters it by the live rows', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'FoodChatScreen.js'), 'utf8');
  assert.match(src, /withNotice\(th, liveNotice\(/);
  const updates = src.match(/setNotice\(\{ kind: 'updated'[^)]*\}\)/g) || [];
  assert.ok(updates.length >= 3, 'all Updated notices found');
  for (const u of updates) assert.match(u, /rowIds/, 'carries rowIds: ' + u);
  const actions = fs.readFileSync(path.join(__dirname, '..', 'lib', 'foodLogActions.js'), 'utf8');
  assert.match(actions, /return \{ changed, updatedItems, updatedRowIds \}/, 'catch-up reports which rows it updated');
});
