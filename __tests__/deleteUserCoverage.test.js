'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Guards journey-review F4: the delete-user edge function must explicitly delete
// EVERY table the sync engine writes, or a synced table's rows survive account
// deletion (GDPR Art. 17 / Apple 5.1.1(v) — and it contradicts the in-app
// "account and all associated data" promise). This asserts syncCore.TABLES is a
// subset of the edge function's delete list, so the next time someone adds a
// synced table they can't silently forget the deletion path.

const { TABLES } = require('../lib/syncCore');

const deleteUserSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'delete-user', 'index.ts'),
  'utf8',
);

// Extract the userDataTables array literal.
const m = deleteUserSrc.match(/userDataTables\s*=\s*\[([\s\S]*?)\]/);

test('delete-user declares a userDataTables list', () => {
  assert.ok(m, 'could not find userDataTables array in delete-user/index.ts');
});

test('every synced table (syncCore.TABLES) is deleted by delete-user', () => {
  const listed = new Set(
    m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
  );
  const missing = TABLES.filter((tbl) => !listed.has(tbl));
  assert.deepEqual(
    missing,
    [],
    `delete-user is missing synced tables (they would leak past deletion): ${missing.join(', ')}`,
  );
});
