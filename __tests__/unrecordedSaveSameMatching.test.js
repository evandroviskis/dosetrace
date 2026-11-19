'use strict';
// Founder 2026-11-19 (Android, KLOW 3 mg daily 20:00, ended 2026-11-03): "Desde o dia 28 que tento marcar este
// como completo e não consigo. Salvar aqui não funciona somente para este protocolo." The question asked
// Sep 28 (its app Missed row) because the scan, matching every slot in order, gave the dose marked at 00:02 of
// Sep 28 to Sep 27's 20:00 slot (the late dose of that day). The save's re-check matched Sep 28 ALONE, so the
// same 00:02 dose covered it, nothing was left to write and Salvar did nothing, every day since.
// The save must re-check with the scan's own matching (same slots, same order). Real rows, local times.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { unrecordedPhone } = require('./helpers/unrecordedPhone');
const U = require('../lib/unrecordedPeriod');

const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const NOW = L(2026, 11, 19, 10, 42);
const opts = { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null };

function seed() {
  const db = makeDb();
  db.runSync(`INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, reminder_time, doses_per_day, interval_days, start_date, active, created_at, ended_at, updated_at, sync_status)
    VALUES ('klow', 'u', 'KLOW', 'recon', '#5DCAA5', '3', 'mg', '20:00', 1, 1, '2026-09-15', 0, ?, ?, '000001', 'synced')`,
  [iso(L(2026, 9, 15, 0, 28)), iso(L(2026, 11, 3, 21, 42))]);
  const p = db.getFirstSync('SELECT * FROM protocols');
  const ph = unrecordedPhone(db, { now: NOW });
  const add = (outcome, ms, byPerson = null) => ph.db.insertDoseLog({ user_id: 'u', protocol_id: p.id, outcome, logged_at: iso(ms), outcome_by_person: byPerson });
  // Every day taken, except the real rows around Sep 27-28.
  for (let d = new Date(2026, 8, 15); d < new Date(2026, 10, 3); d.setDate(d.getDate() + 1)) {
    const day = d.getDate(); const mo = d.getMonth() + 1;
    if (mo === 9 && day >= 25 && day <= 28) continue;
    add('Taken', L(2026, mo, day, 20), 1);
  }
  add('Taken', L(2026, 9, 25, 22, 34));
  add('Taken', L(2026, 9, 26, 22, 14));
  add('Taken', L(2026, 9, 27, 1, 55));
  add('Missed', L(2026, 9, 27, 20), 0); // the app's
  add('Taken', L(2026, 9, 28, 0, 2)); // Sep 27's dose, marked after midnight
  add('Missed', L(2026, 9, 28, 20), 0); // the app's, written twice
  add('Missed', L(2026, 9, 28, 20), 0);
  return { db, p, ph };
}

test('KLOW 2026-11-19: Salvar on the asked Sep 28 dose writes it (the save matches like the scan)', () => {
  const { p, ph } = seed();
  const asked = U.gapEntries(p, ph.logs('u'), opts);
  const sep28 = asked.filter((e) => e.slotMs === L(2026, 9, 28, 20));
  assert.equal(sep28.length, 1, 'the scan asks Sep 28');
  assert.ok(sep28[0].row, 'with the app Missed row');
  const res = ph.save({ protocolId: p.id, entries: sep28, choice: 'all' });
  assert.ok(res, 'Salvar writes (it returned nothing before the fix)');
  const row = ph.logs('u').find((l) => l.id === sep28[0].row.id);
  assert.equal(row.outcome, 'Taken');
  assert.ok(!U.gapEntries(p, ph.logs('u'), opts).some((e) => e.slotMs === L(2026, 9, 28, 20)), 'not asked again');
});

test('KLOW 2026-11-19: stillOpen agrees with the scan on every asked slot', () => {
  const { p, ph } = seed();
  const logs = ph.logs('u');
  const asked = U.gapEntries(p, logs, opts);
  assert.deepEqual(U.stillOpen(p, asked, logs, opts).map((e) => e.slotMs), asked.map((e) => e.slotMs));
});

test('KLOW 2026-11-19: a question with nothing left to write never leaves Salvar dead (the sheet moves on and refreshes)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'screens/components/UnrecordedHost.js'), 'utf8');
  const { sliceBlock } = require('./helpers/extractFn');
  const save = sliceBlock(src, '  function save(ask, { choice, picked }) {');
  assert.match(save, /let failed = false;/);
  assert.match(save, /catch \{ res = null; failed = true; \}/);
  assert.match(save, /if \(!res\) \{\s*if \(failed\) return false;\s*if \(onChanged\) onChanged\(\);\s*if \(queue && queue\[queue\.length - 1\] === ask\) close\(\);\s*return true;\s*\}/);
});
