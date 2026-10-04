'use strict';
// A-50 (founder 2026-09-28, A-40 option 2; target 1.2.6 → 1.3.0): a Skipped row in the Dose log
// can be changed to complete — the same row (no second row), the vial or bottle moves once, an
// injectable asks its site first (S-25). The Dose log's Missed → complete takes the same path
// now (lib/doseActions recordDoseTaken with the row named: flipRowId), so a corrected dose
// counts in the supply like any other.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planMarkTaken } = require('../lib/markTaken');
const { read, sliceBlock } = require('./helpers/extractFn');

const P = { id: 1, user_id: 'u', type: 'recon', doses_per_day: 1, interval_days: 1, start_date: '2026-09-01', reminder_time: '08:00', amount: '5', unit: 'mg', dose: '250', dose_unit: 'mcg' };
const day = '2026-10-01';
const at = new Date(2026, 9, 1, 8, 0).toISOString();

test('a past Skipped row becomes complete in place, keeps its time, and the vial moves once', () => {
  const skipped = { id: 42, protocol_id: 1, outcome: 'Skipped', logged_at: at };
  const plan = planMarkTaken({ protocol: P, vial: { id: 9, doses_taken: 3, total_doses: 20 }, todayLogs: [skipped], dayKey: day, slotMs: Date.parse(at), nowMs: new Date(2026, 9, 3, 12).getTime(), flipRowId: 42, injectionSite: 'abd_l' });
  assert.equal(plan.insert, null, 'no second row');
  assert.deepEqual(plan.update, { id: 42, outcome: 'Taken', injection_site: 'abd_l' });
  assert.equal(plan.vialUpdate.doses_taken, 4);
});

test('the Dose log offers Mark complete on a Skipped dose and routes every row-to-complete through recordDoseTaken', () => {
  const src = read('screens/LogScreen.js');
  assert.match(src, /shownSheet\.outcome === 'Skipped' && \(/);
  assert.match(src, /onPress=\{\(\) => takeFromSheet\(shownSheet\)\}/);
  const mark = sliceBlock(src, 'function markRowTaken(');
  assert.match(mark, /recordDoseTaken\(/);
  assert.match(mark, /flipRowId:/);
  const site = sliceBlock(src, 'function siteAction(');
  assert.match(site, /markRowTaken\(tgt, plan\.writeSite \? stored : null\)/);
  const missed = sliceBlock(src, 'function setMissedOutcome(');
  assert.match(missed, /markRowTaken\(/);
});
