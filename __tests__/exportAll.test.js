'use strict';
// S-07 / FX-12: "Export my data" must contain everything the user entered — it missed
// food logs, reality checks, weigh-in snapshots and targets (and the open check and
// calculator inputs). Durable rule: the export covers EVERY synced user table
// (lib/syncCore.js TABLES), so a new table can never be left out again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TABLES } = require('../lib/syncCore');

test('S-07: the export includes food logs, reality checks, snapshots and targets', () => {
  const { exportTableNames } = require('../lib/exportTables');
  const names = exportTableNames(TABLES);
  for (const t of ['food_logs', 'reality_checks', 'calc_snapshots', 'calc_targets', 'reality_check_open', 'calc_inputs']) assert.ok(names.includes(t), t);
});

test('S-07: the export covers every synced user table', () => {
  const { exportTableNames } = require('../lib/exportTables');
  assert.deepEqual(exportTableNames(TABLES).slice().sort(), TABLES.map((t) => t.name || t.table || t).sort());
});

test('S-07: getAllDataForExport reads the table list from exportTableNames(TABLES)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'database.js'), 'utf8');
  const i = src.indexOf('export function getAllDataForExport(');
  assert.match(src.slice(i, i + 800), /exportTableNames\(TABLES\)/);
});
