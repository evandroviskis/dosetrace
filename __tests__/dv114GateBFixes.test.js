'use strict';
// DV-114 Gate B review (independent senior engineer, 2026-11-01: FIX FIRST). The offline gate answer
// kept on the phone (lib/pendingGate) must be: told apart the same way at the gate and in the flush
// (a busy or down server is temporary, never a refusal); never erased by a save that lands while the
// written answer is being removed; kept per account and counted by the deliberate sign-out like any
// unsent change; and read by the rest of the app (Edit profile, greeting, body map, calculator),
// with a newer Settings save winning over an older kept answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../lib/pendingGate');

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, v); },
    removeItem: async (k) => { m.delete(k); },
  };
}
const OFFLINE = { name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' };

function makeGate({ storage = memStorage(), uid = 'u1', update } = {}) {
  const writes = [];
  const gate = G.createPendingGate({
    storage,
    getSessionUserId: async () => uid,
    updateUser: update || (async (patch) => { writes.push(patch); return { error: null }; }),
  });
  return { gate, writes, storage };
}

// ── Finding 4 (LOW): 429 / 5xx are temporary at the gate too ────────────────────────────────────
test('Gate B 4: a busy or down server (429, 5xx) at the gate keeps the answer on the phone, like offline', async () => {
  for (const status of [429, 500, 502, 503]) {
    const { gate } = makeGate();
    await gate.load();
    const r = await G.answerGate({ userId: 'u1', patch: { adult_confirmed_at: 'X', birth_year: 1985 }, write: async () => ({ error: { status, message: 'Service unavailable' } }), gate });
    assert.equal(r.status, 'pending', `status ${status}`);
    assert.ok(gate.get('u1'), `kept for ${status}`);
  }
  // A real refusal still fails and keeps nothing.
  const { gate } = makeGate();
  await gate.load();
  const r = await G.answerGate({ userId: 'u1', patch: { a: 1 }, write: async () => ({ error: { status: 422, message: 'invalid' } }), gate });
  assert.equal(r.status, 'failed');
  assert.equal(gate.get('u1'), null);
});

test('Gate B 4: the flush classifies the same way — 429 / 5xx keep the answer quietly (no refusal told)', async () => {
  for (const status of [429, 503]) {
    const told = [];
    const { gate } = makeGate({ update: async () => ({ error: { status, message: 'busy' } }) });
    await gate.load();
    await gate.save('u1', { a: 1 });
    gate.subscribe((e) => told.push(e.type));
    assert.equal((await gate.flush()).status, 'offline');
    assert.ok(gate.get('u1'));
    assert.ok(!told.includes('refused'));
  }
});
