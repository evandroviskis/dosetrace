'use strict';
// DV-007 (S1, DL-55): the AI consent belongs to the account that gave it, with its version and
// date, can be withdrawn, and is cleared by the intended sign-out wipe and the cross-account guard.
// Runs the real lib/aiConsent.js functions (cut out with loadFn) over an in-memory AsyncStorage,
// and the real lib/signedOut.js wipe.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { afterSignedOut } = require('../lib/signedOut');

const SRC = read('lib/aiConsent.js');
const consts = (names) => {
  const out = {};
  for (const n of names) {
    const m = new RegExp(`const ${n} = ([^;]+);`).exec(SRC);
    out[n] = m ? new Function(`return ${m[1]};`)() : undefined;
  }
  return out;
};

function makeStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    _m: m,
    async getItem(k) { return m.has(k) ? m.get(k) : null; },
    async setItem(k, v) { m.set(k, String(v)); },
    async removeItem(k) { m.delete(k); },
    async getAllKeys() { return [...m.keys()]; },
    async multiRemove(ks) { for (const k of ks) m.delete(k); },
  };
}

// The module's functions bound to a fake storage and a "who is signed in" switch.
function consentModule(store, who, updates = []) {
  const C = consts(['CONSENT_VERSION', 'CONSENT_PREFIX', 'LEGACY_KEYS']);
  const getCachedUser = async () => (who.id ? { id: who.id } : null);
  const supabase = { auth: { updateUser: async (arg) => { updates.push(arg); return { error: null }; } } };
  const base = { AsyncStorage: store, getCachedUser, supabase, ...C };
  const consentUserId = loadFn('lib/aiConsent.js', 'async function consentUserId(', 'consentUserId', base);
  const writeConsent = loadFn('lib/aiConsent.js', 'async function writeConsent(', 'writeConsent', { ...base, consentUserId });
  const deps = { ...base, consentUserId, writeConsent };
  return {
    grant: loadFn('lib/aiConsent.js', 'export async function grantAIConsent(', 'grantAIConsent', deps),
    revoke: loadFn('lib/aiConsent.js', 'export async function revokeAIConsent(', 'revokeAIConsent', deps),
    has: loadFn('lib/aiConsent.js', 'export async function hasAIConsent(', 'hasAIConsent', deps),
    clear: loadFn('lib/aiConsent.js', 'export async function clearAIConsent(', 'clearAIConsent', deps),
  };
}

test('DV-007: A grants, B signs in on the same phone → B is asked (consent is per account)', async () => {
  const store = makeStore();
  const who = { id: 'user-a' };
  const m = consentModule(store, who);
  await m.grant();
  assert.equal(await m.has(), true, 'A has consented');
  who.id = 'user-b';
  assert.equal(await m.has(), false, 'B never consented');
});

test('DV-007: the record carries the consent version and the date, on this phone only', async () => {
  const store = makeStore();
  const updates = [];
  const m = consentModule(store, { id: 'user-a' }, updates);
  const before = Date.now();
  await m.grant();
  const recKey = [...store._m.keys()].find((k) => k.includes('user-a'));
  assert.ok(recKey, 'the record is keyed by the account');
  const rec = JSON.parse(store._m.get(recKey));
  assert.equal(rec.status, 'granted');
  assert.equal(rec.version, 4);
  assert.ok(Date.parse(rec.at) >= before - 1000, 'dated');
});

// Gate B 6 (1.3.1): the user_metadata.ai_consent copy was never read, is not valid proof (DL-83)
// and cost a USER_UPDATED event and a session rewrite on every grant. Gone.
test('Gate B 6: granting or withdrawing the consent makes no auth call', async () => {
  const store = makeStore();
  const calls = [];
  const m = consentModule(store, { id: 'user-a' }, calls);
  await m.grant();
  await m.revoke();
  assert.deepEqual(calls, [], 'no updateUser / auth call');
  assert.doesNotMatch(SRC, /updateUser|supabase\.auth/);
  assert.doesNotMatch(SRC, /import \{[^}]*\bsupabase\b[^}]*\} from '\.\/supabase'/);
});

test('DV-007: grant then revoke → no consent; the withdrawal is recorded with its date', async () => {
  const store = makeStore();
  const m = consentModule(store, { id: 'user-a' });
  await m.grant();
  await m.revoke();
  assert.equal(await m.has(), false);
  const rec = JSON.parse(store._m.get([...store._m.keys()].find((k) => k.includes('user-a'))));
  assert.equal(rec.status, 'revoked');
  assert.ok(rec.at);
});

test('DV-007: the 1.3.0 phone-wide flag (no owner, no date) does not count as anyone\'s consent', async () => {
  const store = makeStore({ dosetrace_ai_extraction_consent_v4: 'granted' });
  const m = consentModule(store, { id: 'user-a' });
  assert.equal(await m.has(), false);
});

test('DV-007: signed out (no user) → no consent and nothing is recorded', async () => {
  const store = makeStore();
  const m = consentModule(store, { id: null });
  await m.grant();
  assert.equal(await m.has(), false);
  assert.equal(store._m.size, 0);
});

test('DV-007: A grants, intended sign-out wipe, B signs in → hasAIConsent is false (and A\'s record is gone)', async () => {
  const store = makeStore({ dosetrace_ai_extraction_consent_v4: 'granted', other_key: 'kept' });
  const who = { id: 'user-a' };
  const m = consentModule(store, who);
  await m.grant();
  const d = {
    stopSyncEngine() {}, waitForSyncIdle: async () => {}, clearLocalDatabase() {},
    cancelAllNotifications: async () => {}, dismissAllNotifications: async () => {}, logOutPurchases: async () => {},
    clearOnboarding: async () => {}, removeRcStart: async () => {}, clearRealityDeviceFlags: async () => {},
    clearSeenOnboarding: async () => {}, removeQuestions: async () => {}, resetAllSelections() {}, clearAllDrafts() {},
    forgetTodayLayout: async () => {}, clearAIConsent: m.clear,
  };
  assert.equal(await afterSignedOut(true, d), true);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(![...store._m.keys()].some((k) => k.includes('consent')), 'every consent record and the legacy flag are removed');
  assert.equal(store._m.get('other_key'), 'kept');
  who.id = 'user-a';
  assert.equal(await m.has(), false, 'even the same account is asked again after an intended sign-out');
  who.id = 'user-b';
  assert.equal(await m.has(), false);
});

test('DV-007: the App wires clearAIConsent into the wipe steps and the cross-account discard', () => {
  assert.match(read('lib/signedOut.js'), /d\.clearAIConsent/);
  const app = read('App.js');
  assert.match(app, /clearAIConsent,/, 'wipeDeps carries clearAIConsent');
  assert.match(read('lib/accountGuard.js'), /d\.clearAIConsent/, 'the cross-account discard clears it too');
});
