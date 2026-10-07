'use strict';
// A-45 (founder 2026-09-28, target 1.2.6 → 1.3.0): a vial EXPIRY notification behind the
// existing "Vial expiry alerts" switch (user_metadata.vial_alerts), so its copy becomes true.
// Lead time = the app's own in-app rule (Today flags a vial within 7 days, VIAL_EXPIRY_SOON_DAYS):
// one reminder 7 days before and one on the expiry day, at 09:00, with Today's own words
// ("{name} — {n} days left" / "{name} — expired"; date statements only, no advice). Only the
// NEXT future reminder of each vial is pending at a time, so the expiry alerts can never crowd
// iOS's 64 pending notifications (at most one per active vial). Recon: mix date + the
// protocol's validity window; ready to use: the box date. The tap opens the vial's protocol.
// The founder still eyeballs the lead time and the words (registry: "needs founder approval").
const test = require('node:test');
const assert = require('node:assert/strict');
const { vialExpiryPlan, notifTapTarget } = require('../lib/notificationPlan');
const { read } = require('./helpers/extractFn');

const at = (d, h = 9) => new Date(2026, 9, d, h, 0, 0, 0).getTime();
const recon = { id: 1, type: 'recon', vial_valid_days: 30 };
const rtu = { id: 2, type: 'rtu' };

test('recon: 7 days before at 09:00, then the expiry day; only the next one is planned', () => {
  // mixed 2026-09-20 + 30 days → expires 2026-10-20
  const v = { id: 7, protocol_id: 1, mixed_on: '2026-09-20' };
  const p1 = vialExpiryPlan({ vials: [v], protocolsById: { 1: recon }, nowMs: at(3, 12) });
  assert.deepEqual(p1, [{ id: 'vial-exp-7-7', vialId: 7, protocolId: 1, fireAtMs: at(13), daysLeft: 7 }]);
  const p2 = vialExpiryPlan({ vials: [v], protocolsById: { 1: recon }, nowMs: at(14, 8) });
  assert.deepEqual(p2, [{ id: 'vial-exp-7-0', vialId: 7, protocolId: 1, fireAtMs: at(20), daysLeft: 0 }]);
  assert.deepEqual(vialExpiryPlan({ vials: [v], protocolsById: { 1: recon }, nowMs: at(20, 10) }), [], 'both passed: nothing pending');
});

test('ready to use: the box date; no date or no protocol → nothing', () => {
  const v = { id: 8, protocol_id: 2, expires_on: '2026-10-31' };
  const p = vialExpiryPlan({ vials: [v], protocolsById: { 2: rtu }, nowMs: at(3) });
  assert.equal(p[0].fireAtMs, at(24));
  assert.deepEqual(vialExpiryPlan({ vials: [{ id: 9, protocol_id: 2 }], protocolsById: { 2: rtu }, nowMs: at(3) }), []);
  assert.deepEqual(vialExpiryPlan({ vials: [v], protocolsById: {}, nowMs: at(3) }), []);
});

test('never more than one pending expiry reminder per vial (the 64-slot budget)', () => {
  const vials = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, protocol_id: 1, mixed_on: '2026-09-20' }));
  const plan = vialExpiryPlan({ vials, protocolsById: { 1: recon }, nowMs: at(3) });
  assert.equal(plan.length, 5);
});

test('scheduled behind the vial alerts switch with Today\'s words; the tap opens the protocol', () => {
  const src = read('lib/notifications.js');
  const fn = src.slice(src.indexOf('export async function syncVialAlerts'), src.indexOf('// ── CHECK-IN REMINDERS'));
  assert.match(fn, /vialExpiryPlan\(/);
  assert.match(fn, /type: 'vial_expiry'/);
  assert.match(fn, /today_alert_vial_expired_one/);
  assert.match(fn, /today_alert_vial_expiry_one/);
  // A-109: switching it off also cancels the vial alerts already scheduled.
  assert.match(fn, /if \(user\.user_metadata\?\.vial_alerts === false\) \{ await cancelByPrefix\(N, 'vial-'\); return; \}/);
  const t = notifTapTarget({ actionIdentifier: 'x', notification: { request: { content: { data: { type: 'vial_expiry', vialId: 7, protocolId: 1 } } } } }, 1);
  assert.deepEqual(t.params, { screen: 'Protocols', params: { openProtocolId: 1 } });
});
