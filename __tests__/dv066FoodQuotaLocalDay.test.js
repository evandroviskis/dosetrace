'use strict';
// DV-066 (DL-28, AD-79 item 8; founder go 2026-11-01, picture docs/design/rodada1-hoje-registro.html #dv066):
// a meal typed offline stays "saved, I'll read it later". If, once the connection is back, the 25 reads
// of THAT entry's day were already used, the server refused it every time (it counted by the entry's day)
// and the item said "I'll try again" forever, with no reason. Now:
//   - server (parse-food): the daily caps count the user's LOCAL DAY OF THE REQUEST (local_day, sent by the
//     app); an app that does not send it (older versions) is counted by entry_date as before;
//   - app: a quota refusal of an offline row is told apart from being offline: the row is marked
//     (parse_status 'quota_wait:<local day>'), keeps its text, the note under it reads "Ainda não lido —
//     limite diário atingido. Vou ler amanhã." in the attention colour, the chat says once why, and the row
//     is read again only on a later local day.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadFn, read } = require('./helpers/extractFn');
const { rowsToReparse, quotaWaitStatus, quotaWaitDay } = require('../lib/nutrition');
const { buildThread, sendFailureNotice } = require('../lib/foodThread');
const { translations: T } = require('../i18n/translations');

// ── The server's request handling, run for real (transpiled), with Supabase and the model faked ──
function serverHandler(usage) {
  let src = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/parse-food/index.ts'), 'utf8');
  src = src.replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/[^']+';$/m, '');
  // ./usage.ts (the delivered-or-given-back slot, 2026-11-11) is inlined: the handler runs as one script.
  const usageSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/parse-food/usage.ts'), 'utf8').replace(/^export /gm, '');
  src = src.replace(/^import \{ countIfDelivered \} from '\.\/usage\.ts';$/m, usageSrc);
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const calls = { dayQueries: [], inserts: [] };
  const query = () => {
    const q = { filters: {}, head: false };
    const b = {
      select: () => b, gte: (c, v) => { q.filters[c] = v; q.gte = true; return b; },
      eq: (c, v) => { q.filters[c] = v; return b; }, order: () => b, limit: () => b,
      insert: (row) => { calls.inserts.push(row); const r = { error: null, data: { id: calls.inserts.length } }; return { select: () => ({ single: () => Promise.resolve(r) }), then: (res, rej) => Promise.resolve(r).then(res, rej) }; },
      then: (res, rej) => {
        if (q.gte) return Promise.resolve({ count: 0, error: null, data: [] }).then(res, rej); // the rolling 24 h ceiling
        calls.dayQueries.push({ ...q.filters });
        const n = usage[`${q.filters.kind}|${q.filters.entry_date}`] || 0;
        return Promise.resolve({ count: n, error: null }).then(res, rej);
      },
    };
    return b;
  };
  const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) }, from: () => query() });
  const env = { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', ANTHROPIC_API_KEY: 'k' };
  let handler = null;
  const Deno = { env: { get: (k) => env[k] }, serve: (fn) => { handler = fn; } };
  const model = { items: [{ food: 'ovos mexidos', qty: 2, unit: 'un', kcal: 180, protein_g: 12, carb_g: 1, fat_g: 14, confidence: 'med', category: 'meal' }], ask: null, refusal: false, days_ago: null };
  const fetch = async () => ({ ok: true, json: async () => ({ content: [{ text: JSON.stringify(model) }] }) });
  const quiet = { error: () => {}, log: () => {}, warn: () => {} };
  // eslint-disable-next-line no-new-func
  new Function('createClient', 'Deno', 'fetch', 'console', 'exports', js)(createClient, Deno, fetch, quiet, {});
  const call = async (body) => {
    const res = await handler(new Request('http://x/parse-food', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { call, calls };
}

test('server: an offline meal of a full day is read when the day of the request still has reads', async () => {
  // Oct 31 used all 25 reads; the meal typed offline on Oct 31 is sent on Nov 1 (3 reads used so far).
  const s = serverHandler({ 'parse|2026-10-31': 25, 'parse|2026-11-01': 3 });
  const r = await s.call({ text: '2 ovos mexidos', lang: 'pt', entry_date: '2026-10-31', local_day: '2026-11-01' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 1);
  assert.equal(s.calls.dayQueries[0].entry_date, '2026-11-01', 'the cap counts the local day of the request');
  assert.deepEqual(s.calls.inserts[0], { user_id: 'u1', entry_date: '2026-11-01', kind: 'parse' }, 'and the read is counted on that day');
});

test('server: the day of the request used its 25 reads → quota_exceeded (429)', async () => {
  const s = serverHandler({ 'parse|2026-11-01': 25 });
  const r = await s.call({ text: '2 ovos mexidos', lang: 'pt', entry_date: '2026-10-31', local_day: '2026-11-01' });
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'quota_exceeded');
  assert.equal(s.calls.inserts.length, 0);
});

test('server: an older app (no local_day) is counted by entry_date, as before', async () => {
  const s = serverHandler({ 'parse|2026-10-31': 25 });
  const r = await s.call({ text: '2 ovos mexidos', lang: 'pt', entry_date: '2026-10-31' });
  assert.equal(r.status, 429);
  assert.equal(s.calls.dayQueries[0].entry_date, '2026-10-31');
  const ok = serverHandler({});
  await ok.call({ text: 'x', lang: 'pt', entry_date: '2026-10-31', local_day: 'not a day' });
  assert.equal(ok.calls.dayQueries[0].entry_date, '2026-10-31', 'a malformed local_day falls back too');
});

test('server: follow-up answers count the local day of the request too', async () => {
  const s = serverHandler({ 'followup|2026-11-01': 25 });
  const r = await s.call({ followup: { item: { food: 'ovos', qty: 2, unit: 'un', kcal: 180 }, kind: 'amount', answer: '3' }, lang: 'pt', entry_date: '2026-10-31', local_day: '2026-11-01' });
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'followup_limit');
});

// ── The app ──
test('app: parseFood and parseFollowup send the local day of the request', () => {
  const sent = [];
  const deps = { invoke: (b) => { sent.push(b); return b; }, localISO: () => '2026-11-01' };
  loadFn('lib/nutritionClient.js', 'export function parseFood(', 'parseFood', deps)('2 ovos', 'pt', '2026-10-31', []);
  loadFn('lib/nutritionClient.js', 'export function parseFollowup(', 'parseFollowup', deps)({ food: 'ovos' }, 'amount', '3', 'pt', '2026-10-31');
  assert.equal(sent[0].local_day, '2026-11-01');
  assert.equal(sent[0].entry_date, '2026-10-31', 'the entry keeps its own day');
  assert.equal(sent[1].local_day, '2026-11-01');
});

function reparser(res, updates) {
  return loadFn('lib/foodLogActions.js', 'async function reparseRow(', 'reparseRow', {
    inFlight: new Set(),
    parseFood: async () => res,
    recentForParse: () => [],
    updateFoodLog: (id, fields) => { updates.push({ id, fields }); return 1; },
    localISO: () => '2026-11-01',
    sendFailureNotice, quotaWaitStatus,
    withinCatchUp: () => ({ keep: [] }), saveParsed: () => [],
  });
}

test('app: a quota refusal marks the row (text kept); being offline leaves it pending', async () => {
  const row = { id: 7, raw_text: '2 ovos mexidos e uma torrada', entry_date: '2026-10-31', parse_status: 'pending' };
  const u1 = [];
  assert.equal(await reparser({ ok: false, code: 'quota_exceeded', status: 429 }, u1)(row, 'u1', 'pt', []), null);
  assert.deepEqual(u1, [{ id: 7, fields: { parse_status: 'quota_wait:2026-11-01' } }], 'only the status changes: the text stays');
  const u2 = [];
  await reparser({ ok: false, code: null, status: 429 }, u2)(row, 'u1', 'pt', []);
  assert.deepEqual(u2[0].fields, { parse_status: 'quota_wait:2026-11-01' }, 'an older server\'s 429 is the quota too');
  for (const res of [{ ok: false, code: 'network', status: null }, { ok: false, code: 'provider_error', status: 502 }, { ok: false, code: 'ceiling_24h', status: 429 }]) {
    const u = [];
    await reparser(res, u)(row, 'u1', 'pt', []);
    assert.deepEqual(u, [], `${res.code}: kept pending, retried later`);
  }
});

test('app: a marked row is read again only on a later local day', () => {
  assert.equal(quotaWaitStatus('2026-11-01'), 'quota_wait:2026-11-01');
  assert.equal(quotaWaitDay('quota_wait:2026-11-01'), '2026-11-01');
  assert.equal(quotaWaitDay('pending'), null);
  const pending = { id: 1, raw_text: 'a', parse_status: 'pending' };
  const waitToday = { id: 2, raw_text: 'b', parse_status: 'quota_wait:2026-11-01' };
  const waitYesterday = { id: 3, raw_text: 'c', parse_status: 'quota_wait:2026-10-31' };
  assert.deepEqual(rowsToReparse([pending, waitToday, waitYesterday], new Set(), '2026-11-01').map((r) => r.id), [1, 3]);
  assert.deepEqual(rowsToReparse([pending, waitToday, waitYesterday], new Set()).map((r) => r.id), [1], 'no day known: never a marked row');
  assert.match(read('lib/foodLogActions.js'), /rowsToReparse\(rows, localKeys, localISO\(\)\)/);
});

test('app: the chat shows the note under the item and the explanation once', () => {
  const at = (h) => new Date(`2026-11-01T${h}:00`).getTime();
  const rows = [
    { id: 1, user_id: 'u1', entry_date: '2026-10-31', raw_text: '2 ovos mexidos e uma torrada', parse_status: 'quota_wait:2026-11-01', source: 'ai', created_at: new Date(at('09:00')).toISOString() },
    { id: 2, user_id: 'u1', entry_date: '2026-10-31', raw_text: 'um café', parse_status: 'quota_wait:2026-11-01', source: 'ai', created_at: new Date(at('09:05')).toISOString() },
  ];
  const th = buildThread(rows, { todayISO: '2026-11-01', sinceISO: '2026-10-25' });
  const users = th.filter((x) => x.type === 'user');
  assert.deepEqual(users.map((x) => [x.text, x.status]), [['2 ovos mexidos e uma torrada', 'quota_wait'], ['um café', 'quota_wait']]);
  assert.equal(th.filter((x) => x.type === 'quota_wait').length, 1, 'the chat explains once');
  assert.ok(th.findIndex((x) => x.type === 'quota_wait') > th.findIndex((x) => x.type === 'user'), 'after the item');
  const chat = read('screens/FoodChatScreen.js');
  assert.match(chat, /x\.status === 'quota_wait' && <Text style=\{\[s\.userNote, s\.userNoteWarn\]\}>\{t\('nutri_quota_wait_note'\)\}<\/Text>/);
  assert.match(chat, /case 'quota_wait':[\s\S]{0,200}t\('nutri_quota_wait'\)/);
});

test('the texts, 6 languages (pt as approved)', () => {
  assert.equal(T.pt.nutri_quota_wait_note, 'Ainda não lido — limite diário atingido. Vou ler amanhã.');
  assert.equal(T.pt.nutri_quota_wait, 'Este item foi salvo, mas as 25 leituras de hoje já foram usadas. Ele será lido amanhã; o texto fica guardado.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(T[l].nutri_quota_wait_note, l);
    assert.ok(T[l].nutri_quota_wait.includes('25'), l);
  }
});
