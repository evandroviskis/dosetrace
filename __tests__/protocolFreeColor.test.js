'use strict';
// S25 2026-11-26 (how-to recording, Italian): a third protocol was saved with the same colour as the
// first ("Questo colore è già usato da un altro protocollo"). Every new protocol started on Ocean
// (lib/protocolColors DEFAULT_PROTOCOL_COLOR), so the second protocol a person creates always repeated
// the first one's colour unless they changed it — two curve lines and two dots looking the same.
// A new protocol now starts on the first palette colour no other protocol uses (Ocean while none
// does); a colour the person picks, including a repeated one on purpose, is still theirs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PALETTE, firstFreeColor } = require('../lib/protocolColors');
const { newProtocolForm } = require('../lib/protocolForm');

const NOW = new Date(2026, 10, 26, 21, 0, 0);

test('no protocols yet: Ocean, as before', () => {
  assert.equal(firstFreeColor([]), PALETTE[0].hex);
  assert.equal(newProtocolForm(NOW).color, PALETTE[0].hex);
});

test('the first unused palette colour, in palette order', () => {
  assert.equal(firstFreeColor([PALETTE[0].hex]), PALETTE[1].hex);
  assert.equal(firstFreeColor([PALETTE[0].hex, PALETTE[1].hex]), PALETTE[2].hex);
  assert.equal(firstFreeColor([PALETTE[1].hex]), PALETTE[0].hex, 'a gap is filled first');
  assert.equal(newProtocolForm(NOW, [PALETTE[0].hex, PALETTE[1].hex]).color, PALETTE[2].hex);
});

test('a legacy stored hex counts as its palette colour', () => {
  assert.equal(firstFreeColor([PALETTE[0].legacy]), PALETTE[1].hex);
});

test('every colour taken: Ocean again (the person can still pick)', () => {
  assert.equal(firstFreeColor(PALETTE.map((p) => p.hex)), PALETTE[0].hex);
});

test('the new-protocol form on Protocols passes the colours in use', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProtocolsScreen.js'), 'utf8');
  assert.match(src, /applyForm\(newProtocolForm\(new Date\(\), protocols\.map\(\(p\) => displayColor\(p\.color\)\)\)\)/);
});
