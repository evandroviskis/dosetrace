// A-90 (1) / DL-86 / DV-091 (found by the parked-error sweep, 2026-10-31): editing a protocol's start to
// an EARLIER day never asked the past-doses question — the curve silently estimated the new period
// (no history_from), or kept an old "No" for ever (history_from set, never correctable). DL-86: the
// question is asked again when an edit moves the start earlier; "Sim" lets the curve estimate, "Não"
// starts it on the day the protocol was added to the app (the logged doses after that are kept).
// "Sim" after an earlier "Não" writes history_from = the start date (historyCut: a cut on or before the
// start cuts nothing) — a value like any other, so it syncs; a NULL would never reach the cloud.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { historyCut } = require('../lib/declared');
const { editStartAsk, editStartWrites } = require('../lib/pastDoses');

const NOW = new Date(2026, 9, 31, 12, 0).getTime();
const created = new Date(2026, 9, 20, 9, 0).toISOString(); // added to the app on Oct 20
const base = { id: 1, name: 'Testosterone Cypionate', dose: 100, dose_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '09:00', created_at: created };

test('historyCut: a history_from after the start cuts; on or before the start it cuts nothing', () => {
  assert.equal(historyCut({ start_date: '2026-09-01', history_from: '2026-10-20' }), true);
  assert.equal(historyCut({ start_date: '2026-09-01', history_from: '2026-09-01' }), false);
  assert.equal(historyCut({ start_date: '2026-09-01', history_from: '2026-08-01' }), false);
  assert.equal(historyCut({ start_date: '2026-09-01', history_from: null }), false);
});

test('editStartAsk: the start moved earlier, before the day it was added → asks with the doses of that span', () => {
  const before = { ...base, start_date: '2026-10-20' };
  const after = { ...base, start_date: '2026-09-29' }; // weekly: Sep 29, Oct 6, Oct 13 before Oct 20
  const ask = editStartAsk({ before, after, nowMs: NOW, curveAsk: true });
  assert.deepEqual({ n: ask.n, createdDay: ask.createdDay }, { n: 3, createdDay: '2026-10-20' });
});

test('editStartAsk: no question when the start moved later, stayed on/after the day it was added, or there is no curve', () => {
  assert.equal(editStartAsk({ before: { ...base, start_date: '2026-09-29' }, after: { ...base, start_date: '2026-10-06' }, nowMs: NOW, curveAsk: true }), null);
  assert.equal(editStartAsk({ before: { ...base, start_date: '2026-10-25' }, after: { ...base, start_date: '2026-10-21' }, nowMs: NOW, curveAsk: true }), null);
  assert.equal(editStartAsk({ before: { ...base, start_date: '2026-10-20' }, after: { ...base, start_date: '2026-09-29' }, nowMs: NOW, curveAsk: false }), null);
});

test('editStartWrites: Não starts the curve on the day it was added; Sim/Quase todas undo an earlier Não', () => {
  const ask = { n: 3, createdDay: '2026-10-20' };
  assert.deepEqual(editStartWrites('no', ask, { ...base, start_date: '2026-09-29', history_from: null }), { history_from: '2026-10-20' });
  assert.equal(editStartWrites('no', ask, { ...base, start_date: '2026-09-29', history_from: '2026-10-20' }), null); // already
  assert.equal(editStartWrites('yes', ask, { ...base, start_date: '2026-09-29', history_from: null }), null); // nothing cut
  assert.deepEqual(editStartWrites('yes', ask, { ...base, start_date: '2026-09-29', history_from: '2026-10-20' }), { history_from: '2026-09-29' });
  assert.deepEqual(editStartWrites('almost', ask, { ...base, start_date: '2026-09-29', history_from: '2026-10-20' }), { history_from: '2026-09-29' });
});

test('the curve and the dose question read the cut through historyCut (a history_from on the start cuts nothing)', () => {
  const sm = fs.readFileSync(path.join(__dirname, '..', 'lib/serumModel.js'), 'utf8');
  assert.match(sm, /const hasDeclared = !historyCut\(p\)/);
  assert.match(sm, /if \(!p \|\| historyCut\(p\) \|\| !p\.start_date/);
  const db = fs.readFileSync(path.join(__dirname, '..', 'lib/database.js'), 'utf8');
  assert.match(db, /!h\.length && !historyCut\(prev\)/);
});

test('the edit save asks the question when the start moved earlier', () => {
  const ps = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  assert.match(ps, /editStartAsk\(\{ before: startBefore, after: editedProtocol/);
  assert.match(ps, /editStartWrites\(kind, eAsk, getProtocolById\(editingId\)/);
  assert.match(ps, /protocols_past_body_edit/);
});

test('the edit question body exists ×6 with {date}', () => {
  const tr = fs.readFileSync(path.join(__dirname, '..', 'i18n/translations.js'), 'utf8');
  for (const key of ['protocols_past_body_edit', 'protocols_past_body_edit_many']) {
    const vals = [...tr.matchAll(new RegExp(`^\\s*${key}:\\s*(["'])(.*)\\1,`, 'gm'))].map((m) => m[2]);
    assert.equal(vals.length, 6, key);
    for (const v of vals) assert.match(v, /\{date\}/);
  }
});
