'use strict';
// Founder 2026-11-23: he typed the exact macros of a recipe he followed ("41 g de proteína por porção,
// 240 calorias, 12 g de carboidrato, 3 g de fibra, 3 g de gordura, 570 mg de sódio", dictated with a
// self-correction "91 não, anula, 41"). The first read failed (server log 04:52 UTC: non_json_output → 502),
// the row stayed pending and was read only on the retry, so it looked refused. Now:
//   - the server takes the JSON object even when the model wraps it in a sentence or a note;
//   - a reply with no JSON at all gets ONE more model call before the server gives up;
//   - the prompt says: numbers the user states for what they ate are used exactly (per serving × servings),
//     confidence high, no question; and a spoken correction ("91, no, 41") keeps the corrected value.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/parse-food/index.ts'), 'utf8');

function serverWith(replies) {
  let src = SRC.replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/[^']+';$/m, '');
  const usageSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/parse-food/usage.ts'), 'utf8').replace(/^export /gm, '');
  src = src.replace(/^import \{ countIfDelivered \} from '\.\/usage\.ts';$/m, usageSrc);
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const query = () => {
    const b = {
      select: () => b, gte: () => { b._gte = true; return b; }, eq: () => b, order: () => b, limit: () => b,
      insert: () => { const r = { error: null, data: { id: 1 } }; return { select: () => ({ single: () => Promise.resolve(r) }) }; },
      delete: () => b,
      then: (res, rej) => Promise.resolve({ count: 0, error: null, data: [] }).then(res, rej),
    };
    return b;
  };
  const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) }, from: () => query() });
  const env = { SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', ANTHROPIC_API_KEY: 'k' };
  let handler = null;
  const Deno = { env: { get: (k) => env[k] }, serve: (fn) => { handler = fn; } };
  const sent = [];
  let n = 0;
  const fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); const text = replies[Math.min(n++, replies.length - 1)]; return { ok: true, json: async () => ({ content: [{ text }] }) }; };
  const quiet = { error: () => {}, log: () => {}, warn: () => {} };
  // eslint-disable-next-line no-new-func
  new Function('createClient', 'Deno', 'fetch', 'console', 'exports', js)(createClient, Deno, fetch, quiet, {});
  const call = async (body) => {
    const res = await handler(new Request('http://x/parse-food', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { call, sent };
}

const RECIPE = { items: [{ food: 'receita caseira', qty: 1, unit: 'porção', kcal: 240, protein_g: 41, carb_g: 12, fat_g: 3, fiber_g: 3, confidence: 'high', category: 'meal', days_ago: null }], ask: null, refusal: false, days_ago: null };
const TEXT = 'Fiz uma receita, foram 91 não, anula, 41 gramas de proteína por porção, 240 calorias, 12 de carboidrato, 3 de fibra, 3 de gordura, 570 mg de sódio';

test('a JSON object wrapped in a sentence or a note is still read', async () => {
  const s = serverWith([`Here is the parsed entry:\n${JSON.stringify(RECIPE)}\nNote: the user gave exact values, used as stated.`]);
  const r = await s.call({ text: TEXT, lang: 'pt', entry_date: '2026-11-23' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items[0].protein_g, 41);
  assert.equal(r.body.items[0].kcal, 240);
  assert.equal(s.sent.length, 1, 'no second call when the first reply had the object');
});

test('a reply with no JSON gets one more model call, and that answer is used', async () => {
  const s = serverWith(['Sure! The recipe has 240 kcal and 41 g of protein per serving.', JSON.stringify(RECIPE)]);
  const r = await s.call({ text: TEXT, lang: 'pt', entry_date: '2026-11-23' });
  assert.equal(r.status, 200);
  assert.equal(r.body.items[0].fiber_g, 3);
  assert.equal(s.sent.length, 2);
});

test('two replies with no JSON → invalid_parse (502), and no third call', async () => {
  const s = serverWith(['no json here', 'still none']);
  const r = await s.call({ text: TEXT, lang: 'pt', entry_date: '2026-11-23' });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'invalid_parse');
  assert.equal(s.sent.length, 2);
});

test('the prompt tells the model to use numbers the user states, and to keep a spoken correction', () => {
  assert.match(SRC, /exact numbers[^`]*use them exactly/i, 'stated macros are used as given');
  assert.match(SRC, /per serving[^`]*servings/i, 'per-serving values scale by the servings eaten');
  assert.match(SRC, /corrects? (a|the) number[^`]*corrected value/i, 'a dictated self-correction keeps the corrected value');
});
