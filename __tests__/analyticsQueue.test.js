'use strict';
// Re-verification E (DV-184): the background analytics queue (lib/analyticsQueue, used by
// lib/analytics). Events logged in background mode wait in AsyncStorage and go with the next
// foreground event. A row leaves the queue only after its send succeeded; a failed send keeps it
// (and the rows after it) for the next flush; two flushes at once never send a row twice; an event
// queued while a flush is running is never lost. Every row is queued by account u1 (each entry is
// tagged with its account; __tests__/analyticsOptOutQueue covers other accounts' rows).
const test = require('node:test');
const assert = require('node:assert/strict');

const { createAnalyticsQueue } = require('../lib/analyticsQueue');

function storage() {
  const mem = {};
  return { mem, getItem: async (k) => (k in mem ? mem[k] : null), setItem: async (k, v) => { mem[k] = v; } };
}
const tick = () => new Promise((r) => setTimeout(r, 1));

test('E: a failed send keeps the row (and the ones after it) for the next flush', async () => {
  const s = storage();
  const sent = [];
  let down = true;
  const q = createAnalyticsQueue({ storage: s, key: 'q', send: async (row) => { if (down) return { error: { message: 'offline' } }; sent.push(row.name); return { error: null }; } });
  await q.add({ name: 'a' }, 'u1');
  await q.add({ name: 'b' }, 'u1');
  await q.flush('u1');
  assert.deepEqual(sent, []);
  assert.equal(JSON.parse(s.mem.q).length, 2, 'nothing dropped');
  down = false;
  await q.flush('u1');
  assert.deepEqual(sent, ['a', 'b']);
  assert.equal(JSON.parse(s.mem.q).length, 0);
  // a send that throws counts as failed too
  const t = createAnalyticsQueue({ storage: s, key: 'q', send: async () => { throw new Error('net'); } });
  await t.add({ name: 'c' }, 'u1');
  await t.flush('u1');
  assert.equal(JSON.parse(s.mem.q).length, 1);
});

test('E: two flushes at the same time send each row once', async () => {
  const s = storage();
  const sent = [];
  const q = createAnalyticsQueue({ storage: s, key: 'q', send: async (row) => { await tick(); sent.push(row.name); return { error: null }; } });
  await q.add({ name: 'a' }, 'u1');
  await q.add({ name: 'b' }, 'u1');
  await Promise.all([q.flush('u1'), q.flush('u1'), q.flush('u1')]);
  assert.deepEqual(sent, ['a', 'b']);
  await q.flush('u1');
  assert.deepEqual(sent, ['a', 'b'], 'nothing left to resend');
});

test('E: an event queued while a flush is sending is kept and sent next', async () => {
  const s = storage();
  const sent = [];
  let q;
  q = createAnalyticsQueue({
    storage: s, key: 'q',
    send: async (row) => { if (row.name === 'a') await q.add({ name: 'late' }, 'u1'); sent.push(row.name); return { error: null }; },
  });
  await q.add({ name: 'a' }, 'u1');
  await q.flush('u1');
  assert.deepEqual(sent, ['a']);
  assert.deepEqual(JSON.parse(s.mem.q).map((e) => e.row.name), ['late'], 'the late event survived the flush');
  await q.flush('u1');
  assert.deepEqual(sent, ['a', 'late']);
});

test('E: the queue keeps the newest 50; clear empties it (opted out)', async () => {
  const s = storage();
  const q = createAnalyticsQueue({ storage: s, key: 'q', send: async () => ({ error: null }) });
  for (let i = 0; i < 55; i++) await q.add({ name: String(i) }, 'u1');
  const l = JSON.parse(s.mem.q);
  assert.equal(l.length, 50);
  assert.equal(l[0].row.name, '5');
  await q.clear();
  assert.deepEqual(JSON.parse(s.mem.q), []);
});
