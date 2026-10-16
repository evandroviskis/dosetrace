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
// committed-to line names a LATER release AND cites the founder AND (council fix 6, founder
// 2026-10-16) the spec's id — its file name or its registry id (A-119) — appears in a dated
// founder entry of docs/decisions.md that moves it to a later release; anything else blocks.
const fs = require('node:fs');
const path = require('node:path');
const { isDeferred } = require('../scripts/spec-audit.cjs');

const LEDGER = '## 2026-10-15 — founder: ship now\n\n- **Ship this version now** — 2026-10-15 — source: founder in chat. Open 1.3.0 items (A-119, A-121, A-127, the DV sweep) move to the next release.\n- **A-200 checklist signed** — 2026-10-15 — source: founder "assino".\n';
const spec = (title, line) => `# ${title}\n\n- checklist-signed: founder 2026-10-15\n- committed-to: ${line}\n`;
const DEFER = 'the release after 1.3.0 (founder deferral 2026-10-15, docs/decisions.md "Ship this version now")';

test('spec-audit: a founder deferral to the release after the current one does not block', () => {
  const opts = { ledger: LEDGER, file: 'one-active-device.md' };
  assert.equal(isDeferred(spec('One active device — A-119', DEFER), '1.3.0', opts), true);
  assert.equal(isDeferred(spec('One active device — A-119', '1.3.1 (founder deferral 2026-10-15)'), '1.3.0', opts), true);
});

test('spec-audit: the current release, "next build", no line, or a deferral without the founder all block', () => {
  const opts = { ledger: LEDGER, file: 'x.md' };
  const t = (line) => spec('X — A-119', line);
  assert.equal(isDeferred(t('1.3.0 (approved → next build)'), '1.3.0', opts), false);
  assert.equal(isDeferred(t('next build (founder "approved → next build" rule)'), '1.3.0', opts), false);
  assert.equal(isDeferred('# X — A-119\n# no committed-to line\n', '1.3.0', opts), false);
  assert.equal(isDeferred(t('the release after 1.3.0'), '1.3.0', opts), false);
  assert.equal(isDeferred(t('1.3.1'), '1.3.0', opts), false);
});

test('spec-audit: once the app reaches the deferred release, the spec blocks again', () => {
  const opts = { ledger: LEDGER, file: 'x.md' };
  assert.equal(isDeferred(spec('X — A-119', DEFER), '1.3.1', opts), false);
  assert.equal(isDeferred(spec('X — A-119', '1.3.1 (founder deferral 2026-10-15)'), '1.3.1', opts), false);
});

test('council fix 6: a founder deferral line without a matching dated ledger entry blocks', () => {
  assert.equal(isDeferred(spec('Something new — A-999', DEFER), '1.3.0', { ledger: LEDGER, file: 'something-new.md' }), false, 'A-999 is in no ledger entry');
  assert.equal(isDeferred(spec('X — A-119', DEFER), '1.3.0'), false, 'no ledger read: blocks');
  assert.equal(isDeferred(spec('X — A-119', DEFER), '1.3.0', { ledger: '', file: 'x.md' }), false, 'empty ledger: blocks');
  // Named, but the entry does not move it to a later release.
  assert.equal(isDeferred(spec('Y — A-200', DEFER), '1.3.0', { ledger: LEDGER, file: 'y.md' }), false, 'a signing entry is not a deferral');
  // A move without a date, or without the founder, is not a founder decision.
  const undated = '- **Ship now** — source: founder. A-119 moves to the next release.\n';
  assert.equal(isDeferred(spec('X — A-119', DEFER), '1.3.0', { ledger: undated, file: 'x.md' }), false, 'undated');
  const noFounder = '- **Ship now** — 2026-10-15 — source: council. A-119 moves to the next release.\n';
  assert.equal(isDeferred(spec('X — A-119', DEFER), '1.3.0', { ledger: noFounder, file: 'x.md' }), false, 'not the founder');
  // A-1190 is not A-119.
  const other = '- **Ship now** — 2026-10-15 — source: founder. A-1190 moves to the next release.\n';
  assert.equal(isDeferred(spec('X — A-119', DEFER), '1.3.0', { ledger: other, file: 'x.md' }), false, 'whole ids only');
  // The spec's file name counts as its id too.
  const byFile = '- **Later** — 2026-10-16 — source: founder: docs/specs/foo-bar.md moves to the release after 1.3.0.\n';
  assert.equal(isDeferred(spec('Foo bar', DEFER), '1.3.0', { ledger: byFile, file: 'foo-bar.md' }), true, 'by file name');
  // An id named only in the spec's body (related:) is not the spec's id.
  assert.equal(isDeferred('# Z — A-500\n- related: A-119\n- committed-to: ' + DEFER + '\n', '1.3.0', { ledger: LEDGER, file: 'z.md' }), false);
});

test('council fix 6: the real deferred specs still read as deferred against the real ledger', () => {
  const ROOT = path.join(__dirname, '..');
  const ledger = fs.readFileSync(path.join(ROOT, 'docs/decisions.md'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo.version;
  for (const file of ['one-active-device.md', 'still-going-end-date.md', 'update-notice.md']) {
    const text = fs.readFileSync(path.join(ROOT, 'docs/specs', file), 'utf8');
    assert.equal(isDeferred(text, version, { ledger, file }), true, file);
  }
  // spec-audit itself reads the ledger.
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/spec-audit.cjs'), 'utf8'), /isDeferred\(text, version, \{ ledger, file: f \}\)/);
});

