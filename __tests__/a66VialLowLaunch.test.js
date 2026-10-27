'use strict';
// A-66 (simulator 2026-10-01, BPC-157 / TB-500): "Vial running low" fired on every app launch.
// The every-launch repeat was the sync re-sending an immediate notification for every low vial
// each time it ran; m10 (2026-10-03) added a sent map on the device, keyed by the LOCAL vial id.
// What still re-fired or never re-armed (this file drives the REAL syncVialAlerts, launch after
// launch, with one AsyncStorage that outlives every launch):
//   1. a re-import of the same account (sign out / in, the new-device sign-in of A-119) gives every
//      vial a new local id (AUTOINCREMENT), so every low vial was announced again;
//   2. a sync that runs while the vials are not imported yet (empty list) forgot every vial;
//   3. an unreadable sent map was treated as "nothing sent" and every low vial was announced;
//   4. a vial started again on the same row (refillVial: doses_taken 0, DV-199) never announced
//      its next crossing. Once per vial per crossing: a full vial re-arms, an Undo does not (m10).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');
const plan = require('../lib/notificationPlan');
const { supplyState } = require('../lib/supplyLow');

const USER = { id: 'u1', user_metadata: {} };
// Every other day (2026-10-27: low = 7 days of use or the last dose): 3 left = 6 days = low, 4 left = 8 days
// = not — the same crossings these announcement tests were written around.
const PROTOCOLS = [{ id: 1, name: 'BPC-157', type: 'recon', interval_days: 2 }, { id: 2, name: 'TB-500', type: 'recon', interval_days: 2 }];

function storage() {
  const m = new Map();
  return { m, failRead: false, async getItem(k) { if (this.failRead) throw new Error('unreadable'); return m.has(k) ? m.get(k) : null; }, async setItem(k, v) { m.set(k, v); }, async removeItem(k) { m.delete(k); } };
}
function fakeN() {
  return { sent: [], async getAllScheduledNotificationsAsync() { return []; }, async cancelScheduledNotificationAsync() {}, async scheduleNotificationAsync(req) { if (req.trigger === null) this.sent.push(req.content.data.vialId); return req.identifier; } };
}
const t = Object.assign((k) => k, { language: 'en' });

// One app launch: the real syncVialAlerts over this launch's vial rows.
function launch(AS, vials) {
  const N = fakeN();
  const fn = loadFn('lib/notifications.js', 'export async function syncVialAlerts(', 'syncVialAlerts', {
    getNotifications: () => N, getCachedUser: async () => USER, cancelByPrefix: async () => {}, restoreSnoozes: async () => {},
    getT: async () => t, getActiveVials: () => vials, loadSnoozes: async () => [], showNamesInNotifications: async () => true,
    getActiveProtocols: () => PROTOCOLS, protocolDisplayName: (p) => p.name, supplyState, _background: false,
    AsyncStorage: AS, VIAL_LOW_SENT_KEY: 'dosetrace_vial_low_sent', vialLowToSend: plan.vialLowToSend,
    fill: (s) => s, isOne: (n) => n === 1, scheduleReq: (n, req) => n.scheduleNotificationAsync(req), Platform: { OS: 'ios' },
    capExpiryAlerts: () => [], vialExpiryPlan: () => [], pluralKey: (k) => k, cancelUnwanted: async () => {},
  });
  return fn().then(() => N.sent);
}
// total 10 doses: 7 taken = 3 left = low.
const vial = (id, remote, taken, extra = {}) => ({ id, remote_id: remote, user_id: 'u1', protocol_id: id === 7 || id === 17 ? 1 : 2, total_doses: 10, doses_taken: taken, active: 1, ...extra });

test('A-66: a low vial is announced on the first launch and never on the next ones', async () => {
  const AS = storage();
  const rows = [vial(7, 'r-bpc', 7), vial(8, 'r-tb', 8)];
  assert.deepEqual(await launch(AS, rows), [7, 8]);
  for (let i = 0; i < 4; i++) assert.deepEqual(await launch(AS, rows), [], `launch ${i + 2}`);
});

test('A-66: the same account imported again (new local ids, same cloud ids) announces nothing new', async () => {
  const AS = storage();
  await launch(AS, [vial(7, 'r-bpc', 7), vial(8, 'r-tb', 8)]);
  // Sign out / sign in: clearLocalDatabase, then the import writes the rows with new local ids.
  assert.deepEqual(await launch(AS, [vial(17, 'r-bpc', 7), vial(18, 'r-tb', 8)]), []);
  assert.deepEqual(await launch(AS, [vial(17, 'r-bpc', 7), vial(18, 'r-tb', 8)]), []);
});

test('A-66: a sync that runs before the vials are imported again forgets nothing', async () => {
  const AS = storage();
  await launch(AS, [vial(7, 'r-bpc', 7), vial(8, 'r-tb', 8)]);
  assert.deepEqual(await launch(AS, []), [], 'empty database for a moment');
  assert.deepEqual(await launch(AS, [vial(17, 'r-bpc', 7)]), [], 'half imported');
  assert.deepEqual(await launch(AS, [vial(17, 'r-bpc', 7), vial(18, 'r-tb', 8)]), []);
});

test('A-66: a vial announced before it had a cloud id is not announced again once it has one', async () => {
  const AS = storage();
  assert.deepEqual(await launch(AS, [vial(7, null, 7)]), [7]);
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7)]), [], 'pushed: remote id now known');
  assert.deepEqual(await launch(AS, [vial(17, 'r-bpc', 7)]), [], 're-imported under the cloud id');
});

test('A-66: an unreadable sent map sends nothing and keeps what was there (the alert stays owed)', async () => {
  const AS = storage();
  await launch(AS, [vial(7, 'r-bpc', 7)]);
  const before = AS.m.get('dosetrace_vial_low_sent');
  AS.failRead = true;
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7), vial(8, 'r-tb', 8)]), []);
  assert.equal(AS.m.get('dosetrace_vial_low_sent'), before, 'nothing overwritten');
  AS.failRead = false;
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7), vial(8, 'r-tb', 8)]), [8], 'owed one sent on the next readable run');
});

test('A-66: Undo above the line and the dose again: still one announcement (m10)', async () => {
  const AS = storage();
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7)]), [7]);
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 6)]), [], '4 left after Undo');
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7)]), [], '3 left again');
});

test('A-66 / DV-199: a vial started again on the same row announces its next crossing once', async () => {
  const AS = storage();
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7)]), [7]);
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 0)]), [], 'refilled: full, not low');
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 4)]), []);
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7)]), [7], 'low again: announced once');
  assert.deepEqual(await launch(AS, [vial(7, 'r-bpc', 7)]), []);
});

test('A-66: a vial that is low from its first dose (3-dose vial) is not re-armed by being full', async () => {
  const AS = storage();
  const small = (taken) => vial(7, 'r-bpc', taken, { total_doses: 3 });
  assert.deepEqual(await launch(AS, [small(0)]), [7], '3 of 3 left is low');
  assert.deepEqual(await launch(AS, [small(0)]), [], 'never every launch');
});
