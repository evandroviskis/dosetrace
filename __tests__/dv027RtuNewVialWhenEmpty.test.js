// DV-027 (AD-80; parked-error sweep 2026-10-31): a ready-to-use pen that ran out is set inactive, and "New
// vial" needed an active pen with doses used — so a finished pen left the protocol page with no way to add
// the next one. With no pen in use, a ready-to-use protocol offers "New vial" (the new box asks its month and
// year, AD-80; startNewVial writes a new row).
const test = require('node:test');
const assert = require('node:assert/strict');
const NV = require('../lib/newVial');

test('DV-027: no pen in use → New vial on a ready-to-use protocol', () => {
  assert.equal(NV.showsNewVialButton({ type: 'rtu' }, null), true);
  assert.equal(NV.showsNewVialButton({ type: 'rtu' }, { doses_taken: 0 }), false, 'a fresh pen in use: not yet');
  assert.equal(NV.showsNewVialButton({ type: 'recon' }, null), false, 'recon: Today\'s Add vial notice covers it');
});
