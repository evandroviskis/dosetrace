'use strict';
// Council regulatory review (1.3.1): an opted-out account's analytics rows could still be sent.
// lib/analytics queued a background-mode event (DV-184) BEFORE the opt-out was read, and the queue
// was only cleared by that account's next foreground event. Scenario: A (opted out) taps Mark
// complete on a notification (row queued), signs out, B (opted in) signs in, B's first foreground
// event flushed A's rows. Fix:
//   - a local opt-out flag on the phone (written whenever the account's choice is read or changed)
//     is checked BEFORE anything is queued: opted out, or unknown and previously opted out → never;
//   - the Settings switch (off), the intended sign-out wipe and the cross-account discard clear it;
//   - every queued row is tagged with the account that queued it; a flush drops other accounts' rows.
// Runs the REAL logEvent (lib/analytics), toggleAnalytics (Settings), runWipeSteps (lib/signedOut)
// and discardPreviousAccount (lib/accountGuard) with fakes for the platform pieces.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { createAnalyticsQueue, createOptOutFlag } = require('../lib/analyticsQueue');
const { buildRow } = require('../lib/analyticsEvent');
const S = require('../lib/signedOut');
const G = require('../lib/accountGuard');

const QKEY = 'dosetrace_analytics_bg_queue';
const FKEY = 'dosetrace_analytics_opt_out';

function storage() {
  const mem = {};
  return { mem, getItem: async (k) => (k in mem ? mem[k] : null), setItem: async (k, v) => { mem[k] = v; } };
}

const A_OUT = { id: 'user-a', user_metadata: { analytics_opt_in: false } };
const A_UNKNOWN = { id: 'user-a', user_metadata: {} };
const A_IN = { id: 'user-a', user_metadata: { analytics_opt_in: true } };
const B_IN = { id: 'user-b', user_metadata: { analytics_opt_in: true } };
const B_DEFAULT = { id: 'user-b', user_metadata: {} };

// One phone: the real queue + flag over one fake AsyncStorage, the real logEvent.
function phone() {
  const st = storage();
  const sent = [];
  const supabase = { from: () => ({ insert: async (row) => { sent.push(row); return { error: null }; } }) };
  const bgQueue = createAnalyticsQueue({ storage: st, key: QKEY, send: (row) => supabase.from('analytics_events').insert(row) });
  const optOutFlag = createOptOutFlag({ storage: st, key: FKEY });
  const state = { background: false, user: null };
  const logEvent = loadFn('lib/analytics.js', 'export async function logEvent(', 'logEvent', {
    storedSessionOnly: () => state.background,
    getCachedUser: async () => { if (state.background) throw new Error('auth client in background mode'); return state.user; },
    readStoredUser: async () => state.user,
    bgQueue, optOutFlag, buildRow, supabase,
    installId: async () => 'install-1',
    Platform: { OS: 'ios' },
  });
  const queued = () => { try { return JSON.parse(st.mem[QKEY] || '[]'); } catch { return []; } };
  return { st, sent, bgQueue, optOutFlag, state, logEvent, queued };
}

test('opt-out: A opted out (stored metadata) → a background event queues nothing', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_OUT;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 0, 'nothing queued for an opted-out account');
  assert.equal(JSON.parse(p.st.mem[FKEY]).out, true, 'the phone remembers the opt-out');
});

test('opt-out: the stored session says nothing, but the phone remembers A opted out → nothing queued', async () => {
  const p = phone();
  // A foreground read of A's choice (opted out) wrote the flag.
  p.state.user = A_OUT;
  await p.logEvent('view_today');
  assert.equal(p.sent.length, 0);
  // Later, headless, the stored user carries no explicit choice.
  p.state.background = true; p.state.user = A_UNKNOWN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 0, 'unknown + previously opted out → never queued');
});

test('opt-out: a phone that previously recorded an opt-out queues nothing for an account whose choice is unknown', async () => {
  const p = phone();
  await p.optOutFlag.remember('user-a', true);
  p.state.background = true; p.state.user = B_DEFAULT; // no explicit choice stored for B
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 0);
  // B's explicit opt-in is a known choice: its own row may wait.
  p.state.user = B_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 1);
  assert.equal(p.queued()[0].uid, 'user-b', 'tagged with the account that queued it');
});

test('opt-out: the opt-out remembered for A wins over a stale opted-in stored session of A', async () => {
  const p = phone();
  await p.optOutFlag.remember('user-a', true);
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 0);
});

test('opt-out: no readable stored user in the background → nothing queued', async () => {
  const p = phone();
  p.state.background = true; p.state.user = null;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 0);
});

test('opt-out: the row sent stays anonymous (the account tag lives on the queue entry only)', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 1);
  p.state.background = false;
  await p.logEvent('view_today');
  assert.equal(p.sent.length, 2);
  for (const row of p.sent) {
    assert.equal(JSON.stringify(row).includes('user-a'), false, 'no account id in a sent row');
  }
});

test('opt-out: A\'s queued rows are never flushed by B (A signs out, B signs in)', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  await p.logEvent('dose_logged', { outcome: 'Taken', source: 'notification' });
  assert.equal(p.queued().length, 2);
  // B signs in; B's first foreground event.
  p.state.background = false; p.state.user = B_IN;
  await p.logEvent('view_today');
  assert.deepEqual(p.sent.map((r) => r.event), ['view_today'], 'only B\'s own event went');
  assert.equal(p.queued().length, 0, 'A\'s rows are dropped, never sent');
});

test('opt-out: an untagged row (queued by 1.3.0, no account) is dropped, never sent', async () => {
  const p = phone();
  p.st.mem[QKEY] = JSON.stringify([{ qid: 'old-1', row: { event: 'notif_action' } }]);
  p.state.user = B_IN;
  await p.logEvent('view_today');
  assert.deepEqual(p.sent.map((r) => r.event), ['view_today']);
  assert.equal(p.queued().length, 0);
});

test('opt-out: the same account\'s queued rows still go with its next foreground event', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  p.state.background = false;
  await p.logEvent('view_today');
  assert.deepEqual(p.sent.map((r) => r.event), ['notif_action', 'view_today']);
  assert.equal(p.queued().length, 0);
});

test('queue: flush(uid) sends only that account\'s rows and drops the others', async () => {
  const st = storage();
  const sent = [];
  const q = createAnalyticsQueue({ storage: st, key: 'q', send: async (row) => { sent.push(row.name); return { error: null }; } });
  await q.add({ name: 'a1' }, 'user-a');
  await q.add({ name: 'b1' }, 'user-b');
  await q.add({ name: 'a2' }, 'user-a');
  await q.flush('user-b');
  assert.deepEqual(sent, ['b1']);
  assert.deepEqual(JSON.parse(st.mem.q), []);
});

// ── The Settings switch ──
function settingsToggle(p, { saveFails = false } = {}) {
  const errors = [];
  const toggle = loadFn('screens/SettingsScreen.js', 'async function toggleAnalytics(', 'toggleAnalytics', {
    t: (k) => k,
    friendlyError: () => 'err',
    user: { id: 'user-a' },
    supabase: { auth: { updateUser: async () => (saveFails ? { error: { message: 'offline' } } : { error: null }) } },
    analyticsSaved: { current: true },
    setAnalyticsEnabled: () => {},
    errorSheet: (b) => errors.push(b),
    clearAnalyticsQueue: () => p.bgQueue.clear(),
    noteAnalyticsChoice: (uid, optIn) => p.optOutFlag.remember(uid, !optIn),
  });
  return { toggle, errors };
}

test('opt-out: turning the analytics switch off clears the queue and remembers the opt-out', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 1);
  await settingsToggle(p).toggle(false);
  assert.equal(p.queued().length, 0, 'the queue is cleared');
  assert.deepEqual(JSON.parse(p.st.mem[FKEY]), { uid: 'user-a', out: true });
  // A later background event of A (stale stored session still opted in) queues nothing.
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 0);
});

test('opt-out: the switch off clears the queue even when the save is refused (the intent is to opt out)', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  const s = settingsToggle(p, { saveFails: true });
  await s.toggle(false);
  assert.equal(s.errors.length, 1, 'the refusal is still shown');
  assert.equal(p.queued().length, 0);
});

test('opt-out: turning the switch back on remembers the opt-in', async () => {
  const p = phone();
  await p.optOutFlag.remember('user-a', true);
  await settingsToggle(p).toggle(true);
  assert.deepEqual(JSON.parse(p.st.mem[FKEY]), { uid: 'user-a', out: false });
});

test('opt-out: Settings remembers the choice it reads (fetchUser) and wires the switch', () => {
  const src = read('screens/SettingsScreen.js');
  assert.match(src, /noteAnalyticsChoice\(user\.id, user\.user_metadata\?\.analytics_opt_in !== false\)/);
  assert.match(src, /import \{ clearAnalyticsQueue, noteAnalyticsChoice \} from '\.\.\/lib\/analytics'/);
});

// ── The intended sign-out wipe and the cross-account discard ──
test('opt-out: the intended sign-out wipe clears the analytics queue', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  assert.equal(p.queued().length, 1);
  const noop = () => {};
  S.registerWipe(() => ({
    stopSyncEngine: noop, clearLocalDatabase: noop, cancelAllNotifications: noop, dismissAllNotifications: noop,
    logOutPurchases: noop, clearOnboarding: noop, removeRcStart: noop, clearRealityDeviceFlags: noop,
    clearSeenOnboarding: noop, removeQuestions: noop, resetAllSelections: noop, clearAllDrafts: noop,
    forgetTodayLayout: noop, clearAIConsent: noop, forgetLocalOwner: noop,
    clearAnalyticsQueue: () => p.bgQueue.clear(),
  }));
  S.runRegisteredWipe();
  await new Promise((r) => setTimeout(r, 10)); // the wipe's steps are not awaited
  assert.equal(p.queued().length, 0);
});

test('opt-out: discarding the previous account (B signs in over A) clears the analytics queue', async () => {
  const p = phone();
  p.state.background = true; p.state.user = A_IN;
  await p.logEvent('notif_action', { action: 'MARK_TAKEN' });
  const noop = async () => {};
  const d = {
    getLocalOwner: () => 'user-a', countPending: () => 0, readOwnerLabel: async () => null,
    rememberOwner: noop, forgetLocalOwner: noop, clearLocalDatabase: () => {}, removeRcStart: noop,
    clearRealityDeviceFlags: noop, cancelAllNotifications: noop, dismissAllNotifications: noop,
    clearAllDrafts: () => {}, resetAllSelections: () => {}, removeQuestions: noop, clearAIConsent: noop,
    ask: () => {}, clearAnalyticsQueue: () => p.bgQueue.clear(),
  };
  assert.equal(await G.guardSignedIn(d, { sessionUser: { id: 'user-b' } }), 'continue');
  assert.equal(p.queued().length, 0);
});

test('opt-out: the App wires clearAnalyticsQueue into the wipe steps and the cross-account discard', () => {
  assert.match(read('lib/signedOut.js'), /d\.clearAnalyticsQueue/);
  assert.match(read('lib/accountGuard.js'), /d\.clearAnalyticsQueue/);
  const app = read('App.js');
  assert.match(app, /import \{ clearAnalyticsQueue \} from '\.\/lib\/analytics'/);
  const wipe = app.slice(app.indexOf('const wipeDeps = () => ({'), app.indexOf('// DV-242 (AD-102 = B): the cross-account guard'));
  assert.match(wipe, /clearAnalyticsQueue,/, 'wipeDeps carries it');
  const guard = app.slice(app.indexOf('const guardDeps = () => ({'), app.indexOf('const sessionUid ='));
  assert.match(guard, /clearAnalyticsQueue,/, 'guardDeps carries it');
});
