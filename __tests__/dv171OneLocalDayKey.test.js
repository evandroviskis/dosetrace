// DV-171 (parked-error sweep 2026-10-31): the local-day key ("YYYY-MM-DD" from a Date's local fields)
// was hand-built in 30 places across 26 files. lib/localDate localISO is its one owner: no other file
// builds it from getFullYear / getMonth() + 1 / getDate().
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.js$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('DV-171: only lib/localDate builds the local day key', () => {
  const files = ['App.js', ...walk('lib'), ...walk('screens'), ...walk('components')].filter((f) => f !== path.join('lib', 'localDate.js'));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/getMonth\(\) \+ 1/.test(line) && /getFullYear\(\)|getDate\(\)|\$\{m\}|\+ m\b/.test(line) && !/\bm: \w+\.getMonth\(\) \+ 1/.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('DV-171: localISO is the padded local calendar day', () => {
  const { localISO } = require('../lib/localDate');
  assert.equal(localISO(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localISO(new Date(2026, 10, 30, 0, 1)), '2026-11-30');
});
