'use strict';
// A-119 Gate B M3: the migration's EFFECT on real Postgres 15.8 + PostgREST 12.2
// (scripts/a119-pg-rehearsal.cjs: 36 scenarios — the guard's codes, legacy cutoff, takeover, OD-3
// races with a write in flight, stale rebuild, grants, deletion). It starts two throw-away Docker
// containers from images already on the machine (nothing is pulled) and takes ~40 s, so it runs only
// with DT_PG_REHEARSAL=1; otherwise it is skipped (and says so). On 2026-10-20 it passed 36/36 on
// this branch's migration and 28/36 on the earlier version (the Gate B findings).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');

const run = process.env.DT_PG_REHEARSAL === '1';
test('A-119 migration rehearsed on Postgres + PostgREST (opt-in: DT_PG_REHEARSAL=1; Docker and the two images present)', { skip: run ? false : 'set DT_PG_REHEARSAL=1 to run the Docker rehearsal', timeout: 400000 }, async () => {
  const out = await new Promise((resolve) => execFile(process.execPath, [path.join(__dirname, '../scripts/a119-pg-rehearsal.cjs')], { maxBuffer: 1 << 22 }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout: String(stdout) })));
  if (out.code === 3) return; // Docker or an image is missing: nothing to rehearse here
  assert.equal(out.code, 0, out.stdout);
  assert.match(out.stdout, /36\/36 scenarios passed/);
});
