'use strict';
// S25 2026-11-26: the "Repetir nas próximas doses" card cut its line with "…" ("Você pode trocar ou apagar em …")
// once the observation was a normal sentence — the line quotes the mark and the note, so its length follows what
// she wrote. Clipped text is a bug (design rule); the line wraps in full, like the rest of the sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the repeat line is never cut: no numberOfLines on the card body', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'DoseObservation.js'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('style={s.repBody}'));
  assert.ok(line, 'the repeat body text exists');
  assert.doesNotMatch(line, /numberOfLines/);
});
