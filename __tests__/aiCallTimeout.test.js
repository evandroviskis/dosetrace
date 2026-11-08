// AI calls had no client timeout (Galaxy S25, 2026-11-07, app in pt): "Montar com IA" stayed on
// "Lendo sua resposta…" over 2 minutes twice and the vial scan on "Lendo o rótulo…" 3 minutes twice.
// The server logs show the requests never reached Supabase (a phone-side hang); the bug is that the
// spinner never ended, with no error and no retry. Every AI invoke now goes through one bounded wait
// (lib/aiWait invokeAI); when it runs out the screen shows its EXISTING failure state and copy, and a
// late answer is dropped (it cannot overwrite what the screen shows by then).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const { invokeAI, AI_WAIT_MS, AI_DOC_WAIT_MS } = require('../lib/aiWait');
const { scanErrorKind, scanErrorSheet } = require('../lib/bodyScan');
const { assistantErrorKind, assistantErrorNotice } = require('../lib/assistantErrors');
const { sendFailureNotice, followupFailure } = require('../lib/foodThread');

test('AI wait: a call that never answers ends at the limit with a timeout error, and its request is aborted', async () => {
  let signal = null;
  const t0 = Date.now();
  const r = await invokeAI((name, opts) => { signal = opts.signal; return new Promise(() => {}); }, 'protocol-assistant', { a: 1 }, { ms: 40 });
  assert.ok(Date.now() - t0 >= 35, 'it waited for the limit');
  assert.equal(r.data, null);
  assert.deepEqual(r.error, { status: null, code: 'timeout', body: null, kind: 'timeout' });
  assert.ok(signal && signal.aborted, 'the hung request is cancelled');
});

test('AI wait: a late answer after the timeout is dropped (it cannot overwrite the failure the screen shows)', async () => {
  let answer;
  const r = await invokeAI(() => new Promise((res) => { answer = res; }), 'extract-bloodwork', {}, { ms: 20 });
  assert.equal(r.error.kind, 'timeout');
  answer({ data: { vial: { compound_name: 'late' } }, error: null });
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(r.data, null, 'the late answer never reaches the caller');
  assert.equal(r.error.code, 'timeout');
});

test('AI wait: a hang while reading the error body is bounded too', async () => {
  const error = { context: { status: 502, clone: () => ({ json: () => new Promise(() => {}) }) } };
  const r = await invokeAI(async () => ({ data: null, error }), 'parse-food', {}, { ms: 20 });
  assert.equal(r.error.kind, 'timeout');
});

test('AI wait: answers and server errors pass through unchanged; a throw is a network error; never throws', async () => {
  const ok = await invokeAI(async (name, opts) => ({ data: { name, body: opts.body }, error: null }), 'parse-food', { text: 'x' }, { ms: 1000 });
  assert.deepEqual(ok, { data: { name: 'parse-food', body: { text: 'x' } }, error: null });
  const body = { code: 'quota_exceeded', limit: 3 };
  const err = await invokeAI(async () => ({ data: null, error: { context: { status: 429, clone: () => ({ json: async () => body }) } } }), 'extract-bloodwork', {}, { ms: 1000 });
  assert.deepEqual(err.error, { status: 429, code: 'quota_exceeded', body, kind: 'error' });
  const noBody = await invokeAI(async () => ({ data: null, error: { context: { status: 500 } } }), 'x', {}, { ms: 1000 });
  assert.deepEqual(noBody.error, { status: 500, code: null, body: null, kind: 'error' });
  const thrown = await invokeAI(() => { throw new Error('boom'); }, 'x', {}, { ms: 1000 });
  assert.deepEqual(thrown.error, { status: null, code: null, body: null, kind: 'thrown' });
  const fetchErr = await invokeAI(async () => ({ data: null, error: { context: new TypeError('Network request failed') } }), 'x', {}, { ms: 1000 });
  assert.deepEqual(fetchErr.error, { status: null, code: null, body: null, kind: 'error' }, 'a fetch error keeps its old reading (no status)');
});

test('AI wait: the limits fit a real AI call and stay under the edge-function request limit', () => {
  assert.equal(AI_WAIT_MS, 60000, 'assistant, food and vial label: seconds in real use; 60 s only ends a hang');
  assert.equal(AI_DOC_WAIT_MS, 120000, 'lab report / vaccine record: long reports take up to about a minute');
  assert.ok(AI_DOC_WAIT_MS < 150000, 'an edge-function request cannot last longer than 150 s anyway');
});

test('AI wait: every AI invoke of the app goes through invokeAI (none waits forever)', () => {
  const direct = /functions\.invoke\(\s*(['"](extract-bloodwork|parse-food|protocol-assistant)['"]|FN\b|FOOD_FN\b)/;
  for (const f of ['lib/assistantClient.js', 'lib/nutritionClient.js', 'screens/ProtocolsScreen.js', 'screens/BodyScreen.js', 'screens/components/VaccinesSection.js']) {
    const src = read(f);
    assert.doesNotMatch(src, direct, `${f} still calls an AI function without the bounded wait`);
    assert.match(src, /invokeAI\(/, `${f} uses invokeAI`);
  }
  assert.match(read('lib/assistantClient.js'), /invokeAI\(fnInvoke, FN, body\)/);
  assert.match(read('lib/nutritionClient.js'), /invokeAI\(fnInvoke, FOOD_FN, body\)/);
  assert.match(read('screens/ProtocolsScreen.js'), /invokeAI\(fnInvoke, 'extract-bloodwork', \{ kind: 'vial'/);
  assert.match(read('screens/BodyScreen.js'), /invokeAI\(fnInvoke, 'extract-bloodwork', reqBody, \{ ms: AI_DOC_WAIT_MS \}\)/);
  assert.match(read('screens/components/VaccinesSection.js'), /invokeAI\(fnInvoke, 'extract-bloodwork', \{ kind: 'vaccines', lang: language, \.\.\.source \}, \{ ms: AI_DOC_WAIT_MS \}\)/);
});

test('AI wait: protocol assistant — a timeout is the existing "can\'t connect" notice; the typed text stays for Send again', () => {
  const src = read('lib/assistantClient.js');
  // The client maps a timeout / no answer to { status: null, code: null } → offline (AP-16).
  assert.match(src, /error\.kind !== 'error'\) return \{ error: \{ status: null, code: null, timedOut: error\.kind === 'timeout' \} \}/);
  assert.equal(assistantErrorKind({ status: null, code: null, timedOut: true }), 'offline');
  assert.equal(assistantErrorNotice({ status: null, code: null, timedOut: true }).key, 'ap_err_offline');
  const ui = read('screens/components/ProtocolAssistant.js');
  assert.match(ui, /const r = await session\.current\.understand\(step, typed\.slice\(0, 300\), language, now\(\)\);\n\s+setBusy\(false\);/);
  assert.match(ui, /\/\/ Nothing is lost: the typed text stays in the box/);
});

test('AI wait: food chat — a timeout is the existing "saved, tried again later" path (the row stays pending and is retried)', () => {
  assert.equal(sendFailureNotice({ ok: false, code: 'timeout', status: null }, true), 'retry');
  assert.equal(sendFailureNotice({ ok: false, code: 'timeout', status: null }, false), 'offline');
  assert.equal(followupFailure({ ok: false, code: 'timeout', status: null }), 'retry', 'a follow-up answer is kept and retried');
  assert.match(read('lib/nutritionClient.js'), /if \(error\.kind === 'timeout'\) return \{ ok: false, code: 'timeout', status: null \};/);
});

test('AI wait: lab report, vaccine record and vial label — a timeout is the existing "Scan service unavailable" sheet, never blamed on the file', () => {
  assert.equal(scanErrorKind({ code: 'timeout', status: null }), 'service');
  const t = (k) => k;
  assert.deepEqual(scanErrorSheet('service', t, { what: 'vaccine' }), { title: 'blood_error_service', body: 'blood_error_service_sub' });
  const vial = read('screens/ProtocolsScreen.js');
  assert.match(vial, /const serviceDown = \['provider_error', 'not_configured', 'internal_error', 'timeout'\]\.includes\(code\)/);
  // The spinner is switched off right after the bounded wait, so the button can be tapped again.
  assert.match(vial, /\{ ms: AI_WAIT_MS \}\);\n\s+setVialScanning\(false\);/);
});

test('AI wait: a timed-out scan is never counted on the phone — the app keeps no scan counter, the line is the server\'s number', () => {
  const body = read('screens/BodyScreen.js');
  const sets = body.match(/setScanUsage\([^)]*\)/g) || [];
  assert.deepEqual(sets, ['setScanUsage(u)'], 'the only write is the server\'s answer');
  assert.match(read('lib/scanUsage.js'), /The app keeps no counter of its own/);
});
