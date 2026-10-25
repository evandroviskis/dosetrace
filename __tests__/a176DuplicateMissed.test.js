'use strict';
// A-176 (Fold, build 5, 2026-10-23): the same dose slot got two identical "Missed" rows, and a
// slot that WAS taken still got a false Missed. Cause: lib/zoneHistory recordZone appended
// { tz, sinceMs: now } without keeping the history in time order — a zone change while the clock
// was set ahead, then back after the clock was restored, left A@t0, B@future, A@earlier; the
// zone intervals overlapped and every slot in the overlap was built twice. Fix: the history stays
// in time order (and a stored one heals on the next read), the slots are never listed twice, and
// the scan removes the identical app-written Missed copies already written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('../lib/zoneHistory');
const { computeMissedDoses, duplicateMissedRows } = require('../lib/missedDoses');

const SP = 'America/Sao_Paulo';
const BA = 'America/Bahia';
const T0 = Date.parse('2026-10-01T00:00:00Z');
const AHEAD = Date.parse('2026-10-30T00:00:00Z');
const BACK = Date.parse('2026-10-21T00:00:00Z');
const NOW = Date.parse('2026-10-23T18:36:00Z');
const P = { id: 1, user_id: 'u', created_at: '2026-10-01T00:00:00Z', frequency: 'daily', interval_days: 1, doses_per_day: 1, reminder_time: '15:00', start_date: '2026-10-01', active: 1 };
const iso = (ms) => new Date(ms).toISOString();

// What the old recordZone produced (kept literal so the bug stays reproducible).
const CORRUPT = [{ tz: SP, sinceMs: T0 }, { tz: BA, sinceMs: AHEAD }, { tz: SP, sinceMs: BACK }];

test('A-176: recordZone keeps the history in time order when the clock went back', () => {
  let h = [{ tz: SP, sinceMs: T0 }];
  h = H.recordZone(h, BA, AHEAD); // clock set ahead, zone changed
  h = H.recordZone(h, SP, BACK); // clock restored, zone back
  for (let i = 1; i < h.length; i++) assert.ok(h[i].sinceMs > h[i - 1].sinceMs, JSON.stringify(h));
  assert.equal(H.zoneAt(h, NOW), SP);
});

test('A-176: a stored out-of-order history heals on the next read (seedHistory)', () => {
  const h = H.seedHistory({ stored: CORRUPT, currentTz: SP, nowMs: NOW });
  for (let i = 1; i < h.length; i++) assert.ok(h[i].sinceMs > h[i - 1].sinceMs, JSON.stringify(h));
  assert.equal(H.zoneAt(h, NOW), SP);
});

test('A-176: even with an out-of-order history each slot is judged once (no duplicate Missed)', () => {
  const out = computeMissedDoses([P], [], NOW, 0, { lookbackDays: 3, zoneHistory: CORRUPT }).map((o) => iso(o.scheduledAtMs));
  assert.deepEqual(out, [...new Set(out)], 'no slot twice');
  assert.deepEqual(out, ['2026-10-20T18:00:00.000Z', '2026-10-21T18:00:00.000Z', '2026-10-22T18:00:00.000Z']);
});

test('A-176: a taken slot never gets a Missed row, whatever the history', () => {
  const taken = [{ protocol_id: 1, logged_at: '2026-10-22T18:05:00Z', outcome: 'Taken' }];
  const out = computeMissedDoses([P], taken, NOW, 0, { lookbackDays: 3, zoneHistory: CORRUPT }).map((o) => iso(o.scheduledAtMs));
  assert.ok(!out.includes('2026-10-22T18:00:00.000Z'), out.join(', '));
});

test('A-176: duplicateMissedRows picks the extra identical app-written Missed copies, never an edited row', () => {
  const at = '2026-10-22T18:00:00.000Z';
  const rows = [
    { id: 10, protocol_id: 1, outcome: 'Missed', logged_at: at, injection_site: null, remote_id: 'r10' },
    { id: 11, protocol_id: 1, outcome: 'Missed', logged_at: at, injection_site: null, remote_id: 'r11' },
    { id: 12, protocol_id: 1, outcome: 'Missed', logged_at: '2026-10-22T18:00:00Z', injection_site: null },
    { id: 20, protocol_id: 2, outcome: 'Missed', logged_at: at, injection_site: null },
    { id: 30, protocol_id: 3, outcome: 'Missed', logged_at: at, injection_site: null },
    { id: 31, protocol_id: 3, outcome: 'Missed', logged_at: at, injection_site: '{"type":"subq","sites":["abdomen_ul"]}' },
    { id: 40, protocol_id: 4, outcome: 'Taken', logged_at: at, injection_site: null },
    { id: 41, protocol_id: 4, outcome: 'Taken', logged_at: at, injection_site: null },
  ];
  const PROTOS = [1, 2, 3, 4].map((id) => ({ ...P, id }));
  const gone = duplicateMissedRows(rows, PROTOS).map((r) => r.id).sort((a, b) => a - b);
  // protocol 1: one kept (the lowest id), the two copies go (the same instant written two ways counts as one slot)
  // protocol 2: alone, kept; protocol 3: the edited copy (a site) is kept, the plain one goes
  // protocol 4: Taken rows are the user's, never touched
  assert.deepEqual(gone, [11, 12, 30]);
  assert.deepEqual(duplicateMissedRows([], PROTOS), []);
  assert.deepEqual(duplicateMissedRows(rows), [], "no protocol list → nothing is touched");
});

test('A-176: the scan removes the duplicate copies before judging (lib/doseActions scanMissedDoses)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'doseActions.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function scanMissedDoses'));
  assert.match(body, /duplicateMissedRows\(/);
  assert.ok(body.indexOf('duplicateMissedRows(') < body.indexOf('coveredMissedRows('), 'duplicates first');
});

test('A-176 Gate B 1: rows with no local protocol are grouped by the cloud protocol id, never lumped together', () => {
  const at = '2026-10-22T18:00:00.000Z';
  const rows = [
    { id: 1, protocol_id: null, protocol_remote_id: 'pA', outcome: 'Missed', logged_at: at, remote_id: 'r1' },
    { id: 2, protocol_id: null, protocol_remote_id: 'pB', outcome: 'Missed', logged_at: at, remote_id: 'r2' },
    { id: 3, protocol_id: null, protocol_remote_id: null, outcome: 'Missed', logged_at: at },
    { id: 4, protocol_id: null, protocol_remote_id: null, outcome: 'Missed', logged_at: at },
  ];
  assert.deepEqual(duplicateMissedRows(rows, [{ ...P, id: 8, remote_id: 'pA' }, { ...P, id: 9, remote_id: 'pB' }]), [], 'two protocols at the same time are two slots; unknown protocol → untouched');
});

test('A-176 Gate B 2: every phone keeps the same copy (synced first, then the smallest cloud id), whatever its local ids', () => {
  const at = '2026-10-22T18:00:00.000Z';
  const phoneA = [
    { id: 5, protocol_id: 1, protocol_remote_id: 'p1', outcome: 'Missed', logged_at: at, remote_id: 'rB' },
    { id: 6, protocol_id: 1, protocol_remote_id: 'p1', outcome: 'Missed', logged_at: at, remote_id: 'rA' },
  ];
  const phoneB = [
    { id: 9, protocol_id: 7, protocol_remote_id: 'p1', outcome: 'Missed', logged_at: at, remote_id: 'rA' },
    { id: 10, protocol_id: 7, protocol_remote_id: 'p1', outcome: 'Missed', logged_at: at, remote_id: 'rB' },
  ];
  assert.deepEqual(duplicateMissedRows(phoneA, [{ ...P, id: 1, remote_id: 'p1' }]).map((r) => r.remote_id), ['rB']);
  assert.deepEqual(duplicateMissedRows(phoneB, [{ ...P, id: 7, remote_id: 'p1' }]).map((r) => r.remote_id), ['rB']);
  const mixed = [
    { id: 1, protocol_id: 1, outcome: 'Missed', logged_at: at },
    { id: 2, protocol_id: 1, outcome: 'Missed', logged_at: at, remote_id: 'rZ' },
  ];
  assert.deepEqual(duplicateMissedRows(mixed, [{ ...P, id: 1 }]).map((r) => r.id), [1], 'the synced copy stays, the pending one goes');
});

test('A-176 Gate B 3: an ordinary travel history is unchanged; a clock put back before the only entry keeps one entry', () => {
  const t1 = T0 + 5 * 86400000;
  const t2 = T0 + 9 * 86400000;
  let h = [{ tz: SP, sinceMs: T0 }];
  h = H.recordZone(h, BA, t1);
  h = H.recordZone(h, SP, t2);
  assert.deepEqual(h, [{ tz: SP, sinceMs: T0 }, { tz: BA, sinceMs: t1 }, { tz: SP, sinceMs: t2 }]);
  assert.deepEqual(H.recordZone(h, SP, t2 + 1000), h, 'same zone later: nothing changes');
  const back = H.recordZone([{ tz: SP, sinceMs: T0 }], BA, T0 - 86400000);
  assert.deepEqual(back, [{ tz: BA, sinceMs: T0 - 86400000 }]);
});

test('A-176 council: a protocol with the same dose time twice keeps both slots and both Missed rows', () => {
  const TWICE = { ...P, doses_per_day: 2, reminder_time: '15:00,15:00' };
  const out = computeMissedDoses([TWICE], [], NOW, 0, { lookbackDays: 3, zoneHistory: CORRUPT }).map((o) => iso(o.scheduledAtMs));
  assert.equal(out.length, 6, out.join(', '));
  const at = '2026-10-22T18:00:00.000Z';
  const rows = [
    { id: 1, protocol_id: 1, outcome: 'Missed', logged_at: at, remote_id: 'a' },
    { id: 2, protocol_id: 1, outcome: 'Missed', logged_at: at, remote_id: 'b' },
  ];
  assert.deepEqual(duplicateMissedRows(rows, [TWICE]), [], 'two real doses at one time are not copies');
});

test('A-176 council: two copies are one slot even when only one carries the cloud protocol id', () => {
  const at = '2026-10-22T18:00:00.000Z';
  const rows = [
    { id: 1, protocol_id: 1, protocol_remote_id: 'p1', outcome: 'Missed', logged_at: at, remote_id: 'a' },
    { id: 2, protocol_id: 1, protocol_remote_id: null, outcome: 'Missed', logged_at: at },
  ];
  assert.deepEqual(duplicateMissedRows(rows, [{ ...P, id: 1, remote_id: 'p1' }]).map((r) => r.id), [2]);
});

test('A-176 council: the scan passes the protocols to the cleanup', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'doseActions.js'), 'utf8');
  assert.match(src, /duplicateMissedRows\(logs, \[\.\.\.protocols, \.\.\.ended\]\)/);
});
