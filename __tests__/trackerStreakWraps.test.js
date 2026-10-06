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
