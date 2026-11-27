'use strict';
// S25 2026-11-26 (how-to recording, German): Today's tracker read "30 Ta…". The small-ring label
// column measured 52 dp (uiautomator bounds 147 px at 450 dpi); "30 Tage" in the 15 pt semibold
// label needs about 55 dp, but the shared size (lib/trackerFit sideTextSize) counted 7 characters
// x 0.46 em = 48 dp, so it kept 15 pt and Android cut the word. "30 dias" (same 7 characters, narrow
// letters) fits at 15 pt on the same phone. The label now uses a per-character width estimate
// (labelEm: capitals and wide letters count more than i, l, t, r and spaces) with a small margin, so
// a word that will not fit shrinks (both rows together, floor 0.75) instead of being cut.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

async function load() { return import('../lib/trackerFit.js'); }

test('"30 Tage" in the S25 52 dp column shrinks below 15 pt; "30 dias" keeps 15 pt', async () => {
  const { sideTextSize, labelEm } = await load();
  const de = sideTextSize(52, ['7 Tage', '30 Tage'], 15, labelEm);
  assert.ok(de < 15 && de >= 15 * 0.75, 'de ' + de);
  assert.ok(labelEm('30 Tage') * de <= 52, 'fits at the new size');
  assert.equal(sideTextSize(52, ['7 dias', '30 dias'], 15, labelEm), 15, 'pt unchanged');
});

test('the Fold calibration still holds ("7 dias" 15 pt = 38 dp, estimate generous)', async () => {
  const { labelEm } = await load();
  const w = labelEm('7 dias') * 15;
  assert.ok(w >= 38 && w <= 44, String(w));
});

test('a number em still works as before (the counts use 0.5)', async () => {
  const { sideTextSize } = await load();
  assert.equal(sideTextSize(200, ['4 von 5', '9 von 10'], 13, 0.5), 13);
  assert.equal(sideTextSize(0, ['x'], 15, (t) => 99), 15, 'not measured yet');
});

test('Today passes the per-character estimate for the labels', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'TodayTracker.js'), 'utf8');
  assert.match(src, /const labelSize = sideTextSize\(col, \[label7, label30\], 15, labelEm\);/);
});
