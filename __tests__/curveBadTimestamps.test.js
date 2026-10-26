'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-14, R9): a Taken row dated after now (a phone clock that
// was ahead) and an unparseable logged_at are left out — never an exception; SQLite
// "YYYY-MM-DD HH:MM:SS" (UTC, no zone) parses.
process.env.TZ = 'Asia/Tokyo';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');

const HOUR = 3600000;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const sqlite = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const p = { id: 9, type: 'recon', name: 'Ipamorelin', compound_id: null, dose: '0.3', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '22:00', start_date: '2026-10-20', created_at: iso(at(20, 8)) };
const e = H.getHalfLifeEntry('Ipamorelin');
const NOW = at(22, 12);

test('PK-14: a future-dated Taken row and unparseable logged_at are excluded, no exception', () => {
  const good = at(22, 10);
  const logs = [
    { protocol_id: 9, outcome: 'Taken', logged_at: iso(good), sync_status: 'synced' },
    { protocol_id: 9, outcome: 'Taken', logged_at: iso(NOW + 2 * HOUR), sync_status: 'synced' },  // clock ahead
    { protocol_id: 9, outcome: 'Taken', logged_at: 'garbage', sync_status: 'synced' },
    { protocol_id: 9, outcome: 'Taken', logged_at: null, sync_status: 'synced' },
    { protocol_id: 9, outcome: 'Taken', sync_status: 'synced' },
    null,
  ];
  let plan, lv;
  assert.doesNotThrow(() => { plan = M.curvePlan(p, e, M.curveGridStart(NOW, 3), NOW + 864e5, NOW, { logs }); });
  assert.doesNotThrow(() => { lv = M.estimatedLevelNow(p, NOW, { logs }); });
  assert.deepEqual([...plan.taken], [good]);
  assert.ok(Math.abs(lv.value - 0.3 * Math.pow(2, -1)) < 1e-12, `level ${lv.value}`);
  // Tonight's 22:00 is closed by the 10:00 Taken (one dose a day, R7).
  assert.ok(!plan.doses.includes(at(22, 22)));
  // Without the good row, the future-dated one neither counts nor closes tonight's slot.
  const only = M.curvePlan(p, e, M.curveGridStart(NOW, 3), NOW + 864e5, NOW, { logs: logs.slice(1) });
  assert.deepEqual([...only.taken], []);
  assert.ok(only.doses.includes(at(22, 22)));
});

test('R9: SQLite "YYYY-MM-DD HH:MM:SS" logged_at is read as UTC', () => {
  const t = at(22, 11);
  const lv = M.estimatedLevelNow(p, NOW, { logs: [{ protocol_id: 9, outcome: 'Taken', logged_at: sqlite(t), sync_status: 'synced' }] });
  assert.ok(Math.abs(lv.value - 0.3 * Math.pow(2, -0.5)) < 1e-12, `level ${lv.value}`);
});
