'use strict';
// DV-114 (DL-92; founder 2026-11-01, docs/design/rodada2-conta-exames.html #dv114): "Confirm your age"
// and "Finish your profile" answered OFFLINE — the answer is kept on the phone, the person goes on
// into the app with the toast "Salvo neste celular. Vai para a sua conta quando a internet voltar.",
// and the answer is written to the account once the phone is online (merge-only, never dropped).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../lib/pendingGate');
const { needsAdultConfirmation, adultConfirmPatch } = require('../lib/adultGate');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const T = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NOW = new Date(2026, 10, 1, 10, 0);
const USER = { id: 'u1', user_metadata: { display_name: 'Carla', birth_year: 2012, birth_month: 3, theme: 'dark' } };

// The profile gate rule of lib/supabase (ESM there): the same field checks, read from the source.
function profileGate() {
  const src = read('lib/supabase.js');
  const start = src.indexOf('export const REQUIRED_PROFILE_FIELDS');
  const end = src.indexOf('export function isProfileComplete');
  const body = src.slice(start, end).replace(/export /g, '');
  // eslint-disable-next-line no-new-func
  const { validBirthYear, validBirthMonth } = require('../lib/profileName');
  return new Function('validBirthYear', 'validBirthMonth', `${body}; return { missingProfileFields };`)(validBirthYear, validBirthMonth);
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

function world({ online = false, storage = memStorage(), refuse = null } = {}) {
  const w = { online, writes: [], storage, account: { ...USER.user_metadata } };
  w.gate = G.createPendingGate({
    storage,
    getSessionUserId: async () => 'u1',
    updateUser: async (patch) => {
      if (refuse) return { error: refuse };
      if (!w.online) return { error: OFFLINE };
      w.writes.push(patch);
      w.account = { ...w.account, ...patch }; // supabase merges data keys
      return { error: null };
    },
  });
  return w;
}

test('DV-114: offline confirm → the gate passes, the answer is stored on the phone, nothing written yet', async () => {
  const w = world();
  await w.gate.load();
  const patch = adultConfirmPatch('2026-11-01T13:00:00.000Z', 1985, NOW);
  const r = await G.answerGate({ userId: 'u1', patch, write: async () => ({ error: OFFLINE }), gate: w.gate });
  assert.equal(r.status, 'pending');
  assert.deepEqual(JSON.parse(w.storage.m.get(G.KEY)).byUser.u1.patch, patch, 'kept durably on the phone');
  assert.equal(w.writes.length, 0);
  const seen = G.withPendingAnswer(USER, w.gate.get('u1'));
  assert.equal(needsAdultConfirmation(seen.user_metadata, NOW), false, 'the 18+ gate passes');
  assert.equal(needsAdultConfirmation(USER.user_metadata, NOW), true, 'without the answer it would not');
  assert.equal(seen.user_metadata.theme, 'dark', 'the rest of the metadata is untouched');
  // Another account on this phone never borrows it.
  assert.equal(G.withPendingAnswer({ id: 'u2', user_metadata: { birth_year: 2012 } }, w.gate.get('u1')).user_metadata.adult_confirmed_at, undefined);
});

test('DV-114: back online → written once, merge-only (only the answer\'s keys), then gone from the phone', async () => {
  const w = world();
  await w.gate.load();
  const patch = adultConfirmPatch('2026-11-01T13:00:00.000Z', 1985, NOW);
  await G.answerGate({ userId: 'u1', patch, write: async () => ({ error: OFFLINE }), gate: w.gate });
  assert.equal((await w.gate.flush()).status, 'offline', 'still offline: kept');
  assert.ok(w.storage.m.has(G.KEY));
  w.online = true;
  const [a, b] = await Promise.all([w.gate.flush(), w.gate.flush()]);
  assert.equal(a.status, 'written'); assert.equal(b.status, 'written');
  assert.equal((await w.gate.flush()).status, 'none');
  assert.equal(w.writes.length, 1, 'written once');
  assert.deepEqual(Object.keys(w.writes[0]).sort(), ['adult_confirmed_at', 'birth_year'], 'never the whole metadata');
  assert.equal(w.account.theme, 'dark', 'the other keys of the account stay');
  assert.equal(w.account.birth_year, 1985);
  assert.ok(!w.storage.m.has(G.KEY));
  assert.equal(w.gate.get('u1'), null);
});

test('DV-114: restart before online → still passes the gate, still written later', async () => {
  const storage = memStorage();
  const first = world({ storage });
  await first.gate.load();
  await G.answerGate({ userId: 'u1', patch: adultConfirmPatch('2026-11-01T13:00:00.000Z', 1985, NOW), write: async () => ({ error: OFFLINE }), gate: first.gate });
  // The app is closed and opened again (a new store over the same phone storage), still offline.
  const second = world({ storage });
  assert.equal(second.gate.isReady(), false);
  await second.gate.load();
  assert.equal(needsAdultConfirmation(G.withPendingAnswer(USER, second.gate.get('u1')).user_metadata, NOW), false);
  assert.equal((await second.gate.flush()).status, 'offline');
  second.online = true;
  assert.equal((await second.gate.flush()).status, 'written');
  assert.equal(second.writes.length, 1);
});

test('DV-114: the profile gate answered offline passes with the answer laid over the account', async () => {
  const { missingProfileFields } = profileGate();
  const meta = { display_name: 'Carla', birth_year: 1985, birth_month: 3, gender: 'female', country: 'BR' };
  const user = { id: 'u1', user_metadata: meta };
  assert.deepEqual(missingProfileFields(user), ['goal', 'activity', 'tracking', 'provider']);
  const w = world();
  await w.gate.load();
  const patch = { primary_goal: 'recomp', activity_level: 'light', tracking_types: ['peptides'], has_provider: 'no' };
  assert.equal((await G.answerGate({ userId: 'u1', patch, write: async () => ({ error: OFFLINE }), gate: w.gate })).status, 'pending');
  assert.deepEqual(missingProfileFields(G.withPendingAnswer(user, w.gate.get('u1'))), []);
  // A second gate answered offline joins the first (one pending answer per account, merged).
  await w.gate.save('u1', { adult_confirmed_at: 'X', birth_year: 1985 });
  assert.deepEqual(Object.keys(w.gate.get('u1').patch).sort(), ['activity_level', 'adult_confirmed_at', 'birth_year', 'has_provider', 'primary_goal', 'tracking_types']);
});

test('DV-114: a refusal (not offline) is said as such and never stored as "saved on this phone"; a refused flush keeps the answer', async () => {
  const w = world();
  await w.gate.load();
  const refused = { name: 'AuthApiError', status: 422, message: 'Invalid metadata' };
  const r = await G.answerGate({ userId: 'u1', patch: { adult_confirmed_at: 'X', birth_year: 1985 }, write: async () => ({ error: refused }), gate: w.gate });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, refused);
  assert.equal(w.gate.get('u1'), null, 'nothing kept: the screen says why and stays');
  // Stored offline, later refused by the server: kept (never dropped), and the refusal is told.
  const w2 = world({ refuse: refused });
  await w2.gate.load();
  await w2.gate.save('u1', { adult_confirmed_at: 'X', birth_year: 1985 });
  const told = [];
  w2.gate.subscribe((e) => told.push(e.type));
  assert.equal((await w2.gate.flush()).status, 'refused');
  assert.ok(w2.gate.get('u1'), 'kept on the phone');
  assert.ok(told.includes('refused'));
  // A phone storage that cannot keep it: never "saved".
  const broken = { getItem: async () => null, setItem: async () => { throw new Error('disk'); }, removeItem: async () => {} };
  const w3 = world({ storage: broken });
  await w3.gate.load();
  assert.equal((await G.answerGate({ userId: 'u1', patch: { a: 1 }, write: async () => ({ error: OFFLINE }), gate: w3.gate })).status, 'failed');
  // Online: written straight away, nothing kept.
  const w4 = world({ online: true });
  await w4.gate.load();
  assert.equal((await G.answerGate({ userId: 'u1', patch: { a: 1 }, write: async () => ({ error: null }), gate: w4.gate })).status, 'saved');
  assert.equal(w4.gate.get('u1'), null);
});

test('DV-114: offline is told apart from a refusal', () => {
  assert.equal(G.isOfflineError(OFFLINE), true);
  assert.equal(G.isOfflineError(new TypeError('Network request failed')), true);
  assert.equal(G.isOfflineError({ status: 400, message: 'Bad request' }), false);
  assert.equal(G.isRetryableError({ status: 503, message: 'down' }), true);
  assert.equal(G.isRetryableError({ status: 422, message: 'invalid' }), false);
});

// ── wiring ────────────────────────────────────────────────────────────────────────────────────
test('DV-114: both screens save through answerGate (the one write each), go on when pending and show no error', () => {
  const age = read('screens/AgeConfirmScreen.js');
  const confirm = age.slice(age.indexOf('async function confirmAdult()'), age.indexOf('async function exportData()'));
  assert.match(confirm, /answerGate\(\{[^}]*write: \(\) => supabase\.auth\.updateUser\(\{ data: patch \}\)/);
  assert.match(confirm, /status === 'failed'[\s\S]{0,200}friendlyError\(r\.error, t, 'error_save_failed'\)/);
  const onb = read('screens/OnboardingFlowScreen.js');
  const fin = onb.slice(onb.indexOf('async function finish()'), onb.indexOf('async function handleSignOut()'));
  assert.match(fin, /answerGate\(\{[^}]*write: \(\) => supabase\.auth\.updateUser\(\{ data \}\)/);
  assert.match(fin, /status === 'failed'[\s\S]{0,300}friendlyError\(r\.error, t, 'error_save_failed'\)/);
  assert.match(fin, /clearOnboarding\(\)/);
  // The "Sign out anyway" part stays (dbea7bf, a6f3abe).
  assert.match(age, /signOutSheet\(/);
  assert.match(onb, /signOutSheet\(/);
});

test('DV-114: App.js decides the gates with the pending answer laid over the account; onAuthStateChange stays synchronous', () => {
  const app = read('App.js');
  assert.match(app, /const gateUser = session \? withPendingAnswer\(session\.user, gateAnswer\.pending\) : null;/);
  const gate = app.indexOf('!isProfileComplete(gateUser)');
  const age = app.indexOf('needsAdultConfirmation(gateUser.user_metadata)');
  assert.ok(gate > 0 && age > gate, 'profile gate first, then the 18+ gate — both on gateUser');
  assert.doesNotMatch(app, /isProfileComplete\(session\.user\)|needsAdultConfirmation\(session\.user/, 'no gate reads the bare account');
  // While the phone's answer is not read yet, a gated account sees the empty ground (no gate flash).
  assert.match(app, /!gateAnswer\.ready && gated\(session\.user\) \? \([\s\S]{0,300}<Stack\.Screen name="GateWait" component=\{BootEmpty\} \/>/);
  assert.match(app, /const onMain = !!session && !recovery && !accountHeld && !gated\(gateUser\);/);
  assert.match(app, /<SheetToast text=\{gateToast\} \/>/);
  const cb = app.slice(app.indexOf('supabase.auth.onAuthStateChange('), app.indexOf('// Sign in with Apple: if the user revokes'));
  assert.doesNotMatch(cb, /pendingGate|flushPendingGate/, 'nothing new inside onAuthStateChange');
  assert.match(app, /startPendingGateFlush\(\)/);
});

test('DV-114: the store loads on start and flushes on app open, sign-in, connection back and return to the app', () => {
  const s = read('lib/pendingGateStore.js');
  assert.match(s, /createPendingGate\(/);
  assert.match(s, /AsyncStorage/);
  assert.match(s, /addSyncListener\(/);
  assert.match(s, /e\.type === 'connectivity' && e\.online/);
  assert.match(s, /AppState\.addEventListener\('change'/);
  assert.match(s, /supabase\.auth\.updateUser\(\{ data: patch \}\)/);
  const app = read('App.js');
  const signIn = app.slice(app.indexOf('const onSignedIn = '), app.indexOf('setSignInHandler(onSignedIn);'));
  assert.match(signIn, /flushPendingGate\(\)/);
});

test('DV-114: the toasts in 6 languages (pt as approved)', () => {
  assert.equal(T.pt.gate_saved_offline, 'Salvo neste celular. Vai para a sua conta quando a internet voltar.');
  for (const l of LANGS) {
    assert.ok(T[l].gate_saved_offline, `${l}.gate_saved_offline`);
    assert.ok(T[l].gate_save_refused, `${l}.gate_save_refused`);
  }
});
