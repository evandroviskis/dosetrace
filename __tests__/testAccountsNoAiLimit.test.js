'use strict';
// Founder 2026-11-26: "Nenhuma das contas de teste deveriam ter essas limitações". Our own test
// accounts are never refused by an AI usage cap and their use does not consume a budget:
//   - the shared monthly scan budget (extract-bloodwork: labs, vaccine cards, vials; 3 / 20);
//   - the food log daily caps and the rolling 24 h ceiling (parse-food);
//   - the protocol assistant's weekly uses and its per-conversation / per-day turn caps.
// A test account = the auth user's email (trimmed, lowercased) is dosetrace.io@gmail.com,
// appreview@dosetrace.io, or a Gmail plus-alias of our own inbox (dosetrace.io+anything@gmail.com),
// AND the email is confirmed (email_confirmed_at set): nobody can claim one without our inbox.
// evandro1985@gmail.com is NOT one: it is the account that tests the free limits.
// One definition, server side: supabase/functions/_shared/testAccounts.ts. Everyone else: unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const T = () => require('../supabase/functions/_shared/testAccounts.ts');
const Q = () => require('../supabase/functions/extract-bloodwork/quota.ts');
const B = () => require('../supabase/functions/protocol-assistant/budget.ts');
const CONFIRMED = '2026-11-01T10:00:00Z';
const u = (email, confirmed = CONFIRMED) => ({ id: 'u1', email, email_confirmed_at: confirmed });

// ── The predicate ───────────────────────────────────────────────────────────────────────────
test('test account: the explicit list and our inbox plus-aliases, confirmed', () => {
  const { isTestAccount, TEST_ACCOUNT_EMAILS } = T();
  assert.deepEqual([...TEST_ACCOUNT_EMAILS].sort(), ['appreview@dosetrace.io', 'dosetrace.io@gmail.com']);
  for (const e of ['dosetrace.io@gmail.com', 'appreview@dosetrace.io', 'dosetrace.io+s25@gmail.com', 'dosetrace.io+qa.free-1_a@gmail.com']) {
    assert.equal(isTestAccount(u(e)), true, e);
  }
});

test('test account: case and surrounding spaces do not matter', () => {
  const { isTestAccount } = T();
  assert.equal(isTestAccount(u('  DoseTrace.IO@Gmail.com ')), true);
  assert.equal(isTestAccount(u('AppReview@DoseTrace.io')), true);
  assert.equal(isTestAccount(u(' DOSETRACE.IO+Fold@GMAIL.COM')), true);
});

test('test account: an unconfirmed email is never one (a stranger cannot claim it without our inbox)', () => {
  const { isTestAccount } = T();
  for (const e of ['dosetrace.io@gmail.com', 'dosetrace.io+x@gmail.com', 'appreview@dosetrace.io']) {
    for (const c of [null, undefined, '', 0, true]) assert.equal(isTestAccount({ id: 'u1', email: e, email_confirmed_at: c }), false, `${e} / ${c}`);
    assert.equal(isTestAccount({ id: 'u1', email: e }), false, `${e} / no field`);
  }
});

test('test account: everyone else is not one (incl. the free-limits tester and the Premium list)', () => {
  const { isTestAccount } = T();
  for (const e of [
    'evandro1985@gmail.com', 'jootaerre@gmail.com', 'hello@dosetrace.io', 'a@b.c',
    'dosetrace.io+@gmail.com', 'dosetrace.io+x@gmail.com.evil.com', 'xdosetrace.io+x@gmail.com',
    'dosetrace.io+x@googlemail.com', 'dosetraceio@gmail.com', 'dosetrace.io+a b@gmail.com',
    'dosetrace.io+x+y@gmail.com', 'appreview@dosetrace.io.evil.com', 'dosetrace.io@gmail.com\nx',
  ]) assert.equal(isTestAccount(u(e)), false, JSON.stringify(e));
  assert.equal(isTestAccount(null), false);
  assert.equal(isTestAccount(undefined), false);
  assert.equal(isTestAccount({}), false);
  assert.equal(isTestAccount({ email: 42, email_confirmed_at: CONFIRMED }), false);
});

test('test account: one definition, server side; the Premium list is unchanged by it', () => {
  const src = read('supabase/functions/_shared/testAccounts.ts');
  assert.doesNotMatch(src, /^import /m, 'pure: runs under node --test and Deno');
  const { PREMIUM_EMAILS } = Q();
  assert.deepEqual([...PREMIUM_EMAILS].sort(), ['appreview@dosetrace.io', 'hello@dosetrace.io', 'jeovane_m@live.com', 'jootaerre@gmail.com', 'jootaerre@yahoo.com.br', 'victor.s.engenharia@gmail.com']);
  for (const f of ['extract-bloodwork/index.ts', 'parse-food/index.ts', 'protocol-assistant/index.ts']) {
    const s = read(`supabase/functions/${f}`);
    assert.match(s, /^import \{ isTestAccount \} from '\.\.\/_shared\/testAccounts\.ts';$/m, `${f} uses the shared definition`);
    assert.match(s, /isTestAccount\(user\)/, `${f} asks it about the signed-in user`);
    assert.doesNotMatch(s, /dosetrace\.io@gmail\.com|dosetrace\\\.io/, `${f} keeps no copy of the list`);
  }
});

// ── extract-bloodwork: the monthly scan budget ──────────────────────────────────────────────
function scanStore(n) {
  let rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, created_at: i + 1 }));
  let seq = n;
  const touched = [];
  return {
    rows: () => rows,
    touched,
    async count() { touched.push('count'); return rows.length; },
    async reserve() { touched.push('reserve'); const r = { id: ++seq, created_at: seq }; rows.push(r); return r.id; },
    async list(limit) { touched.push('list'); return rows.slice(0, limit).map((r) => r.id); },
    async release(id) { touched.push('release'); rows = rows.filter((r) => r.id !== id); },
  };
}
const scanWork = async () => ({ ok: true, response: 'scan' });

test('scans: a test account at (and past) the cap is not refused and reserves no row', async () => {
  for (const n of [3, 20, 45]) {
    const store = scanStore(n);
    let asked = false;
    const out = await Q().withScanBudget({ store, email: 'dosetrace.io@gmail.com', lookup: async () => { asked = true; return 'inactive'; }, work: scanWork, unlimited: true });
    assert.deepEqual(out, { status: 'done', response: 'scan' }, `at ${n}`);
    assert.equal(store.rows().length, n, 'no usage row written');
    assert.deepEqual(store.touched, [], 'the budget is not even read');
    assert.equal(asked, false, 'RevenueCat is not asked');
  }
});

test('scans: a normal account at the cap is still refused (free 3, Premium 20)', async () => {
  const free = scanStore(3);
  assert.deepEqual(await Q().withScanBudget({ store: free, email: 'evandro1985@gmail.com', lookup: async () => 'inactive', work: scanWork }), { status: 'refused', limit: 3 });
  const prem = scanStore(20);
  assert.deepEqual(await Q().withScanBudget({ store: prem, email: 'a@b.c', lookup: async () => 'active', work: scanWork, unlimited: false }), { status: 'refused', limit: 20 });
  assert.equal(free.rows().length, 3);
  assert.equal(prem.rows().length, 20);
});

test('scans: the usage line of a test account never shows it near a limit (0 used)', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  assert.deepEqual(Q().scanUsageReply({ count: 17, now, unlimited: true }), { status: 200, body: { used: 0, renews_on: '2026-12-01' } });
  assert.deepEqual(Q().scanUsageReply({ count: null, now, unlimited: true }), { status: 200, body: { used: 0, renews_on: '2026-12-01' } });
  assert.deepEqual(Q().scanUsageReply({ count: 2, now }), { status: 200, body: { used: 2, renews_on: '2026-12-01' } }, 'everyone else: the real count');
});

test('scans: index.ts passes the test-account flag to the budget and to the usage reply', () => {
  const s = read('supabase/functions/extract-bloodwork/index.ts');
  assert.match(s, /const noAiCap = isTestAccount\(user\);/);
  assert.match(s, /scanUsageReply\(\{ count: used, now, unlimited: noAiCap \}\)/);
  assert.match(s, /withScanBudget<Response>\(\{[\s\S]*?unlimited: noAiCap,/);
  assert.ok(s.indexOf('const noAiCap = isTestAccount(user);') > s.indexOf('auth.getUser()'), 'decided only after auth');
});

// ── parse-food: the daily caps and the 24 h ceiling, the real handler run with fakes ─────────
function foodServer({ user, day = 0, hard = 0 }) {
  let src = read('supabase/functions/parse-food/index.ts');
  src = src.replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/[^']+';$/m, '');
  src = src.replace(/^import \{ countIfDelivered \} from '\.\/usage\.ts';$/m, read('supabase/functions/parse-food/usage.ts').replace(/^export /gm, ''));
  src = src.replace(/^import \{ isTestAccount \} from '\.\.\/_shared\/testAccounts\.ts';$/m, read('supabase/functions/_shared/testAccounts.ts').replace(/^export /gm, ''));
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const calls = { counts: 0, inserts: [] };
  const query = () => {
    const q = {};
    const b = {
      select: () => b, eq: () => b, order: () => b, limit: () => b, delete: () => b,
      gte: () => { q.gte = true; return b; },
      insert: (row) => { calls.inserts.push(row); const r = { error: null, data: { id: calls.inserts.length } }; return { select: () => ({ single: () => Promise.resolve(r) }) }; },
      then: (res, rej) => { calls.counts++; return Promise.resolve(q.gte ? { count: hard, error: null, data: [{ created_at: '2026-11-26T00:00:00Z' }] } : { count: day, error: null }).then(res, rej); },
    };
    return b;
  };
  const createClient = () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => query() });
  const env = { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', ANTHROPIC_API_KEY: 'k' };
  let handler = null;
  const Deno = { env: { get: (k) => env[k] }, serve: (fn) => { handler = fn; } };
  const model = { items: [{ food: 'ovos', qty: 2, unit: 'un', kcal: 180, protein_g: 12, carb_g: 1, fat_g: 14, fiber_g: 0, confidence: 'med', category: 'meal' }], ask: null, refusal: false, days_ago: null };
  const fetch = async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(model) }] }) });
  // eslint-disable-next-line no-new-func
  new Function('createClient', 'Deno', 'fetch', 'console', 'exports', js)(createClient, Deno, fetch, { error() {}, log() {}, warn() {} }, {});
  const call = async (body) => {
    const res = await handler(new Request('http://x/parse-food', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { call, calls };
}
const MEAL = { text: '2 ovos', lang: 'pt', entry_date: '2026-11-26', local_day: '2026-11-26' };
const FOLLOWUP = { followup: { item: { food: 'ovos', qty: 2, unit: 'un', kcal: 180 }, kind: 'amount', answer: '3' }, lang: 'pt', entry_date: '2026-11-26', local_day: '2026-11-26' };

test('food: a test account past the daily parse cap, the follow-up cap and the 24 h ceiling is read, and nothing is counted', async () => {
  for (const [body, day, hard] of [[MEAL, 25, 0], [MEAL, 80, 500], [FOLLOWUP, 25, 0], [FOLLOWUP, 0, 60]]) {
    const s = foodServer({ user: u('dosetrace.io+s25@gmail.com'), day, hard });
    const r = await s.call(body);
    assert.equal(r.status, 200, JSON.stringify({ kind: body.followup ? 'followup' : 'parse', day, hard, r: r.body }));
    assert.ok(Array.isArray(r.body.items) && r.body.items.length === 1);
    assert.equal(s.calls.inserts.length, 0, 'no usage row reserved');
    assert.equal(s.calls.counts, 0, 'the caps are not even counted');
  }
});

test('food: a normal account at each cap is still refused, with the same codes', async () => {
  const user = u('evandro1985@gmail.com');
  let s = foodServer({ user, day: 25 });
  let r = await s.call(MEAL);
  assert.equal(r.status, 429); assert.equal(r.body.code, 'quota_exceeded'); assert.equal(s.calls.inserts.length, 0);
  s = foodServer({ user, day: 25 });
  r = await s.call(FOLLOWUP);
  assert.equal(r.status, 429); assert.equal(r.body.code, 'followup_limit');
  s = foodServer({ user, hard: 60 });
  r = await s.call(MEAL);
  assert.equal(r.status, 429); assert.equal(r.body.code, 'ceiling_24h');
  s = foodServer({ user: u('dosetrace.io@gmail.com', null), day: 25 });
  r = await s.call(MEAL);
  assert.equal(r.status, 429, 'an unconfirmed test address is a normal account');
  s = foodServer({ user, day: 3 });
  r = await s.call(MEAL);
  assert.equal(r.status, 200);
  assert.deepEqual(s.calls.inserts, [{ user_id: 'u1', entry_date: '2026-11-26', kind: 'parse' }], 'under the cap a read is still counted');
});

// ── protocol-assistant: weekly uses and turn caps ───────────────────────────────────────────
const NOW = Date.parse('2026-11-26T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();
function startStore(n) {
  let rows = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, created_at: daysAgo(1 + i * 0.1) }));
  let k = 0;
  return {
    rows: () => rows,
    async startsSince(since) { return rows.filter((r) => r.created_at >= since).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); },
    async reserveStart() { const id = `n${k++}`; rows.push({ id, created_at: new Date(NOW).toISOString() }); return id; },
    async release(id) { rows = rows.filter((r) => r.id !== id); },
  };
}

test('assistant: a test account past the weekly limit starts a conversation (its turns still need the start row)', async () => {
  const st = startStore(10);
  const r = await B().startConversation(st, NOW, B().WEEKLY_LIMIT, { unlimited: true });
  assert.deepEqual(r, { status: 'ok', remaining: null, resetsAt: null, counted: false });
  assert.equal(st.rows().length, 11, 'the conversation is recorded so its answers are allowed');
  const many = startStore(60);
  assert.equal((await B().startConversation(many, NOW, B().WEEKLY_LIMIT, { unlimited: true })).status, 'ok');
});

test('assistant: a normal account at the weekly limit is still refused', async () => {
  const st = startStore(10);
  const r = await B().startConversation(st, NOW);
  assert.equal(r.status, 'refused');
  assert.equal(r.limit, 10);
  assert.equal(st.rows().length, 10);
  assert.equal((await B().startConversation(startStore(10), NOW, B().WEEKLY_LIMIT, { unlimited: false })).status, 'refused');
});

test('assistant: turns — a test account passes the per-conversation, per-day and age caps; a conversation it never started is still refused', () => {
  const { turnAllowed, TURNS_PER_CONVERSATION, TURNS_PER_DAY } = B();
  const free = { unlimited: true };
  assert.deepEqual(turnAllowed({ started: daysAgo(0.1), turns: TURNS_PER_CONVERSATION, turnsDay: 0 }, NOW, free), { ok: true });
  assert.deepEqual(turnAllowed({ started: daysAgo(0.1), turns: 1, turnsDay: TURNS_PER_DAY + 50 }, NOW, free), { ok: true });
  assert.deepEqual(turnAllowed({ started: daysAgo(3), turns: 1, turnsDay: 1 }, NOW, free), { ok: true });
  assert.deepEqual(turnAllowed({ started: null }, NOW, free), { ok: false, code: 'no_conversation' });
  // everyone else: unchanged
  assert.deepEqual(turnAllowed({ started: daysAgo(0.1), turns: TURNS_PER_CONVERSATION, turnsDay: 0 }, NOW), { ok: false, code: 'turn_limit' });
  assert.deepEqual(turnAllowed({ started: daysAgo(0.1), turns: 1, turnsDay: TURNS_PER_DAY }, NOW, { unlimited: false }), { ok: false, code: 'daily_turn_limit' });
  assert.deepEqual(turnAllowed({ started: daysAgo(3), turns: 0, turnsDay: 0 }, NOW), { ok: false, code: 'conversation_expired' });
});

test('assistant: index.ts passes the test-account flag to the start and to the turn check', () => {
  const s = read('supabase/functions/protocol-assistant/index.ts');
  assert.match(s, /const noAiCap = isTestAccount\(user\);/);
  assert.match(s, /\}, nowMs, WEEKLY_LIMIT, \{ unlimited: noAiCap \}\);/);
  assert.match(s, /\}, nowMs, \{ unlimited: noAiCap \}\);/);
  assert.ok(s.indexOf('const noAiCap = isTestAccount(user);') > s.indexOf('auth.getUser()'), 'decided only after auth');
});

// Found 2026-11-26 after the deploy: the test accounts in real use are evandro1985+qa, +qa2, +qa3 (the
// Ads recording account), +qa4 — plus-aliases of the founder's own Gmail inbox, which the rule missed.
// They are test accounts too; evandro1985@gmail.com itself stays limited (founder "1 sim": it tests
// the free limits).
test('test account: the plus-aliases of the founder test inbox count, the bare address does not', () => {
  const { isTestAccount } = T();
  for (const e of ['evandro1985+qa@gmail.com', 'evandro1985+qa2@gmail.com', 'evandro1985+qa3@gmail.com', 'EVANDRO1985+QA4@gmail.com ']) {
    assert.equal(isTestAccount(u(e)), true, e);
  }
  for (const e of ['evandro1985@gmail.com', 'evandro1985+@gmail.com', 'xevandro1985+qa@gmail.com', 'evandro1985+qa@gmail.com.evil.com']) {
    assert.equal(isTestAccount(u(e)), false, e);
  }
  assert.equal(isTestAccount({ id: 'u1', email: 'evandro1985+qa3@gmail.com', email_confirmed_at: null }), false, 'unconfirmed');
});
