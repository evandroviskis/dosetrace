// DV-031 / DL-05 (decided 2026-10-12, "the Missed scan covers ended protocols up to their end": ended
// protocols keep their history, A-83, and the rings already count them). Parked-error sweep 2026-10-31:
// scanMissedDoses still wrote Missed rows for ACTIVE protocols only, so a slot missed before an end showed
// as missed in the rings but never in the Dose log or the provider report.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { computeMissedDoses } = require('../lib/missedDoses');

test('DV-031: the scan hands the ended protocols to computeMissedDoses and can write their rows', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/doseActions.js'), 'utf8');
  const scan = src.slice(src.indexOf('export async function scanMissedDoses('), src.indexOf('export async function scanMissedDoses(') + 6000);
  assert.match(scan, /const scanned = \[\.\.\.protocols, \.\.\.ended\];/);
  assert.match(scan, /computeMissedDoses\(scanned, kept, nowMs, sinceMs/);
  assert.match(scan, /for \(const p of scanned\) byId\[p\.id\] = p;/);
});

test('DV-031: computeMissedDoses stops an ended protocol at its end', () => {
  const day = 86400000;
  const now = new Date(2026, 9, 31, 12).getTime();
  const p = { id: 1, user_id: 'u', name: 'X', interval_days: 1, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-10-20',
    created_at: new Date(2026, 9, 20, 8).toISOString(), active: 0, ended_at: new Date(2026, 9, 28, 20).toISOString() };
  const out = computeMissedDoses([p], [], now, now - 10 * day, { lookbackDays: 14, pulledThroughMs: now });
  assert.ok(out.length > 0, 'the slots before the end are owed');
  assert.ok(out.every((m) => m.scheduledAtMs < Date.parse(p.ended_at)), 'none after the end');
});
