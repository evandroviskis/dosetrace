'use strict';
// DV-229 family: the ship-check Gate S parser (scripts/spec-audit.cjs).
// Bug 1: an EMPTY "checklist-signed:" line was read as signed by the next line.
// Bug 2: criterion ids with a digit in the prefix (MB2-1, BK2-3) were invisible ("0 of 0").
const test = require('node:test');
const assert = require('node:assert/strict');
const { readSignature, isUnsigned, criterionRows } = require('../scripts/spec-audit.cjs');

test('spec-audit: an empty checklist-signed line is unsigned (does not swallow the next line)', () => {
  const text = '# Spec\n\n- checklist-signed:\n- committed-to: 1.3.0\n';
  assert.equal(readSignature(text).trim(), '');
  assert.equal(isUnsigned(readSignature(text)), true);
});

test('spec-audit: an empty checklist-signed line with trailing spaces is unsigned', () => {
  const text = '- checklist-signed:   \r\n- committed-to: 1.3.0\n';
  assert.equal(isUnsigned(readSignature(text)), true);
});

test('spec-audit: a filled checklist-signed line is signed, and pending is unsigned', () => {
  const signed = '- checklist-signed: founder 2026-10-15 ("assino")\n- committed-to: 1.3.0\n';
  assert.equal(readSignature(signed).trim(), 'founder 2026-10-15 ("assino")');
  assert.equal(isUnsigned(readSignature(signed)), false);
  assert.equal(isUnsigned(readSignature('checklist-signed: pending (awaiting founder)\n')), true);
  assert.equal(isUnsigned(readSignature('# no signature line at all\n')), true);
});

test('spec-audit: criterion ids with a digit in the prefix are read (MB2-1..MB2-3)', () => {
  const text = [
    '| ID | Criterion | Status | Evidence | Deviation |',
    '|---|---|---|---|---|',
    '| MB2-1 | one | built | sim 2026-10-15 | |',
    '| MB2-2 | two | partial | | |',
    '| MB2-3 | three | missing | | |',
  ].join('\n');
  assert.equal(criterionRows(text).length, 3);
  assert.equal(criterionRows('| BK2-3 | x | built | sim 2026-10-15 | |').length, 1);
});

test('spec-audit: existing criterion ids still match and the header/separator rows do not', () => {
  const text = [
    '| ID | Criterion | Status | Evidence | Deviation |',
    '|---|---|---|---|---|',
    '| SG-1 | a | built | x | |',
    '| OD-12 | b | built | x | |',
    '|  FR-6  | c | built | x | |',
    '| 2-1 | not an id | built | x | |',
    '| O1 | not a dashed id | built | x | |',
  ].join('\n');
  assert.deepEqual(criterionRows(text).map((l) => l.split('|')[1].trim()), ['SG-1', 'OD-12', 'FR-6']);
});
