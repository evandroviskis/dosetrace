// A-200 (Fold7 2026-10-31, founder "A200 sim"): with the Dose log open, the phone reconnects, the
// automatic sync ends and the not-synced card goes away — but the dose it promised to record as
// missed was not written until the next screen opened (neither "+1 not recorded" nor Missed).
// A finished sync on this screen now runs the Missed scan before the card and the list are read
// again, the same order "Sincronizar agora" uses (sync → scan → notice).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens/LogScreen.js'), 'utf8');

test('A-200: a finished sync on the Dose log scans for missed doses, then reads the list and the card', () => {
  const at = src.indexOf('useEffect(() => addSyncListener((e) => {');
  assert.ok(at > 0, 'the Dose log listens for a finished sync');
  const body = src.slice(at, at + 400);
  const scan = body.indexOf('scanMissedDoses(');
  const logs = body.indexOf('fetchLogs()');
  const card = body.indexOf('refreshUnsync()');
  assert.ok(scan > 0, 'the scan runs after a finished sync');
  assert.ok(logs > scan && card > scan, 'the list and the card are read after the scan');
});

test('A-200: a scan that wrote rows sends them up once; one that wrote nothing never asks for another sync', () => {
  const at = src.indexOf('useEffect(() => addSyncListener((e) => {');
  const body = src.slice(at, at + 400);
  assert.match(body, /if \(n > 0\) requestSync\(\);/);
});
