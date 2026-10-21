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
  // Round 2 item 2: through the optional-column read (the column may not be there yet).
  assert.match(sr, /selectWithOptionalLanguage\(/);
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
  // After the REM merge (AD-88): registering only reads the permission; a language change re-writes
  // the row through REM's onAppLanguageChanged (checked in "I-1 merge with REM").
  assert.match(fn, /AD-88/);
  const ns = read('lib/notifications.js');
  assert.match(ns.slice(ns.indexOf('export async function onAppLanguageChanged('), ns.indexOf('// ── Action buttons')), /registerPushToken\(\{ ifChanged: false \}\)/);
  // Round 2 item 2: its own migration (applies independently of app_releases).
  assert.match(read('supabase/migrations/20261021230000_push_tokens_language.sql'), /alter table public\.push_tokens add column if not exists language text check \(language is null or language in \('en', 'es', 'pt', 'fr', 'de', 'it'\)\)/);
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
  // Round 2 item 3: only when something on the row changed (or once a day).
  assert.match(fg, /registerPushToken\(\{ ifChanged: true \}\)/);
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
  // After the REM merge: inside REM's one channel setup (getT), re-run by onAppLanguageChanged.
  const ch = src.slice(src.indexOf('export async function syncNotificationChannels('), src.indexOf('export async function onAppLanguageChanged('));
  assert.match(ch, /name: t\('settings_version_news'\)/);
  assert.match(src.slice(src.indexOf('export async function onAppLanguageChanged(')), /syncNotificationChannels\(\)/);
});

// ══ Review round 2 (coordinator 2026-10-20, re-verification items 2-6) ═════════════════════════

// ── 2. Deploy order: push_tokens.language has its own migration; the senders survive without it ──
test('R2-2 push_tokens.language is its own small migration (applies without app_releases); app_releases no longer adds it', () => {
  const dir = path.join(ROOT, 'supabase/migrations');
  const f = fs.readdirSync(dir).find((x) => /push_tokens_language\.sql$/.test(x));
  assert.ok(f, 'a separate migration file');
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  assert.match(sql, /alter table public\.push_tokens add column if not exists language text check \(language is null or language in \('en', 'es', 'pt', 'fr', 'de', 'it'\)\)/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /app_releases/, 'no statement on A-127\'s release tables');
  assert.match(sql, /NOT APPLIED/);
  assert.doesNotMatch(read('supabase/migrations/20261022000000_app_releases.sql'), /add column if not exists language/);
});

test('R2-2 both senders read the tokens with the language column and retry without it on 42703 / PGRST204 (English then); any other error stays an error', async () => {
  const L = await langMod();
  const calls = [];
  const missing = (code) => async (cols) => { calls.push(cols); return /language/.test(cols) ? { data: null, error: { code, message: 'column push_tokens.language does not exist' } } : { data: [{ user_id: 'u', expo_token: 'T' }], error: null }; };
  for (const code of ['42703', 'PGRST204']) {
    calls.length = 0;
    const r = await L.selectWithOptionalLanguage(missing(code), 'user_id, expo_token');
    assert.deepEqual(calls, ['user_id, expo_token, language', 'user_id, expo_token'], code);
    assert.equal(r.error, null);
    assert.equal(r.withLanguage, false);
    assert.equal(L.tokenLanguage(r.data[0]), 'en', 'no language column: English');
  }
  calls.length = 0;
  const ok = await L.selectWithOptionalLanguage(async (cols) => { calls.push(cols); return { data: [{ language: 'pt' }], error: null }; }, 'user_id');
  assert.deepEqual(calls, ['user_id, language']);
  assert.equal(ok.withLanguage, true);
  const other = await L.selectWithOptionalLanguage(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }), 'user_id');
  assert.equal(other.error.code, '57014', 'a real failure is not hidden');
  const sr = read('supabase/functions/send-reminders/index.ts');
  assert.match(sr, /selectWithOptionalLanguage\(/);
  assert.doesNotMatch(sr, /select\('user_id, expo_token, platform, timezone, language'\)/, 'never a hard dependency on the column');
  const vn = read('supabase/functions/version-notice/index.ts');
  assert.match(vn, /selectWithOptionalLanguage\(/);
});

// ── 3. The foreground re-write only when something changed (or once a day) ────────────────────
test('R2-3 the push row is written only when token / app version / language / time zone / device / account changed, or once a day; a forced write always goes', () => {
  const { pushRowDue, pushRowPrint } = require('../lib/pushRow');
  const base = { userId: 'u1', appVersion: '1.3.2', language: 'pt', timezone: 'America/Sao_Paulo', deviceId: 'd1' };
  const now = 1_000_000_000_000;
  const prev = { print: pushRowPrint(base), token: 'T', at: now - 3600e3 };
  assert.equal(pushRowDue({ prev, cheap: base, now, force: false }), false, 'same, 1 h ago: no exp.host call, no upsert');
  assert.equal(pushRowDue({ prev, cheap: { ...base, appVersion: '1.3.3' }, now, force: false }), true, 'store auto-update');
  assert.equal(pushRowDue({ prev, cheap: { ...base, language: 'de' }, now, force: false }), true);
  assert.equal(pushRowDue({ prev, cheap: { ...base, timezone: 'Europe/Lisbon' }, now, force: false }), true);
  assert.equal(pushRowDue({ prev, cheap: { ...base, deviceId: 'd2' }, now, force: false }), true);
  assert.equal(pushRowDue({ prev, cheap: { ...base, userId: 'u2' }, now, force: false }), true, 'another account');
  assert.equal(pushRowDue({ prev: { ...prev, at: now - 24 * 3600e3 }, cheap: base, now, force: false }), true, 'the daily heartbeat (a new token shows up there)');
  assert.equal(pushRowDue({ prev: { ...prev, at: now + 3 * 24 * 3600e3 }, cheap: base, now, force: false }), true, 'a stamp from a clock that was ahead');
  assert.equal(pushRowDue({ prev: null, cheap: base, now, force: false }), true);
  assert.equal(pushRowDue({ prev, cheap: base, now, force: true }), true, 'sign-in / language change / version news yes');
  // Wiring: the check runs before getExpoPushTokenAsync; the print is stored only after a write that worked.
  const src = read('lib/notifications.js');
  const fn = src.slice(src.indexOf('export async function registerPushToken'), src.indexOf('export async function removePushToken'));
  assert.ok(fn.indexOf('pushRowDue(') > 0 && fn.indexOf('pushRowDue(') < fn.indexOf('getExpoPushTokenAsync'), 'checked before exp.host');
  assert.match(fn, /force: opts\.ifChanged !== true/, 'every caller but the foreground forces the write');
  assert.match(fn, /if \(!lastError\)/);
  const app = read('App.js');
  const fg = app.slice(app.indexOf("const appStateSub = AppState.addEventListener('change'"), app.indexOf('// A-106:'));
  assert.match(fg, /registerPushToken\(\{ ifChanged: true \}\)/);
});

// ── 4. The drift guard covers every way to reach React Native's Modal ─────────────────────────
function rnModalUses(code) {
  const { parse } = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const out = [];
  const ns = new Set(); // namespace / default imports and require bindings of react-native
  const isRNRequire = (n) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].value === 'react-native';
  const propName = (n) => n.property && (n.property.name || n.property.value);
  traverse(ast, {
    ImportDeclaration(p) {
      if (p.node.source.value !== 'react-native') return;
      for (const s of p.node.specifiers) {
        if (s.type === 'ImportSpecifier' && (s.imported.name || s.imported.value) === 'Modal') out.push(`import { Modal${s.local.name !== 'Modal' ? ' as ' + s.local.name : ''} }`);
        if (s.type === 'ImportNamespaceSpecifier' || s.type === 'ImportDefaultSpecifier') ns.add(s.local.name);
      }
    },
    ExportNamedDeclaration(p) {
      if (p.node.source && p.node.source.value === 'react-native' && p.node.specifiers.some((s) => s.local && s.local.name === 'Modal')) out.push("export { Modal } from 'react-native'");
    },
    VariableDeclarator(p) {
      if (!isRNRequire(p.node.init)) return;
      if (p.node.id.type === 'Identifier') ns.add(p.node.id.name);
      if (p.node.id.type === 'ObjectPattern' && p.node.id.properties.some((q) => q.key && (q.key.name || q.key.value) === 'Modal')) out.push("const { Modal } = require('react-native')");
    },
  });
  traverse(ast, {
    MemberExpression(p) {
      if (propName(p.node) !== 'Modal') return;
      if (isRNRequire(p.node.object)) out.push("require('react-native').Modal");
      else if (p.node.object.type === 'Identifier' && ns.has(p.node.object.name)) out.push(`${p.node.object.name}.Modal`);
    },
    JSXMemberExpression(p) {
      if (p.node.property.name === 'Modal' && p.node.object.type === 'JSXIdentifier' && ns.has(p.node.object.name)) out.push(`<${p.node.object.name}.Modal>`);
    },
  });
  return out;
}
test('R2-4 no app code reaches React Native\'s Modal except components/PresenceModal.js (named, aliased, namespace, default or require)', () => {
  // The guard catches every form (synthetic code first).
  assert.equal(rnModalUses("import { Modal as M } from 'react-native';").length, 1);
  assert.equal(rnModalUses("import * as RN from 'react-native'; const x = <RN.Modal />;").length, 1);
  assert.equal(rnModalUses("import RN from 'react-native'; const M = RN.Modal;").length, 1);
  assert.equal(rnModalUses("const { Modal } = require('react-native');").length, 1);
  assert.equal(rnModalUses("const RN = require('react-native'); RN.Modal;").length, 1);
  assert.equal(rnModalUses("const M = require('react-native').Modal;").length, 1);
  assert.equal(rnModalUses("export { Modal } from 'react-native';").length, 1);
  assert.equal(rnModalUses("import Modal from '../components/PresenceModal'; import { View } from 'react-native';").length, 0);
  // The app code.
  const files = ['App.js', 'index.js'];
  const walkAll = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walkAll(p); } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ['lib', 'screens', 'components', 'i18n', 'modules']) if (fs.existsSync(path.join(ROOT, d))) walkAll(d);
  const bad = [];
  for (const f of files) {
    if (f === 'components/PresenceModal.js') continue;
    let uses;
    try { uses = rnModalUses(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { bad.push(`${f}: unparsable (${e.message})`); continue; }
    for (const u of uses) bad.push(`${f}: ${u}`);
  }
  assert.ok(files.length > 100, `scanned ${files.length} files`);
  assert.deepEqual(bad, []);
  assert.equal(rnModalUses(read('components/PresenceModal.js')).length, 1, 'the wrapper is the one place');
});

// ── 5. An older overlapping required check never wins ─────────────────────────────────────────
test('R2-5 evalRequired: when two checks overlap, the newer answer stands even if the older one arrives last', async () => {
  const answers = [];
  const shown = [];
  const gate = createUpdateGate({
    flow: { state: () => new Promise((r) => answers.push(r)), inviteCandidate: async () => null, recordShown: async () => {}, flushPending: async () => {} },
    sheets: { count: P.openSheetCount, subscribe: P.onSheetsChange },
    rootState: () => tabs,
    ctx: () => ({ uid: 'u1', onMain: true }),
    onRequired: (r) => shown.push(r),
    onInvite: () => {},
    setTimer: () => 1, clearTimer: () => {},
  });
  const older = gate.evalRequired(); // e.g. the cached row, still required
  const newer = gate.evalRequired(); // the server lowered the minimum
  answers[1]({ required: null });
  await newer;
  answers[0]({ required: { reason: 'old' } });
  await older;
  assert.deepEqual(shown, [null], 'the stale "required" is dropped');
  gate.dispose();
});

// ── 6. A missing Vault secret is loud ─────────────────────────────────────────────────────────
test('R2-6 version-notice logs a refused call without the header loudly (missing Vault secret), never the secret; the migration header says how to check', () => {
  const ts = read('supabase/functions/version-notice/index.ts');
  assert.match(ts, /console\.error\('\[version-notice\] refused: no Authorization header/);
  assert.match(ts, /dosetrace_cron_secret/);
  assert.doesNotMatch(ts, /console\.[a-z]+\([^)]*(cronSecret|serviceKey|auth\b)/, 'never the secret or the header in a log');
  const sql = read('supabase/migrations/20261022000000_app_releases.sql');
  assert.match(sql, /select count\(\*\) from vault\.decrypted_secrets where name = 'dosetrace_cron_secret'/);
});

// ══ Item 1 (after the REM reminders merge): the version-news "yes" asks for the permission ═════
// The phone's notification permission, as REM's askNotificationPermission sees it: it shows the
// system dialog only while the permission is undetermined (AD-88), and registerPushToken only reads it.
function permissionPhone(status, answer) {
  const p = { status, dialogs: 0, registered: 0 };
  p.ask = async () => { if (p.status !== 'undetermined') return false; p.dialogs++; p.status = answer; return true; };
  p.granted = async () => p.status === 'granted';
  p.register = async () => { if (p.status === 'granted') p.registered++; };
  return p;
}
function yesFlow(phone, writes) {
  return createUpdateFlow({
    store: memStore(), platform: 'ios', appVersion: '1.3.2', now: () => 1,
    fetchRelease: async () => ({ data: null, error: null }),
    openUrl: async () => {}, writeMeta: async (d) => { writes.push(d); return { error: null }; },
    askPermission: async () => { await phone.ask(); return phone.granted(); },
    registerPush: phone.register,
    play: createPlayUpdate(null),
  });
}

test('I-1 invitation "yes" while the permission is undetermined: ONE system dialog, then (granted) the phone registered and version_news true', async () => {
  const phone = permissionPhone('undetermined', 'granted');
  const writes = [];
  const r = await yesFlow(phone, writes).answerOptIn('u1', true);
  assert.equal(phone.dialogs, 1);
  assert.equal(phone.registered, 1);
  assert.deepEqual(writes, [{ version_news: true }]);
  assert.equal(r.on, true);
});

test('I-1 invitation "yes" with notifications denied: no dialog, nothing registered, the answer stored as off (never ON without a way to deliver)', async () => {
  const phone = permissionPhone('denied');
  const writes = [];
  const r = await yesFlow(phone, writes).answerOptIn('u1', true);
  assert.equal(phone.dialogs, 0, 'no system dialog');
  assert.equal(phone.registered, 0);
  assert.deepEqual(writes, [{ version_news: false }]);
  assert.equal(r.on, false);
  // Undetermined and the person says "Don't allow" in the dialog: off too.
  const p2 = permissionPhone('undetermined', 'denied');
  const w2 = [];
  assert.equal((await yesFlow(p2, w2).answerOptIn('u1', true)).on, false);
  assert.equal(p2.dialogs, 1);
  assert.deepEqual(w2, [{ version_news: false }]);
  // "No" never asks.
  const p3 = permissionPhone('undetermined', 'granted');
  await yesFlow(p3, []).answerOptIn('u1', false);
  assert.equal(p3.dialogs, 0);
});

function settingsToggle(phone, { saveError = null } = {}) {
  const { loadFn } = require('./helpers/extractFn');
  const shown = [];
  const writes = [];
  const sheets = [];
  const fn = loadFn('screens/SettingsScreen.js', 'async function toggleVersionNews(', 'toggleVersionNews', {
    setVersionNews: (v) => shown.push(v),
    supabase: { auth: { updateUser: async ({ data }) => { writes.push(data); return { error: saveError }; } } },
    errorSheet: (x) => sheets.push(x),
    friendlyError: () => 'err',
    t: (k) => k,
    user: { id: 'u1' },
    updateFlow: () => ({ noteSettingsAnswer: async () => {} }),
    askNotificationPermission: phone.ask,
    notificationsGranted: phone.granted,
    registerPushToken: phone.register,
  });
  return { fn, shown, writes, sheets };
}

test('I-1 Settings "Novidades do DoseTrace" ON: undetermined → one dialog, granted → saved, registered, the switch stays ON', async () => {
  const phone = permissionPhone('undetermined', 'granted');
  const s = settingsToggle(phone);
  await s.fn(true);
  assert.equal(phone.dialogs, 1);
  assert.deepEqual(s.writes, [{ version_news: true }]);
  assert.equal(phone.registered, 1);
  assert.equal(s.shown[s.shown.length - 1], true);
});

test('I-1 Settings ON with notifications denied: no dialog, nothing saved or registered, the switch never shows ON', async () => {
  const phone = permissionPhone('denied');
  const s = settingsToggle(phone);
  await s.fn(true);
  assert.equal(phone.dialogs, 0);
  assert.deepEqual(s.writes, []);
  assert.equal(phone.registered, 0);
  assert.ok(!s.shown.includes(true), 'never ON');
  assert.equal(s.shown[s.shown.length - 1], false);
  // OFF never asks and saves false.
  const p2 = permissionPhone('undetermined', 'granted');
  const s2 = settingsToggle(p2);
  await s2.fn(false);
  assert.equal(p2.dialogs, 0);
  assert.deepEqual(s2.writes, [{ version_news: false }]);
});

test('I-1 merge with REM: one channel setup (app-news named with settings_version_news inside syncNotificationChannels), read-only registerPushToken, readAppLanguage, the language change re-writes the push row', () => {
  const src = read('lib/notifications.js');
  assert.doesNotMatch(src, /nameNewsChannel|appLanguageNow|PUSH_LANGS|opts\.prompt|requestNotificationPermissions/);
  const ch = src.slice(src.indexOf('export async function syncNotificationChannels('), src.indexOf('export async function onAppLanguageChanged('));
  assert.match(ch, /setNotificationChannelAsync\('app-news', \{\s*name: t\('settings_version_news'\)/);
  const lang = src.slice(src.indexOf('export async function onAppLanguageChanged('), src.indexOf('// ── Action buttons'));
  assert.match(lang, /registerPushToken\(\{ ifChanged: false \}\)/);
  const reg = src.slice(src.indexOf('export async function registerPushToken'), src.indexOf('export async function removePushToken'));
  assert.match(reg, /AD-88/);
  assert.match(reg, /readAppLanguage\(/);
  assert.doesNotMatch(reg, /requestPermissionsAsync/);
  assert.match(src, /export async function notificationsGranted\(/);
  const lc = read('i18n/LanguageContext.js');
  const set = lc.slice(lc.indexOf('function setLanguage('), lc.indexOf('function setTimeFormat('));
  assert.match(set, /onAppLanguageChanged\(\)/);
  assert.doesNotMatch(set, /registerPushToken|nameNewsChannel/);
  assert.match(read('lib/updateRuntime.js'), /askNotificationPermission\(\)/);
});
