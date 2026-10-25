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

// ── DV-007 = A (founder 2026-10-20, docs/design/dv007-ai-consent-withdraw.html): the "AI use"
// switch in Settings › Data & privacy. ON = this account's consent is granted. OFF withdraws at
// once (nothing deleted, no sheet). ON shows the AI consent sheet every AI feature shows, and the
// switch stays ON only after "Agree". Runs the real lib/aiUseSwitch over the real consent functions.
const { createAIUseSwitch } = require('../lib/aiUseSwitch');
const { translations } = require('../i18n/translations');

function settingsSwitch(store, who) {
  const m = consentModule(store, who);
  const calls = [];
  const out = { on: null, sheet: null, calls, m };
  const sw = createAIUseSwitch();
  const t = (k) => translations.en[k];
  const d = {
    t,
    has: async () => { calls.push('has'); return m.has(); },
    grant: async () => { calls.push('grant'); return m.grant(); },
    revoke: async () => { calls.push('revoke'); return m.revoke(); },
    setOn: (v) => { out.on = v; },
    showSheet: (cfg) => { calls.push('sheet'); out.sheet = cfg; },
    openPrivacy: () => { calls.push('privacy'); },
  };
  out.load = () => sw.load(d);
  out.tap = (v) => sw.toggle(v, d);
  out.press = async (kind) => {
    const b = out.sheet.buttons.find((x) => x.kind === kind);
    if (b.onPress) await b.onPress();
  };
  return out;
}

test('DV-007 A: switch OFF → revokeAIConsent at once, nothing else (no sheet, no grant, nothing deleted)', async () => {
  const store = makeStore({ other_key: 'kept' });
  const who = { id: 'user-a' };
  const s = settingsSwitch(store, who);
  await s.m.grant();
  await s.load();
  assert.equal(s.on, true, 'granted → the switch shows ON');
  s.calls.length = 0;
  await s.tap(false);
  assert.deepEqual(s.calls, ['revoke'], 'only the withdrawal');
  assert.equal(s.on, false);
  assert.equal(s.sheet, null, 'no sheet');
  assert.equal(await s.m.has(), false, 'withdrawn');
  assert.equal(store._m.get('other_key'), 'kept', 'nothing else on the phone changes');
});

test('DV-007 A: switch ON → the existing AI consent sheet; Agree → granted and ON', async () => {
  const store = makeStore();
  const s = settingsSwitch(store, { id: 'user-a' });
  await s.load();
  assert.equal(s.on, false);
  s.calls.length = 0;
  await s.tap(true);
  assert.deepEqual(s.calls, ['sheet'], 'the sheet first, nothing granted yet');
  assert.equal(s.on, false, 'still OFF while the sheet is open');
  const en = translations.en;
  assert.equal(s.sheet.icon, 'ai_spark');
  assert.equal(s.sheet.title, en.ai_consent_title);
  assert.equal(s.sheet.body, en.ai_consent_body);
  assert.equal(s.sheet.link.label, en.ai_consent_privacy);
  assert.deepEqual(s.sheet.buttons.map((b) => [b.label, b.kind]), [[en.cancel, 'secondary'], [en.ai_consent_agree, 'primary']]);
  assert.equal(await s.m.has(), false, 'not granted before Agree');
  await s.press('primary');
  assert.ok(s.calls.includes('grant'));
  assert.equal(await s.m.has(), true);
  assert.equal(s.on, true);
});

test('DV-007 A: switch ON → Cancel, the policy link or closing the sheet → stays OFF, nothing granted', async () => {
  for (const how of ['cancel', 'link', 'dismiss']) {
    const store = makeStore();
    const s = settingsSwitch(store, { id: 'user-a' });
    await s.load();
    await s.tap(true);
    if (how === 'cancel') await s.press('secondary');
    if (how === 'link') { s.sheet.link.onPress(); assert.ok(s.calls.includes('privacy')); }
    if (how === 'dismiss' && s.sheet.onDismiss) await s.sheet.onDismiss();
    assert.ok(!s.calls.includes('grant'), `${how}: never granted`);
    assert.equal(await s.m.has(), false, `${how}: no consent`);
    assert.equal(s.on, false, `${how}: the switch stays OFF`);
  }
});

test('DV-007 A: the switch is per account — another account, a sign-out or the 1.3.0 flag shows OFF', async () => {
  const store = makeStore({ dosetrace_ai_extraction_consent_v4: 'granted' });
  const who = { id: 'user-a' };
  const s = settingsSwitch(store, who);
  await s.load();
  assert.equal(s.on, false, 'after the 1.3.1 update everybody starts not granted');
  await s.tap(true);
  await s.press('primary');
  assert.equal(s.on, true);
  who.id = 'user-b';
  await s.load();
  assert.equal(s.on, false, 'another account on the same phone: OFF');
  who.id = null;
  await s.load();
  assert.equal(s.on, false, 'signed out: OFF');
  who.id = 'user-a';
  await s.load();
  assert.equal(s.on, true, 'A again (no wipe between): still A\'s consent');
  await s.m.clear(); // the intended sign-out wipe / the cross-account discard
  await s.load();
  assert.equal(s.on, false, 'after the wipe: OFF');
});

test('DV-007 A: a withdrawal that cannot be recorded shows what is stored, never a false OFF', async () => {
  const store = makeStore();
  const s = settingsSwitch(store, { id: 'user-a' });
  await s.m.grant();
  await s.load();
  store.setItem = async () => { throw new Error('disk full'); };
  await s.tap(false);
  assert.equal(await s.m.has(), true, 'still granted on the phone');
  assert.equal(s.on, true, 'the switch says so');
});

test('DV-007 A: a slow first read never overwrites the person\'s tap', async () => {
  const store = makeStore();
  const s = settingsSwitch(store, { id: 'user-a' });
  await s.m.grant();
  const load = s.load(); // still reading
  await s.tap(false);
  await load;
  assert.equal(s.on, false);
  assert.equal(await s.m.has(), false);
});

test('DV-007 A: the AI use row strings, in all six languages', () => {
  const want = {
    en: ['AI use', 'What you send to the AI features goes to Claude (Anthropic)'],
    pt: ['Uso de IA', 'O que você envia às funções de IA vai para o Claude (Anthropic)'],
    es: ['Uso de IA', 'Lo que envías a las funciones de IA va a Claude (Anthropic)'],
    fr: ['Utilisation de l’IA', 'Ce que vous envoyez aux fonctions d’IA est transmis à Claude (Anthropic)'],
    de: ['KI-Nutzung', 'Was du an die KI-Funktionen sendest, geht an Claude (Anthropic)'],
    it: ['Uso dell’IA', 'Ciò che invii alle funzioni di IA arriva a Claude (Anthropic)'],
  };
  assert.deepEqual(Object.keys(translations).sort(), Object.keys(want).sort());
  for (const [lang, [label, sub]] of Object.entries(want)) {
    assert.equal(translations[lang].settings_ai_use, label, `${lang} label`);
    assert.equal(translations[lang].settings_ai_use_sub, sub, `${lang} sub-line`);
    if (lang !== 'en') assert.notEqual(translations[lang].settings_ai_use_sub, want.en[1], `${lang}: translated`);
  }
});

test('DV-007 A: Settings wires the switch row, reads it per account on focus, and never sends it anywhere', () => {
  const SET = read('screens/SettingsScreen.js');
  const lib = read('lib/aiUseSwitch.js');
  const body = SET.slice(SET.indexOf('function renderPrivacyBody()'), SET.indexOf('function renderSupportBody()') > 0 ? SET.indexOf('function renderSupportBody()') : undefined);
  const a = body.indexOf("t('settings_analytics')");
  const ai = body.indexOf("t('settings_ai_use')");
  const rep = body.indexOf("t('settings_report_title')");
  assert.ok(a > 0 && ai > a && rep > ai, 'AI use sits right after Usage analytics, before the adherence report');
  const row = body.slice(ai - 400, rep);
  assert.match(row, /<FeatureIcon name="ai_spark" size=\{28\} color=\{colors\.text\} \/>/);
  assert.match(row, /<Text style=\{s\.rowSub\}>\{t\('settings_ai_use_sub'\)\}<\/Text>/);
  assert.match(row, /<GradSwitch\s+value=\{aiUseOn\}\s+onValueChange=\{toggleAIUse\}/);
  assert.match(row, /accessibilityLabel=\{t\('settings_ai_use'\)\}/);
  // Read per account each time Settings is shown (fetchUser runs on focus).
  const fetchUser = SET.slice(SET.indexOf('async function fetchUser()'), SET.indexOf('async function toggleNotificationPref('));
  assert.match(fetchUser, /aiUse\.load\(aiUseDeps\(\)\)/);
  assert.match(SET, /import \{ hasAIConsent, grantAIConsent, revokeAIConsent, AI_PRIVACY_URL \} from '\.\.\/lib\/aiConsent';/);
  // Never sent: no account write, no network, in the switch or its wiring.
  const toggle = SET.slice(SET.indexOf('function aiUseDeps()'), SET.indexOf('async function toggleNotificationPref('));
  for (const src of [lib, toggle]) {
    assert.doesNotMatch(src, /updateUser|supabase|fetch\(|user_metadata|Analytics/);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u);
  }
});
