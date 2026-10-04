'use strict';
// Pre-build pass 2026-10-03, m3 (shot 55): the custom interval row "Every [14] days" started at
// the field edge, while the wizard's labels and hints are inset 4 pt (fldLabel / fldHint
// paddingHorizontal 4). A row that STARTS with words is inset like the labels above it; rows
// that start with an input stay on the field edge.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../screens/ProtocolsScreen.js'), 'utf8');

test('the "Every … days" row is inset like the form labels', () => {
  const i = src.indexOf("{t('protocols_every_word')}");
  const row = src.slice(src.lastIndexOf('<View style=', i), i);
  assert.match(row, /<View style=\{\[s\.inrow, s\.inrowLead\]\}>/);
  const lead = src.match(/inrowLead: \{ paddingLeft: (\d+) \}/);
  const label = src.match(/fldLabel: \{ paddingHorizontal: (\d+),/);
  assert.ok(lead && label, 'styles present');
  assert.equal(lead[1], label[1]);
});
