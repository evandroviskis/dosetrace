'use strict';
// A-127 review round 1 (coordinator 2026-10-20: review + independent spec audit, items 1-11). Each
// test was written before its fix and seen failing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { read } = require('./helpers/extractFn');

const ROOT = path.join(__dirname, '..');
const P = require('../lib/sheetPresence');
const { createUpdateGate } = require('../lib/updateGate');
const { createUpdateFlow } = require('../lib/updateFlow');
const { createPlayUpdate } = require('../lib/playUpdate');

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, String(v)); }, removeItem: async (k) => { m.delete(k); } };
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

const tabs = { index: 0, routes: [{ name: 'Main', state: { index: 0, routes: [{ name: 'MainTabs' }] } }] };
const editorPushed = { index: 0, routes: [{ name: 'Main', state: { index: 1, routes: [{ name: 'MainTabs' }, { name: 'FoodChat' }] } }] };

// ── 1. Every Modal reports itself ──────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}
test('1 drift guard: every file that draws a <Modal> takes it from components/PresenceModal (it reports itself while visible)', () => {
  const ALLOW = {
    // The wrapper itself draws the real React Native Modal.
    'components/PresenceModal.js': 'the reporting wrapper',
  };
  const files = ['App.js', ...walk('screens'), ...walk('components')];
  const bad = [];
  let seen = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/<Modal\b/.test(src)) continue;
    seen++;
    if (ALLOW[f]) continue;
    const fromWrapper = /import Modal from '(\.\.\/|\.\/)+(components\/)?PresenceModal';/.test(src);
    const fromRN = /import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*'react-native'/.test(src);
    if (!fromWrapper || fromRN) bad.push(f);
  }
  assert.ok(seen >= 17, `found ${seen} files with a Modal`);
  assert.deepEqual(bad, []);
});

test('1 the wrapper counts a Modal while it is visible (also with no visible prop: React Native shows it) and stops on close / unmount', () => {
  const src = read('components/PresenceModal.js');
  assert.match(src, /useSheetPresence\(props\.visible === undefined \? true : !!props\.visible\)/);
  assert.match(src, /<RNModal \{\.\.\.props\} \/>/);
});

// ── 1 + 2. The gate: required / invitation wait for a calm screen, and re-check right before ────
function makeGate({ state, candidate, root = () => tabs, ctx = {} } = {}) {
  const timers = [];
  const shown = { required: [], invite: [] };
  const recorded = [];
  const flow = {
    state: async () => state(),
    inviteCandidate: async () => candidate(),
    recordShown: async (v) => { recorded.push(v); },
    flushPending: async () => {},
  };
  const c = { uid: 'u1', meta: {}, onMain: true, language: 'pt', blocked: false, ...ctx };
  const gate = createUpdateGate({
    flow,
    sheets: { count: P.openSheetCount, subscribe: P.onSheetsChange },
    rootState: () => root(),
    ctx: () => c,
    onRequired: (r) => shown.required.push(r),
    onInvite: (i) => shown.invite.push(i),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  const fire = async () => { while (timers.length) timers.shift().fn(); await settle(); };
  return { gate, shown, recorded, timers, fire, ctx: c };
}

test('1 HIGH: the protocol editor (a pageSheet Modal) is open when "required" flips → the required screen WAITS (the form and its typed text stay); it shows when the editor closes', async () => {
  const editor = P.markSheet(true); // ProtocolsScreen editor <Modal presentationStyle="pageSheet"> through PresenceModal
  const g = makeGate({ state: () => ({ required: { reason: 'Termos novos' } }) });
  await g.gate.evalRequired();
  assert.deepEqual(g.shown.required, [], 'nothing is swapped while the editor is open (the NavigationContainer stays mounted)');
  editor(); // Save / Cancel closes it
  await settle();
  assert.deepEqual(g.shown.required, [{ reason: 'Termos novos' }], 'shown as soon as the screen is calm');
  g.gate.dispose();
});

test('2 HIGH: the required screen waits on a pushed screen and shows when the route returns to a tab (not at the next foreground)', async () => {
  let root = editorPushed;
  const g = makeGate({ state: () => ({ required: { reason: null } }), root: () => root });
  await g.gate.evalRequired();
  assert.equal(g.shown.required.length, 0);
  root = tabs;
  g.gate.poke(); // the navigator's state listener
  await settle();
  assert.equal(g.shown.required.length, 1);
  // Unlock is at once, whatever is open.
  const s = P.markSheet(true);
  g.gate.dispose();
  const g2 = makeGate({ state: () => ({ required: null }) });
  await g2.gate.evalRequired();
  assert.deepEqual(g2.shown.required, [null]);
  s();
  g2.gate.dispose();
});

test('2 HIGH: the invitation waits for a calm screen, and is re-checked RIGHT BEFORE it shows (a sheet opened during the server read → not shown, not counted; shown when it closes)', async () => {
  let release;
  const reading = new Promise((r) => { release = r; });
  const g = makeGate({ state: () => ({ required: null }), candidate: () => ({ version: '1.3.3', lines: ['a'], askOptIn: false }) });
  g.gate.setReading(reading);
  g.gate.requestInvite(false);
  await g.fire(); // the first-screen delay
  const sheet = P.markSheet(true); // a sheet opens while the read is still running
  release();
  await settle();
  assert.deepEqual(g.shown.invite, []);
  assert.deepEqual(g.recorded, [], 'a showing that did not happen is not counted');
  sheet();
  await settle();
  await g.fire();
  assert.equal(g.shown.invite.length, 1);
  assert.deepEqual(g.recorded, ['1.3.3']);
  g.gate.dispose();
});

test('2 the invitation waits on a pushed screen until the person is back on a tab; going to the background drops the wait (the next open asks again)', async () => {
  let root = editorPushed;
  const g = makeGate({ state: () => ({ required: null }), candidate: () => ({ version: '1.3.3', lines: [], askOptIn: true }), root: () => root });
  g.gate.requestInvite(false);
  await g.fire();
  assert.equal(g.shown.invite.length, 0);
  root = tabs;
  g.gate.poke();
  await settle();
  assert.equal(g.shown.invite.length, 1);
  // Background drops a pending invitation.
  root = editorPushed;
  g.gate.requestInvite(false);
  await g.fire();
  g.gate.background();
  root = tabs;
  g.gate.poke();
  await settle();
  assert.equal(g.shown.invite.length, 1, 'not shown after the app went to the background');
  g.gate.dispose();
});

test('2 the hook only wires the gate (no decision of its own) and the comment no longer says "until the next foreground"', () => {
  const hook = read('components/useUpdateNotice.js');
  assert.match(hook, /createUpdateGate\(/);
  assert.match(hook, /onSheetsChange/);
  assert.match(read('App.js'), /onStateChange=\{\(\) => \{ if \(onNavReady\) onNavReady\(\); upd\.poke\(\); \}\}/, 'a route change re-checks what waits');
  assert.doesNotMatch(hook, /next foreground|until the next open/i);
  assert.doesNotMatch(hook, /screenAllows\(/, 'the calm check lives in lib/updateGate');
});

test('2 flow: the candidate is read without recording; recordShown records it', async () => {
  const store = memStore();
  const flow = createUpdateFlow({
    store, platform: 'ios', appVersion: '1.3.2', now: () => new Date(2026, 9, 20, 9).getTime(),
    fetchRelease: async () => ({ data: { platform: 'ios', latest_version: '1.3.3', notes: { en: ['x'] } }, error: null }),
    openUrl: async () => {}, writeMeta: async () => ({ error: null }), play: createPlayUpdate(null),
  });
  await flow.refresh();
  const c = await flow.inviteCandidate({ meta: {}, userId: 'u1' });
  assert.equal(c.version, '1.3.3');
  assert.equal(store.m.get(flow.KEYS.seen), undefined, 'not recorded yet');
  assert.ok(await flow.inviteCandidate({ meta: {}, userId: 'u1' }), 'still a candidate');
  await flow.recordShown('1.3.3');
  assert.equal(await flow.inviteCandidate({ meta: {}, userId: 'u1' }), null, 'recorded: not twice the same day');
});

// ── 3. Pushes in the person's language (A-156) ─────────────────────────────────────────────────
async function planMod() {
  return import(pathToFileURL(path.join(ROOT, 'supabase/functions/version-notice/plan.js')).href);
}
async function langMod() {
  return import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/pushLanguage.js')).href);
}
const NOON_SP = new Date('2026-10-20T15:00:00Z');
const OLD = '2026-10-18T00:00:00Z';
const notes = { en: ['The food log stands out'], es: ['El registro de comidas destaca'], pt: ['Destaque no registro de comida'], fr: ['Le journal alimentaire ressort'], de: ['Das Essensprotokoll sticht hervor'], it: ['Il diario alimentare in evidenza'] };

test('3 version push: title and first line in the language on the TOKEN row (pt / es / fr / de / it), English only when the row has none', async () => {
  const Pl = await planMod();
  const titles = { pt: 'Nova versão do DoseTrace', es: 'Nueva versión de DoseTrace', fr: 'Nouvelle version de DoseTrace', de: 'Neue Version von DoseTrace', it: 'Nuova versione di DoseTrace', en: 'A new version of DoseTrace' };
  for (const lang of ['pt', 'es', 'fr', 'de', 'it', null, 'xx']) {
    const users = new Map([['u1', { version_news: true }]]); // user_metadata has NO language (0 of 134 in production)
    const tokens = [{ user_id: 'u1', expo_token: 'T', platform: 'ios', timezone: 'America/Sao_Paulo', app_version: '1.3.2', language: lang }];
    const [m] = Pl.versionMessages({ releases: [{ platform: 'ios', latest_version: '1.3.3', latest_set_at: OLD, notes }], tokens, users, sent: new Set(), now: NOON_SP });
    const want = ['pt', 'es', 'fr', 'de', 'it'].includes(lang) ? lang : 'en';
    assert.equal(m.title, titles[want], String(lang));
    assert.equal(m.body, notes[want][0], String(lang));
  }
});

test('3 send-reminders reads the language from the token row too (the shared rule), never user_metadata.language', async () => {
  const L = await langMod();
  for (const l of ['pt', 'es', 'fr', 'de', 'it']) assert.equal(L.tokenLanguage({ language: l }), l);
  assert.equal(L.tokenLanguage({ language: null }), 'en');
  assert.equal(L.tokenLanguage({ language: 'pt-BR' }), 'en', 'only the app\'s own codes');
  assert.equal(L.tokenLanguage(null), 'en');
  const sr = read('supabase/functions/send-reminders/index.ts');
  assert.match(sr, /from '\.\.\/_shared\/pushLanguage\.js'/);
  assert.match(sr, /select\('user_id, expo_token, platform, timezone, language'\)/);
  assert.match(sr, /const lang = tokenLanguage\(tok\)/);
  assert.doesNotMatch(sr, /meta\.language/);
  const vn = read('supabase/functions/version-notice/index.ts');
  assert.match(vn, /language/);
  assert.doesNotMatch(vn, /m\.language|meta\.language/);
});

test('3 the token row carries the app language (stored choice, else the phone\'s), with the optional-column retry; re-written when the language changes; no permission prompt then', () => {
  const src = read('lib/notifications.js');
  const fn = src.slice(src.indexOf('export async function registerPushToken'), src.indexOf('export async function removePushToken'));
  assert.match(fn, /language/);
  assert.match(fn, /app_version\|device_id\|language/);
  assert.match(fn, /prompt === false/);
  const lc = read('i18n/LanguageContext.js');
  const set = lc.slice(lc.indexOf('function setLanguage('), lc.indexOf('function setTimeFormat('));
  assert.match(set, /registerPushToken\(\{ prompt: false \}\)/);
  assert.match(read('supabase/migrations/20261022000000_app_releases.sql'), /alter table public\.push_tokens add column if not exists language text check \(language is null or language in \('en', 'es', 'pt', 'fr', 'de', 'it'\)\)/);
});

// ── 5. The push waits 24 h after latest_version changed ───────────────────────────────────────
test('5 the version push goes out only 24 h after latest_version was set (an early latest never wastes the one push)', async () => {
  const Pl = await planMod();
  const users = new Map([['u1', { version_news: true }]]);
  const tokens = [{ user_id: 'u1', expo_token: 'T', platform: 'ios', timezone: 'America/Sao_Paulo', app_version: '1.3.2', language: 'pt' }];
  const send = (setAt) => Pl.versionMessages({ releases: [{ platform: 'ios', latest_version: '1.3.3', latest_set_at: setAt, notes }], tokens, users, sent: new Set(), now: NOON_SP }).length;
  assert.equal(send('2026-10-20T14:00:00Z'), 0, '1 h after');
  assert.equal(send('2026-10-19T15:00:01Z'), 0, 'just under 24 h');
  assert.equal(send('2026-10-19T15:00:00Z'), 1, '24 h after');
  assert.equal(send(null), 0, 'unknown: not sent');
  const sql = read('supabase/migrations/20261022000000_app_releases.sql');
  assert.match(sql, /latest_set_at timestamptz/);
  assert.match(sql, /new\.latest_version is distinct from old\.latest_version/);
  assert.match(sql, /only AFTER the version is live/i);
});

// ── 6. app_version refreshed on every foreground ──────────────────────────────────────────────
test('6 the token row (app version, language) is re-written on every foreground with a session, without a permission prompt', () => {
  const app = read('App.js');
  const fg = app.slice(app.indexOf("const appStateSub = AppState.addEventListener('change'"), app.indexOf('// A-106:'));
  assert.match(fg, /registerPushToken\(\{ prompt: false \}\)/);
});

// ── 7. The sender needs the cron secret ───────────────────────────────────────────────────────
test('7 version-notice refuses a call without the service key or CRON_SECRET; the cron sends the secret from Vault; deploy flags documented; TRD lists it', () => {
  const ts = read('supabase/functions/version-notice/index.ts');
  assert.match(ts, /CRON_SECRET/);
  assert.match(ts, /status: 401|401\)/);
  assert.match(ts, /--no-verify-jwt/);
  assert.doesNotMatch(ts, /Same design as wake-refresh/);
  const sql = read('supabase/migrations/20261022000000_app_releases.sql');
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /dosetrace_cron_secret/);
  assert.match(read('docs/product/TRD.md'), /version-notice/);
});

// ── 8. Metadata only for people not already sent ──────────────────────────────────────────────
test('8 candidates are filtered by the sent ledger, the version, the 24 h wait and the daytime BEFORE any account is read', async () => {
  const Pl = await planMod();
  const rel = { platform: 'ios', latest_version: '1.3.3', latest_set_at: OLD, notes };
  const tokens = [
    { user_id: 'sent', expo_token: 'A', platform: 'ios', timezone: 'America/Sao_Paulo', app_version: '1.3.2' },
    { user_id: 'night', expo_token: 'B', platform: 'ios', timezone: 'Asia/Tokyo', app_version: '1.3.2' },
    { user_id: 'current', expo_token: 'C', platform: 'ios', timezone: 'America/Sao_Paulo', app_version: '1.3.3' },
    { user_id: 'go', expo_token: 'D', platform: 'ios', timezone: 'America/Sao_Paulo', app_version: '1.3.2' },
  ];
  const c = Pl.pushCandidates({ releases: [rel], tokens, sent: new Set(['sent|ios|1.3.3']), now: NOON_SP });
  assert.deepEqual(c.map((t) => t.user_id), ['go']);
  const ts = read('supabase/functions/version-notice/index.ts');
  assert.ok(ts.indexOf('pushCandidates(') < ts.indexOf('getUserById'), 'the ledger and the cheap filters first');
  assert.ok(ts.indexOf("from('app_release_pushes').select") < ts.indexOf('getUserById'));
});

// ── 9. The missing-table answer of PostgREST 12.2 ─────────────────────────────────────────────
test('9 the migration header names the real missing-table answer (404 / 42P01 on PostgREST 12.2), not PGRST205', () => {
  const sql = read('supabase/migrations/20261022000000_app_releases.sql');
  assert.match(sql.slice(0, 900), /42P01/);
  assert.doesNotMatch(sql, /PGRST205/);
});

// ── 10. The spec is committed to 1.3.2 ────────────────────────────────────────────────────────
test('10 the spec header commits A-127 to 1.3.2, and UN-6 evidence says what the tests used', () => {
  const spec = read('docs/specs/update-notice.md');
  assert.match(spec, /- committed-to: 1\.3\.2/);
  const un6 = spec.split('\n').find((l) => l.startsWith('| UN-6 |'));
  assert.match(un6, /token row/);
});

// ── 11. The Android channel name in the app language ──────────────────────────────────────────
test('11 the Android "news" channel is named in the app language (the Settings switch words), and renamed when the language changes', () => {
  const src = read('lib/notifications.js');
  assert.doesNotMatch(src, /name: 'DoseTrace news'/);
  assert.match(src, /export async function nameNewsChannel\(/);
  assert.match(src, /settings_version_news/);
  const lc = read('i18n/LanguageContext.js');
  assert.match(lc.slice(lc.indexOf('function setLanguage('), lc.indexOf('function setTimeFormat(')), /nameNewsChannel\(code\)/);
});
