'use strict';
// Pre-build pass 2026-10-03, M2: the adherence report (Settings → Adherence report, sent to
// health providers) counted each protocol as taken ÷ (taken + skipped) and ignored Missed doses:
// Test03 read "Overall 43%" while every protocol read 100%. One definition everywhere:
// complete ÷ (complete + skipped + missed) over the scheduled doses of the period, per protocol
// and overall (overall = the sum of the protocols listed). Missed = the app's own Missed rows
// (the scanner that feeds Today and the Dose log), never a Missed for a slot before the
// protocol existed (created_at − 1 h, F-MISS-1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HOUR = 3600000;
const iso = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0, 0, 0).toISOString();
const NOW = new Date(2026, 9, 3, 12, 0).getTime();
const SINCE = NOW - 30 * 24 * HOUR;

function fixture() {
  const protocols = [
    { id: 1, name: 'BPC-157', created_at: iso(2026, 9, 1, 8) },
    { id: 2, name: 'Zinc', created_at: iso(2026, 9, 25, 8) },
  ];
  const logs = [
    // BPC-157: 4 complete, 1 skipped, 5 missed
    ...[20, 21, 22, 23].map((d) => ({ protocol_id: 1, outcome: 'Taken', logged_at: iso(2026, 9, d) })),
    { protocol_id: 1, outcome: 'Skipped', logged_at: iso(2026, 9, 24) },
    ...[25, 26, 27, 28, 29].map((d) => ({ protocol_id: 1, outcome: 'Missed', logged_at: iso(2026, 9, d) })),
    // Zinc: 2 complete, 2 missed, plus 3 false Missed rows from before it existed
    { protocol_id: 2, outcome: 'Taken', logged_at: iso(2026, 9, 26) },
    { protocol_id: 2, outcome: 'Taken', logged_at: iso(2026, 9, 27) },
    { protocol_id: 2, outcome: 'Missed', logged_at: iso(2026, 9, 28) },
    { protocol_id: 2, outcome: 'Missed', logged_at: iso(2026, 9, 29) },
    ...[20, 21, 22].map((d) => ({ protocol_id: 2, outcome: 'Missed', logged_at: iso(2026, 9, d) })),
    // outside the period, and a deleted protocol's row: never counted
    { protocol_id: 1, outcome: 'Taken', logged_at: iso(2026, 8, 1) },
    { protocol_id: 99, outcome: 'Taken', logged_at: iso(2026, 9, 28) },
  ];
  return { protocols, logs };
}

test('per protocol: complete ÷ (complete + skipped + missed), missed included', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const r = adherenceStats({ ...fixture(), sinceMs: SINCE, nowMs: NOW });
  const bpc = r.perProtocol.find((p) => p.id === 1);
  assert.deepEqual({ taken: bpc.taken, skipped: bpc.skipped, missed: bpc.missed, adherence: bpc.adherence }, { taken: 4, skipped: 1, missed: 5, adherence: 40 });
  const zinc = r.perProtocol.find((p) => p.id === 2);
  assert.deepEqual({ taken: zinc.taken, skipped: zinc.skipped, missed: zinc.missed, adherence: zinc.adherence }, { taken: 2, skipped: 0, missed: 2, adherence: 50 });
});

test('no Missed counted before the protocol existed (created_at − 1 h)', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const r = adherenceStats({ ...fixture(), sinceMs: SINCE, nowMs: NOW });
  assert.equal(r.perProtocol.find((p) => p.id === 2).missed, 2);
});

test('overall uses the same definition and the same protocols (sum of the rows above)', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const r = adherenceStats({ ...fixture(), sinceMs: SINCE, nowMs: NOW });
  assert.deepEqual(r.overall, { taken: 6, skipped: 1, missed: 7, total: 14, adherence: 43 });
  const sum = r.perProtocol.reduce((a, p) => a + p.taken + p.skipped + p.missed, 0);
  assert.equal(sum, r.overall.total);
});

test('a protocol with nothing due in the period has no percentage (never a made-up 0 % or 100 %)', () => {
  const { adherenceStats } = require('../lib/adherenceReport');
  const r = adherenceStats({ protocols: [{ id: 5, created_at: iso(2026, 10, 3, 8) }], logs: [], sinceMs: SINCE, nowMs: NOW });
  assert.equal(r.perProtocol[0].adherence, null);
  assert.equal(r.overall.adherence, null);
});

test('the Settings report uses lib/adherenceReport, scans for missed doses first and prints the Missed count', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/SettingsScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function handleAdherenceReport'), src.indexOf('async function handleSignOut'));
  assert.match(fn, /adherenceStats\(/);
  assert.match(fn, /await scanMissedDoses\(\)/);
  assert.doesNotMatch(fn, /taken \/ total/, 'the old taken ÷ (taken + skipped) formula is gone');
  assert.match(fn, /\{missed\}/);
});

test('the report line names Missed in six languages', () => {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  const tr = mod.exports.translations;
  const want = { en: 'Missed', es: 'Perdidas', pt: 'Perdidas', fr: 'Manquées', de: 'Verpasst', it: 'Mancate' };
  for (const [l, w] of Object.entries(want)) {
    const line = tr[l].report_outcome_line;
    assert.ok(line.includes(`${w}`) && line.includes('{missed}'), `${l}: ${line}`);
    assert.ok(line.includes('{taken}') && line.includes('{skipped}') && line.includes('{percent}'), l);
  }
});
