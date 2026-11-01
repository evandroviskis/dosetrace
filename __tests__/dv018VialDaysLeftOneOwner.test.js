// DV-018 (AD-65 / DL-80; parked-error sweep 2026-10-31 — the calculation part; the Protocols colouring waits
// for its picture, AD-79 item 11): a vial's days left was computed in several places. lib/vialExpiry
// vialDaysLeft(vial, protocol, now) is the one owner — recon: mix date + validity window; ready to use: the
// box date (good through that day) — and Protocols, Today's card and alert and "+ New vial" all read it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vialDaysLeft, daysUntilExpiry, boxDaysLeft } = require('../lib/vialExpiry');

test('DV-018: one function, both vial kinds', () => {
  const now = new Date(2026, 10, 1, 0, 15);
  assert.equal(vialDaysLeft({ expires_on: '2026-11-02' }, { type: 'rtu' }, now), boxDaysLeft('2026-11-02', now));
  assert.equal(vialDaysLeft({ mixed_on: '2026-10-20' }, { type: 'recon', vial_valid_days: 28 }, now), daysUntilExpiry('2026-10-20', 28, now));
  assert.equal(vialDaysLeft({ mixed_on: '2026-10-20' }, { type: 'recon' }, now), daysUntilExpiry('2026-10-20', 30, now), 'default window');
  assert.equal(vialDaysLeft({}, { type: 'rtu' }, now), null);
  assert.equal(vialDaysLeft(null, { type: 'recon' }, now), null);
});

test('DV-018: every screen reads it', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const today = read('screens/TodayScreen.js');
  const prot = read('screens/ProtocolsScreen.js');
  const nv = read('lib/newVial.js');
  for (const [name, src] of [['Today', today], ['Protocols', prot], ['newVial', nv]]) {
    assert.doesNotMatch(src, /daysUntilExpiry\(|boxDaysLeft\(/, name);
    assert.match(src, /vialDaysLeft\(/, name);
  }
});
