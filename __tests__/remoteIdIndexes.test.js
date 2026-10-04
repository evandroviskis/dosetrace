'use strict';
// A-93 (senior review 2026-10-04): every merge / import looks a row up by remote_id; without an
// index each lookup scans the table, and the dose history only grows. Every synced table has one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/syncHarness');
const { TABLES } = require('../lib/syncCore');

test('every synced table has an index on remote_id', () => {
  const db = makeDb();
  for (const t of TABLES) {
    const ix = db.getAllSync(`PRAGMA index_list(${t})`);
    const cols = ix.flatMap((i) => db.getAllSync(`PRAGMA index_info(${i.name})`).map((c) => c.name));
    assert.ok(cols.includes('remote_id'), `${t} has no remote_id index`);
  }
});
