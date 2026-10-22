'use strict';
// A-163 — messages from the DoseTrace team, the APP part (docs/specs/team-messages.md, signed
// 2026-10-22; app part committed to 1.3.1). Server contract: dosetrace-admin
// supabase/migrations/20261022180000_team_messages.sql (list = select own via RLS, REPLACE the
// local copy each fetch — missing means withdrawn; rpc team_message_mark_read(p_id, p_at); push
// data { type: 'team_message', id }; user_metadata.language written by the app).
// Written BEFORE the code (CLAUDE.md evolution rule 1): every test here failed first.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
const flush = () => new Promise((r) => setImmediate(r));

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const row = (id, created, extra = {}) => ({ id, user_id: A, body: 'Text ' + id, created_at: created, read_at: null, ...extra });

// ── pure rules ───────────────────────────────────────────────────────────────────────────────

test('TM-9/TM-18: each fetch REPLACES the local copy — a message missing from the answer (withdrawn) disappears', () => {
  const { mergeFetched, emptyState } = require('../lib/teamMessages');
  let s = mergeFetched(emptyState(), [row('m1', '2026-10-20T10:00:00Z'), row('m2', '2026-10-21T10:00:00Z')], A);
  assert.deepEqual(s.list.map((m) => m.id), ['m2', 'm1'], 'newest first');
  s = mergeFetched(s, [row('m2', '2026-10-21T10:00:00Z')], A);
  assert.deepEqual(s.list.map((m) => m.id), ['m2'], 'm1 was withdrawn by the team: gone from the app');
});

test('TM-18: rows of another account are never kept (an answer read after an account switch)', () => {
  const { mergeFetched, emptyState } = require('../lib/teamMessages');
  const s = mergeFetched(emptyState(), [row('m1', '2026-10-20T10:00:00Z'), { ...row('x', '2026-10-20T11:00:00Z'), user_id: B }, { id: 'y', body: 'no owner', created_at: '2026-10-20T11:00:00Z' }], A);
  assert.deepEqual(s.list.map((m) => m.id), ['m1']);
});

test('TM-20: a message read offline stays read when the next list still says unread (the tap is queued)', () => {
  const { mergeFetched, emptyState, applyLocalRead, unreadQueue } = require('../lib/teamMessages');
  let s = mergeFetched(emptyState(), [row('m1', '2026-10-20T10:00:00Z')], A);
  s = applyLocalRead(s, 'm1', '2026-10-21T08:00:00.000Z');
  assert.equal(s.pending.m1, '2026-10-21T08:00:00.000Z');
  s = mergeFetched(s, [row('m1', '2026-10-20T10:00:00Z')], A); // server has not seen the tap yet
  assert.equal(unreadQueue(s).length, 0, 'never shown again as new');
  assert.equal(s.list[0].read_at, '2026-10-21T08:00:00.000Z');
  s = mergeFetched(s, [row('m1', '2026-10-20T10:00:00Z', { read_at: '2026-10-21T08:00:00Z' })], A);
  assert.deepEqual(s.pending, {}, 'the server confirmed it: nothing left to send');
});

test('TM-18: read on the other phone → read here on the next list', () => {
  const { mergeFetched, emptyState, unreadQueue } = require('../lib/teamMessages');
  let s = mergeFetched(emptyState(), [row('m1', '2026-10-20T10:00:00Z')], A);
  assert.equal(unreadQueue(s).length, 1);
  s = mergeFetched(s, [row('m1', '2026-10-20T10:00:00Z', { read_at: '2026-10-20T12:00:00Z' })], A);
  assert.equal(unreadQueue(s).length, 0);
});

test('mark read answer: a time → stored; null (not yours / withdrawn / unknown) → dropped locally', () => {
  const { mergeFetched, emptyState, applyLocalRead, applyReadResult } = require('../lib/teamMessages');
  let s = mergeFetched(emptyState(), [row('m1', '2026-10-20T10:00:00Z'), row('m2', '2026-10-20T11:00:00Z')], A);
  s = applyLocalRead(applyLocalRead(s, 'm1', '2026-10-21T08:00:00Z'), 'm2', '2026-10-21T08:00:01Z');
  s = applyReadResult(s, 'm1', '2026-10-21T08:00:00+00:00');
  s = applyReadResult(s, 'm2', null);
  assert.deepEqual(s.list.map((m) => m.id), ['m1']);
  assert.equal(s.list[0].read_at, '2026-10-21T08:00:00+00:00');
  assert.deepEqual(s.pending, {});
});

test('TM-16: several unread show oldest first; a tapped notification puts its own message first', () => {
  const { mergeFetched, emptyState, unreadQueue } = require('../lib/teamMessages');
  const s = mergeFetched(emptyState(), [
    row('m1', '2026-10-18T10:00:00Z'), row('m2', '2026-10-19T10:00:00Z', { read_at: '2026-10-19T11:00:00Z' }),
    row('m3', '2026-10-20T10:00:00Z'), row('m4', '2026-10-21T10:00:00Z'),
  ], A);
  assert.deepEqual(unreadQueue(s).map((m) => m.id), ['m1', 'm3', 'm4']);
  assert.deepEqual(unreadQueue(s, 'm4').map((m) => m.id), ['m4', 'm1', 'm3']);
  assert.deepEqual(unreadQueue(s, 'm2').map((m) => m.id), ['m2', 'm1', 'm3', 'm4'], 'a tap on a message already read still opens it');
  assert.deepEqual(unreadQueue(s, 'gone').map((m) => m.id), ['m1', 'm3', 'm4'], 'a withdrawn tapped message opens nothing of its own');
});

test('TM-17: the Settings row exists only after the first message (count + latest)', () => {
  const { mergeFetched, emptyState, settingsRow } = require('../lib/teamMessages');
  assert.equal(settingsRow(emptyState()), null);
  const s = mergeFetched(emptyState(), [row('m1', '2026-10-18T10:00:00Z'), row('m2', '2026-10-21T10:00:00Z')], A);
  assert.deepEqual(settingsRow(s), { count: 2, latestAt: '2026-10-21T10:00:00Z' });
});

test('dates: "Today, 10:14" / "Yesterday, …" / the long date, in the app language and time format', () => {
  const { messageWhen, rowWhen } = require('../lib/teamMessages');
  const { translations } = require('../i18n/translations');
  const tOf = (l) => (k) => translations[l][k];
  const now = new Date(2026, 9, 22, 15, 0).getTime();
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
  assert.equal(messageWhen(at(22, 10, 14), now, tOf('pt'), 'pt', 'auto'), 'Hoje, 10:14');
  assert.equal(messageWhen(at(22, 10, 14), now, tOf('en'), 'en', 'auto'), 'Today, 10:14 AM');
  // the time as every other time in the app (lib/timeFormat formatTime)
  assert.equal(messageWhen(at(21, 9, 5), now, tOf('pt'), 'pt', 'auto'), 'Ontem, ' + require('../lib/timeFormat').formatTime('9:05', 'pt', 'auto'));
  assert.equal(messageWhen(at(21, 21, 5), now, tOf('en'), 'en', '24h'), 'Yesterday, 21:05');
  assert.equal(messageWhen(at(3, 9, 5), now, tOf('pt'), 'pt', 'auto'), '3 de outubro de 2026');
  assert.equal(rowWhen(at(22, 10, 14), now, tOf('pt'), 'pt'), 'hoje');
  assert.equal(rowWhen(at(3, 9, 5), now, tOf('pt'), 'pt'), 'em 3 de out.');
});

test('TM-17: the Settings row line reads naturally ("2 mensagens · a última hoje"; one message in the singular)', () => {
  const { settingsRowLine } = require('../lib/teamMessages');
  const { translations } = require('../i18n/translations');
  const tOf = (l) => (k) => translations[l][k];
  const now = new Date(2026, 9, 22, 15, 0).getTime();
  const today = new Date(2026, 9, 22, 10, 14).toISOString();
  assert.equal(settingsRowLine({ count: 2, latestAt: today }, now, tOf('pt'), 'pt'), '2 mensagens · a última hoje');
  assert.equal(settingsRowLine({ count: 1, latestAt: today }, now, tOf('pt'), 'pt'), '1 mensagem · recebida hoje');
  assert.equal(settingsRowLine({ count: 2, latestAt: today }, now, tOf('en'), 'en'), '2 messages · latest today');
  assert.equal(settingsRowLine({ count: 1, latestAt: today }, now, tOf('de'), 'de'), '1 Nachricht · heute erhalten');
});

// ── the store (per account, sync, offline) ───────────────────────────────────────────────────

function memStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    m,
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, String(v)); },
    removeItem: async (k) => { m.delete(k); },
    getAllKeys: async () => Array.from(m.keys()),
    multiRemove: async (ks) => { ks.forEach((k) => m.delete(k)); },
  };
}

function harness(opts = {}) {
  const h = { uid: A, rows: [], online: true, remoteReads: [], fetches: 0, storage: memStorage(opts.seed) };
  h.deps = {
    storage: h.storage,
    now: () => opts.now || Date.parse('2026-10-22T10:00:00Z'),
    getUserId: async () => h.uid,
    fetchRows: async () => {
      h.fetches++;
      if (h.beforeAnswer) await h.beforeAnswer();
      if (!h.online) return { data: null, error: { message: 'Network request failed' } };
      return { data: h.rows.filter((r) => r.user_id === h.uid), error: null };
    },
    markReadRemote: async (id, at) => {
      if (!h.online) return { data: null, error: { message: 'Network request failed' } };
      h.remoteReads.push({ id, at });
      const r = h.rows.find((x) => x.id === id && x.user_id === h.uid);
      if (!r) return { data: null, error: null };
      if (!r.read_at) r.read_at = at;
      return { data: r.read_at, error: null };
    },
  };
  return h;
}

test('TM-14: "Entendi" marks the message read on the server, with the tap time', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  const tm = createTeamMessages(h.deps);
  await tm.refresh();
  assert.equal(tm.unread().length, 1);
  await tm.markRead('m1');
  assert.deepEqual(h.remoteReads, [{ id: 'm1', at: '2026-10-22T10:00:00.000Z' }]);
  assert.equal(tm.unread().length, 0);
  assert.equal(h.rows[0].read_at, '2026-10-22T10:00:00.000Z', 'the panel shows Lida');
});

test('TM-20: offline "Entendi" is queued with its real time and sent on the next refresh; offline open is no error', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  const tm = createTeamMessages(h.deps);
  await tm.refresh();
  h.online = false;
  await tm.markRead('m1');
  assert.equal(tm.unread().length, 0, 'gone from the sheet at once');
  const r = await tm.refresh();
  assert.equal(r.ok, false, 'offline: the refresh says it failed, it never throws');
  assert.equal(tm.unread().length, 0);
  // the app is killed and opened again, online
  h.online = true;
  const again = createTeamMessages(h.deps);
  await again.refresh();
  assert.deepEqual(h.remoteReads, [{ id: 'm1', at: '2026-10-22T10:00:00.000Z' }], 'the queued tap keeps its real time');
  assert.equal(again.unread().length, 0, 'a message already seen is never shown again as new');
});

test('TM-20: a message fetched earlier shows from the kept copy when the phone is offline at open', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  await createTeamMessages(h.deps).refresh();
  h.online = false;
  const tm = createTeamMessages(h.deps);
  await tm.refresh();
  assert.deepEqual(tm.unread().map((m) => m.id), ['m1']);
});

test('TM-18: another account on the same phone never sees the first account\'s messages', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  const tm = createTeamMessages(h.deps);
  await tm.refresh();
  assert.equal(tm.snapshot().list.length, 1);
  h.uid = B; // account switch; B is offline, so only the kept copy could leak
  h.online = false;
  await tm.refresh();
  assert.equal(tm.snapshot().uid, B);
  assert.equal(tm.snapshot().list.length, 0);
  h.uid = null; // signed out
  await tm.refresh();
  assert.equal(tm.snapshot().list.length, 0);
});

test('TM-18: an answer that arrives after an account switch is dropped (never stored under the new account)', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  const tm = createTeamMessages(h.deps);
  let release;
  h.beforeAnswer = () => new Promise((r) => { release = r; });
  const p = tm.refresh();
  await flush();
  tm.forget(); // sign-out wipe while A's list is on the way
  h.uid = B;
  h.beforeAnswer = null;
  release();
  await p;
  assert.equal(tm.snapshot().list.length, 0);
  assert.equal(h.storage.m.get('dosetrace_team_messages:' + B), undefined);
});

test('clear on real sign-out / account discard: every account\'s kept copy is removed', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness({ seed: { 'dosetrace_team_messages:x': '{}', 'dosetrace_team_messages:y': '{}', 'dosetrace_language': 'pt' } });
  const tm = createTeamMessages(h.deps);
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  await tm.refresh();
  await tm.clearAll();
  assert.deepEqual(Array.from(h.storage.m.keys()), ['dosetrace_language']);
  assert.equal(tm.snapshot().list.length, 0);
});

test('subscribers hear every change (Today\'s sheet and the Settings row update live)', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.rows = [row('m1', '2026-10-21T10:00:00Z')];
  const tm = createTeamMessages(h.deps);
  const seen = [];
  const un = tm.subscribe((s) => seen.push(s.list.length));
  await tm.refresh();
  un();
  await tm.markRead('m1');
  assert.ok(seen.includes(1));
  const n = seen.length;
  await tm.refresh();
  assert.equal(seen.length, n, 'unsubscribed');
});

// ── language for the push title (contract step 4) ────────────────────────────────────────────

test('user_metadata.language is written only when it differs, with merge semantics (only the language key)', async () => {
  const { syncAccountLanguage } = require('../lib/accountLanguage');
  const writes = [];
  const updateUser = async (p) => { writes.push(p); return { data: {}, error: null }; };
  const user = (lang) => ({ id: A, user_metadata: { silent_mode: true, display_name: 'Carla', ...(lang ? { language: lang } : {}) } });
  assert.equal(await syncAccountLanguage({ language: 'pt', getUser: async () => user(null), updateUser }), 'written');
  assert.deepEqual(writes, [{ data: { language: 'pt' } }], 'never the whole metadata (no clobber)');
  assert.equal(await syncAccountLanguage({ language: 'pt', getUser: async () => user('pt'), updateUser }), 'same');
  assert.equal(await syncAccountLanguage({ language: 'xx', getUser: async () => user('pt'), updateUser }), 'skipped');
  assert.equal(await syncAccountLanguage({ language: 'de', getUser: async () => null, updateUser }), 'skipped');
  assert.equal(writes.length, 1);
  const failing = async () => ({ data: null, error: { message: 'offline' } });
  assert.equal(await syncAccountLanguage({ language: 'de', getUser: async () => user('pt'), updateUser: failing }), 'failed');
});

test('the language is written outside onAuthStateChange (it stays synchronous), on start and on every change', () => {
  const app = code('App.js');
  const cb = app.match(/onAuthStateChange\(\(_event, session\) => \{([\s\S]*?)\n    \}\);/);
  assert.ok(cb, 'found the auth callback');
  assert.doesNotMatch(cb[1], /syncAccountLanguage|AccountLanguageSync/);
  assert.match(app, /<AccountLanguageSync userId=\{/);
  const comp = code('components/AccountLanguageSync.js');
  assert.match(comp, /useEffect\([\s\S]*syncAccountLanguage[\s\S]*\[language, userId, ready\]/);
});

// ── notification tap (TM-11 / TM-13) ─────────────────────────────────────────────────────────

test('TM-13: a tap on a team message opens Today on that message', () => {
  const { notifTapTarget } = require('../lib/notificationPlan');
  const resp = { actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date: 1, request: { identifier: 'r1', content: { data: { type: 'team_message', id: 'm9' } } } } };
  assert.deepEqual(notifTapTarget(resp, 42), { screen: 'MainTabs', params: { screen: 'Today', params: { teamMessage: { id: 'm9', nonce: 42 } } } });
  // Android delivers remote data as a JSON string
  const s = { actionIdentifier: 'x', notification: { request: { content: { data: { dataString: JSON.stringify({ type: 'team_message', id: 'm9' }) } } } } };
  assert.equal(notifTapTarget(s, 1).params.params.teamMessage.id, 'm9');
  const noId = { actionIdentifier: 'x', notification: { request: { content: { data: { type: 'team_message' } } } } };
  assert.deepEqual(notifTapTarget(noId, 1), { screen: 'MainTabs', params: { screen: 'Today', params: { teamMessage: { id: null, nonce: 1 } } } });
});

test('TM-13/TM-15: the sheet waits for every Today popup and for a dose being logged from a reminder tap', () => {
  const { teamSheetMayOpen } = require('../lib/teamMessages');
  const free = { focused: true, todayPopup: false, siteQuestions: 0, keptQuestions: 0, logPopup: false, vialPending: false, doseFocusOpen: false, otherScreen: false };
  assert.equal(teamSheetMayOpen(free), true);
  for (const k of ['todayPopup', 'logPopup', 'vialPending', 'doseFocusOpen', 'otherScreen']) {
    assert.equal(teamSheetMayOpen({ ...free, [k]: true }), false, k);
  }
  assert.equal(teamSheetMayOpen({ ...free, siteQuestions: 1 }), false, 'a site question from a Mark taken tap comes first');
  assert.equal(teamSheetMayOpen({ ...free, keptQuestions: 1 }), false, 'a kept question (killed app) comes first');
  assert.equal(teamSheetMayOpen({ ...free, focused: false }), false, 'never over another tab');
});

test('TM-15: Today\'s own popups never open over the message sheet; they go on when it closes', () => {
  const today = code('screens/TodayScreen.js');
  assert.match(today, /function todayPopupBusy\(\) \{\s*return [^\n]*teamSheetOpenRef\.current/);
  assert.match(today, /async function openNextQuestion\(\) \{[\s\S]{0,400}teamSheetOpenRef\.current/);
  assert.match(today, /<TeamMessageGate[\s\S]{0,600}gateState=\{teamGateState\}[\s\S]{0,600}onOpenChange=/);
  assert.match(today, /route\.params\?\.teamMessage/);
});

// ── account lifecycle ────────────────────────────────────────────────────────────────────────

test('TM-18: the kept copy goes with the account — real sign-out wipe and the cross-account discard', () => {
  const so = code('lib/signedOut.js');
  assert.match(so, /function runWipeSteps\(d\) \{[\s\S]*?d\.clearTeamMessages[\s\S]*?\];/);
  const guard = code('lib/accountGuard.js');
  assert.match(guard, /async function discardPreviousAccount\(d\) \{[\s\S]*?d\.clearTeamMessages[\s\S]*?\];/);
  const app = code('App.js');
  const wipe = app.match(/const wipeDeps = \(\) => \(\{([\s\S]*?)\n  \}\);/);
  const guardDeps = app.match(/const guardDeps = \(\) => \(\{([\s\S]*?)\n  \}\);/);
  assert.match(wipe[1], /clearTeamMessages/);
  assert.match(guardDeps[1], /clearTeamMessages/);
});

test('TM-18: deleting the account deletes its messages (delete-user lists team_messages)', () => {
  const src = read('supabase/functions/delete-user/index.ts');
  const m = src.match(/userDataTables\s*=\s*\[([\s\S]*?)\]/);
  assert.match(m[1], /'team_messages'/);
});

test('the queries match the server contract (own list, mark-read RPC, no writes to the table)', () => {
  const src = code('lib/teamMessages.js');
  assert.match(src, /from\('team_messages'\)\s*\.select\('id, user_id, body, created_at, read_at'\)/);
  assert.match(src, /rpc\('team_message_mark_read', \{ p_id: id, p_at: at \}\)/);
  assert.doesNotMatch(src, /from\('team_messages'\)[\s\S]{0,80}\.(insert|update|upsert|delete)\(/);
});

// ── Android channel (TM-11) ──────────────────────────────────────────────────────────────────

test('TM-11: Android gets a "team-messages" channel named in the app language', async () => {
  const { teamChannelRequest, TEAM_CHANNEL_ID } = require('../lib/teamMessages');
  const { translations } = require('../i18n/translations');
  assert.equal(TEAM_CHANNEL_ID, 'team-messages');
  const r = teamChannelRequest((k) => translations.pt[k], { HIGH: 4 });
  assert.equal(r.id, 'team-messages');
  assert.equal(r.options.name, 'Mensagens da equipe');
  assert.equal(r.options.importance, 4);
  const comp = code('components/AccountLanguageSync.js');
  assert.match(comp, /setNotificationChannelAsync\(/, 'the channel is (re)named whenever the language changes');
});

// ── strings (TM-22) ──────────────────────────────────────────────────────────────────────────

const KEYS = ['team_msg_title', 'team_msg_kept', 'team_msg_got_it', 'team_msg_next', 'team_msg_counter', 'team_msg_today_at', 'team_msg_yesterday_at',
  'settings_team_messages', 'settings_sum_support_msgs', 'team_msgs_footer', 'team_msgs_when_today', 'team_msgs_when_yesterday', 'team_msgs_when_date',
  'team_msgs_sub', 'team_msgs_sub_one'];

test('TM-22: every new string exists in the 6 languages; the title is the server\'s fixed title word for word', () => {
  const { translations } = require('../i18n/translations');
  const SERVER = { en: 'DoseTrace team message', pt: 'Mensagem da equipe DoseTrace', es: 'Mensaje del equipo de DoseTrace', fr: 'Message de l\'équipe DoseTrace', de: 'Nachricht vom DoseTrace-Team', it: 'Messaggio dal team di DoseTrace' };
  for (const l of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    for (const k of KEYS) assert.ok(translations[l][k], `${l}.${k}`);
    assert.equal(translations[l].team_msg_title, SERVER[l], l);
  }
  assert.equal(translations.pt.team_msg_got_it, 'Entendi');
  assert.equal(translations.pt.team_msg_next, 'Próxima');
  assert.equal(translations.pt.settings_team_messages, 'Mensagens da equipe');
  assert.equal(translations.pt.team_msg_kept, 'Fica guardada em Ajustes › Suporte › Mensagens da equipe.');
  assert.equal(translations.pt.settings_sum_support_msgs, 'Mensagens, FAQ, contato');
});

test('TM-22: the "kept in" and reply lines name the real Settings / Support / Contact labels of each language', () => {
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    const tr = translations[l];
    const path3 = `${tr.tab_settings} › ${tr.settings_support} › ${tr.settings_team_messages}`;
    assert.ok(tr.team_msg_kept.includes(path3), `${l}: ${tr.team_msg_kept} ⊅ ${path3}`);
    assert.ok(tr.team_msgs_footer.includes(`${tr.tab_settings} › ${tr.settings_support} › ${tr.settings_contact}`), l);
  }
});

test('TM-22: no emoji, and Portuguese stays formal', () => {
  const { translations } = require('../i18n/translations');
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const l of ['en', 'pt', 'es', 'fr', 'de', 'it']) for (const k of KEYS) assert.doesNotMatch(translations[l][k], emoji, `${l}.${k}`);
  for (const k of KEYS) assert.doesNotMatch(translations.pt[k], /\b(a gente|dá para|não deu|você|tu)\b/i, k);
});

test('TM-22: the sheet, the list screen and the Settings row use theme tokens only (no raw colours)', () => {
  for (const f of ['components/TeamMessageGate.js', 'screens/TeamMessagesScreen.js']) {
    const src = code(f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/, f);
  }
});

test('TM-17: Settings › Support shows the row only after the first message, and it opens the list', () => {
  const st = code('screens/SettingsScreen.js');
  const body = st.match(/function renderSupportBody\(\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(body);
  assert.match(body[1], /teamRow \? \(/);
  assert.match(body[1], /navigation\.navigate\('TeamMessages'\)/);
  assert.match(read('App.js'), /<Stack\.Screen name="TeamMessages" component=\{TeamMessagesScreen\} \/>/);
});

// ── acceptance evidence for TM-12 / TM-19 ────────────────────────────────────────────────────

test('TM-12: Silent mode silences only the push (server); the app shows the message whatever the setting', () => {
  for (const f of ['lib/teamMessages.js', 'components/TeamMessageGate.js']) {
    assert.doesNotMatch(code(f), /silent_mode|silentNow|silent/i, f + ' never reads Silent mode');
  }
});

test('TM-19: notifications off / a failing network never surface an error — the refresh resolves, the sheet reads the kept list', async () => {
  const { createTeamMessages } = require('../lib/teamMessages');
  const h = harness();
  h.deps.fetchRows = async () => { throw new Error('boom'); };
  h.deps.markReadRemote = async () => { throw new Error('boom'); };
  const tm = createTeamMessages(h.deps);
  const r = await tm.refresh();
  assert.equal(r.ok, false);
  await tm.markRead('nope'); // never throws
  const gate = code('components/TeamMessageGate.js');
  assert.doesNotMatch(gate, /getPermissionsAsync|requestPermissionsAsync/, 'the in-app sheet never depends on notification permission');
  assert.match(gate, /teamMessages\(\)\.refresh\(\)\.catch\(\(\) => \{\}\)/);
});
