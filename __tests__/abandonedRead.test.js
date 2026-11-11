'use strict';
// A read counts only if the result was actually delivered (founder 2026-11-11, "pode").
// Bug: the phone gives up waiting for an AI read (network / OS timeout, app sent to the
// background) and shows "try again"; the server's AI call finishes later and the read is
// still recorded (ai_scan_usage for lab / vaccine / vial scans, ai_food_usage for food
// parses), so the person loses one of their reads without getting a result.
// Fix: after the AI call, if the request's abort signal says the client disconnected
// (Deno: req.signal), the reservation is given back. The A-59 parallel-request protection
// stays: the row is still reserved BEFORE the AI call and each request checks its own
// position, so requests fired together can never get more than the limit delivered.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const q = () => require('../supabase/functions/extract-bloodwork/quota.ts');
const fnSrc = (name, file = 'index.ts') => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', name, file), 'utf8');

function fakeStore() {
  let rows = [];
  let seq = 0;
  const tick = () => new Promise((r) => setTimeout(r, Math.floor(Math.random() * 3)));
  return {
    rows: () => rows,
    seed(n) { for (let i = 0; i < n; i++) rows.push({ id: ++seq, created_at: seq }); },
    async count() { await tick(); return rows.length; },
    async reserve() { await tick(); const row = { id: ++seq, created_at: seq }; rows.push(row); return row.id; },
    async list(limit) { await tick(); return rows.slice().sort((a, b) => a.created_at - b.created_at || a.id - b.id).slice(0, limit).map((r) => r.id); },
    async release(id) { await tick(); rows = rows.filter((r) => r.id !== id); },
  };
}
const okWork = async () => { await new Promise((r) => setTimeout(r, 2)); return { ok: true, response: 'scan' }; };

test('abandoned scan: the AI call succeeded but the phone had already given up → the read is NOT counted', async () => {
  const store = fakeStore();
  const ctrl = new AbortController();
  const out = await q().withScanBudget({
    store, email: 'a@b.c', lookup: async () => 'inactive',
    abandoned: () => ctrl.signal.aborted,
    work: async () => { ctrl.abort(); return okWork(); }, // the client disconnects while the AI is working
  });
  assert.equal(out.status, 'abandoned');
  assert.equal(store.rows().length, 0, 'the reservation is given back');
  // The person still has the full month: 3 delivered scans afterwards.
  for (let i = 0; i < 3; i++) {
    assert.equal((await q().withScanBudget({ store, email: 'a@b.c', lookup: async () => 'inactive', abandoned: () => false, work: okWork })).status, 'done');
  }
  assert.equal(store.rows().length, 3);
});

test('abandoned scan: a delivered scan is still counted (abandoned() false or not given)', async () => {
  const store = fakeStore();
  assert.equal((await q().withScanBudget({ store, email: 'a@b.c', lookup: async () => 'inactive', abandoned: () => false, work: okWork })).status, 'done');
  assert.equal((await q().withScanBudget({ store, email: 'a@b.c', lookup: async () => 'inactive', work: okWork })).status, 'done');
  assert.equal(store.rows().length, 2);
});

test('abandoned scan: the client leaving and the AI call throwing → released too', async () => {
  const store = fakeStore();
  const ctrl = new AbortController();
  await assert.rejects(q().withScanBudget({
    store, email: 'a@b.c', lookup: async () => 'inactive', abandoned: () => ctrl.signal.aborted,
    work: async () => { ctrl.abort(); throw new Error('aborted'); },
  }), /aborted/);
  assert.equal(store.rows().length, 0);
});

test('A-59 kept: 30 requests fired together, every other one abandoned → never more than 3 delivered, rows == delivered', async () => {
  for (let round = 0; round < 5; round++) {
    const store = fakeStore();
    const out = await Promise.all(Array.from({ length: 30 }, (_, i) => {
      const ctrl = new AbortController();
      return q().withScanBudget({
        store, email: 'a@b.c', lookup: async () => 'inactive', abandoned: () => ctrl.signal.aborted,
        work: async () => { if (i % 2 === 0) ctrl.abort(); return okWork(); },
      });
    }));
    const delivered = out.filter((o) => o.status === 'done').length;
    assert.ok(delivered <= 3, `delivered ${delivered} > 3`);
    assert.equal(store.rows().length, delivered, 'only delivered reads keep a row');
  }
});

test('A-59 kept: Premium at 19 — an abandoned 20th gives the slot back, the next one gets it, then refused', async () => {
  const store = fakeStore(); store.seed(19);
  const ctrl = new AbortController();
  const gone = await q().withScanBudget({ store, email: 'a@b.c', lookup: async () => 'active', abandoned: () => ctrl.signal.aborted, work: async () => { ctrl.abort(); return okWork(); } });
  assert.equal(gone.status, 'abandoned');
  assert.equal(store.rows().length, 19);
  assert.equal((await q().withScanBudget({ store, email: 'a@b.c', lookup: async () => 'active', abandoned: () => false, work: okWork })).status, 'done');
  assert.deepEqual(await q().withScanBudget({ store, email: 'a@b.c', lookup: async () => 'active', abandoned: () => false, work: okWork }), { status: 'refused', limit: 20 });
});

test('extract-bloodwork: the budget is told when the client disconnected (req.signal) and the abandoned outcome is handled', () => {
  const src = fnSrc('extract-bloodwork');
  assert.match(src, /abandoned:\s*\(\)\s*=>\s*req\.signal\?\.aborted === true/);
  assert.match(src, /outcome\.status === 'abandoned'/);
});

// parse-food: the food parse slot (ai_food_usage) — provider errors and junk still count
// on purpose (abuse bound); only a read the phone never received is given back.
const f = () => require('../supabase/functions/parse-food/usage.ts');

test('parse-food: an abandoned parse gives its usage row back; a delivered one keeps it', async () => {
  const rows = new Set();
  let seq = 0;
  const reserve = async () => { const id = ++seq; rows.add(id); return id; };
  const release = async (id) => { rows.delete(id); };
  const ctrl = new AbortController();
  const r1 = await f().countIfDelivered({ signal: ctrl.signal, reserve, release, work: async () => { ctrl.abort(); return 'items'; } });
  assert.equal(r1, 'items');
  assert.equal(rows.size, 0, 'abandoned → released');
  const r2 = await f().countIfDelivered({ signal: new AbortController().signal, reserve, release, work: async () => 'items' });
  assert.equal(r2, 'items');
  assert.equal(rows.size, 1, 'delivered → counted');
});

test('parse-food: errors still count unless the client left; a failed insert never blocks the parse', async () => {
  const rows = new Set();
  let seq = 0;
  const reserve = async () => { const id = ++seq; rows.add(id); return id; };
  const release = async (id) => { rows.delete(id); };
  await assert.rejects(f().countIfDelivered({ signal: new AbortController().signal, reserve, release, work: async () => { throw new Error('boom'); } }), /boom/);
  assert.equal(rows.size, 1, 'a crash while the phone waits still counts (abuse bound)');
  const ctrl = new AbortController();
  await assert.rejects(f().countIfDelivered({ signal: ctrl.signal, reserve, release, work: async () => { ctrl.abort(); throw new Error('gone'); } }), /gone/);
  assert.equal(rows.size, 1, 'the phone left → released');
  const r = await f().countIfDelivered({ signal: undefined, reserve: async () => null, release, work: async () => 'ok' });
  assert.equal(r, 'ok');
});

test('parse-food: the reservation goes through countIfDelivered with req.signal, before the AI call', () => {
  const src = fnSrc('parse-food');
  assert.match(src, /from '\.\/usage\.ts'/);
  assert.match(src, /countIfDelivered(<\w+>)?\(\{\s*signal: req\.signal/);
  assert.equal((src.match(/\.from\('ai_food_usage'\)\.insert\(/g) || []).length, 1, 'one insert: the reservation');
  assert.ok(src.indexOf("from('ai_food_usage').insert(") < src.indexOf('api.anthropic.com'), 'reserved before the AI call');
  assert.match(src, /from\('ai_food_usage'\)\.delete\(\)\.eq\('id', id\)\.eq\('user_id', user\.id\)/);
});
