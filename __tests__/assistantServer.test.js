'use strict';
// The protocol-assistant edge function and its limit (AP-18: 10 conversations a week per
// user, every plan, enforced on the server, separate from the scan pool), key handling, and
// the fail-safe client (AP-16). Pure parts run here; index.ts is checked statically.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../supabase/functions/protocol-assistant/budget.ts');
const { assistantErrorKind, assistantErrorNotice } = require('../lib/assistantErrors');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const INDEX = read('supabase', 'functions', 'protocol-assistant', 'index.ts');
const MIGRATION = read('supabase', 'migrations', '20261003000000_ai_assistant_usage.sql');
const CLIENT = read('lib', 'assistantClient.js');
const NOW = Date.parse('2026-10-03T12:00:00Z');

// An in-memory usage table for one user.
function memStore(initial = [], opts = {}) {
  let rows = initial.map((r, i) => ({ id: r.id || `s${i}`, created_at: r.created_at }));
  let n = 1000;
  return {
    rows: () => rows,
    async startsSince(since) { if (opts.failCount) return null; return rows.filter((r) => r.created_at >= since).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : String(a.id) < String(b.id) ? -1 : 1)); },
    async reserveStart() { if (opts.failInsert) return null; const id = `n${n++}`; rows.push({ id, created_at: new Date(NOW).toISOString() }); return id; },
    async release(id) { rows = rows.filter((r) => r.id !== id); },
  };
}
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

test('AP-18: 10 uses per rolling 7 days, for everyone (no plan lookup)', () => {
  assert.equal(B.WEEKLY_LIMIT, 10);
  assert.equal(B.WINDOW_MS, 7 * 86400000);
  assert.doesNotMatch(INDEX, /revenuecat|entitlement|premium/i, 'the limit is the same on every plan');
});

test('AP-18: under the limit a start is counted and says how many are left', async () => {
  const st = memStore(Array.from({ length: 3 }, (_, i) => ({ created_at: daysAgo(1 + i) })));
  const r = await B.startConversation(st, NOW);
  assert.deepEqual(r, { status: 'ok', remaining: 6, resetsAt: null, counted: true });
  assert.equal(st.rows().length, 4);
});

test('AP-18: the 11th start in 7 days is refused, with when one frees up; starts older than 7 days do not count', async () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ created_at: daysAgo(6 - i * 0.5) }));
  const r = await B.startConversation(memStore(ten), NOW);
  assert.equal(r.status, 'refused');
  assert.equal(r.limit, 10);
  assert.equal(r.resetsAt, new Date(Date.parse(daysAgo(6)) + B.WINDOW_MS).toISOString(), 'the oldest counted use + 7 days');
  const old = Array.from({ length: 10 }, () => ({ created_at: daysAgo(8) }));
  assert.equal((await B.startConversation(memStore(old), NOW)).status, 'ok');
});

test('AP-18: starts fired together cannot pass the limit (reserve, then check the place)', async () => {
  const st = memStore(Array.from({ length: 8 }, (_, i) => ({ created_at: daysAgo(2), id: `a${i}` })));
  const results = await Promise.all(Array.from({ length: 6 }, () => B.startConversation(st, NOW)));
  assert.equal(results.filter((r) => r.status === 'ok').length, 2);
  assert.equal(st.rows().length, 10, 'refused reservations are released');
});

test('AP-18 / AP-16: a broken counter never blocks a signed-in user (fail open, uncounted)', async () => {
  assert.deepEqual(await B.startConversation(memStore([], { failCount: true }), NOW), { status: 'ok', remaining: null, resetsAt: null, counted: false });
  assert.deepEqual(await B.startConversation(memStore([], { failInsert: true }), NOW), { status: 'ok', remaining: null, resetsAt: null, counted: false });
});

test('turns: only inside a conversation this user started, under a day old, capped per conversation and per day', () => {
  assert.deepEqual(B.turnAllowed({ started: null }, NOW), { ok: false, code: 'no_conversation' }, 'skipping start cannot bypass the limit');
  assert.deepEqual(B.turnAllowed({ started: daysAgo(2), turns: 0, turnsDay: 0 }, NOW), { ok: false, code: 'conversation_expired' });
  assert.deepEqual(B.turnAllowed({ started: daysAgo(0.1), turns: 40, turnsDay: 0 }, NOW), { ok: false, code: 'turn_limit' });
  assert.deepEqual(B.turnAllowed({ started: daysAgo(0.1), turns: 1, turnsDay: 200 }, NOW), { ok: false, code: 'turn_limit' });
  assert.deepEqual(B.turnAllowed({ started: daysAgo(0.1), turns: 1, turnsDay: 1 }, NOW), { ok: true });
  assert.deepEqual(B.turnAllowed({}, NOW), { ok: true }, 'counts unavailable → fail open');
  assert.equal(B.isUuid('6f1c1c3e-2b2a-4c5d-9e8f-0a1b2c3d4e5f'), true);
  assert.equal(B.isUuid("x' or 1=1 --"), false);
});

test('the edge function: auth first, the limit before any AI call, structured output, validation, no user text logged, key only from secrets', () => {
  assert.match(INDEX, /auth\.getUser\(\)/);
  assert.ok(INDEX.indexOf("action === 'start'") < INDEX.indexOf('api.anthropic.com'), 'start is handled before the model is ever called');
  assert.ok(INDEX.indexOf('turnAllowed(') < INDEX.indexOf('api.anthropic.com'), 'a turn is checked before the model call');
  assert.match(INDEX, /const MODEL = 'claude-haiku-4-5';/);
  assert.match(INDEX, /output_config: \{ format: \{ type: 'json_schema', schema: OUTPUT_SCHEMA \} \}/);
  assert.match(INDEX, /return json\(\{ result: validateUnderstanding\(step, raw, text\) \}, 200\);/);
  assert.match(INDEX, /Deno\.env\.get\('ANTHROPIC_API_KEY'\)/);
  assert.doesNotMatch(INDEX, /sk-ant-/);
  for (const line of INDEX.split('\n').filter((l) => /console\.(log|error|warn)/.test(l))) {
    assert.doesNotMatch(line, /\btext\b|body\)|raw\b/, `no user text in logs: ${line.trim()}`);
  }
  assert.match(INDEX, /if \(text\.length > MAX_TEXT\)/);
  assert.match(INDEX, /stop_reason === 'refusal'/);
  assert.match(INDEX, /clearTimeout\(timer\)/, 'the model call has a timeout');
});

test('the usage table: service role only (RLS on, no policies), cascade on account deletion, no user text', () => {
  assert.match(MIGRATION, /enable row level security/);
  assert.doesNotMatch(MIGRATION, /create policy/i);
  assert.match(MIGRATION, /references auth\.users\(id\) on delete cascade/);
  assert.match(MIGRATION, /kind\s+text not null check \(kind in \('start', 'turn'\)\)/);
  const cols = MIGRATION.match(/create table[^(]*\(([\s\S]*?)\n\);/)[1].split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
  assert.deepEqual(cols, ['id', 'user_id', 'conversation_id', 'kind', 'door', 'created_at'], 'no column for what the user typed');
});

test('AP-16: the client never throws and maps failures to app-written notices', () => {
  assert.equal(assistantErrorKind({ online: false }), 'offline');
  assert.equal(assistantErrorKind({ status: null, code: null }), 'offline');
  assert.equal(assistantErrorKind({ status: 429, code: 'quota_exceeded' }), 'quota');
  assert.equal(assistantErrorKind({ status: 429, code: 'turn_limit' }), 'service');
  assert.equal(assistantErrorKind({ status: 404, code: null }), 'service', 'not deployed yet');
  assert.equal(assistantErrorKind({ status: 502, code: 'provider_error' }), 'service');
  assert.deepEqual(assistantErrorNotice({ status: 429, code: 'quota_exceeded', limit: 10, resetsAt: '2026-10-08T09:00:00Z' }, () => 'Thu, Oct 8'),
    { key: 'ap_err_quota', params: { limit: '10', date: 'Thu, Oct 8' } });
  assert.deepEqual(assistantErrorNotice({ status: 429, code: 'quota_exceeded', limit: 10 }, () => ''), { key: 'ap_err_quota_nodate', params: { limit: '10' } });
  assert.deepEqual(assistantErrorNotice({ online: false }), { key: 'ap_err_offline', params: {} });
  assert.match(CLIENT, /try \{[\s\S]*supabase\.functions\.invoke\(FN, \{ body \}\)[\s\S]*\} catch \{\s*return \{ error:/);
});

test('the development stand-in can never run in a production build', () => {
  assert.match(CLIENT, /const devFake = typeof __DEV__ !== 'undefined' && __DEV__ && process\.env\.EXPO_PUBLIC_ASSISTANT_FAKE === '1';/);
  for (const f of ['eas.json', 'app.json']) assert.doesNotMatch(read(f), /EXPO_PUBLIC_ASSISTANT_FAKE/, `${f} never sets the stand-in`);
});
