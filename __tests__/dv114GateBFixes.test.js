'use strict';
// DV-114 Gate B review (independent senior engineer, 2026-11-01: FIX FIRST). The offline gate answer
// kept on the phone (lib/pendingGate) must be: told apart the same way at the gate and in the flush
// (a busy or down server is temporary, never a refusal); never erased by a save that lands while the
// written answer is being removed; kept per account and counted by the deliberate sign-out like any
// unsent change; and read by the rest of the app (Edit profile, greeting, body map, calculator),
// with a newer Settings save winning over an older kept answer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../lib/pendingGate');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}

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

// ── Finding 3 (LOW): a save that lands while the written answer is being removed is kept ────────
test('Gate B 3: an answer saved during the flush clear is never erased (memory and phone)', async () => {
  const base = memStorage();
  let release;
  const held = new Promise((r) => { release = r; });
  let holdNext = false;
  const storage = {
    m: base.m,
    getItem: base.getItem,
    setItem: async (k, v) => { if (holdNext) { holdNext = false; await held; } return base.setItem(k, v); },
    removeItem: async (k) => { if (holdNext) { holdNext = false; await held; } return base.removeItem(k); },
  };
  const { gate, writes } = makeGate({ storage });
  await gate.load();
  await gate.save('u1', { adult_confirmed_at: 'X', birth_year: 1985 });
  holdNext = true; // the clear after the write waits
  const flushing = gate.flush();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  // Meanwhile the profile gate is answered (offline) and kept.
  const saving = gate.save('u1', { primary_goal: 'recomp' });
  release();
  await saving;
  assert.equal((await flushing).status, 'written');
  assert.equal(writes.length, 1);
  const kept = gate.get('u1');
  assert.ok(kept && kept.patch.primary_goal === 'recomp', 'the newer answer stays in memory');
  const raw = storage.m.get(G.KEY);
  assert.ok(raw && raw.includes('recomp'), 'and on the phone');
  // It is sent with the next flush.
  assert.equal((await gate.flush()).status, 'written');
  assert.equal(writes[1].primary_goal, 'recomp');
});

// ── Finding 1 (MEDIUM): per account, counted by the deliberate sign-out, removed only after it ──
test('Gate B 1: another account saving on this phone never drops the first account\'s kept answer', async () => {
  const storage = memStorage();
  const a = makeGate({ storage, uid: 'u1' });
  await a.gate.load();
  await a.gate.save('u1', { adult_confirmed_at: 'X', birth_year: 1985 });
  await a.gate.save('u2', { primary_goal: 'recomp' });
  assert.deepEqual(a.gate.get('u1').patch, { adult_confirmed_at: 'X', birth_year: 1985 });
  assert.deepEqual(a.gate.get('u2').patch, { primary_goal: 'recomp' });
  // After a restart both are still there, each for its own account.
  const b = makeGate({ storage, uid: 'u2' });
  await b.gate.load();
  assert.equal(b.gate.get('u1').userId, 'u1');
  assert.equal(b.gate.get('u2').userId, 'u2');
  // The signed-in account's answer is written; the other one stays for its account.
  assert.equal((await b.gate.flush()).status, 'written');
  assert.deepEqual(b.writes, [{ primary_goal: 'recomp' }]);
  assert.equal(b.gate.get('u2'), null);
  assert.ok(b.gate.get('u1'));
  assert.equal((await b.gate.flush()).status, 'other_user');
  // The one-answer format written before this fix is read as that account's answer.
  const old = makeGate({ storage: memStorage({ [G.KEY]: JSON.stringify({ userId: 'u9', patch: { birth_year: 1990 } }) }), uid: 'u9' });
  await old.gate.load();
  assert.deepEqual(old.gate.get('u9').patch, { birth_year: 1990 });
});

test('Gate B 1: the kept answer counts as one unsent change for its account; removed only by clear(user)', async () => {
  const { gate } = makeGate();
  await gate.load();
  assert.equal(gate.countFor('u1'), 0);
  await gate.save('u1', { adult_confirmed_at: 'X' });
  await gate.save('u1', { primary_goal: 'recomp' });
  assert.equal(gate.countFor('u1'), 1, 'one answer, however many gates it holds');
  assert.equal(gate.countFor('u2'), 0);
  await gate.save('u2', { a: 1 });
  await gate.clear('u1');
  assert.equal(gate.countFor('u1'), 0);
  assert.equal(gate.countFor('u2'), 1, 'only that account\'s answer goes');
  // The sheet's summary names it with the other unsent kinds.
  const s = G.addGateToSummary({ count: 2, byKind: { dose: 2 }, from: '2026-10-30', to: '2026-10-31', refused: 0 }, 1);
  assert.equal(s.count, 3);
  assert.deepEqual(s.byKind, { dose: 2, profile: 1 });
  assert.equal(s.from, '2026-10-30');
  assert.equal(G.addGateToSummary(null, 1), null, 'an unreadable count stays unreadable (5b)');
  assert.deepEqual(G.addGateToSummary({ count: 0, byKind: {}, from: null, to: null, refused: 0 }, 0), { count: 0, byKind: {}, from: null, to: null, refused: 0 });
});

test('Gate B 1: the sign-out sheet names the kept answer in its list (6 languages)', () => {
  const { KIND_ORDER } = require('../lib/unsentSummary');
  assert.ok(KIND_ORDER.includes('profile'));
  const T = loadTranslations();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(T[l].dev_kind_profile_one && T[l].dev_kind_profile_many.includes('{n}'), l);
  }
  assert.equal(T.pt.dev_kind_profile_one, '1 resposta do perfil');
  const { signOutSheet } = require('../lib/deviceCopy');
  const t = (k) => T.pt[k] || k;
  const sheet = signOutSheet({ t, language: 'pt', timeFormat: '24h', offline: true, summary: G.addGateToSummary({ count: 0, byKind: {}, from: null, to: null, refused: 0 }, 1), lastBackup: null, onAnyway: () => {}, onStay: () => {} });
  assert.match(sheet.body, /1 resposta do perfil/);
  assert.equal(sheet.buttons[1].label, T.pt.settings_signout_anyway);
});

test('Gate B 1: the deliberate sign-out tries to send it first, counts it, and removes it only once signed out', () => {
  const acts = read('lib/accountActions.js');
  const fn = acts.slice(acts.indexOf('export async function signOutIntended('), acts.indexOf('// A-119 OD-9: not signed out yet'));
  assert.match(fn, /forceSync: async \(\) => \{ try \{ await gateStore\(\)\.flushPendingGate\(\); \} catch \{[^}]*\} return forceSync\(\); \}/);
  assert.match(fn, /pendingForSignOut\(\{[^}]*\}\) \+ gateStore\(\)\.keptGateCount\(sessionUserId\)/);
  assert.match(fn, /if \(r && r\.blocked === false && uid\) \{ try \{ await gateStore\(\)\.forgetKeptGate\(uid\); \}/);
  // Account deletion takes it with the account.
  const del = acts.slice(acts.indexOf('export async function finishAccountDeletion('), acts.indexOf('// Entries of a protocol deleted forever'));
  assert.match(del, /forgetKeptGate\(userId\)/);
  // The sheet's facts name it.
  assert.match(read('lib/deviceRuntime.js'), /summary = addGateToSummary\(summary, keptGateCount\(uid\)\)/);
  const store = read('lib/pendingGateStore.js');
  assert.match(store, /export function keptGateCount\(userId\) \{ return pendingGate\.countFor\(userId\); \}/);
  assert.match(store, /export function forgetKeptGate\(userId\) \{ return pendingGate\.clear\(userId\); \}/);
  // App decides the gate with THIS account's kept answer.
  assert.match(read('App.js'), /const gateAnswer = usePendingGate\(session && session\.user \? session\.user\.id : null\);/);
});
