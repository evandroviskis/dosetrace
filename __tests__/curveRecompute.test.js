'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-16, R8): the curve is a pure function of (protocols,
// versions, logs, now): deterministic; a Missed → Taken flip changes the level on the next compute; the
// Curve screen and the Journey tile read the Dose log again on focus and after a sync (the device check
// of the same is owed — this file proves the code path).
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const p = { id: 21, type: 'recon', name: 'Testosterone Enanthate', compound_id: null, dose: '30', dose_unit: 'mg', interval_days: 2, doses_per_day: 1, reminder_time: '07:30', start_date: '2026-10-10', created_at: iso(at(10, 6)) };
const e = H.getHalfLifeEntry('Testosterone Enanthate');
const NOW = at(24, 18);
const rows = (flip) => [10, 12, 14, 16, 18, 20, 22, 24].map((d, i) => ({ id: i + 1, protocol_id: 21, outcome: d === 16 ? flip : 'Taken', logged_at: iso(at(d, 7, 40)), sync_status: 'synced' }));

test('PK-16: deterministic — the same input gives the same doses and the same level, the same frozen list', () => {
  const a = M.curvePlan(p, e, M.curveGridStart(NOW, 3), NOW + 7 * 864e5, NOW, { logs: rows('Missed') });
  const b = M.curvePlan(p, e, M.curveGridStart(NOW, 3), NOW + 7 * 864e5, NOW, { logs: rows('Missed') });
  assert.equal(a.doses, b.doses, 'the same frozen list comes back (carried sums kept, ENG-1)');
  assert.equal(M.estimatedLevelNow(p, NOW, { logs: rows('Missed') }).value, M.estimatedLevelNow(p, NOW, { logs: rows('Missed') }).value);
  // The input logs are never changed.
  const logs = rows('Missed');
  const before = JSON.stringify(logs);
  M.curvePlan(p, e, M.curveGridStart(NOW, 3), NOW, NOW, { logs });
  assert.equal(JSON.stringify(logs), before);
});

test('PK-16: a Missed → Taken flip changes the level on the next compute', () => {
  const missed = M.estimatedLevelNow(p, NOW, { logs: rows('Missed') }).value;
  const taken = M.estimatedLevelNow(p, NOW, { logs: rows('Taken') }).value;
  const delta = 30 * H.amountFraction(e, (NOW - at(16, 7, 40)) / 3600000);
  assert.ok(Math.abs(taken - missed - delta) < 1e-9, `${taken} − ${missed} vs ${delta}`);
  const tile = (r) => M.defaultCurveLevel([p], NOW, undefined, null, { logs: r, history: [p] }).value;
  assert.equal(tile(rows('Taken')), taken);
  assert.equal(tile(rows('Missed')), missed);
});

const read = (...f) => fs.readFileSync(path.join(__dirname, '..', ...f), 'utf8');

test('PK-16: the Curve screen rebuilds the lines from the Dose log it re-reads on focus and after a sync', () => {
  const src = read('screens', 'SerumCurveScreen.js');
  // the model depends on the rows (a reload with new rows rebuilds it)
  assert.match(src, /\}, \[protocols, selectedIds, t, colors\.data, showCombined, futureDays, pastDays, doseLogs,/);
  // the read reaches the whole look-back (PK-15) on focus (fetchData) and on a sync (reloadData)
  assert.match(src, /getLogsSince\(userId, new Date\(Date\.now\(\) - CURVE_LOG_LOOKBACK_DAYS \* 24 \* 3600 \* 1000\)\.toISOString\(\)\)/);
  assert.match(src, /curveReloadOnSync\(addSyncListener/);
});

test('PK-16: the Journey tile reads the Dose log and the history protocols on focus and after a sync', () => {
  const src = read('screens', 'JourneyScreen.js');
  assert.match(src, /defaultCurveLevel\(getActiveProtocols\(user\.id\), Date\.now\(\), undefined, savedView, curveLevelData\(user\.id\)\)/);
  assert.match(src, /getLogsSince\(userId, new Date\(Date\.now\(\) - CURVE_LOG_LOOKBACK_DAYS \* 24 \* 3600 \* 1000\)\.toISOString\(\)\)/);
  assert.match(src, /history: getHistoryProtocols\(userId\)/);
  assert.match(src, /curveReloadOnSync\(addSyncListener, \(\) => \{ if \(premium === true\) loadLevel\(\)/);
});
