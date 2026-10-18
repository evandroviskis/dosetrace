'use strict';
// Build 54 review (2026-10-17): useKeyboardLift kept the last keyboard height when it was turned off
// (a sheet closed with the keyboard up), so the next opening showed a keyboard-tall blank space.
// Turning the hook off must clear the keyboard height and top.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'useKeyboardLift.js'), 'utf8');

test('useKeyboardLift clears the keyboard height and top when it is turned off', () => {
  const effect = /useEffect\(\(\) => \{\s*if \(!enabled\) \{([\s\S]*?)return undefined;\s*\}/.exec(src);
  assert.ok(effect, 'the off branch of the listener effect resets state');
  assert.match(effect[1], /kbTop\.current = null/);
  assert.match(effect[1], /setKbHeight\(0\)/);
});
