'use strict';
// The versioned SQL (supabase_admin_rpcs.sql) mirrors the NEWEST definition of each function: a later
// migration may redefine a function an earlier one created (3.3 redefines admin_accounts_list and
// admin_message_begin). These helpers find a function body in a source and the newest migration that
// defines it, so the "identical in both files" checks compare like with like.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const MIG_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

function sqlFnIn(src, name) {
  const m = src.match(new RegExp(`create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`, 'i'));
  assert.ok(m, name + ' defined');
  return m[0];
}

// [file, source] of the newest migration (by file name = timestamp order) that defines `name`.
function latestMigrationWith(name) {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
  const re = new RegExp(`create or replace function public\\.${name}\\(`, 'i');
  let hit = null;
  for (const f of files) {
    const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    if (re.test(src)) hit = [f, src];
  }
  assert.ok(hit, 'a migration defines ' + name);
  return hit;
}
function latestFn(name) { return sqlFnIn(latestMigrationWith(name)[1], name); }

module.exports = { sqlFnIn, latestMigrationWith, latestFn, MIG_DIR };
