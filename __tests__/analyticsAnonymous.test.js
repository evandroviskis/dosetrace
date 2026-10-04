'use strict';
// Founder 2026-10-04 ("4 anônima"; regulatory review): usage analytics must really be anonymous —
// the screens call them "anonymous". No account id, no compound, dose, unit, frequency, goal,
// colour or search text: only a random id of this installation, the event and neutral fields.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRow, HEALTH_KEYS } = require('../lib/analyticsEvent');

test('a row carries no account id and no health field', () => {
  const row = buildRow('protocol_created', { compound: 'Tirzepatide', type: 'recon', dose: 2.5, dose_unit: 'mg', frequency: 'Weekly', wellness_goal: 'fat_loss', color: '#fff', duration_days: 30 }, 'inst-1', 'ios', '2026-10-04T00:00:00Z');
  assert.equal(row.user_id, null);
  assert.equal(row.event, 'protocol_created');
  for (const k of HEALTH_KEYS) assert.ok(!(k in row.properties), `${k} must not be sent`);
  assert.deepEqual(row.properties, { duration_days: 30, install_id: 'inst-1', platform: 'ios', timestamp: '2026-10-04T00:00:00Z' });
});

test('a compound search sends no search text', () => {
  const row = buildRow('compound_search', { query: 'BPC', compound_type: 'recon' }, 'i', 'android', 'T');
  assert.ok(!('query' in row.properties) && !('compound_type' in row.properties));
});

test('lib/analytics sends rows built here and never the user id', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/analytics.js'), 'utf8');
  assert.match(src, /buildRow\(/);
  assert.doesNotMatch(src, /user_id:\s*user\.id/);
});
