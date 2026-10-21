'use strict';
// A-127 in-app update notice (docs/specs/update-notice.md UN-1..UN-7; picture
// docs/design/a127-update-notice.html; ledger 2026-10-15 / 2026-10-16). Behaviour tests on the real
// rules (lib/updateRules), the real flow (lib/updateFlow, every dependency injected), the real push
// plan (supabase/functions/version-notice/plan.js) and the migration text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { read } = require('./helpers/extractFn');

const R = require('../lib/updateRules');
const { createUpdateFlow, KEYS } = require('../lib/updateFlow');
const { createPlayUpdate } = require('../lib/playUpdate');

const DAY = 86400000;
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

const row = (over = {}) => ({
  platform: 'ios',
  latest_version: '1.3.3',
  min_version: null,
  notes: { en: ['The food log stands out', 'My Body is easier to get around', 'End dates for protocols'], pt: ['Destaque no registro de comida', 'Meu corpo mais fácil de navegar', 'Data de fim nos protocolos'] },
  reason: { en: 'We updated the Terms of Use and the Privacy Policy.', pt: 'Atualizamos os Termos de uso e a Política de privacidade.' },
  ...over,
});

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, String(v)); },
    removeItem: async (k) => { m.delete(k); },
  };
}

function makeFlow(over = {}) {
  const clock = { now: over.now != null ? over.now : at(2026, 10, 20, 9) };
  const opened = [];
  const writes = [];
  const store = over.store || memStore();
  let fetched = over.fetched !== undefined ? over.fetched : { data: row(), error: null };
  const flow = createUpdateFlow({
    store,
    platform: over.platform || 'ios',
    appVersion: over.appVersion || '1.3.2',
    now: () => clock.now,
    fetchRelease: async () => { if (fetched instanceof Error) throw fetched; return fetched; },
    deviceMin: async () => (over.deviceMin !== undefined ? over.deviceMin : null),
    openUrl: async (u) => { opened.push(u); if (over.openFails && over.openFails(u)) throw new Error('cannot open'); },
    writeMeta: async (data) => { writes.push(data); return over.writeFails ? { error: { message: 'offline' } } : { error: null }; },
    registerPush: async () => { (over.pushes || []).push(1); },
    play: over.play || createPlayUpdate(null),
  });
  return { flow, clock, opened, writes, store, setFetched: (f) => { fetched = f; } };
}

// ── UN-1: the server row is read per platform, safely ──────────────────────────────────────────
test('UN-1 parseRelease: per platform latest / minimum / lines ×6 / reason; garbage is never a version', () => {
  const r = R.parseRelease(row(), 'ios');
  assert.equal(r.latest, '1.3.3');
  assert.equal(r.min, null);
  assert.deepEqual(R.linesFor(r, 'pt'), ['Destaque no registro de comida', 'Meu corpo mais fácil de navegar', 'Data de fim nos protocolos']);
  // A language the founder has not written yet falls back to English, never to nothing.
  assert.deepEqual(R.linesFor(r, 'de'), ['The food log stands out', 'My Body is easier to get around', 'End dates for protocols']);
  assert.equal(R.reasonFor(r, 'pt'), 'Atualizamos os Termos de uso e a Política de privacidade.');
  assert.equal(R.reasonFor(r, 'it'), 'We updated the Terms of Use and the Privacy Policy.');
  // Another platform's row is not this phone's.
  assert.equal(R.parseRelease(row({ platform: 'android' }), 'ios'), null);
  // Unreadable versions are dropped (never "below"), empty / non-string lines are dropped.
  const bad = R.parseRelease(row({ latest_version: 'v1.4', min_version: '1.x', notes: { en: ['  ', 7, 'Real line'] }, reason: { en: '' } }), 'ios');
  assert.equal(bad.latest, null);
  assert.equal(bad.min, null);
  assert.deepEqual(R.linesFor(bad, 'en'), ['Real line']);
  assert.equal(R.reasonFor(bad, 'en'), null);
  assert.equal(R.parseRelease(null, 'ios'), null);
  assert.equal(R.parseRelease('nope', 'ios'), null);
});

// ── UN-4 + A-119 DT003: ONE required state ─────────────────────────────────────────────────────
test('UN-4 required: below the platform minimum OR below the server refusal floor (A-119 DT003) is the same one screen', () => {
  const r = R.parseRelease(row({ min_version: '1.3.2' }), 'ios');
  assert.equal(R.isRequired('1.3.1', r, null), true);
  assert.equal(R.isRequired('1.3.2', r, null), false, 'at the minimum is not below it');
  const noMin = R.parseRelease(row(), 'ios');
  assert.equal(R.isRequired('1.3.1', noMin, '1.3.2'), true, 'the device floor (DT003 / device_status min_version) alone');
  assert.equal(R.isRequired('1.3.1', null, '1.3.2'), true, 'no release row cached, the device floor still counts');
  assert.equal(R.isRequired('1.3.1', null, null), false);
  assert.equal(R.isRequired(null, r, '9.9.9'), false, 'an unknown app version is never locked out');
});

// ── UN-2: when the invitation shows ────────────────────────────────────────────────────────────
test('UN-2 the invitation: once per new version, once more 7 days after, then quiet until the next version', () => {
  const r = R.parseRelease(row(), 'ios');
  const t0 = at(2026, 10, 20, 9);
  let seen = null;
  const show = (now, forced = false) => R.inviteDecision({ appVersion: '1.3.2', release: r, deviceMin: null, seen, now, forced });
  assert.equal(show(t0).show, true, 'first open below the latest');
  seen = R.markShown(seen, '1.3.3', t0);
  assert.equal(show(t0 + 3600e3).show, false, 'never twice the same day');
  assert.equal(show(t0 + 6 * DAY).show, false, 'not before 7 days');
  assert.equal(show(t0 + 7 * DAY).show, true, 'once more 7 days later');
  seen = R.markShown(seen, '1.3.3', t0 + 7 * DAY);
  assert.equal(show(t0 + 30 * DAY).show, false, 'then not until the next version');
  // The next version starts again — but still never twice on one day.
  const r2 = R.parseRelease(row({ latest_version: '1.3.4' }), 'ios');
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: r2, seen, now: t0 + 7 * DAY + 3600e3 }).show, false, 'a new version the same day as the last showing waits a day');
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: r2, seen, now: t0 + 8 * DAY }).show, true, 'a new version shows');
  // At or above the latest: nothing.
  assert.equal(R.inviteDecision({ appVersion: '1.3.3', release: r, seen: null, now: t0 }).show, false);
  assert.equal(R.inviteDecision({ appVersion: '1.4.0', release: r, seen: null, now: t0 }).show, false);
  // Required wins: no invitation on top of the full screen.
  const req = R.parseRelease(row({ min_version: '1.3.3' }), 'ios');
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: req, seen: null, now: t0 }).show, false);
});

test('UN-2 "once a day" is the phone\'s calendar day: 23:50 then 00:10 is two days; a clock moved back never shows twice; a clock that was far ahead does not block forever', () => {
  const r = R.parseRelease(row(), 'ios');
  const late = at(2026, 10, 20, 23, 50);
  const seen = R.markShown(null, '1.3.2-old', late); // a showing of an older version
  const r2 = r;
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: r2, seen, now: at(2026, 10, 21, 0, 10) }).show, true, 'the next calendar day');
  // Clock moved back below the last showing (by hours): no second showing.
  const seen2 = R.markShown(null, '1.3.3', at(2026, 10, 20, 15));
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: r, seen: seen2, now: at(2026, 10, 20, 10) }).show, false);
  // A showing stamped far in the future (the clock was a year ahead, then corrected) is ignored for
  // a NEW version, and the 7-day rule restarts from now for the same version.
  const future = R.markShown(null, '1.3.1', at(2027, 10, 20));
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: r, seen: future, now: at(2026, 10, 20) }).show, true);
});

test('UN-6 a tap on the version push opens the invitation even the same day (still never over the required screen)', () => {
  const r = R.parseRelease(row(), 'ios');
  const t0 = at(2026, 10, 20, 9);
  const seen = R.markShown(R.markShown(null, '1.3.3', t0), '1.3.3', t0 + 7 * DAY);
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: r, seen, now: t0 + 7 * DAY + 60e3, forced: true }).show, true);
  assert.equal(R.inviteDecision({ appVersion: '1.3.3', release: r, seen, now: t0, forced: true }).show, false, 'already updated: nothing to invite to');
  const req = R.parseRelease(row({ min_version: '1.3.3' }), 'ios');
  assert.equal(R.inviteDecision({ appVersion: '1.3.2', release: req, seen: null, now: t0, forced: true }).show, false);
});

test('UN-2 never over another sheet or before the first screen; the required screen never pulls a screen with typing in progress', () => {
  const main = (inner) => ({ index: 0, routes: [{ name: 'Main', state: inner }] });
  const tabs = main({ index: 0, routes: [{ name: 'MainTabs' }] });
  const pushed = main({ index: 1, routes: [{ name: 'MainTabs' }, { name: 'FoodChat' }] });
  assert.equal(R.screenAllows({ rootState: tabs, sheets: 0, kind: 'invite' }), true);
  assert.equal(R.screenAllows({ rootState: tabs, sheets: 1, kind: 'invite' }), false, 'a sheet is open');
  assert.equal(R.screenAllows({ rootState: pushed, sheets: 0, kind: 'invite' }), false, 'not over a pushed screen');
  assert.equal(R.screenAllows({ rootState: null, sheets: 0, kind: 'invite' }), false, 'not before the first screen');
  assert.equal(R.screenAllows({ rootState: { index: 0, routes: [{ name: 'Auth' }] }, kind: 'invite' }), false, 'signed out: no invitation');
  assert.equal(R.screenAllows({ rootState: null, kind: 'required' }), true, 'at start, before anything is drawn');
  assert.equal(R.screenAllows({ rootState: tabs, kind: 'required' }), true);
  assert.equal(R.screenAllows({ rootState: { index: 0, routes: [{ name: 'Auth' }] }, kind: 'required' }), true);
  assert.equal(R.screenAllows({ rootState: pushed, kind: 'required' }), false, 'a pushed screen (a form) waits for the next open');
  assert.equal(R.screenAllows({ rootState: { index: 0, routes: [{ name: 'CompleteProfile' }] }, kind: 'required' }), false);
  assert.equal(R.screenAllows({ rootState: tabs, sheets: 2, kind: 'required' }), false);
});

// ── UN-5: the opt-in question ──────────────────────────────────────────────────────────────────
test('UN-5 the question shows once: never after an answer on any phone (version_news in the account), never after this phone stored one', () => {
  assert.equal(R.askOptIn({ meta: {}, asked: null, userId: 'u1' }), true);
  assert.equal(R.askOptIn({ meta: { version_news: false }, asked: null, userId: 'u1' }), false);
  assert.equal(R.askOptIn({ meta: { version_news: true }, asked: null, userId: 'u1' }), false);
  assert.equal(R.askOptIn({ meta: {}, asked: { userId: 'u1' }, userId: 'u1' }), false);
  assert.equal(R.askOptIn({ meta: {}, asked: { userId: 'u0' }, userId: 'u1' }), true, 'another account on this phone is asked itself');
  assert.equal(R.optedIn({ version_news: true }), true);
  assert.equal(R.optedIn({}), false, 'off unless the person said yes');
  assert.equal(R.optedIn({ version_news: 'yes' }), false);
});

// ── The flow (cache, offline, store links, opt-in writes) ──────────────────────────────────────
test('UN-1 / UN-4 the row is cached: a later open offline still shows the required screen; a missing table (before the migration) shows nothing', async () => {
  const store = memStore();
  const a = makeFlow({ store, appVersion: '1.3.1', fetched: { data: row({ min_version: '1.3.2' }), error: null } });
  await a.flow.refresh();
  assert.equal((await a.flow.state()).required.reason, 'We updated the Terms of Use and the Privacy Policy.');
  // Next open, offline: the cached row decides.
  const b = makeFlow({ store, appVersion: '1.3.1', fetched: new Error('Network request failed') });
  await b.flow.refresh();
  assert.ok((await b.flow.state({ language: 'pt' })).required, 'still required offline');
  assert.equal((await b.flow.state({ language: 'pt' })).required.reason, 'Atualizamos os Termos de uso e a Política de privacidade.');
  // After the update the same cache no longer locks anything.
  const c = makeFlow({ store, appVersion: '1.3.2', fetched: new Error('offline') });
  assert.equal((await c.flow.state()).required, null);
  // Before the migration the table does not exist (PGRST205): nothing changes, nothing shown.
  const d = makeFlow({ fetched: { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } } });
  await d.flow.refresh();
  assert.equal((await d.flow.state()).required, null);
  assert.equal(await d.flow.inviteNow({ meta: {}, userId: 'u1' }), null);
  // An error never drops a good cache (only a real answer replaces it).
  const e = makeFlow({ store, appVersion: '1.3.1', fetched: { data: null, error: { code: '500', message: 'boom' } } });
  await e.flow.refresh();
  assert.ok((await e.flow.state()).required);
  // The founder lowered the minimum: the next real answer unlocks.
  const f = makeFlow({ store, appVersion: '1.3.1', fetched: { data: row({ min_version: null }), error: null } });
  await f.flow.refresh();
  assert.equal((await f.flow.state()).required, null);
});

test('UN-4 / A-119 the DT003 path (device_status min_version, stored by lib/deviceFlow) opens the same required screen, only while signed in', async () => {
  const a = makeFlow({ appVersion: '1.3.1', deviceMin: '1.3.2', fetched: { data: row(), error: null } });
  await a.flow.refresh();
  const st = await a.flow.state({ signedIn: true });
  assert.ok(st.required, 'one screen');
  assert.equal(st.required.reason, null, 'no founder reason line on the device floor alone');
  // Signed out the server floor cannot refuse anything (and must never block signing in again).
  assert.equal((await a.flow.state({ signedIn: false })).required, null);
});

test('UN-4 / A-119 end to end: the server says min_version 1.3.2 in device_status (the DT003 floor) → the real deviceFlow stores it → the update flow shows the one required screen; the floor lowered → unlocked', async () => {
  const { createDeviceFlow } = require('../lib/deviceFlow');
  const store = memStore();
  let min = '1.3.2';
  const dev = createDeviceFlow({
    store,
    appVersion: '1.3.1',
    deviceId: async () => 'device-aaaaaaaa',
    rpc: async (name) => (name === 'device_status' ? { data: { status: 'active', rebuild_owed: false, notice: null, min_version: min }, error: null } : { data: null, error: null }),
  });
  await dev.gate('u1', 'sync');
  const upd = createUpdateFlow({
    store, platform: 'ios', appVersion: '1.3.1', now: () => at(2026, 10, 20),
    fetchRelease: async () => ({ data: null, error: { code: 'PGRST205' } }),
    deviceMin: async () => { const st = await dev.load(); return st.update && st.update.min; },
    openUrl: async () => {}, writeMeta: async () => ({ error: null }), play: createPlayUpdate(null),
  });
  assert.ok((await upd.state({ signedIn: true })).required, 'the required screen');
  min = null;
  await dev.gate('u1', 'sync');
  assert.equal((await upd.state({ signedIn: true })).required, null);
});

test('UN-4 the required screen deletes nothing: the flow has no wipe, no sign-out and no local-data dependency', () => {
  const src = read('lib/updateFlow.js') + read('lib/updateRules.js') + read('components/UpdateNotice.js');
  assert.doesNotMatch(src, /clearLocalDatabase|signOut|removeItem\(\s*['"]dosetrace_(?!app_release|update)/);
  assert.doesNotMatch(src, /DELETE FROM|\.from\([^)]*\)[\s\S]{0,80}\.delete\(|getDB|executeSql|runSql/i);
});

test('UN-2 / UN-5 inviteNow records the showing at once (a kill mid-sheet still counts) and carries the lines and the question', async () => {
  const { flow, store, clock } = makeFlow();
  await flow.refresh();
  const inv = await flow.inviteNow({ meta: {}, userId: 'u1', language: 'pt' });
  assert.deepEqual(inv.lines, ['Destaque no registro de comida', 'Meu corpo mais fácil de navegar', 'Data de fim nos protocolos']);
  assert.equal(inv.askOptIn, true);
  assert.equal(inv.version, '1.3.3');
  assert.ok(JSON.parse(store.m.get(KEYS.seen)).lastAt === clock.now);
  assert.equal(await flow.inviteNow({ meta: {}, userId: 'u1' }), null, 'the same day: no second time');
});

test('UN-5 the answer is stored in the account (merge write of one key) and this phone; a failed write is kept and sent at the next open', async () => {
  const store = memStore();
  const pushes = [];
  const a = makeFlow({ store, writeFails: true, pushes });
  await a.flow.answerOptIn('u1', true);
  assert.deepEqual(a.writes, [{ version_news: true }], 'only its own key: never a stale copy of the metadata');
  assert.equal(R.askOptIn({ meta: {}, asked: JSON.parse(store.m.get(KEYS.asked)), userId: 'u1' }), false, 'not asked again');
  assert.ok(store.m.get(KEYS.pending), 'kept to send later');
  assert.equal(pushes.length, 1, 'a yes registers this phone for pushes');
  const b = makeFlow({ store });
  await b.flow.flushPending('u1');
  assert.deepEqual(b.writes, [{ version_news: true }]);
  assert.equal(store.m.get(KEYS.pending), undefined);
  // A pending answer of another account is never written into this one.
  const c = makeFlow({ store: memStore({ [KEYS.pending]: JSON.stringify({ userId: 'u0', value: true }) }) });
  await c.flow.flushPending('u1');
  assert.deepEqual(c.writes, []);
  // "No" (the switch left off) is an answer too, and never registers anything.
  const p2 = [];
  const d = makeFlow({ pushes: p2 });
  await d.flow.answerOptIn('u1', false);
  assert.deepEqual(d.writes, [{ version_news: false }]);
  assert.equal(p2.length, 0);
});

test('UN-3 iPhone "Atualizar" opens the DoseTrace App Store page (https fallback)', async () => {
  const a = makeFlow({ platform: 'ios' });
  assert.equal(await a.flow.update('invite'), 'store');
  assert.deepEqual(a.opened, ['itms-apps://apps.apple.com/app/id6761788157']);
  const b = makeFlow({ platform: 'ios', openFails: (u) => u.startsWith('itms-apps') });
  await b.flow.update('required');
  assert.deepEqual(b.opened, ['itms-apps://apps.apple.com/app/id6761788157', 'https://apps.apple.com/app/id6761788157']);
});

test('UN-3 / UN-4 Android without the Play in-app update module: the Play Store page (market link, https fallback)', async () => {
  const a = makeFlow({ platform: 'android' });
  assert.equal(await a.flow.update('invite'), 'store');
  assert.deepEqual(a.opened, ['market://details?id=io.outcom.dosetrace']);
  const b = makeFlow({ platform: 'android', openFails: (u) => u.startsWith('market:') });
  await b.flow.update('required');
  assert.deepEqual(b.opened, ['market://details?id=io.outcom.dosetrace', 'https://play.google.com/store/apps/details?id=io.outcom.dosetrace']);
});

test('UN-3 / UN-4 Android with a Play in-app update module: flexible for the invitation (then the "downloaded · Restart" bar), immediate when required', async () => {
  const calls = [];
  let downloaded = null;
  const native = {
    startFlexible: async () => { calls.push('flexible'); return true; },
    startImmediate: async () => { calls.push('immediate'); return true; },
    onDownloaded: (fn) => { downloaded = fn; return () => { downloaded = null; }; },
    completeUpdate: async () => { calls.push('complete'); },
  };
  const play = createPlayUpdate(native);
  assert.equal(play.available, true);
  const ready = [];
  const a = makeFlow({ platform: 'android', play });
  a.flow.subscribe((s) => ready.push(s.ready));
  assert.equal(await a.flow.update('invite'), 'flexible');
  assert.deepEqual(a.opened, [], 'no store page: Google Play updates inside the app');
  downloaded();
  assert.equal(a.flow.readyBar(), true, 'the bar shows when Play says the download finished');
  assert.ok(ready.includes(true));
  await a.flow.restart();
  assert.deepEqual(calls, ['flexible', 'complete']);
  assert.equal(await a.flow.update('required'), 'immediate');
  // Play refused (not from Play, no update visible yet): the store page instead, never nothing.
  const refusing = createPlayUpdate({ ...native, startFlexible: async () => false, startImmediate: async () => { throw new Error('ERROR_API_NOT_AVAILABLE'); } });
  const b = makeFlow({ platform: 'android', play: refusing });
  assert.equal(await b.flow.update('invite'), 'store');
  assert.equal(await b.flow.update('required'), 'store');
  assert.deepEqual(b.opened.length, 2);
});

test('UN-6 a version push tap is recognised (both data shapes) and routes to Today', () => {
  const resp = (data) => ({ notification: { request: { identifier: 'x', content: { data } }, date: 1 } });
  assert.equal(R.isUpdateTap(resp({ type: 'app_update', version: '1.3.3' })), true);
  assert.equal(R.isUpdateTap(resp({ dataString: JSON.stringify({ type: 'app_update' }) })), true);
  assert.equal(R.isUpdateTap(resp({ type: 'dose_reminder' })), false);
  assert.equal(R.isUpdateTap(null), false);
  const plan = require('../lib/notificationPlan');
  assert.deepEqual(plan.notifTapTarget(resp({ type: 'app_update', version: '1.3.3' }), 5), { screen: 'MainTabs', params: { screen: 'Today' } });
});

// ── UN-6: the push plan (server) ───────────────────────────────────────────────────────────────
async function planMod() {
  return import(pathToFileURL(path.join(__dirname, '../supabase/functions/version-notice/plan.js')).href);
}
const tok = (o) => ({ user_id: 'u1', expo_token: 'ExponentPushToken[a]', platform: 'ios', timezone: 'America/Sao_Paulo', app_version: '1.3.2', updated_at: '2026-10-20T10:00:00Z', ...o });
const rel = (o) => ({ platform: 'ios', latest_version: '1.3.3', notes: row().notes, ...o });
// 15:00 UTC = 12:00 in São Paulo, 08:00 in Los Angeles, 00:00 in Tokyo.
const NOON_SP = new Date('2026-10-20T15:00:00Z');

test('UN-6 one push per version, only to people who said yes, never in Silent mode, never at night, only below the latest', async () => {
  const P = await planMod();
  const users = new Map([
    ['u1', { version_news: true, language: 'pt' }],
    ['u2', { version_news: false }],
    ['u3', {}],
    ['u4', { version_news: true, silent_mode: true }],
    ['u5', { version_news: true, language: 'de' }],
    ['u6', { version_news: true }],
    ['u7', { version_news: true }],
  ]);
  const tokens = [
    tok({}),
    tok({ user_id: 'u2', expo_token: 'T2' }),
    tok({ user_id: 'u3', expo_token: 'T3' }),
    tok({ user_id: 'u4', expo_token: 'T4' }),
    tok({ user_id: 'u5', expo_token: 'T5', timezone: 'Asia/Tokyo' }),
    tok({ user_id: 'u6', expo_token: 'T6', app_version: '1.3.3' }),
    tok({ user_id: 'u7', expo_token: 'T7', app_version: null }),
  ];
  const msgs = P.versionMessages({ releases: [rel()], tokens, users, sent: new Set(), now: NOON_SP });
  assert.deepEqual(msgs.map((m) => m.to), ['ExponentPushToken[a]'], 'only u1: opted in, awake, below the latest, not silent');
  const m = msgs[0];
  assert.equal(m.title, 'Nova versão do DoseTrace');
  assert.equal(m.body, 'Destaque no registro de comida', 'the first release line, in the person\'s language');
  assert.deepEqual(m.data, { type: 'app_update', version: '1.3.3' });
  assert.equal(m.channelId, 'app-news');
  assert.deepEqual(m._claim, { user_id: 'u1', platform: 'ios', version: '1.3.3' });
  // Already sent this version to this person: never again.
  assert.equal(P.versionMessages({ releases: [rel()], tokens, users, sent: new Set(['u1|ios|1.3.3']), now: NOON_SP }).length, 0);
  // A newer version is a new push.
  assert.equal(P.versionMessages({ releases: [rel({ latest_version: '1.3.4' })], tokens, users, sent: new Set(['u1|ios|1.3.3']), now: NOON_SP }).length, 2, 'u1 and u6 (on 1.3.3) are below 1.3.4');
});

test('UN-6 daytime is 10:00 to 19:59 on the person\'s clock; two tokens of one person get one push; other platform rows never mix; no lines = no push', async () => {
  const P = await planMod();
  assert.equal(P.isDaytime(new Date('2026-10-20T13:00:00Z'), 'America/Sao_Paulo'), true); // 10:00
  assert.equal(P.isDaytime(new Date('2026-10-20T12:59:00Z'), 'America/Sao_Paulo'), false); // 09:59
  assert.equal(P.isDaytime(new Date('2026-10-20T22:59:00Z'), 'America/Sao_Paulo'), true); // 19:59
  assert.equal(P.isDaytime(new Date('2026-10-20T23:00:00Z'), 'America/Sao_Paulo'), false); // 20:00
  assert.equal(P.isDaytime(NOON_SP, 'Not/AZone'), false, 'an unreadable zone is treated as night (never wake anyone)');
  assert.equal(P.isDaytime(NOON_SP, null), false);
  const users = new Map([['u1', { version_news: true }]]);
  const two = [tok({ expo_token: 'old', updated_at: '2026-10-01T00:00:00Z' }), tok({ expo_token: 'new', updated_at: '2026-10-19T00:00:00Z' })];
  const msgs = P.versionMessages({ releases: [rel()], tokens: two, users, sent: new Set(), now: NOON_SP });
  assert.deepEqual(msgs.map((m) => m.to), ['new']);
  assert.equal(msgs[0].title, 'A new version of DoseTrace', 'English when the account has no language');
  assert.equal(msgs[0].body, 'The food log stands out');
  const android = [tok({ platform: 'android', expo_token: 'A' })];
  assert.equal(P.versionMessages({ releases: [rel()], tokens: android, users, sent: new Set(), now: NOON_SP }).length, 0);
  assert.equal(P.versionMessages({ releases: [rel({ notes: {} })], tokens: two, users, sent: new Set(), now: NOON_SP }).length, 0, 'nothing to say: no push');
  assert.equal(P.versionMessages({ releases: [rel({ latest_version: null })], tokens: two, users, sent: new Set(), now: NOON_SP }).length, 0);
});

test('UN-6 / UN-7 the push title is written in all 6 languages and matches the in-app title', async () => {
  const P = await planMod();
  const tr = loadTranslations();
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.equal(P.TITLES[l], tr[l].upd_title, l);
});

// ── UN-1 / UN-6: the migration and the sender ──────────────────────────────────────────────────
const MIG = 'supabase/migrations/20261022000000_app_releases.sql';
test('UN-1 migration: one row per platform the founder edits in the dashboard; everyone may read it, nobody may write it from the app', () => {
  const sql = read(MIG);
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /create table if not exists public\.app_releases/);
  assert.match(sql, /platform text primary key check \(platform in \('ios', 'android'\)\)/);
  assert.match(sql, /latest_version text check/);
  assert.match(sql, /min_version text check/);
  assert.match(sql, /notes jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /reason jsonb not null default '\{\}'::jsonb/);
  assert.match(sql, /insert into public\.app_releases \(platform\) values \('ios'\), \('android'\) on conflict \(platform\) do nothing/);
  assert.match(sql, /alter table public\.app_releases enable row level security/);
  assert.match(sql, /create policy app_releases_read on public\.app_releases for select to anon, authenticated using \(true\)/);
  assert.match(sql, /revoke insert, update, delete, truncate on table public\.app_releases from anon, authenticated/);
  // The minimum can never be set above the latest (a typo would lock everyone out).
  assert.match(sql, /app_releases_min_not_above_latest/);
  // UN-6: the app version on the device row, the per-person ledger, the hourly run.
  assert.match(sql, /alter table public\.push_tokens add column if not exists app_version text/);
  assert.match(sql, /create table if not exists public\.app_release_pushes/);
  assert.match(sql, /primary key \(user_id, platform, version\)/);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /create or replace function public\.claim_version_notice\(\)/);
  assert.match(sql, /functions\/v1\/version-notice/);
  assert.match(sql, /ROLLBACK/);
});

test('UN-6 sender: claims each push before sending, releases a failed one, prunes dead tokens, reads only opted-in data', () => {
  const ts = read('supabase/functions/version-notice/index.ts');
  assert.match(ts, /from '\.\/plan\.js'/);
  assert.match(ts, /claim_version_notice/);
  assert.match(ts, /app_release_pushes/);
  assert.match(ts, /exp\.host\/--\/api\/v2\/push\/send/);
  assert.match(ts, /DeviceNotRegistered|deadTokens/);
  assert.match(ts, /version_news/);
  assert.match(ts, /silent_mode/);
  assert.doesNotMatch(ts, /console\.(log|error)\([^)]*(expo_token|user_id)/, 'never a token or a user id in the logs');
});

// ── Wiring ─────────────────────────────────────────────────────────────────────────────────────
test('UN-6 push registration names the app version on the device row (with the no-column fallback)', () => {
  const src = read('lib/notifications.js');
  const fn = src.slice(src.indexOf('export async function registerPushToken'), src.indexOf('export async function removePushToken'));
  assert.match(fn, /app_version/);
  assert.match(fn, /appVersion\(\)/);
  assert.match(fn, /app_version\|device_id|device_id\|app_version/);
});

test('UN-6 Android has its own "news" channel (never the dose reminders channel)', () => {
  const src = read('lib/notifications.js');
  assert.match(src, /setNotificationChannelAsync\('app-news'/);
});

test('UN-5 Settings › Notifications: "Novidades do DoseTrace" after the vial alerts, before Silent mode, off unless version_news is true', () => {
  const src = read('screens/SettingsScreen.js');
  const body = src.slice(src.indexOf('function renderNotificationsBody'), src.indexOf("t('settings_persistent')"));
  const vial = body.indexOf("t('settings_vial_alerts')");
  const news = body.indexOf("t('settings_version_news')");
  const silent = body.indexOf("t('settings_silent')");
  assert.ok(vial > 0 && news > vial && silent > news, 'order as drawn');
  assert.match(body, /toggleVersionNews/);
  assert.match(src, /setVersionNews\(user\.user_metadata\?\.version_news === true\)/);
  assert.match(body, /FeatureIcon name="download"/);
});

test('App: the required screen replaces the whole app; the invitation waits for Main, no other sheet and the first screen', () => {
  const src = read('App.js');
  assert.match(src, /UpdateRequiredScreen/);
  assert.match(src, /UpdateInviteSheet/);
  assert.match(src, /UpdateReadyBar/);
  assert.match(src, /isUpdateTap\(response\)\) requestForcedInvite\(\)/);
  assert.match(src, /config=\{deviceSheet \|\| linkSheet \? null : upd\.invite\}/, 'never over the A-119 / link sheets');
  const hook = read('components/useUpdateNotice.js');
  assert.match(hook, /openSheetCount\(\)/);
  assert.match(hook, /screenAllows\(\{ rootState: rootState\(\), sheets: openSheetCount\(\), kind: 'invite' \}\)/);
  assert.match(hook, /screenAllows\(\{ rootState: rootState\(\), sheets: openSheetCount\(\), kind: 'required' \}\)/);
  const root = src.slice(src.indexOf('function ThemedRoot('), src.indexOf('function navThemeFor('));
  const req = root.indexOf('if (updateRequired)');
  const nav = root.indexOf('<NavigationContainer');
  assert.ok(req > 0 && req < nav, 'checked before anything else is drawn');
});

test('every DoseTrace sheet reports itself open (the invitation never shows over one)', () => {
  const pp = read('screens/components/ProtocolParts.js');
  for (const fn of ['export function DTSheet(', 'export function DTActionSheet(', 'export function DTPickerSheet(']) {
    const b = pp.slice(pp.indexOf(fn), pp.indexOf(fn) + 600);
    assert.match(b, /useSheetPresence\(/, fn);
  }
  assert.match(read('screens/components/BodySheets.js'), /useSheetPresence\(/);
  const P = require('../lib/sheetPresence');
  assert.equal(P.openSheetCount(), 0);
  const a = P.markSheet(true);
  const b = P.markSheet(true);
  assert.equal(P.openSheetCount(), 2);
  a(); a(); // closing twice counts once
  assert.equal(P.openSheetCount(), 1);
  b();
  assert.equal(P.openSheetCount(), 0);
});

// ── UN-7: texts ×6 ─────────────────────────────────────────────────────────────────────────────
function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  return mod.exports.translations;
}
const KEYS6 = ['upd_title', 'upd_whats_new', 'upd_not_now', 'upd_update', 'upd_ask', 'upd_ask_sub', 'upd_downloaded', 'upd_restart', 'upd_req_title', 'upd_req_body', 'upd_req_safe', 'settings_version_news', 'settings_version_news_sub'];
test('UN-7 the approved words (pt / en as drawn) and every new text in 6 languages', () => {
  const tr = loadTranslations();
  const pt = { upd_title: 'Nova versão do DoseTrace', upd_whats_new: 'O que há de novo', upd_not_now: 'Agora não', upd_update: 'Atualizar', upd_ask: 'Avisar quando houver versão nova?', upd_ask_sub: 'Uma notificação por versão, durante o dia.', upd_downloaded: 'A nova versão foi baixada.', upd_restart: 'Reiniciar', upd_req_title: 'Atualize o DoseTrace para continuar', upd_req_body: 'Esta versão não pode mais ser usada.', upd_req_safe: 'Seus dados continuam guardados — nada é apagado ao atualizar.', settings_version_news: 'Novidades do DoseTrace', settings_version_news_sub: 'Uma notificação quando sair uma versão nova, com o que mudou.' };
  const en = { upd_title: 'A new version of DoseTrace', upd_whats_new: "What's new", upd_not_now: 'Not now', upd_update: 'Update', upd_ask: "Tell me when there's a new version?", upd_ask_sub: 'One notification per version, in the daytime.', upd_downloaded: 'The new version is downloaded.', upd_restart: 'Restart', upd_req_title: 'Update DoseTrace to continue', upd_req_body: 'This version can no longer be used.', upd_req_safe: 'Your data stays saved — nothing is deleted when you update.', settings_version_news: "What's new in DoseTrace", settings_version_news_sub: 'A notification when a new version is out, with what changed.' };
  for (const k of KEYS6) {
    assert.equal(tr.pt[k], pt[k], `pt ${k}`);
    assert.equal(tr.en[k], en[k], `en ${k}`);
    for (const l of ['es', 'fr', 'de', 'it']) {
      assert.ok(tr[l][k] && tr[l][k] !== tr.en[k], `${l} ${k} written in ${l}`);
    }
  }
  // One term per concept: "Not now" is the app's existing "Not now" in every language.
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.equal(tr[l].upd_not_now, tr[l].today_vial_not_now, l);
});
