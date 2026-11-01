// DV-089 (parked-error sweep 2026-10-31): Today's "running low" alert naming ONE protocol opened the Protocols
// list instead of that protocol (the push and the vial-expiry alert already open it, A-132). Same rule now:
// lib/newVial vialAlertTarget.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-089: the supply-low alert goes through vialAlertTarget with each protocol id', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  const block = src.slice(src.indexOf("id: 'supply_low'") - 1200, src.indexOf("id: 'supply_low'") + 900);
  assert.match(block, /low\.push\(\{ name: [^}]*protocolId: p\.id \}\)/);
  assert.match(block, /const lowTarget = vialAlertTarget\(low\);/);
  assert.match(block, /onPress: \(\) => navigation\.navigate\(lowTarget\.screen, lowTarget\.params\),/);
});
