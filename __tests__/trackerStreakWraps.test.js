'use strict';
// 2026-10-06 (store screenshots, review account): Today's tracker cut its streak line —
// "8 days without a…" next to "On fire!" — in English already, worse in German. Clipped text is a
// bug: the line wraps to a second line instead of being cut.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the tracker streak line wraps instead of being cut', () => {
  const s = fs.readFileSync(path.join(__dirname, '../screens/components/TodayTracker.js'), 'utf8');
  const tag = s.slice(s.indexOf('<Text style={s.streakText}'), s.indexOf('<Text style={s.streakText}') + 80);
  assert.doesNotMatch(tag, /numberOfLines=\{1\}/);
  assert.match(tag, /numberOfLines=\{2\}/);
});

// Same day, German: "Dosisprotokoll ansehen" + "Läuft super!" squeezed the streak to "8 / Tag…".
// flex: 1 (basis 0) let the text shrink to nothing, so the row never wrapped. The text now keeps
// a minimum width; when the row is too long the history link wraps to its own line instead.
test('the streak text keeps a minimum width so the history link wraps instead', () => {
  const s = fs.readFileSync(path.join(__dirname, '../screens/components/TodayTracker.js'), 'utf8');
  const m = /streakText:\s*\{([^}]*)\}/.exec(s);
  assert.ok(m);
  assert.doesNotMatch(m[1], /\bflex:\s*1\b/, 'flex: 1 has a zero basis and never wraps');
  const w = /minWidth:\s*(\d+)/.exec(m[1]);
  assert.ok(w && Number(w[1]) >= 110, 'minWidth >= 110');
  assert.match(m[1], /flexGrow:\s*1/);
  assert.match(/streak:\s*\{([^}]*)\}/.exec(s)[1], /flexWrap:\s*'wrap'/);
});
