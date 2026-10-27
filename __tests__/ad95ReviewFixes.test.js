'use strict';
// AD-95 code review 2026-10-26 (senior engineer, independent): six defects, each a failing test first.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const S = require('../lib/serumModel');
const { getHalfLifeEntry, doseInCurveUnit } = require('../lib/halfLives');
const { makeDb, seedSyncedProtocol } = require('./helpers/syncHarness');
const { loadFn } = require('./helpers/extractFn');
const { OPTIONAL_COLUMNS } = require('../lib/syncMappers');

const DAY = 864e5, H = 36e5;
const iso = (ms) => new Date(ms).toISOString();
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// 1. A blend's estimated part was weighed component ÷ total (counted at its share twice): 1.4x–7x low.
test('review 1: a blend component\'s estimated past counts at its own dose (weight 1 without changes)', () => {
  const now = Date.parse('2026-10-26T15:00:00Z');
  const p = { id: 7, type: 'recon', name: 'GLOW', compound_id: 'lyo_glow', dose: '2', dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: ymd(now - 30 * DAY), created_at: iso(now - 2 * DAY) };
  const { active } = S.splitCurveProtocols([p]);
  assert.ok(active.length >= 2, 'GLOW splits into its components');
  for (const c of active) {
    const e = getHalfLifeEntry(S.matchName(c));
    const plan = S.curvePlan(c, e, now - 20 * DAY, now + 3 * DAY, now, { logs: [] });
    assert.ok(!plan.doses.w || plan.doses.w.every((w) => Math.abs(w - 1) < 1e-12), `${c.compound_id}: ${plan.doses.w && plan.doses.w.slice(0, 3)}`);
  }
  // and after a dose change of the blend (2 → 4 mg today), the estimated past weighs 2/4 per component
  const changed = { ...p, dose: '4', dose_history: JSON.stringify([{ from: null, dose: 2, unit: 'mg' }, { from: iso(now - H), dose: 4, unit: 'mg' }]) };
  for (const c of S.splitCurveProtocols([changed]).active) {
    const e = getHalfLifeEntry(S.matchName(c));
    const plan = S.curvePlan(c, e, now - 20 * DAY, now + 3 * DAY, now, { logs: [] });
    const past = plan.doses.map((t, i) => [t, plan.doses.w ? plan.doses.w[i] : 1]).filter(([t]) => t < now - 2 * DAY);
    assert.ok(past.length && past.every(([, w]) => Math.abs(w - 0.5) < 1e-12), c.compound_id);
  }
});

// 2. A Taken dose moved (Alterar horário) to before the moment the protocol was added vanished from the
// curve when there is no estimated part ("added tonight, injected this morning").
test('review 2: a Taken dose timed before the protocol was added still counts when there is no estimated part', () => {
  const e = getHalfLifeEntry('Testosterone Cypionate');
  const created = new Date(2026, 9, 20, 20, 0).getTime();
  const p = { id: 9, type: 'rtu', name: 'Testosterone Cypionate', compound_id: 'testosterone_cypionate', dose: '100', dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: ymd(created), created_at: iso(created) };
  const at = new Date(2026, 9, 20, 7, 0).getTime();
  const logs = [{ id: 1, protocol_id: 9, outcome: 'Taken', logged_at: iso(at), dose_amount: 100, dose_unit: 'mg' }];
  const now = created + 3 * DAY;
  const plan = S.curvePlan(p, e, now - 10 * DAY, now + DAY, now, { logs });
  assert.ok(plan.doses.includes(at), 'the 07:00 dose is in the curve');
  assert.ok(S.levelAt(plan.doses, 100, e, now) > 10);
});

// 4. The upgrade added dose_unit only together with dose_amount: a half-done upgrade broke every insert.
test('review 4: the upgrade adds each column on its own (a half-done upgrade completes on the next start)', () => {
  const raw = new Database(':memory:');
  raw.exec(`CREATE TABLE protocols (id INTEGER PRIMARY KEY, dose TEXT, dose_unit TEXT);
    CREATE TABLE dose_logs (id INTEGER PRIMARY KEY, protocol_id INTEGER, outcome TEXT, logged_at TEXT, dose_amount REAL);`);
  const db = { execSync: (s) => raw.exec(s), getAllSync: (s, p = []) => raw.prepare(s).all(...p), runSync: (s, p = []) => raw.prepare(s).run(...p) };
  require('../lib/schema').upgradeDoseAmounts(db);
  const cols = raw.prepare('PRAGMA table_info(dose_logs)').all().map((c) => c.name);
  assert.ok(cols.includes('dose_unit'));
  assert.ok(cols.includes('optional_pending'), 'review 6: the re-send marker exists on dose_logs');
});

// 5. "Alterar dose" on a row without a unit saved unit NULL (read as mg: a mcg protocol weighed 1000x).
test('review 5: a dose edit without a unit on the row takes the protocol\'s unit', () => {
  const { unitForDoseEdit } = require('../lib/doseEdit');
  assert.equal(unitForDoseEdit({ dose_unit: null, protocol_dose_unit: 'mcg' }), 'mcg');
  assert.equal(unitForDoseEdit({ dose_unit: 'mg', protocol_dose_unit: 'mcg' }), 'mg');
  assert.equal(unitForDoseEdit({}), null);
});

// 6. dose_logs is an optional-column table: its rows need the local optional_pending marker.
test('review 6: dose_logs optional columns can be re-sent (local marker in the fresh schema too)', () => {
  assert.deepEqual(OPTIONAL_COLUMNS.dose_logs, ['dose_amount', 'dose_unit']);
  const db = makeDb();
  const cols = db.getAllSync('PRAGMA table_info(dose_logs)').map((c) => c.name);
  assert.ok(cols.includes('optional_pending'));
});

// 7. Undo of a take restored Skipped/Missed but kept the stamp; a later recovery reused it.
test('review 7: a row leaving Taken loses its stamp; taken again it gets the dose in force at its time', () => {
  const db = makeDb();
  const pid = seedSyncedProtocol(db, 'u', { remote_id: 'p', updated_at: '1' });
  db.runSync('UPDATE protocols SET dose = ?, dose_unit = ? WHERE id = ?', ['200', 'mg', pid]);
  const f = (n) => loadFn('lib/database.js', `export function ${n}(`, n, { getDB: () => db });
  const insertDoseLog = f('insertDoseLog'), updateDoseLog = f('updateDoseLog'), updateProtocol = f('updateProtocol');
  const id = insertDoseLog({ user_id: 'u', protocol_id: pid, outcome: 'Taken', logged_at: iso(Date.now() - DAY) });
  updateDoseLog(id, { outcome: 'Skipped' });
  assert.equal(db.getFirstSync('SELECT dose_amount FROM dose_logs WHERE id = ?', [id]).dose_amount, null);
  updateProtocol(pid, { dose: '100' });
  updateDoseLog(id, { outcome: 'Taken' });
  assert.equal(db.getFirstSync('SELECT dose_amount FROM dose_logs WHERE id = ?', [id]).dose_amount, 200, 'the dose of its time');
});
