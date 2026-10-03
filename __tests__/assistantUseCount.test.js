'use strict';
// AP-18, decided 2026-10-03 by logic: a use of the weekly 10 counts when the FIRST answer of a
// conversation goes to the AI (or the label-photo path starts) — never when the window
// opens. Opening and closing the window, or the "AI isn't available" notice, never spends a
// use; more answers in the same conversation never spend another. Server and phone agree:
// the phone starts the conversation on its first AI call (lib/assistantSession), the server
// counts a conversation once (supabase/functions/protocol-assistant/budget.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSession } = require('../lib/assistantSession');
const B = require('../supabase/functions/protocol-assistant/budget.ts');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const NOW = Date.parse('2026-10-03T12:00:00Z');

// A server backed by the real budget logic and an in-memory usage table for one user.
function fakeServer() {
  const rows = []; let n = 0; const calls = { start: 0, understand: 0 };
  const store = (conv) => ({
    async hasStart() { return rows.some((r) => r.conv === conv); },
    async startsSince(since) { return rows.filter((r) => r.created_at >= since); },
    async reserveStart() { const id = `r${n++}`; rows.push({ id, conv, created_at: new Date(NOW).toISOString() }); return id; },
    async release(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
  });
  return {
    rows, calls,
    async start(conv) {
      calls.start++;
      const o = await B.startConversation(store(conv), NOW);
      return o.status === 'refused' ? { error: { status: 429, code: 'quota_exceeded', limit: o.limit, resetsAt: o.resetsAt } } : { data: { ok: true } };
    },
    async understand() { calls.understand++; return { data: { result: { intent: 'unclear' } } }; },
  };
}
const session = (srv, id) => createSession({ conversationId: id, start: (c) => srv.start(c), understand: () => srv.understand() });

test('opening and closing the window spends no use (nothing is called)', () => {
  const srv = fakeServer();
  session(srv, 'c1');
  assert.equal(srv.calls.start, 0);
  assert.equal(srv.rows.length, 0);
  // the component no longer calls the server when it mounts
  const comp = read('screens', 'components', 'ProtocolAssistant.js');
  const mount = comp.slice(comp.indexOf('useEffect(() => {'), comp.indexOf('}, []);'));
  assert.doesNotMatch(mount, /(startAssistant|ensureStarted|understandAnswer|\.understand)\(/, 'no server call when the window opens');
});

test('the first answer sent to the AI spends one use; more answers in the same conversation spend none', async () => {
  const srv = fakeServer();
  const s = session(srv, 'c1');
  await s.understand('dose', 'two and a half mg weekly');
  assert.equal(srv.rows.length, 1);
  await s.understand('dose', 'again');
  await s.understand('start', 'today');
  assert.equal(srv.rows.length, 1);
  assert.equal(srv.calls.start, 1);
  assert.equal(srv.calls.understand, 3);
});

test('the label-photo path counts the same single use', async () => {
  const srv = fakeServer();
  const s = session(srv, 'c2');
  assert.deepEqual(await s.ensureStarted(), { ok: true });
  await s.understand('amount', 'twenty milligrams');
  assert.equal(srv.rows.length, 1);
});

test('a conversation started again (same id, e.g. after a retry) is never counted twice on the server', async () => {
  const srv = fakeServer();
  await srv.start('c3');
  await srv.start('c3');
  assert.equal(srv.rows.length, 1);
});

test('the 11th first answer in 7 days is refused (429) and nothing goes to the AI', async () => {
  const srv = fakeServer();
  for (let i = 0; i < 10; i++) await session(srv, `w${i}`).understand('dose', 'x');
  assert.equal(srv.rows.length, 10);
  const r = await session(srv, 'w10').understand('dose', 'x');
  assert.equal(r.error.status, 429);
  assert.equal(r.error.code, 'quota_exceeded');
  assert.equal(srv.calls.understand, 10, 'the refused conversation never reached the model');
});

test('a failed start (offline / not deployed) spends nothing and is retried on the next answer', async () => {
  let fail = true; let starts = 0;
  const s = createSession({ conversationId: 'c4', start: async () => { starts++; return fail ? { error: { status: null, code: null } } : { data: { ok: true } }; }, understand: async () => ({ data: { result: {} } }) });
  const r1 = await s.understand('dose', 'x');
  assert.ok(r1.error);
  fail = false;
  const r2 = await s.understand('dose', 'x');
  assert.ok(r2.data);
  assert.equal(starts, 2);
});
