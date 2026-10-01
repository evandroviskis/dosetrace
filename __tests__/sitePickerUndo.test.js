'use strict';
// S-20 (A-39 + A-38(d), founder 2026-09-28 / 2026-09-30; journey review 2026-09-30).
// S-25 (founder 2026-10-01) replaced the write-then-undo picker: the picker's own
// actions are tested in siteBeforeTaken.test.js. What stays here: the Undo bar's undo
// safety, Remove site, the Skip button and the 6-language copy.
// The site picker opens by itself after Mark taken on an injectable. There:
//   Cancel / X = the dose is undone (full undo) and a notice says so;
//   Android back (button or gesture) = a confirmation first: stay, or leave (= Cancel).
//     An accidental back never undoes by itself (founder 2026-09-30);
//   Skip = the dose is kept with no site;  Save = the dose is kept with the site.
// A picker the user opened on purpose (the Undo bar's "Add site", or a Dose-log row)
// only closes on Cancel / back (nothing is written without Save, so no confirmation).
// Sites are OPTIONAL: a saved site can be removed ("Remove site") or changed without
// undoing the dose (founder 2026-09-30). Each picker carries its OWN undo record, and undo
// takes ONE dose back from the vial / bottle as they are NOW (never a stale snapshot).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { planUndoTake } = require('../lib/markTaken');
const sites = require('../lib/injectionSites');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('S-20: A and B marked quickly, Cancel on A\'s picker — only A\'s row goes; "today, skip yesterday" removes both of ITS rows; a flipped Missed goes back', () => {
  const recA = { logId: 11, flipped: false, protocolId: 1, fx: { applied: true } };
  const recB = { logId: 12, flipped: false, protocolId: 2, fx: { applied: true } };
  assert.deepEqual(planUndoTake(recA).deleteIds, [11]);
  assert.deepEqual(planUndoTake(recB).deleteIds, [12]);
  assert.deepEqual(planUndoTake({ logId: 13, flipped: false, extraDeleteIds: [9], protocolId: 1 }).deleteIds, [13, 9]);
  const flipped = planUndoTake({ logId: 14, flipped: true, protocolId: 1 });
  assert.equal(flipped.restoreMissedId, 14);
  assert.deepEqual(flipped.deleteIds, []);
});

test('S-20: same vial, two takes, Cancel the first — the vial ends at start + 1 (one dose back from the CURRENT count)', () => {
  // start 4 → take A (5) → take B (6) → undo A must give 5, not the snapshot 4.
  const u = planUndoTake({ logId: 11, protocolId: 1, vialId: 3, prevDosesTaken: 4 }, { vialNow: { id: 3, doses_taken: 6, active: 1 } });
  assert.deepEqual(u.vialRestore, { id: 3, doses_taken: 5 });
});

test('S-20: the take that finished the vial, Cancel — vial reopened with one dose back and the new-vial prompt closes', () => {
  const rec = { logId: 11, protocolId: 1, vialId: 3, prevDosesTaken: 19, vialFinished: true };
  const u = planUndoTake(rec, { vialNow: { id: 3, doses_taken: 20, active: 0 }, otherActiveVial: false });
  assert.deepEqual(u.vialRestore, { id: 3, doses_taken: 19, active: 1 });
  assert.equal(u.closeVialPrompt, true);
});

test('S-20: Cancel after a new vial was already started — never two active vials (the old one stays closed)', () => {
  const rec = { logId: 11, protocolId: 1, vialId: 3, prevDosesTaken: 19, vialFinished: true };
  const u = planUndoTake(rec, { vialNow: { id: 3, doses_taken: 20, active: 0 }, otherActiveVial: true });
  assert.deepEqual(u.vialRestore, { id: 3, doses_taken: 19 });
});

test('S-20: oral bottle — undo gives back exactly the units this dose used, from the CURRENT count', () => {
  const u = planUndoTake({ logId: 5, protocolId: 2, oralPrevUnitsTaken: 6, oralUnitsAdded: 2 }, { unitsNow: 10 });
  assert.deepEqual(u.oralRestore, { protocolId: 2, units_taken: 8 });
});

test('S-20: "Remove site" clears a saved site (picked or typed) without touching the dose; shown only when a site is saved', () => {
  const src = read('screens', 'components', 'BodyMapModal.js');
  const r = src.indexOf('function handleRemove(');
  assert.ok(r > 0, 'handleRemove exists');
  assert.match(src.slice(r, r + 300), /onSave\(\{\s*stored:\s*null/, 'Remove site saves "no site" through the same onSave path (the dose row is only updated, never deleted)');
  assert.match(src, /\{hasSavedSite && \(/, 'the button is shown only when a site is already saved');
  assert.match(src, /bodymap_remove_site/);
  assert.equal(sites.hasSavedSite('left glute'), true);
  assert.equal(sites.hasSavedSite(JSON.stringify({ type: 'subq', sites: ['abdomen_lr'] })), true);
  assert.equal(sites.hasSavedSite(null), false);
  assert.equal(sites.hasSavedSite(JSON.stringify({ type: 'subq', sites: [] })), false);
  // The Dose-log save path writes whatever the picker returns, so null clears only injection_site.
  const log = read('screens', 'LogScreen.js');
  assert.match(log, /writeOutcome\(tgt\.logId, \{ injection_site: stored \}\)/);
});

test('S-20: recordDoseTaken reports the oral units this dose used (for the relative undo)', () => {
  const src = read('lib', 'doseActions.js');
  const i = src.indexOf('export function recordDoseTaken(');
  assert.match(src.slice(i, src.indexOf('\nexport function ', i + 10)), /oralUnitsAdded/);
});

test('S-20: the picker has a Skip button and routes Android back to its own handler', () => {
  const src = read('screens', 'components', 'BodyMapModal.js');
  assert.match(src, /today_pick_site_skip/);
  assert.match(src, /onRequestClose=\{onBack \|\| onClose\}/);
});

test('S-20: the notice, Skip, Remove site and the back confirmation exist in all 6 languages', () => {
  const src = read('i18n', 'translations.js');
  for (const key of ['today_pick_site_skip', 'today_take_undone', 'bodymap_remove_site', 'today_site_back_title', 'today_site_back_msg', 'today_site_back_stay', 'today_site_back_leave']) {
    assert.equal((src.match(new RegExp(`\\n\\s+${key}:`, 'g')) || []).length, 6, key);
  }
});
