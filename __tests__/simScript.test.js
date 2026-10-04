'use strict';
// Pre-build pass 2026-10-03: a stale Metro cache gave the simulator a white screen
// ("supabaseUrl is required"). The simulator bundle script always resets the cache.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('scripts/sim-load-main.sh exports with --reset-cache', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/sim-load-main.sh'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('expo export:embed'));
  assert.ok(line, 'export line present');
  assert.match(line, /--reset-cache/);
});

test('scripts/sim-load-main.sh stops when the .env is missing (a worktree has none)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/sim-load-main.sh'), 'utf8');
  assert.match(src, /\[ -f \.env \] \|\| \{/);
  assert.ok(src.indexOf('[ -f .env ]') < src.indexOf('expo export:embed'), 'checked before the export');
});
