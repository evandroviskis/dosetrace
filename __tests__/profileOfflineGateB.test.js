'use strict';
// Gate B review of the offline Edit profile (feat/profile-synced 2e2a39b6; Second Brain dosetrace/02-decisoes.md
// 2026-11-24 19:20 "FIX-THEN-GO"). Spec docs/specs/profile-synced.md PS-24..PS-27. Each test failed before its fix.
//   1. a profile write outside Edit profile (calculator, onboarding, 18+, birth month, the sign-in name fill)
//      never cleared the kept edit, so the older kept value hid and then overwrote the newer one;
//   2. the flush ignored the A-119 takeover: an edit made before "Use here" could overwrite the other
//      phone's newer data before the rebuild discarded it;
//   3. a permanent refusal left the edit stuck forever, with nothing shown;
//   4. a hanging updateUser held the one send queue (Save, the sign-out send-first step) with no end.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers/syncHarness');
const { phone } = require('./helpers/devicePhone');
const core = require('../lib/syncCore');
const PS = require('../lib/profileStore');
const { afterMetadataWrite, metadataWrite } = require('../lib/profileWrite');
const { summarizeUnsent } = require('../lib/unsentSummary');
const { readChangeSeq } = require('../lib/changeSeq');
const { errorSheet, ERROR_TITLE_KEYS } = require('../lib/errorSheet');
const { loadFn } = require('./helpers/extractFn');
const { normalizeActivityLevel } = require('../lib/activityLevels');
const { birthMonthIndex } = require('../lib/profileName');
const { translations } = require('../i18n/translations');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const U = 'user-1';
const T = 'account_profile';
const OFFLINE = { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 };
const DT001 = { code: 'DT001', message: 'device_not_active', status: 409 };
const META = { display_name: 'Sam', birth_year: 1985, birth_month: 7, gender: 'male', country: 'BR', primary_goal: 'fat_loss', tracking_types: ['peptides'], has_provider: 'yes', activity_level: 'moderate', activity_scale: 5 };

let clock = 0;
const now = () => new Date(Date.parse('2026-11-24T20:00:00Z') + (++clock) * 1000).toISOString();
const rowOf = (db) => PS.readProfileRow(db, U);
const owed = (db) => { const r = rowOf(db); return r && r.pending_meta ? JSON.parse(r.pending_meta) : null; };
const ready = (db) => core.cloudTableReady(db, T, U);
const shown = (db, meta) => PS.withProfileMeta({ id: U, user_metadata: meta }, { row: rowOf(db), ready: ready(db) }).user_metadata;

function makeServer(cloud, meta = META) {
  const server = { meta: JSON.parse(JSON.stringify(meta)), online: true, refuse: null, hang: false, writes: [] };
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
// The REAL wrapper body (lib/profileWrite metadataWrite, which lib/supabase's updateUser runs) over a fake auth server.
function wrapper(db, server, { session = () => U, gate = null } = {}) {
  const raw = async (attrs) => {
    server.writes.push(attrs.data);
    if (gate) await gate;
    if (server.hang) return new Promise(() => {});
    if (!server.online) return { data: { user: null }, error: OFFLINE };
    if (server.refuse) return { data: { user: null }, error: server.refuse };
    Object.assign(server.meta, attrs.data);
    server.trigger(attrs.data);
    return { data: { user: { id: U, user_metadata: { ...server.meta } } }, error: null };
  };
  const updateUser = (attributes, options) => metadataWrite(attributes, options, {
    guard: null,
    raw,
    note: (u, d) => PS.noteWrite(db, u, d, { sessionUserId: session(), localOwner: () => U, ready: ready(db), now: now() }),
    keptBefore: (keys) => PS.keptEditsBefore(db, session(), keys),
    clearAccepted: (user, keys, before) => PS.clearAcceptedEdits(db, user, keys, before, { sessionUserId: session() }),
  });
  return updateUser;
}
const send = (db, server, extra, opts = {}) => {
  const up = wrapper(db, server, opts);
  return PS.sendProfileEdits(db, U, extra, { updateUser: (data) => up({ data }), meta: server.meta, now: now(), canKeep: () => true, ...opts });
};
async function setup() {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const server = makeServer(cloud);
  server.backfill();
  await core.pullChanges(db, cloud, U);
  return { db, cloud, server };
}

// ── 1 ───────────────────────────────────────────────────────────────────────────────────────────
test('PS-24: a profile write outside Edit profile (the calculator) accepted online supersedes the older kept edit of the same key: the view shows it and the flush never sends the old value; a newer edit kept meanwhile survives', async () => {
  const { db, server } = await setup();
  server.online = false;
  assert.equal((await send(db, server, { gender: 'female', country: 'PT' })).status, 'kept');
  assert.equal(shown(db, server.meta).gender, 'female');
  // Back online, the calculator writes M through the one wrapper (CalculatorSection.js, like every other writer).
  server.online = true;
  const up = wrapper(db, server);
  const res = await up({ data: { gender: 'male' } });
  assert.equal(res.error, null);
  assert.equal(shown(db, server.meta).gender, 'male', 'the newer accepted value is what the app shows');
  assert.deepEqual(owed(db), { country: 'PT' }, 'only the superseded key leaves the kept edit');
  server.writes.length = 0;
  assert.equal((await send(db, server, null)).status, 'saved');
  assert.deepEqual(server.writes, [{ country: 'PT' }], 'the flush sends nothing for gender');
  assert.equal(server.meta.gender, 'male', 'never overwritten by the older kept F');
  assert.equal((await send(db, server, null)).status, 'none');

  // A refused write (offline) clears nothing.
  server.online = false;
  await send(db, server, { gender: 'female' });
  await wrapper(db, server)({ data: { gender: 'male' } });
  assert.deepEqual(owed(db), { gender: 'female' }, 'a write the server did not accept supersedes nothing');
  // A newer edit kept while the write is out survives its acceptance (only a key still holding the value
  // snapshotted before sending leaves).
  server.online = true;
  let release;
  const gate = new Promise((r) => { release = r; });
  const out = wrapper(db, server, { gate })({ data: { gender: 'male' } });
  await new Promise((r) => setImmediate(r));
  await PS.sendProfileEdits(db, U, { gender: 'other' }, { updateUser: async () => ({ error: OFFLINE }), meta: server.meta, now: now(), canKeep: () => true });
  release();
  assert.equal((await out).error, null);
  assert.deepEqual(owed(db), { gender: 'other' }, 'the edit saved meanwhile is newer and still waits');
  assert.equal(shown(db, server.meta).gender, 'other');
  // Another session's answer (after the intended sign-out) never touches the row.
  const db2 = H.makeDb();
  const s2 = makeServer(H.makeCloud());
  s2.online = false;
  await send(db2, s2, { gender: 'female' });
  s2.online = true;
  let who = U;
  const late = wrapper(db2, s2, { session: () => who });
  const p = late({ data: { gender: 'male' } });
  who = null;
  await p;
  assert.deepEqual(owed(db2), { gender: 'female' }, 'no session → nothing changed on the phone (Gate B F2)');
});

test('PS-24 (wiring): the clear on accept lives in the one updateUser wrapper (every writer); the sign-in name fill reads the profile view, so a kept name is never replaced by the Apple / Google name', () => {
  const sb = read('lib/supabase.js');
  assert.match(sb, /supabase\.auth\.updateUser = \(attributes, options\) => metadataWrite\(attributes, options, \{\n\s+guard: metadataGuard,[\s\S]*?raw: rawUpdateUser,[\s\S]*?note: noteProfileWriteLazy,[\s\S]*?keptBefore: \(keys\) => require\('\.\/profile'\)\.keptEditsBefore\(keys\),[\s\S]*?clearAccepted: \(user, keys, before\) => require\('\.\/profile'\)\.clearAcceptedEdits\(user, keys, before\),/);
  // Both sign-in name fills (Google, Apple) decide "is the name empty?" on the view (kept edit included).
  assert.equal((sb.match(/signInName\(\{ meta: profileMetaOf\(data && data\.user\)/g) || []).length, 2);
  assert.match(sb, /function profileMetaOf\(user\) \{[\s\S]*?withProfileView\(user\)[\s\S]*?\}/);
  const prof = read('lib/profile.js');
  assert.match(prof, /export function keptEditsBefore\(keys\) \{[\s\S]*?keptEditsBefore\(openDb\(\), sessionUserId\(\), keys\)/);
  assert.match(prof, /export function clearAcceptedEdits\(user, keys, before\) \{[\s\S]*?clearAcceptedEdits\(openDb\(\), user, keys, before, \{ sessionUserId: sessionUserId\(\) \}\)/);
  // The writers the review named all go through supabase.auth.updateUser (the wrapper), never around it.
  for (const f of ['screens/components/CalculatorSection.js', 'screens/AgeConfirmScreen.js', 'screens/OnboardingFlowScreen.js', 'screens/SettingsScreen.js', 'lib/pendingGateStore.js']) {
    assert.match(read(f), /supabase\.auth\.updateUser\(/, f);
    assert.doesNotMatch(read(f), /rawUpdateUser|auth\.admin\.updateUserById/, f);
  }
});

// ── 2 ───────────────────────────────────────────────────────────────────────────────────────────
test('PS-25: the A-119 "Use here" sequence — while the takeover is not settled the kept edit is never sent; the rebuild discards (and counts) only what was edited before the claim point, per key; then only the newer input is sent', async () => {
  const cloud = H.makeDeviceCloud();
  cloud.addUser(U);
  const A = phone(cloud, 'dev-A', U);
  await A.signIn();
  const B = phone(cloud, 'dev-B', U, { session: '2026-10-16T09:00:00.000Z' });
  const writes = [];
  const accept = async (data) => { writes.push(data); return { data: { user: { id: U, user_metadata: { ...META, ...data } } }, error: null }; };
  const held = () => B.flow.editsHeld(U);
  // B kept an edit offline before anything else happened (the old copy).
  assert.equal((await PS.sendProfileEdits(B.db, U, { display_name: 'Old B', birth_year: 1970 }, { updateUser: async () => ({ error: OFFLINE }), meta: META, now: now(), canKeep: () => true })).status, 'kept');
  // Screen 4: the account is in use on A. The flush (reconnect, sync pass, app active) does not send.
  assert.equal((await B.flow.gate(U, 'sync')).reason, 'ask');
  assert.equal(await held(), true, 'screen 4 holds it');
  assert.equal((await PS.sendProfileEdits(B.db, U, null, { updateUser: accept, held, now: now() })).status, 'held');
  assert.equal(writes.length, 0);
  assert.equal((await B.state()).ask.summary.byKind.profile, 1, 'screen 4 counts the kept edit "Use here" would discard');
  // "Use here": the claim is made, the rebuild is queued for the next pass.
  assert.equal((await B.flow.useHere(U)).reason, 'rebuild_queued');
  const point = JSON.parse(await B.kv.getItem('dosetrace_device_takeover')).seq;
  assert.ok(point >= rowOf(B.db).dt_seq, 'the kept edit is from before the claim point');
  assert.equal(await held(), true, 'the takeover is not settled');
  assert.equal((await PS.sendProfileEdits(B.db, U, null, { updateUser: accept, held, now: now() })).status, 'held', 'the old copy never overwrites A\'s newer data');
  assert.equal(writes.length, 0);
  // An Edit profile save online in that window sends only what was typed now, never the older kept keys.
  assert.equal((await PS.sendProfileEdits(B.db, U, { gender: 'female' }, { updateUser: accept, held, meta: META, now: now(), canKeep: () => true })).status, 'saved');
  assert.deepEqual(writes, [{ gender: 'female' }]);
  // The person keeps typing offline after the claim point: the same row, a newer key.
  assert.equal((await PS.sendProfileEdits(B.db, U, { country: 'PT' }, { updateUser: async () => ({ error: OFFLINE }), held, meta: META, now: now(), canKeep: () => true })).status, 'kept');
  assert.ok(rowOf(B.db).dt_seq > point, 'the row as a whole is newer than the point');
  assert.equal(summarizeUnsent(B.db, [U], { keep: { seq: point } }).byKind.profile, 1, 'still counted: part of it is the old copy');
  // The next pass rebuilds: per key, the edit from before the point goes (counted), the newer one stays.
  const pass = await B.sync();
  assert.equal(pass.ran, true);
  assert.deepEqual(owed(B.db), { country: 'PT' }, 'only what was typed after the claim point');
  assert.equal((await B.state()).notice.own.byKind.profile, 1, 'what was discarded is counted');
  assert.equal(await held(), false, 'settled');
  writes.length = 0;
  assert.equal((await PS.sendProfileEdits(B.db, U, null, { updateUser: accept, held, now: now() })).status, 'saved');
  assert.deepEqual(writes, [{ country: 'PT' }], 'the flush sends only the newer input');
  // A takeover with no point keeps nothing: every kept key is discarded and counted; keep all keeps all.
  const db = H.makeDb();
  await PS.sendProfileEdits(db, U, { display_name: 'X' }, { updateUser: async () => ({ error: OFFLINE }), meta: META, now: now(), canKeep: () => true });
  assert.deepEqual(PS.editsKeptByRebuild(rowOf(db), { all: true }), true);
  assert.deepEqual(PS.editsKeptByRebuild(rowOf(db), { seq: null }), false);
  const rb = await core.rebuildFromCloud(db, H.makeCloud(), U, { keep: { seq: readChangeSeq(db) } });
  assert.equal(rb.discarded.byKind.profile, 1);
  assert.equal(owed(db), null);
});

test('PS-25 (wiring): the flush and Edit profile\'s save ask the device state (deviceRuntime profileEditsHeld: screen 2 / 4 or a takeover not settled) on every trigger; the rebuild strips the kept keys from before the point even when the cloud table is not there yet', () => {
  const prof = read('lib/profile.js');
  assert.match(prof, /const editsHeld = \(uid\) => \{ try \{ return require\('\.\/deviceRuntime'\)\.profileEditsHeld\(uid\); \} catch \{ return Promise\.resolve\(true\); \} \};/);
  assert.match(prof, /export function flushProfileEdits\(\) \{[\s\S]*?held: \(\) => editsHeld\(uid\),[\s\S]*?\n\}/);
  assert.match(prof, /export function saveProfileEdit\([\s\S]*?held: \(\) => editsHeld\(user\.id\),[\s\S]*?\n\}/);
  assert.match(read('lib/deviceRuntime.js'), /export function profileEditsHeld\(userId\) \{ return deviceFlow\(\)\.editsHeld\(userId\); \}/);
  const flow = read('lib/deviceFlow.js');
  assert.match(flow, /async editsHeld\(userId\) \{[\s\S]*?KEYS\.verdict[\s\S]*?KEYS\.ask[\s\S]*?openTakeoverSeq\(userId\)[\s\S]*?\}/);
  const sc = read('lib/syncCore.js');
  assert.match(sc, /PS\.dropEditsBefore\(db, userId, keep\);/);
});

// ── 3 ───────────────────────────────────────────────────────────────────────────────────────────
test('PS-26: a permanent refusal (not DT001, not "try later") on the flush clears the kept keys, stops blocking the cloud row and keeps what was typed for a one-time notice; DT001 and a session problem keep it; the attempt cap is a backstop; a refused save never stays stuck', async () => {
  const { db, cloud, server } = await setup();
  server.online = false;
  await send(db, server, { display_name: 'Bad', country: 'PT' });
  server.online = true;
  // DT001 (A-119 owns it) and a session problem (401) keep it, tried again.
  server.refuse = DT001;
  assert.equal((await send(db, server, null)).status, 'refused');
  server.refuse = { status: 401, message: 'JWT expired' };
  assert.equal((await send(db, server, null)).status, 'refused');
  assert.deepEqual(owed(db), { display_name: 'Bad', country: 'PT' });
  // A permanent refusal (422): cleared, the typed values kept for the notice.
  server.refuse = { status: 422, message: 'invalid metadata' };
  const r = await send(db, server, null);
  assert.equal(r.status, 'dropped');
  assert.deepEqual(r.values, { display_name: 'Bad', country: 'PT' });
  assert.equal(owed(db), null, 'no longer waiting');
  assert.deepEqual(PS.droppedEditOf(rowOf(db)), { display_name: 'Bad', country: 'PT' }, 'durable until the notice is seen');
  assert.equal(summarizeUnsent(db, [U]).count, 0, 'not counted as unsent forever');
  assert.equal(shown(db, server.meta).display_name, 'Sam', 'the account\'s value is shown again');
  server.refuse = null;
  await core.pushPending(db, cloud, U);
  assert.equal(rowOf(db).sync_status, 'synced', 'the cloud row is no longer held (\'wait\')');
  server.writes.length = 0;
  assert.equal((await send(db, server, null)).status, 'none', 'never retried');
  assert.equal(server.writes.length, 0);
  PS.forgetDroppedEdit(db, U);
  assert.equal(PS.droppedEditOf(rowOf(db)), null, 'one time');

  // The attempt cap: the server answers "busy" again and again → after MAX_SEND_TRIES it is treated as a
  // refusal (notice with the values). Never on the phone being offline.
  server.online = false;
  await send(db, server, { birth_year: 1999 });
  for (let i = 0; i < PS.MAX_SEND_TRIES + 5; i++) assert.equal((await send(db, server, null)).status, 'offline');
  assert.deepEqual(owed(db), { birth_year: 1999 }, 'offline never counts');
  server.online = true;
  server.refuse = { status: 503, message: 'Service Unavailable' };
  for (let i = 0; i < PS.MAX_SEND_TRIES - 1; i++) assert.equal((await send(db, server, null)).status, 'offline');
  assert.deepEqual(owed(db), { birth_year: 1999 });
  const capped = await send(db, server, null);
  assert.equal(capped.status, 'dropped');
  assert.deepEqual(capped.values, { birth_year: 1999 });
  assert.equal(PS.MAX_SEND_TRIES, 20);
  // A new edit starts its own count.
  PS.forgetDroppedEdit(db, U);
  server.online = false;
  await send(db, server, { birth_year: 2000 });
  server.online = true;
  assert.equal((await send(db, server, null)).status, 'offline');
  assert.deepEqual(owed(db), { birth_year: 2000 });

  // A save refused for good keeps Edit profile open (its form already shows the kept values) and the
  // older kept keys no longer ride along on every later save.
  server.refuse = { status: 400, message: 'bad request' };
  const s = await send(db, server, { display_name: 'Typed' });
  assert.equal(s.status, 'failed');
  assert.equal(owed(db), null, 'nothing stuck');
  assert.equal(PS.droppedEditOf(rowOf(db)), null, 'no notice: Edit profile is open with the values');
  server.refuse = null;
  server.writes.length = 0;
  assert.equal((await send(db, server, { display_name: 'Typed' })).status, 'saved');
  assert.deepEqual(server.writes, [{ display_name: 'Typed' }]);
});

test('PS-26 (notice): the line in 6 languages (pt formal, the founder\'s words), the app\'s error sheet with "Edit profile", which reopens Edit profile with the typed values; shown once', () => {
  const want = {
    en: ["Couldn't save your profile change", 'What you typed is still filled in under Edit profile. Check it and save again.'],
    pt: ['Não foi possível salvar a alteração do seu perfil', 'O que foi digitado continua preenchido em Editar perfil. Confira e salve novamente.'],
    es: ['No se pudo guardar el cambio de tu perfil', 'Lo que escribiste sigue en Editar perfil. Revísalo y vuelve a guardarlo.'],
    fr: ['Impossible d’enregistrer la modification de votre profil', 'Ce que vous avez saisi est toujours rempli dans Modifier le profil. Vérifiez-le et enregistrez à nouveau.'],
    de: ['Die Änderung an deinem Profil konnte nicht gespeichert werden', 'Deine Eingaben stehen noch in „Profil bearbeiten“. Prüfe sie und speichere erneut.'],
    it: ['Impossibile salvare la modifica del tuo profilo', 'Quello che hai inserito è ancora in Modifica profilo. Controllalo e salva di nuovo.'],
  };
  for (const [l, [title, body]] of Object.entries(want)) {
    assert.equal(translations[l].err_title_profile_edit, title, l);
    assert.equal(translations[l].profile_edit_refused_body, body, l);
    assert.ok(translations[l].profile_edit_title, l);
    assert.ok(translations[l].profile_edit_refused_later, l);
    for (const s of [title, body, translations[l].profile_edit_refused_later]) assert.doesNotMatch(s, /\p{Extended_Pictographic}/u, `${l}: no emoji`);
  }
  assert.doesNotMatch(want.pt.join(' '), /\b(dá para|a gente|tá|deu)\b/, 'formal pt');
  assert.equal(ERROR_TITLE_KEYS.profileEdit, 'err_title_profile_edit');
  const t = (k) => translations.pt[k];
  const cfg = errorSheet(t, 'profileEdit', t('profile_edit_refused_body'));
  assert.equal(cfg.icon, 'warning');
  assert.equal(cfg.title, 'Não foi possível salvar a alteração do seu perfil');
  const app = read('App.js');
  assert.match(app, /const droppedEdit = useDroppedProfileEdit\(session && session\.user \? session\.user\.id : null\);/);
  assert.match(app, /const droppedSheet = droppedEdit\.values && onMain && !deviceSheet && !linkSheet && !accountSheet && !upd\.invite\s*\n?\s*\? errorSheet\(t, 'profileEdit', t\('profile_edit_refused_body'\), \{[\s\S]*?label: t\('profile_edit_refused_later'\), kind: 'secondary'[\s\S]*?label: t\('profile_edit_title'\), kind: 'primary', onPress: \(\) => openEditProfileWith\(droppedEdit\.values\)/);
  assert.match(app, /<DTSheet config=\{droppedSheet\} onClose=\{droppedEdit\.forget\} \/>/);
  assert.match(app, /nav\.navigate\('Main', \{ screen: 'MainTabs', params: \{ screen: 'Settings', params: \{ search: \{ target: 'profile', values, n: Date\.now\(\) \} \} \} \}\)/);
  const prof = read('lib/profile.js');
  assert.match(prof, /export function useDroppedProfileEdit\(userId\) \{/);
  assert.match(prof, /if \(r && r\.status === 'dropped'\) emitDropped\(\);/);
  const st = read('screens/SettingsScreen.js');
  assert.match(st, /case 'profile': openEditProfileWith\(sp\.values \|\| null\); break;/);
});

test('PS-26 (screen): Edit profile reopened from the notice is filled with the typed values, not the account\'s', async () => {
  const set = {};
  const setter = (k) => (v) => { set[k] = v; };
  const env = {
    setDisplayName: setter('name'), setGender: setter('gender'), setBirthMonth: setter('month'), setBirthYear: setter('year'),
    setBirthYearText: setter('yearText'), setCountry: setter('country'), setPrimaryGoals: setter('goals'), setTrackingTypes: setter('tracking'),
    setActivityLevel: setter('activity'), setHasProvider: setter('provider'), birthMonthIndex, normalizeActivityLevel,
  };
  const fill = loadFn('screens/SettingsScreen.js', 'function fillProfileForm(', 'fillProfileForm', env);
  fill({ display_name: 'Typed', birth_month: 4, birth_year: 1990, country: 'PT', primary_goal: 'fat_loss,energy', tracking_types: ['peptides'], activity_level: 'very_high', has_provider: 'no', gender: 'female' });
  assert.deepEqual(set, { name: 'Typed', gender: 'female', month: 3, year: 1990, yearText: '1990', country: 'PT', goals: ['fat_loss', 'energy'], tracking: ['peptides'], activity: 'very_high', provider: 'no' });
  // Only the keys it holds: the rest stays what Settings read.
  for (const k of Object.keys(set)) delete set[k];
  fill({ country: 'ES' });
  assert.deepEqual(set, { country: 'ES' });
  const opened = [];
  const openWith = loadFn('screens/SettingsScreen.js', 'function openEditProfileWith(', 'openEditProfileWith', {
    whenAllSettled: async () => {}, profileLoaded: { p: Promise.resolve() }, fillProfileForm: (v) => opened.push(['fill', v]), setEditProfileOpen: (v) => opened.push(['open', v]),
  });
  await openWith({ country: 'ES' });
  assert.deepEqual(opened, [['fill', { country: 'ES' }], ['open', true]], 'filled before it opens (the read never lands over it)');
});

// ── 4 ───────────────────────────────────────────────────────────────────────────────────────────
test('PS-27: a hanging updateUser ends after 15 s as "try later" (the edit is kept), so Save and the sign-out send-first step never wait forever; the queue goes on', async () => {
  const { db, server } = await setup();
  server.hang = true;
  const r = await send(db, server, { display_name: 'Slow' }, { timeoutMs: 20 });
  assert.equal(r.status, 'kept', 'Edit profile closes with the "saved on this phone" line');
  assert.equal(r.error.name, 'TimeoutError');
  assert.deepEqual(owed(db), { display_name: 'Slow' });
  assert.equal((await send(db, server, null, { timeoutMs: 20 })).status, 'offline', 'the flush: kept, tried later');
  assert.deepEqual(owed(db), { display_name: 'Slow' });
  assert.equal(PS.SEND_TIMEOUT_MS, 15000);
  // A late answer that lands after the timeout still clears through the wrapper (the edit was accepted).
  server.hang = false;
  assert.equal((await send(db, server, null)).status, 'saved');
  assert.equal(owed(db), null);
  // lib/authFetch puts its own timeout only on the token refresh POST (refreshFetch), never on PUT /auth/v1/user.
  const af = read('lib/authFetch.js');
  assert.equal((af.match(/await fetchWithTimeout\(/g) || []).length, 1, 'one timed request');
  assert.match(af, /if \(isRefreshUrl\(u\) && methodOf\(input, init\) === 'POST'\) return refreshFetch\(input, init\);/, 'and it is the refresh');
});

test('PS-24..PS-27: the old harness wrapper (afterMetadataWrite alone) is what the real wrapper still does first', async () => {
  // The table step (PS-6) is unchanged: only an accepted write reaches the table, before the clear.
  const seen = [];
  const res = await metadataWrite({ data: { country: 'PT' } }, undefined, {
    guard: async () => true,
    raw: async () => ({ data: { user: { id: U } }, error: null }),
    note: () => seen.push('note'),
    keptBefore: () => { seen.push('snapshot'); return { userId: U, snapshot: { country: 'BR' } }; },
    clearAccepted: () => seen.push('clear'),
  });
  assert.equal(res.error, null);
  assert.deepEqual(seen, ['snapshot', 'note', 'clear']);
  // The guard refuses → DT001, nothing sent, nothing cleared.
  seen.length = 0;
  const refused = await metadataWrite({ data: { country: 'PT' } }, undefined, { guard: async () => false, raw: async () => { seen.push('raw'); }, note: () => seen.push('note'), keptBefore: () => seen.push('snapshot'), clearAccepted: () => seen.push('clear') });
  assert.equal(refused.error.code, 'DT001');
  assert.deepEqual(seen, []);
  // A password change (no data) is never touched.
  const pw = await metadataWrite({ password: 'x' }, undefined, { guard: async () => false, raw: async () => ({ data: { user: { id: U } }, error: null }), note: () => seen.push('note'), keptBefore: () => seen.push('snapshot'), clearAccepted: () => seen.push('clear') });
  assert.equal(pw.error, null);
  assert.deepEqual(seen, []);
  assert.equal(typeof afterMetadataWrite, 'function');
});
