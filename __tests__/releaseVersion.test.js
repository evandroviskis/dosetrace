'use strict';
// A-127 review finding 6 (2026-10-20): the version check (lib/deviceId.js, the update notice) reads
// Constants.expoConfig.version, i.e. app.json. A build shipped without bumping it reports the old
// version, so the newest build could be told to update. On a release/<x.y.z> branch, app.json must
// say <x.y.z>.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

function branch() {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
}

test('A-127/6: on a release/x.y.z branch app.json version is x.y.z', (t) => {
  const m = /^release\/(\d+\.\d+\.\d+)$/.exec(branch());
  if (!m) { t.skip('not a release branch'); return; }
  const appVersion = require('../app.json').expo.version;
  assert.equal(appVersion, m[1]);
});
