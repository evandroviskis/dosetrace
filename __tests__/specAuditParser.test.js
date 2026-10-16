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

// Gate S blocked every build on specs the founder had moved to a later release
// (A-119, A-121, A-127 — decisions.md 2026-10-15). A spec is deferred only when its
// committed-to line names a LATER release AND cites the founder; anything else blocks.
const { isDeferred } = require('../scripts/spec-audit.cjs');

test('spec-audit: a founder deferral to the release after the current one does not block', () => {
  assert.equal(isDeferred('- committed-to: the release after 1.3.0 (founder deferral 2026-10-15)\n', '1.3.0'), true);
  assert.equal(isDeferred('- committed-to: 1.3.1 (founder deferral 2026-10-15)\n', '1.3.0'), true);
});

test('spec-audit: the current release, "next build", no line, or a deferral without the founder all block', () => {
  assert.equal(isDeferred('- committed-to: 1.3.0 (approved → next build)\n', '1.3.0'), false);
  assert.equal(isDeferred('- committed-to: next build (founder "approved → next build" rule)\n', '1.3.0'), false);
  assert.equal(isDeferred('# no committed-to line\n', '1.3.0'), false);
  assert.equal(isDeferred('- committed-to: the release after 1.3.0\n', '1.3.0'), false);
  assert.equal(isDeferred('- committed-to: 1.3.1\n', '1.3.0'), false);
});

test('spec-audit: once the app reaches the deferred release, the spec blocks again', () => {
  assert.equal(isDeferred('- committed-to: the release after 1.3.0 (founder deferral 2026-10-15)\n', '1.3.1'), false);
  assert.equal(isDeferred('- committed-to: 1.3.1 (founder deferral 2026-10-15)\n', '1.3.1'), false);
});
