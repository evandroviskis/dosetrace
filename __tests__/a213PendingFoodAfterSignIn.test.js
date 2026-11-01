// A-213 (found by the Gate B review of DV-081, 2026-10-31): a food entry still waiting to be read and already
// uploaded was left "to the device that typed it" (FL-19). Under one device at a time (AD-77 / A-119) that
// device is this one or is gone (signing in elsewhere replaces it), so after a sign-out / sign-in — or a new
// phone — the entry was never read on any phone. Every pending entry of the account is read here now.
const test = require('node:test');
const assert = require('node:assert/strict');
const { rowsToReparse } = require('../lib/nutrition');

test('A-213: an uploaded pending entry is read on this phone too (one device at a time)', () => {
  const uploaded = { id: 7, created_at: '2026-10-30T10:00:00Z', remote_id: 'r-7', raw_text: 'rice', parse_status: 'pending', source: 'ai' };
  const local = { id: 6, created_at: '2026-10-30T09:00:00Z', remote_id: null, raw_text: 'eggs', parse_status: 'pending', source: 'ai' };
  const done = { id: 8, created_at: 'x', remote_id: 'r-8', raw_text: 'y', parse_status: 'done', source: 'ai' };
  const marker = { id: 9, created_at: 'x', remote_id: null, raw_text: 'z', parse_status: 'pending', source: 'day_closed' };
  assert.deepEqual(rowsToReparse([uploaded, local, done, marker], new Set()).map((r) => r.id), [7, 6]);
});
