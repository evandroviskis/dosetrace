// Integration 2026-11-24 (integration/pacote-2026-11): three branches each wrote a migration named
// 20261124000000_*.sql (dose observation, account profile, protocol copper). Supabase keys a migration by
// its version (the number before the first "_"), so two files with one version cannot both be recorded as
// applied, and the order between them is only the file name. Every migration has its own version; the
// dose observation, profile and copper migrations go in that order (copper's purge trigger is the newest
// definition and names the dose observation columns, __tests__/dv221PurgeBlanksAll.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');

test('every migration has its own version (no two files share the timestamp)', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql'));
  const seen = new Map();
  for (const f of files) {
    const v = f.split('_')[0];
    assert.match(v, /^\d{14}$/, f);
    assert.ok(!seen.has(v), `${f} shares the version ${v} with ${seen.get(v)}`);
    seen.set(v, f);
  }
});

test('the package migrations of 2026-11-24 apply in order: dose observation, account profile, protocol copper', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const at = (re) => files.findIndex((f) => re.test(f));
  const obs = at(/_dose_observation\.sql$/);
  const prof = at(/_account_profile\.sql$/);
  const cu = at(/_protocol_copper\.sql$/);
  assert.ok(obs >= 0 && prof >= 0 && cu >= 0);
  assert.ok(obs < prof && prof < cu, files.slice(obs, cu + 1).join(', '));
});
