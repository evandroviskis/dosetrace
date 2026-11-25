'use strict';
// Founder 2026-11-24 (admin panel decision): "Editar o perfil (nome, data de nascimento etc.) sem
// internet deve continuar recusado, como hoje?" → B) "Guardar no celular e enviar quando a internet
// voltar". Spec docs/specs/profile-synced.md PS-18..PS-23 (branch feat/profile-synced).
//
// The trap this file guards: during the mirror period user_metadata wins on read (founder B1). An edit
// made offline never reached user_metadata, so reading the stale metadata back would put the old value
// on screen and, worse, Edit profile (it saves what it shows) would later write the old value back. The
// rule built here: a key edited on this phone and not yet accepted by user_metadata (account_profile
// pending_meta) wins over user_metadata AND over the table, per key, until user_metadata accepts that
// same value. No clock is compared (user_metadata has no per-key time; the phone clock can be moved).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers/syncHarness');
const core = require('../lib/syncCore');
const PS = require('../lib/profileStore');
const { afterMetadataWrite } = require('../lib/profileWrite');
const { summarizeUnsent } = require('../lib/unsentSummary');
const { loadFn } = require('./helpers/extractFn');
const { friendlyError } = require('../lib/friendlyError');
const { normalizeActivityLevel, legacyActivity } = require('../lib/activityLevels');
const { errorSheet: errorSheetConfig } = require('../lib/errorSheet');
const { translations } = require('../i18n/translations');
const { nicknameFields, reportNameFields } = require('../lib/profileName');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const U = 'user-1';
const T = 'account_profile';
const OFFLINE = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 };
const DT001 = { code: 'DT001', message: 'device_not_active', status: 409 };

const META = { display_name: 'Sam', birth_year: 1985, birth_month: 7, gender: 'female', country: 'BR', primary_goal: 'fat_loss', tracking_types: ['peptides'], has_provider: 'yes', activity_level: 'moderate', activity_scale: 5, dose_reminders: true, full_name: 'Samantha Carter' };

let clock = 0;
const now = () => new Date(Date.parse('2026-11-24T18:00:00Z') + (++clock) * 1000).toISOString();
const rowOf = (db, uid = U) => PS.readProfileRow(db, uid);
const owed = (db, uid = U) => { const r = rowOf(db, uid); return r && r.pending_meta ? JSON.parse(r.pending_meta) : null; };
const ready = (db) => core.cloudTableReady(db, T, U);
const shown = (db, meta) => PS.withProfileMeta({ id: U, user_metadata: meta }, { row: rowOf(db), ready: ready(db) }).user_metadata;

// The server: user_metadata (GoTrue merges the keys sent) + the migration's backfill and trigger.
function makeServer(cloud, meta = META) {
  const server = { meta: JSON.parse(JSON.stringify(meta)), online: true, refuse: null, writes: [] };
  server.backfill = () => {
    const id = `cloud-profile-${U}`;
    const st = cloud._stamp();
    cloud._store[T].set(id, { id, user_id: U, payload: PS.pickProfile(server.meta), created_at: st, updated_at: st });
  };
  server.trigger = (changes) => {
    const r = [...cloud._store[T].values()].find((x) => x.user_id === U);
    if (!r) return;
    r.payload = { ...r.payload, ...PS.pickProfile(changes) };
    r.updated_at = cloud._stamp();
  };
  return server;
}
// The one updateUser wrapper (lib/supabase.js), its metadata write and its table step (noteWrite).
function wrapper(db, server, { session = () => U, owner = () => U } = {}) {
  return async (data) => {
    server.writes.push(data);
    let res;
    if (!server.online) res = { data: { user: null }, error: OFFLINE };
    else if (server.refuse) res = { data: { user: null }, error: server.refuse };
    else {
      Object.assign(server.meta, data);
      server.trigger(data);
      res = { data: { user: { id: U, user_metadata: { ...server.meta } } }, error: null };
    }
    afterMetadataWrite(res, data, (u, d) => PS.noteWrite(db, u, d, { sessionUserId: session(), localOwner: owner, ready: ready(db), now: now() }));
    return res;
  };
}
const send = (db, server, extra, opts = {}) => PS.sendProfileEdits(db, U, extra, { updateUser: wrapper(db, server, opts), meta: server.meta, now: now(), canKeep: () => true, ...opts });

test('PS-18: an Edit profile save without internet is kept in the local table and shown at once; a refusal that is not a connection problem is refused as today', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const server = makeServer(cloud);
  server.backfill();
  await core.pullChanges(db, cloud, U);
  PS.ensureProfileRow(db, U, server.meta, { now: now() });
  // Offline: the request fails on the network → kept on this phone.
  server.online = false;
  const r = await send(db, server, { display_name: 'Sam C.', birth_year: 1986 });
  assert.equal(r.status, 'kept');
  assert.deepEqual(owed(db), { display_name: 'Sam C.', birth_year: 1986 }, 'in account_profile, waiting for the account');
  assert.equal(rowOf(db).sync_status, 'pending', 'an unsent change of this phone (numbered for A-119)');
  assert.ok(rowOf(db).dt_seq > 0);
  assert.equal(shown(db, server.meta).display_name, 'Sam C.', 'shown at once');
  assert.equal(server.meta.display_name, 'Sam', 'user_metadata does not have it yet');
  // The phone already knows it is offline: kept at once, no request sent.
  const before = server.writes.length;
  assert.equal((await send(db, server, { country: 'PT' }, { knownOffline: true })).status, 'kept');
  assert.equal(server.writes.length, before, 'no request that cannot leave');
  // 429 / 5xx count as "try later" too (lib/pendingGate isRetryableError, the DV-114 rule).
  server.online = true;
  server.refuse = { status: 503, message: 'Service Unavailable' };
  assert.equal((await send(db, server, { gender: 'male' })).status, 'kept');
  // A refusal (A-119 DT001: this phone is no longer the account's; any 4xx): not kept, Edit stays open.
  const db2 = H.makeDb();
  const s2 = makeServer(H.makeCloud());
  s2.refuse = DT001;
  const r2 = await send(db2, s2, { display_name: 'X' });
  assert.equal(r2.status, 'failed');
  assert.equal(r2.error.code, 'DT001');
  assert.equal(owed(db2), null, 'nothing kept for a refused save');
  // The table cannot be written (or another account's data is here): never "saved on this phone".
  const r3 = await PS.sendProfileEdits(db2, U, { display_name: 'X' }, { updateUser: async () => ({ error: OFFLINE }), canKeep: () => false, now: now() });
  assert.equal(r3.status, 'failed');
  const broken = { getFirstSync() { throw new Error('db closed'); }, runSync() { throw new Error('db closed'); }, getAllSync() { throw new Error('db closed'); } };
  assert.equal((await PS.sendProfileEdits(broken, U, { display_name: 'X' }, { updateUser: async () => ({ error: OFFLINE }), canKeep: () => true, now: now() })).status, 'failed');
});

test('PS-18 (screen): Settings saveProfile — offline closes Edit profile with the honest "saved on this phone" line; a refusal keeps it open with the error; online closes as before', async () => {
  const run = (status, error = null) => {
    const out = { sends: [], sheets: [], closed: 0, refetched: 0, toasts: [], forgot: [] };
    const save = loadFn('screens/SettingsScreen.js', 'async function saveProfile(', 'saveProfile', {
      t: (k) => k, friendlyError, normalizeActivityLevel, legacyActivity, errorSheetConfig,
      supabase: { auth: { updateUser: async () => { throw new Error('the screen never writes the profile itself'); } } },
      saveProfileEdit: async (user, data, opts) => { out.sends.push({ user, data, opts }); return { status, error }; },
      isOnlineNow: () => false,
      savingProfile: { current: false },
      displayName: 'Sam C.', birthMonth: 4, birthYear: 1986, gender: 'male', country: 'Portugal', primaryGoals: ['fat_loss'], activityLevel: 'moderate', hasProvider: 'yes', trackingTypes: ['peptides'],
      user: { id: U, user_metadata: { display_name: 'Sam', activity_level: 'moderate' } },
      setEditSheet: (v) => out.sheets.push(v),
      setEditProfileOpen: (v) => { if (v === false) out.closed++; },
      setShowCountryPicker: () => {},
      fetchUser: () => { out.refetched++; },
      forgetKeptKeys: async (uid, keys) => { out.forgot.push(keys); },
      flushPendingGate: async () => ({ status: 'none' }),
      showSavedOffline: () => out.toasts.push('profile_saved_offline'),
      // Integration 2026-11-24 with the adherence report (AR-18): the two names go through lib/profileName,
      // and the full name typed in Edit profile is part of the same offline save.
      nicknameFields, reportNameFields, reportName: 'Samantha Carter', loadedReportName: { current: '' },
    });
    return { out, save };
  };
  let { out, save } = run('kept');
  await save();
  assert.equal(out.sends.length, 1);
  assert.equal(out.sends[0].data.report_name, 'Samantha Carter', 'report_name in Edit profile goes through saveProfileEdit (kept on this phone offline)');
  assert.equal(out.sends[0].data.display_name, 'Sam C.');
  assert.equal(out.sends[0].opts.knownOffline, true, 'the phone knows it is offline: kept at once');
  assert.equal(typeof out.sends[0].opts.updateUser, 'function');
  assert.equal(out.closed, 1, 'Edit profile closes');
  assert.equal(out.refetched, 1, 'the profile is read again — with the kept edit laid over it');
  assert.deepEqual(out.toasts, ['profile_saved_offline']);
  assert.equal(out.sheets.length, 0, 'no error sheet');
  assert.ok(out.forgot[0].includes('display_name'), 'a kept 18+ / profile answer never goes over the newer edit (DV-114 Gate B 2)');
  ({ out, save } = run('failed', DT001));
  await save();
  assert.equal(out.closed, 0, 'a refusal keeps Edit profile open with the typed values');
  assert.equal(out.sheets.length, 1);
  assert.equal(out.sheets[0].title, 'err_title_save');
  assert.equal(out.toasts.length, 0);
  ({ out, save } = run('saved'));
  await save();
  assert.equal(out.closed, 1);
  assert.equal(out.toasts.length, 0, 'online: no line, as before');
  // The toast is the app's own (SheetToast, theme tokens c.toast / c.toastText: both themes), and the
  // old refusal for a profile save without internet is gone from the screen.
  const st = read('screens/SettingsScreen.js');
  assert.match(st, /<SheetToast text=\{savedOfflineToast\} \/>/);
  assert.match(st, /import \{ SheetToast \} from '\.\/components\/BodySheets';/);
  assert.match(st, /function showSavedOffline\(\) \{[\s\S]*?setSavedOfflineToast\(t\('profile_saved_offline'\)\)/);
});

test('PS-19: precedence — a key edited here and not yet accepted by user_metadata wins over user_metadata and over the table, in the mirror period and after the cutover; nothing reads the stale value back over it', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const server = makeServer(cloud);
  server.backfill();
  await core.pullChanges(db, cloud, U);
  server.online = false;
  await send(db, server, { display_name: 'New', birth_month: 3 });
  const row = rowOf(db);
  for (const mirror of [true, false]) {
    const v = PS.profileView({ row, meta: server.meta, ready: true, mirror });
    assert.equal(v.display_name, 'New', `mirror=${mirror}: the edit wins over stale user_metadata`);
    assert.equal(v.birth_month, 3);
    assert.equal(v.country, 'BR', 'other keys as before');
  }
  assert.equal(PS.profileView({ row, meta: server.meta, ready: false }).display_name, 'New', 'before the cloud table is read too');
  // The stale metadata is read back (a restart, a USER_UPDATED of another key, a token refresh): still New.
  assert.equal(shown(db, { ...server.meta }).display_name, 'New');
  // The copy from user_metadata (cold start / sign-in) never overwrites it.
  PS.ensureProfileRow(db, U, server.meta, { now: now() });
  assert.equal(shown(db, server.meta).display_name, 'New');
  // A pull of the (stale) cloud row never overwrites it, and keeps it waiting.
  server.trigger({ dose_reminders: false }); // something else changed in the cloud row
  await core.pullChanges(db, cloud, U);
  assert.deepEqual(owed(db), { display_name: 'New', birth_month: 3 });
  assert.equal(rowOf(db).sync_status, 'pending');
  assert.equal(shown(db, server.meta).display_name, 'New');
  // An A-119 rebuild that keeps this phone's newer input (keep seq before the edit) keeps it too.
  const rb = await core.rebuildFromCloud(db, cloud, U, { keep: { seq: 0 } });
  assert.equal(rb.ok, true);
  assert.deepEqual(owed(db), { display_name: 'New', birth_month: 3 }, 'kept by the rebuild and its import');
  assert.equal(shown(db, server.meta).display_name, 'New');
  // Edit profile then saves what it shows (New) — never the stale Sam.
  server.online = true;
  await send(db, server, { display_name: shown(db, server.meta).display_name, country: 'PT' });
  assert.equal(server.meta.display_name, 'New');
  assert.equal(server.meta.birth_month, 3, 'the waiting key went in the same merge write');
  assert.equal(server.meta.country, 'PT');
});

test('PS-20: when the connection returns, the waiting edit goes to user_metadata first (one merge write, only its keys), then the table; the cloud table never holds a value user_metadata lacks', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const server = makeServer(cloud);
  server.backfill();
  await core.pullChanges(db, cloud, U);
  server.online = false;
  await send(db, server, { display_name: 'Sam C.', country: 'PT' });
  // A sync while the edit waits (e.g. a dose logged): the profile row is held — mirror first.
  await core.pushPending(db, cloud, U);
  const cp = () => [...cloud._store[T].values()].find((r) => r.user_id === U).payload;
  assert.equal(cp().display_name, 'Sam', 'the cloud table is not ahead of user_metadata');
  assert.equal(rowOf(db).sync_status, 'pending', 'still waiting');
  // The flush with no internet: nothing changes, nothing lost.
  assert.equal((await send(db, server, null)).status, 'offline');
  assert.deepEqual(owed(db), { display_name: 'Sam C.', country: 'PT' });
  // A refusal on the flush (e.g. A-119 DT001): kept, retried later (never destroyed on a maybe).
  server.online = true;
  server.refuse = DT001;
  assert.equal((await send(db, server, null)).status, 'refused');
  assert.deepEqual(owed(db), { display_name: 'Sam C.', country: 'PT' });
  // Back online: one merge write of exactly the waiting keys.
  server.refuse = null;
  server.writes.length = 0;
  assert.equal((await send(db, server, null)).status, 'saved');
  assert.deepEqual(server.writes, [{ display_name: 'Sam C.', country: 'PT' }], 'merge-only: never the whole metadata');
  assert.equal(server.meta.display_name, 'Sam C.');
  assert.equal(server.meta.birth_year, 1985, 'no other key touched');
  assert.equal(server.meta.full_name, 'Samantha Carter');
  assert.equal(owed(db), null, 'no longer waiting for the account');
  // Then the table (the wrapper recorded the accepted write as a patch) goes up.
  await core.pushPending(db, cloud, U);
  assert.equal(cp().display_name, 'Sam C.');
  assert.equal(cp().country, 'PT');
  assert.equal(rowOf(db).sync_status, 'synced');
  assert.equal(shown(db, server.meta).display_name, 'Sam C.');
  // Nothing waiting → no request at all.
  server.writes.length = 0;
  assert.equal((await send(db, server, null)).status, 'none');
  assert.equal(server.writes.length, 0);
  // Before the migration (no cloud table): the flush still writes user_metadata; the row waits as before.
  const db2 = H.makeDb();
  const s2 = makeServer(H.makeCloud());
  s2.trigger = () => {};
  s2.online = false;
  await send(db2, s2, { display_name: 'Early' });
  s2.online = true;
  assert.equal((await send(db2, s2, null)).status, 'saved');
  assert.equal(s2.meta.display_name, 'Early');
  assert.equal(owed(db2), null);
  assert.equal(shown(db2, s2.meta).display_name, 'Early');
});

test('PS-20 (wiring): the flush runs on app start / sign-in after the account guard, connection back and return to the app — through the one updateUser wrapper, one send at a time, never inside onAuthStateChange', () => {
  const prof = read('lib/profile.js');
  assert.match(prof, /export function saveProfileEdit\(user, data, \{ updateUser, knownOffline = false \} = \{\}\) \{\n\s+return serial\(/);
  assert.match(prof, /export function flushProfileEdits\(\) \{\n\s+return serial\(/);
  assert.match(prof, /updateUser: \(data\) => sb\.supabase\.auth\.updateUser\(\{ data \}\)/, 'the flush goes through the wrapper (A-119 guard, then the table step)');
  assert.match(prof, /export function startProfileEditFlush\(\) \{[\s\S]*?e\.type === 'connectivity' && e\.online\) \|\| e\.type === 'sync_complete'[\s\S]*?st === 'active'[\s\S]*?\}/);
  assert.match(prof, /canKeep: \(\) => sessionUserId\(\) === user\.id && !phoneHoldsOtherAccount\(getLocalDataUserId, user\.id\)/, 'kept only for the signed-in account, never next to another account\'s data');
  const app = read('App.js');
  const listener = app.slice(app.indexOf('supabase.auth.onAuthStateChange((_event, session) => {'));
  const body = listener.slice(0, listener.indexOf('\n    });'));
  assert.doesNotMatch(body, /flushProfileEdits|startProfileEditFlush/, 'onAuthStateChange stays synchronous (Gate B)');
  assert.match(app, /const stopProfileFlush = startProfileEditFlush\(\);/);
  assert.match(app, /stopProfileFlush\(\);/);
  const signIn = app.slice(app.indexOf('const onSignedIn = (session) => {'), app.indexOf('setSignInHandler(onSignedIn);'));
  assert.match(signIn, /ensureProfileCopy\(session\.user\);\n\s+flushProfileEdits\(\);/);
  const cold = app.slice(app.indexOf('supabase.auth.getSession().then(async'), app.indexOf('const onSignedIn = (session) => {'));
  assert.match(cold, /ensureProfileCopy\(session\.user\);\n\s+flushProfileEdits\(\);/);
  assert.match(read('lib/supabase.js'), /export function sessionUserId\(\) \{ return knownUser_ \? knownUser_\.id : null; \}/);
});

test('PS-21: two quick edits offline — the later wins per key, the earlier\'s other keys are kept; an edit saved while a send is out is never cleared by that send; an online save after an offline edit sends both and clears both', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const server = makeServer(cloud);
  server.backfill();
  await core.pullChanges(db, cloud, U);
  server.online = false;
  await send(db, server, { display_name: 'A', country: 'PT' });
  await send(db, server, { display_name: 'B', birth_year: 1990 });
  assert.deepEqual(owed(db), { display_name: 'B', country: 'PT', birth_year: 1990 });
  assert.equal(shown(db, server.meta).display_name, 'B');
  // A send is out (slow network) and the person saves again offline before it answers.
  server.online = true;
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = wrapper(db, server);
  const out = PS.sendProfileEdits(db, U, null, { updateUser: async (d) => { await gate; return slow(d); }, meta: server.meta, now: now(), canKeep: () => true });
  await new Promise((r) => setImmediate(r));
  await PS.sendProfileEdits(db, U, { display_name: 'C' }, { updateUser: async () => ({ error: OFFLINE }), meta: server.meta, now: now(), canKeep: () => true });
  release();
  assert.equal((await out).status, 'saved');
  assert.equal(server.meta.display_name, 'B', 'the account got what was sent');
  assert.deepEqual(owed(db), { display_name: 'C' }, 'the edit saved meanwhile still waits (newer than what landed)');
  assert.equal(shown(db, server.meta).display_name, 'C', 'and is what the screen shows');
  await core.pushPending(db, cloud, U);
  assert.equal([...cloud._store[T].values()][0].payload.display_name, 'B', 'the cloud table never passes user_metadata');
  assert.equal((await send(db, server, null)).status, 'saved');
  assert.equal(server.meta.display_name, 'C');
  assert.equal(owed(db), null);
  await core.pushPending(db, cloud, U);
  assert.equal([...cloud._store[T].values()][0].payload.display_name, 'C', 'ends on the last edit everywhere');
  // Offline edit, then an online Edit profile save: one write with both, both cleared.
  server.online = false;
  await send(db, server, { activity_level: 'very_active' });
  server.online = true;
  server.writes.length = 0;
  assert.equal((await send(db, server, { display_name: 'D' })).status, 'saved');
  assert.deepEqual(server.writes, [{ activity_level: 'very_active', display_name: 'D' }]);
  assert.equal(owed(db), null);
  // lib/profile runs every send (Edit profile and the flush) one after the other.
  assert.match(read('lib/profile.js'), /let sendQueue = Promise\.resolve\(\);\nconst serial = \(fn\) => \{ const run = sendQueue\.then\(fn, fn\); sendQueue = run\.catch\(\(\) => \{\}\); return run; \};/);
});

test('PS-22: never lost — a token refresh, a session hiccup or a re-auth of the same user keep it; the intended sign-out, another account signing in and the A-119 takeover count it as not in the account yet; a row only mirroring user_metadata is still never counted (Gate B F1)', async () => {
  const S = require('../lib/signedOut');
  const { pendingForSignOut, unsyncedCount } = require('../lib/recoveryFlow');
  const { crossAccountDecision } = require('../lib/accountGuard');
  const db = H.makeDb();
  const server = makeServer(H.makeCloud());
  PS.ensureProfileRow(db, U, server.meta, { now: now() });
  // Gate B F1 unchanged: a row waiting only to mirror an accepted write is not "unsent".
  PS.recordProfileWrite(db, U, { country: 'PT' }, { ready: true, meta: server.meta, now: now() });
  assert.equal(rowOf(db).sync_status, 'pending');
  assert.equal(summarizeUnsent(db, [U]).count, 0);
  assert.equal(pendingForSignOut({ db, localOwnerId: U, sessionUserId: U, tables: core.UNSENT_TABLES, getPending: core.getUnsentChanges }), 0);
  // An edit user_metadata does not have yet IS at risk.
  server.online = false;
  await send(db, server, { display_name: 'Sam C.' });
  assert.ok(core.UNSENT_TABLES.includes(T));
  const s = summarizeUnsent(db, [U]);
  assert.equal(s.count, 1);
  assert.equal(s.byKind.profile, 1, 'the "profile" word of the unsent list (DV-114)');
  assert.equal(pendingForSignOut({ db, localOwnerId: U, sessionUserId: U, tables: core.UNSENT_TABLES, getPending: core.getUnsentChanges }), 1, 'the deliberate sign-out warns before it is lost');
  assert.deepEqual(crossAccountDecision({ localOwnerId: U, sessionUserId: 'user-2', countPending: (id) => unsyncedCount(db, id, core.UNSENT_TABLES, core.getUnsentChanges) }), { action: 'ask', pending: 1 }, 'another account signing in asks first (DV-242)');
  // A spurious SIGNED_OUT (token refresh, session hiccup) or the same user signing in again: kept.
  let cleared = 0;
  const d = { stopSyncEngine() {}, clearLocalDatabase() { cleared++; db.execSync(`DELETE FROM ${T};`); }, waitForSyncIdle: async () => {}, runExclusive: async (fn) => fn() };
  assert.equal(await S.afterSignedOut(false, d), false);
  assert.equal(cleared, 0);
  PS.ensureProfileRow(db, U, server.meta, { now: now() }); // the re-auth's copy step
  assert.deepEqual(owed(db), { display_name: 'Sam C.' });
  // While no session is known (after a SIGNED_OUT) the answer of a late write never touches the row.
  assert.equal(PS.noteWrite(db, { id: U, user_metadata: server.meta }, { display_name: 'late' }, { sessionUserId: null, localOwner: () => U, ready: true, now: now() }), false);
  assert.deepEqual(owed(db), { display_name: 'Sam C.' });
  // The A-119 takeover (this phone loses): what it discards is counted and shown (the founder's exception).
  const cloud = H.makeCloud();
  const rb = await core.rebuildFromCloud(db, cloud, U, { keep: null });
  assert.equal(rb.ok, true);
  assert.equal(rb.discarded.byKind.profile, 1, 'never discarded uncounted');
  // The app's counts use the one getter (no call site pairs the list with the raw pending rows).
  assert.match(read('App.js'), /countPending: \(id\) => unsyncedCount\(getDB\(\), id, UNSENT_TABLES, getUnsentChanges\),/);
  assert.match(read('lib/accountActions.js'), /pendingForSignOut\(\{ db: getDB\(\), localOwnerId: getLocalDataUserId\(\), sessionUserId, tables: UNSENT_TABLES, getPending: getUnsentChanges \}\)/);
  assert.match(read('screens/TodayScreen.js'), /unsyncedCount\(getDB\(\), getLocalDataUserId\(\), UNSENT_TABLES, getUnsentChanges\)/);
  // The deliberate sign-out first tries to send it (with the kept gate answer and the push), then counts.
  const signOut = read('lib/accountActions.js');
  assert.match(signOut.slice(signOut.indexOf('export async function signOutIntended(')), /forceSync: async \(\) => \{[^\n]*flushProfileEdits\(\);[^\n]*return forceSync\(\); \},/);
  for (const f of ['App.js', 'lib/accountActions.js', 'screens/TodayScreen.js', 'lib/unsentSummary.js', 'lib/deviceRuntime.js']) {
    assert.doesNotMatch(read(f), /UNSENT_TABLES, getPendingChanges|getPending: getPendingChanges/, `${f}: the unsent counts never use the raw pending rows`);
  }
});

test('PS-23: the line in all 6 languages, natural, formal pt, no emoji; the column on older local tables', () => {
  const want = {
    en: "Saved on this phone. It will be sent to your account when you're back online.",
    pt: 'Salvo neste celular. Será enviado para a sua conta quando a internet voltar.',
    es: 'Guardado en este teléfono. Se enviará a tu cuenta cuando vuelva la conexión.',
    fr: 'Modifications enregistrées sur ce téléphone. Elles seront envoyées à votre compte dès le retour de la connexion.',
    de: 'Auf diesem Handy gespeichert. Die Änderungen werden an dein Konto gesendet, sobald du wieder online bist.',
    it: 'Salvato su questo telefono. Le modifiche verranno inviate al tuo account quando torna la connessione.',
  };
  for (const [l, s] of Object.entries(want)) {
    assert.equal(translations[l].profile_saved_offline, s, l);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u, `${l}: no emoji`);
  }
  assert.doesNotMatch(want.pt, /\b(dá para|a gente|tá)\b/, 'formal pt');
  // The local column (fresh install, and a table made before it).
  const db = H.makeDb();
  assert.ok(db.getAllSync(`PRAGMA table_info(${T})`).some((c) => c.name === 'pending_meta'));
  assert.match(read('lib/database.js'), /ALTER TABLE account_profile ADD COLUMN pending_meta TEXT;/);
});
