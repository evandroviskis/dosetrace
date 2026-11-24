'use strict';
// Profile synced (founder 2026-11-24 13:13 EST: "pode corrigir... faça o desenho... os testes próprios...
// vamos fazer tudo junto"; spec docs/specs/profile-synced.md PS-1..PS-14; picture
// docs/design/perfil-sincronizado.html). The whole profile (name, birth year and month, sex at birth,
// country, goals, what she uses, activity, provider, onboarding answers, the reminder and privacy
// choices, the new report_name...) lived ONLY in Supabase Auth user_metadata — no history, no
// tombstones, overwrite-prone. It moves to the synced table account_profile (one row per account,
// one JSON payload merged per key, like calc_inputs DV-010), with user_metadata kept as a mirror
// while 1.3.0 / 1.3.1 are in the stores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const H = require('./helpers/syncHarness');
const core = require('../lib/syncCore');
const PS = require('../lib/profileStore');
const { afterMetadataWrite } = require('../lib/profileWrite');
const PN = require('../lib/profileName');
const { CLOUD_FIELDS, toCloudPayload } = require('../lib/syncMappers');
const { summarizeUnsent } = require('../lib/unsentSummary');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const U = 'user-1';
const T = 'account_profile';
const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.account_profile' in the schema cache" };

// A full 1.3.1 account as it is in user_metadata today: profile, answers, choices, provider claims,
// mirrors of other synced tables and migration markers.
const META = {
  display_name: 'Sam', birth_year: 1985, birth_month: 7, gender: 'female', country: 'BR',
  primary_goal: 'fat_loss,sleep', tracking_types: ['peptides', 'supplements'], has_provider: 'yes',
  activity_level: 'moderate', activity_scale: 5, activity_set_at: '2026-10-01T10:00:00.000Z',
  onboarded_at: '2026-09-20T10:00:00.000Z', consent_accepted: true, consent_date: '2026-09-20T10:00:00.000Z',
  adult_confirmed_at: '2026-10-03T10:00:00.000Z', food_meals: { plan: 'three' }, dose_reminders: true,
  food_reminders: false, silent_mode: false, analytics_opt_in: false, version_news: true, language: 'pt',
  some_future_key: 'kept',
  // provider identity claims (Google / Apple) — theirs, never the profile
  full_name: 'Samantha Carter', name: 'Samantha Carter', avatar_url: 'https://x', email: 's@x', email_verified: true, sub: 'g-1', iss: 'https://accounts.google.com', provider_id: 'g-1',
  // other synced tables' mirrors and markers
  calc_inputs: { heightCm: 170 }, calc_reality_open: null, favorite_markers: ['Ferritin'], report_tags: {},
  rc_store_migrated: true, lab_prefs_migrated: true, calc_history_migrated_v55: true,
};
const PROFILE_OF_META = Object.fromEntries(Object.entries(META).filter(([k]) => ![
  'full_name', 'name', 'avatar_url', 'email', 'email_verified', 'sub', 'iss', 'provider_id',
  'calc_inputs', 'calc_reality_open', 'favorite_markers', 'report_tags', 'rc_store_migrated', 'lab_prefs_migrated', 'calc_history_migrated_v55',
].includes(k)));

let clock = 0;
const now = () => new Date(Date.parse('2026-11-24T12:00:00Z') + (++clock) * 1000).toISOString();
const rows = (db) => db.getAllSync(`SELECT * FROM ${T} WHERE user_id = ? ORDER BY id`, [U]);
const payloadOf = (r) => JSON.parse(r.payload);
const ready = (db) => core.cloudTableReady(db, T, U);
const view = (db, meta) => PS.profileView({ row: PS.readProfileRow(db, U), meta, ready: ready(db) });

// The cloud before the migration: account_profile answers "table not found" to every call.
function withoutTable(cloud) {
  const v = Object.create(cloud);
  for (const m of ['insert', 'update', 'delete', 'fetchSince', 'fetchAll', 'fetchIn']) {
    v[m] = async (table, ...rest) => (table === T ? { data: null, error: MISSING } : cloud[m](table, ...rest));
  }
  return v;
}
// The migration's backfill: every account's user_metadata (profile keys) into the table; a key the
// table already has is never overwritten.
function backfill(cloud, meta, userId = U) {
  const store = cloud._store[T];
  const existing = [...store.values()].find((r) => r.user_id === userId);
  const fromMeta = PS.pickProfile(meta);
  if (existing) { existing.payload = { ...fromMeta, ...existing.payload }; existing.updated_at = cloud._stamp(); return existing.id; }
  const id = `cloud-profile-${userId}`;
  const st = cloud._stamp();
  store.set(id, { id, user_id: userId, payload: fromMeta, created_at: st, updated_at: st });
  return id;
}
// The migration's trigger: a metadata write (an old version, or this app's mirror) merges the
// changed profile keys into the table row.
function triggerCopy(cloud, changes, userId = U) {
  const store = cloud._store[T];
  const row = [...store.values()].find((r) => r.user_id === userId);
  if (!row) return backfill(cloud, changes, userId);
  row.payload = { ...row.payload, ...PS.pickProfile(changes) };
  row.updated_at = cloud._stamp();
  return row.id;
}
const cloudPayload = (cloud) => ([...cloud._store[T].values()].find((r) => r.user_id === U) || {}).payload;

test('PS-1: account_profile is a synced table like the others (local table, engine lists, change numbering, mapper, wipe, owner, deletion, export, unsent count)', () => {
  const db = H.makeDb();
  assert.ok(core.TABLES.includes(T), 'syncCore TABLES');
  assert.ok(core.LATE_TABLES.has(T), 'a late table: the cloud may not have it yet (migration not applied)');
  assert.ok(require('../lib/changeSeq').TABLES.includes(T), 'local change numbering (A-119 rebuild keep rule)');
  const cols = db.getAllSync(`PRAGMA table_info(${T})`).map((c) => c.name);
  for (const c of ['id', 'remote_id', 'user_id', 'payload', 'pending_patch', 'pending_fill', 'created_at', 'updated_at', 'sync_status', 'dt_seq']) assert.ok(cols.includes(c), `${T}.${c}`);
  assert.deepEqual(CLOUD_FIELDS[T], ['payload']);
  assert.deepEqual(toCloudPayload(T, { payload: '{"display_name":"Sam"}' }), { payload: { display_name: 'Sam' } });
  const dbSrc = read('lib/database.js');
  assert.match(dbSrc, /export function clearLocalDatabase\(\) \{[\s\S]*?DELETE FROM account_profile;[\s\S]*?\n\}/, 'the intended sign-out wipe clears it');
  assert.match(dbSrc, /export function getLocalDataUserId\(\) \{[\s\S]*?'lab_prefs', 'account_profile'\]/, 'the local owner check sees it (cross-account guard)');
  assert.match(read('supabase/functions/delete-user/index.ts'), /'lab_prefs',\n\s+'account_profile',/, 'account deletion names it');
  assert.ok(require('../lib/exportTables').exportTableNames(core.TABLES).includes(T), 'Export my data covers it');
  assert.match(read('lib/sync.js'), /if \(table === 'calc_inputs' \|\| table === 'account_profile'\) \{\n\s+return await supabase\.from\(table\)\.upsert\(payload, \{ onConflict: 'user_id', ignoreDuplicates: true \}\)/, 'one row per account: a racing first insert never replaces the row');
});

test('PS-1b (Gate B F1): while user_metadata is the mirror, a profile row waiting to go up is never "unsent / at risk" — not in the sign-out count, the DV-242 cross-account count, the A-119 takeover summary; no sheet, a silent discard', async () => {
  const db = H.makeDb();
  PS.recordProfileWrite(db, U, { display_name: 'Sam' }, { ready: true, meta: {}, now: now() });
  assert.equal(rows(db)[0].sync_status, 'pending', 'the row does wait to be sent');
  assert.ok(!core.UNSENT_TABLES.includes(T), 'not an at-risk table while the mirror exists');
  assert.deepEqual(core.UNSENT_TABLES, core.TABLES.filter((t) => t !== T));
  const s = summarizeUnsent(db, [U]);
  assert.equal(s.count, 0);
  assert.equal(s.byKind.profile, undefined, 'no double count with the kept 18+ / profile answer (lib/pendingGate keptGateCount)');
  const { pendingForSignOut, unsyncedCount } = require('../lib/recoveryFlow');
  assert.equal(pendingForSignOut({ db, localOwnerId: U, sessionUserId: U, tables: core.UNSENT_TABLES, getPending: core.getPendingChanges }), 0, 'the deliberate sign-out is not blocked');
  const { crossAccountDecision } = require('../lib/accountGuard');
  assert.deepEqual(crossAccountDecision({ localOwnerId: U, sessionUserId: 'user-2', countPending: (id) => unsyncedCount(db, id, core.UNSENT_TABLES, core.getPendingChanges) }), { action: 'discard', pending: 0 }, 'another account signs in: silent discard, no sheet');
  const cloud = H.makeCloud();
  const rb = await core.rebuildFromCloud(db, cloud, U, { keep: { seq: null } });
  assert.equal(rb.ok, true);
  assert.equal(rb.discarded.count, 0, 'the takeover never announces a profile change as discarded');
  // The app's call sites use the same list.
  assert.match(read('App.js'), /countPending: \(id\) => unsyncedCount\(getDB\(\), id, UNSENT_TABLES, getPendingChanges\),/);
  assert.match(read('lib/accountActions.js'), /pendingForSignOut\(\{ db: getDB\(\), localOwnerId: getLocalDataUserId\(\), sessionUserId, tables: UNSENT_TABLES, getPending: getPendingChanges \}\)/);
  assert.match(read('screens/TodayScreen.js'), /unsyncedCount\(getDB\(\), getLocalDataUserId\(\), UNSENT_TABLES, getPendingChanges\)/);
});

test('PS-2: the Supabase migration FILE (NOT applied): table, own-row RLS, updated_at, A-119 guard, backfill that never overwrites the table, trigger from auth.users that never breaks a sign-in', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const file = fs.readdirSync(dir).find((f) => /_account_profile\.sql$/.test(f));
  assert.ok(file, 'a migration file *_account_profile.sql');
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.match(sql, /create table if not exists public\.account_profile \(\n\s+id uuid primary key default gen_random_uuid\(\),\n\s+user_id uuid not null unique references auth\.users\(id\) on delete cascade,\n\s+payload jsonb not null default '\{\}'::jsonb,/);
  assert.match(sql, /alter table public\.account_profile enable row level security;/);
  for (const op of ['select', 'insert', 'update']) assert.match(sql, new RegExp(`create policy "account_profile ${op} own" on public\\.account_profile for ${op}`));
  assert.match(sql, /for select using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /for update using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(sql, /create policy "account_profile delete own"/, 'the app never deletes the row (account deletion: service role + cascade)');
  assert.match(sql, /create trigger account_profile_set_updated_at before update on public\.account_profile\n\s+for each row execute function public\.set_updated_at\(\);/);
  assert.match(sql, /drop trigger if exists dt_device_guard on public\.account_profile/);
  assert.match(sql, /'calc_inputs', 'lab_prefs', 'account_profile'\]\) then\n\s+perform public\.dt_require_active_device/, 'the pre-request guard covers the table');
  // Backfill: every account, the table's own keys win (re-runnable, never overwrites a newer table value).
  assert.match(sql, /insert into public\.account_profile \(user_id, payload\)\nselect u\.id, public\.dt_profile_keys\(u\.raw_user_meta_data\)\nfrom auth\.users u\non conflict \(user_id\) do update\n\s+set payload = excluded\.payload \|\| public\.account_profile\.payload/);
  // Trigger: only the keys that changed, merged over the row; an error never fails the auth write.
  assert.match(sql, /create trigger dt_profile_from_auth\n\s+after insert or update of raw_user_meta_data on auth\.users\n\s+for each row execute function public\.dt_profile_from_auth\(\);/);
  assert.match(sql, /is distinct from/);
  assert.match(sql, /set payload = public\.account_profile\.payload \|\| excluded\.payload/);
  assert.match(sql, /exception when others then\n\s+raise warning/);
  assert.match(sql, /notify pgrst, 'reload schema';/);
  // Gate B F3: (a) the trigger exists BEFORE the backfill reads auth.users (its lock holds every metadata
  // write until the commit, so none can fall between the backfill's read and the trigger).
  assert.ok(sql.indexOf('create trigger dt_profile_from_auth') < sql.indexOf('insert into public.account_profile (user_id, payload)\nselect'), 'trigger first, then backfill');
  // (b) nothing that can fail runs in DECLARE (outside the exception block).
  const fn = sql.slice(sql.indexOf('create or replace function public.dt_profile_from_auth()'), sql.indexOf('revoke all on function public.dt_profile_from_auth()'));
  const decl = fn.slice(fn.indexOf('declare'), fn.indexOf('\nbegin'));
  assert.doesNotMatch(decl, /:=/, 'no computed default in DECLARE');
  assert.match(fn, /\nbegin\n\s+v_new := public\.dt_profile_keys\(new\.raw_user_meta_data\);/);
  // (c) drift is observable: a failed copy leaves a row (best effort, never failing the auth write).
  assert.match(sql, /create table if not exists public\.account_profile_copy_errors \(/);
  assert.match(sql, /alter table public\.account_profile_copy_errors enable row level security;/);
  assert.match(fn, /insert into public\.account_profile_copy_errors \(user_id, sqlstate, message\)/);
  // (d) the header says to diff the live dt_pre_request before applying.
  assert.match(sql, /pg_get_functiondef\('public\.dt_pre_request'::regproc\)/);
  // NIT: the unique user_id is the only index needed (one row per account).
  assert.doesNotMatch(sql, /account_profile_user_updated_idx/);
});

test('PS-3: every key moves except the provider claims, the mirrors of other synced tables and the migration markers — the same list in the app and in the SQL', () => {
  assert.deepEqual(PS.pickProfile(META), PROFILE_OF_META);
  assert.equal(PS.isProfileKey('report_name'), true);
  assert.equal(PS.isProfileKey('some_future_key'), true, 'a key added later moves without a new migration');
  for (const k of ['full_name', 'avatar_url', 'calc_inputs', 'favorite_markers', 'lab_prefs_migrated']) assert.equal(PS.isProfileKey(k), false, k);
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const sql = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /_account_profile\.sql$/.test(f))), 'utf8');
  const arr = (sql.match(/not \(e\.key = any \(array\[([\s\S]*?)\]\)\)/) || [])[1];
  assert.ok(arr, 'the SQL key filter');
  const sqlKeys = arr.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual(sqlKeys.slice().sort(), PS.EXCLUDED_KEYS.slice().sort());
  assert.match(sql, /and e\.key !~ 'migrated'/);
});

test('PS-4: reads — during the mirror period (user_metadata written first, 1.3.0 / 1.3.1 in the stores) user_metadata wins, the table only fills keys it lacks; at the cutover the table wins once read here (founder B1, 2026-11-24)', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  backfill(cloud, { ...META, display_name: 'Old in the table', report_name: 'Only in the table' });
  const meta = { ...META, display_name: 'New in user_metadata' };
  assert.equal(PS.MIRROR_PERIOD, true, 'the mirror period is on (flip at the cutover, with the mirror removal)');
  assert.equal(view(db, meta).display_name, 'New in user_metadata', 'no row: user_metadata');
  await core.pullChanges(db, cloud, U);
  assert.equal(ready(db), true);
  const v = view(db, meta);
  assert.equal(v.display_name, 'New in user_metadata', 'mirror period: user_metadata wins even after the table was read');
  assert.equal(v.report_name, 'Only in the table', 'a key user_metadata lacks comes from the table');
  const user = PS.withProfileMeta({ id: U, user_metadata: { ...meta, only_in_meta: 1, calc_inputs: { a: 1 } } }, { row: PS.readProfileRow(db, U), ready: true });
  assert.equal(user.user_metadata.display_name, 'New in user_metadata');
  assert.equal(user.user_metadata.only_in_meta, 1, 'a key the table lacks still shows');
  assert.deepEqual(user.user_metadata.calc_inputs, { a: 1 }, 'non-profile keys untouched');
  // The flip, documented: after the cutover (mirror: false) the table wins once read in full here, and
  // before it is read, user_metadata still does.
  const row = PS.readProfileRow(db, U);
  assert.equal(PS.profileView({ row, meta, ready: true, mirror: false }).display_name, 'Old in the table', 'cutover: the table wins');
  assert.equal(PS.profileView({ row, meta, ready: false, mirror: false }).display_name, 'New in user_metadata', 'cutover, table not read yet: user_metadata');
  // Not ready (the cloud table missing): user_metadata wins over a local row, exactly today's values.
  const db2 = H.makeDb();
  PS.ensureProfileRow(db2, U, { display_name: 'old copy' }, { now: now() });
  assert.equal(PS.profileView({ row: PS.readProfileRow(db2, U), meta: { display_name: 'Sam' }, ready: false }).display_name, 'Sam');
  // The app's readers: getCachedUser, peekCachedUser, readStoredUser and the App gate all get this view.
  const sb = read('lib/supabase.js');
  assert.match(sb, /export function peekCachedUser\(\) \{ return withProfileView\(knownUser_\); \}/);
  assert.match(sb, /if \(storedSessionOnly\(\)\) return withProfileView\(await readStoredUser\(\)\);/);
  assert.match(sb, /return withProfileView\(session\?\.user \|\| null\);/);
  const app = read('App.js');
  assert.match(app, /const profiledUser = session \? withProfile\(session\.user\) : null;\n\s+const gateUser = session \? withPendingAnswer\(profiledUser, gateAnswer\.pending\) : null;/);
  assert.match(app, /!gateAnswer\.ready && gated\(profiledUser\)/);
});

test('PS-5: a missing row is never an empty profile — user_metadata is shown and the row is created from it, merge-only (a key the row has, a cleared value included, is never overwritten)', () => {
  const db = H.makeDb();
  assert.deepEqual(view(db, META), PROFILE_OF_META, 'no row: user_metadata, never empty');
  assert.equal(PS.ensureProfileRow(db, U, META, { now: now() }), 'created');
  const r = rows(db);
  assert.equal(r.length, 1);
  assert.deepEqual(payloadOf(r[0]), PROFILE_OF_META, 'every key copied');
  assert.equal(r[0].sync_status, 'synced', 'a copy of what the account already holds is not an unsent change');
  assert.deepEqual(JSON.parse(r[0].pending_fill).sort(), Object.keys(PROFILE_OF_META).sort(), 'copied keys fill the cloud only where it has none');
  // A cleared value (report_name null) and a newer table value are never overwritten by the copy.
  PS.recordProfileWrite(db, U, { report_name: null, display_name: 'Sam C.' }, { ready: false, meta: META, now: now() });
  assert.equal(PS.ensureProfileRow(db, U, { ...META, report_name: 'Samantha Carter', display_name: 'Sam' }, { now: now() }), 'kept');
  const p = payloadOf(rows(db)[0]);
  assert.equal(p.report_name, null);
  assert.equal(p.display_name, 'Sam C.');
  assert.equal(PS.ensureProfileRow(db, U, { ...META, new_key: 1 }, { now: now() }), 'filled', 'a key the row lacks is added');
  assert.equal(payloadOf(rows(db)[0]).new_key, 1);
  assert.equal(rows(db).length, 1, 'still one row');
  assert.equal(PS.ensureProfileRow(H.makeDb(), U, {}, { now: now() }), 'empty', 'nothing to copy: no row');
});

test('PS-6: every profile write goes to user_metadata (merge, only the keys sent) AND to the table; a refused or failed metadata write changes nothing in the table', () => {
  const seen = [];
  const note = (u, d) => seen.push([u.id, d]);
  afterMetadataWrite({ data: { user: { id: U, user_metadata: {} } }, error: null }, { display_name: 'Sam' }, note);
  assert.deepEqual(seen, [[U, { display_name: 'Sam' }]]);
  afterMetadataWrite({ data: { user: null }, error: { message: 'Network request failed' } }, { display_name: 'X' }, note);
  afterMetadataWrite({ data: { user: null }, error: { code: 'DT001', message: 'device_not_active', status: 409 } }, { display_name: 'X' }, note);
  afterMetadataWrite(null, { display_name: 'X' }, note);
  assert.equal(seen.length, 1, 'refused (offline, A-119 not the active phone) → nothing recorded; the screen says "not saved" as today');
  assert.doesNotThrow(() => afterMetadataWrite({ data: { user: { id: U } }, error: null }, { a: 1 }, () => { throw new Error('db closed'); }), 'a table failure never changes the write result');
  // The one wrapper: the A-119 guard first (unchanged), then the metadata write, then the table.
  const sb = read('lib/supabase.js');
  assert.match(sb, /supabase\.auth\.updateUser = async \(attributes, options\) => \{\n\s+if \(attributes && attributes\.data && metadataGuard\) \{[\s\S]*?if \(allowed === false\) return \{ data: \{ user: null \}, error: \{ code: 'DT001'[\s\S]*?\}\n\s+const res = await rawUpdateUser\(attributes, options\);\n[\s\S]*?if \(attributes && attributes\.data\) afterMetadataWrite\(res, attributes\.data, noteProfileWriteLazy\);\n\s+return res;\n\};/);
  // recordProfileWrite: after this phone read the cloud table → a per-key patch to send; before → the
  // local copy follows, nothing waits to be sent (user_metadata already has it; the backfill copies it).
  const db = H.makeDb();
  PS.recordProfileWrite(db, U, { display_name: 'Sam', full_name: 'Google Name' }, { ready: false, meta: META, now: now() });
  let r = rows(db)[0];
  assert.equal(r.sync_status, 'synced');
  assert.equal(r.pending_patch, null);
  assert.equal(payloadOf(r).display_name, 'Sam');
  assert.equal('full_name' in payloadOf(r), false, 'provider claims never enter the table');
  PS.recordProfileWrite(db, U, { country: 'PT' }, { ready: true, meta: META, now: now() });
  r = rows(db)[0];
  assert.equal(r.sync_status, 'pending');
  assert.deepEqual(JSON.parse(r.pending_patch), { country: 'PT' }, 'only the keys written here');
  PS.recordProfileWrite(db, U, { report_name: 'Samantha Carter' }, { ready: true, meta: META, now: now() });
  assert.deepEqual(JSON.parse(rows(db)[0].pending_patch), { country: 'PT', report_name: 'Samantha Carter' }, 'patches accumulate until sent');
});

test('PS-7: the push merges per key over the cloud row it read (an old version\'s newer key is kept), only while that row is unchanged; copied keys fill only what the cloud lacks; a missing cloud table waits and stops nothing else', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  backfill(cloud, META);
  await core.pullChanges(db, cloud, U);
  PS.recordProfileWrite(db, U, { country: 'PT' }, { ready: true, meta: META, now: now() });
  // Meanwhile 1.3.1 on the same account wrote another key (user_metadata → the trigger → the table).
  triggerCopy(cloud, { activity_level: 'very_active' });
  await core.pushPending(db, cloud, U);
  const cp = cloudPayload(cloud);
  assert.equal(cp.country, 'PT', 'the key changed here');
  assert.equal(cp.activity_level, 'very_active', 'the other writer\'s key survives (never an object computed from a stale read)');
  assert.equal(cp.display_name, 'Sam');
  assert.equal(rows(db)[0].sync_status, 'synced');
  assert.equal(rows(db)[0].pending_patch, null);
  // CAS: the cloud row changed between the push's read and its write → 0 rows → retried, then merged.
  PS.recordProfileWrite(db, U, { gender: 'male' }, { ready: true, meta: META, now: now() });
  const realUpdate = cloud.update.bind(cloud);
  let once = true;
  cloud.update = async (table, id, payload, opts) => {
    if (table === T && once) { once = false; triggerCopy(cloud, { has_provider: 'no' }); }
    return realUpdate(table, id, payload, opts);
  };
  await core.pushPending(db, cloud, U);
  assert.equal(rows(db)[0].sync_status, 'pending', 'refused by the updated_at check: kept, retried');
  await core.pushPending(db, cloud, U);
  assert.equal(cloudPayload(cloud).gender, 'male');
  assert.equal(cloudPayload(cloud).has_provider, 'no', 'the write that landed in between is kept');
  assert.equal(rows(db)[0].sync_status, 'synced');
  // Fill-only: copied keys never overwrite a cloud value.
  const db2 = H.makeDb();
  const cloud2 = H.makeCloud();
  PS.ensureProfileRow(db2, U, { ...META, display_name: 'stale' }, { now: now() });
  backfill(cloud2, { display_name: 'newer', country: 'BR' });
  await core.pullChanges(db2, cloud2, U);
  await core.pushPending(db2, cloud2, U);
  const cp2 = [...cloud2._store[T].values()][0].payload;
  assert.equal(cp2.display_name, 'newer', 'the cloud value stays');
  assert.equal(cp2.birth_year, 1985, 'a key the cloud lacked is filled from the copy');
  assert.equal(payloadOf(rows(db2)[0]).display_name, 'newer', 'the phone shows the cloud value');
  // Missing cloud table: rows wait (pending), every other table still syncs.
  const db3 = H.makeDb();
  const c3 = H.makeCloud();
  const off = withoutTable(c3);
  await core.pullChanges(db3, off, U);
  assert.equal(ready(db3), false);
  H.seedLocalProtocol(db3, U, { name: 'Tirzepatide' });
  PS.recordProfileWrite(db3, U, { country: 'PT' }, { ready: true, meta: META, now: now() }); // e.g. a phone that read the table before it disappeared
  await core.pushPending(db3, off, U);
  assert.equal(c3.rows('protocols', U).length, 1, 'protocols still pushed');
  assert.equal(rows(db3)[0].sync_status, 'pending', 'the profile row waits, never dropped');
  const rb = await core.rebuildFromCloud(db3, off, U, { keep: { all: true } });
  assert.equal(rb.ok, true, 'the A-119 rebuild is not failed by the missing table');
  assert.equal(rows(db3).length, 1, 'and keeps the local profile row');
});

test('PS-8: the pull — a change not sent yet survives, every other key takes the cloud; the local copy links to the cloud row (one row per account); an account with no cloud row gets its copy sent', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  PS.ensureProfileRow(db, U, META, { now: now() });
  backfill(cloud, { ...META, country: 'US' });
  await core.pullChanges(db, cloud, U);
  assert.equal(rows(db).length, 1, 'linked, never a second row');
  assert.ok(rows(db)[0].remote_id);
  assert.equal(payloadOf(rows(db)[0]).country, 'US');
  PS.recordProfileWrite(db, U, { country: 'PT' }, { ready: true, meta: META, now: now() });
  triggerCopy(cloud, { display_name: 'Sam (1.3.1)' });
  await core.pullChanges(db, cloud, U);
  const p = payloadOf(rows(db)[0]);
  assert.equal(p.country, 'PT', 'the pending change survives the pull');
  assert.equal(p.display_name, 'Sam (1.3.1)', 'the cloud\'s other keys are taken');
  assert.equal(rows(db)[0].sync_status, 'pending');
  await core.pushPending(db, cloud, U);
  assert.equal(cloudPayload(cloud).country, 'PT');
  assert.equal(cloudPayload(cloud).display_name, 'Sam (1.3.1)');
  // The cloud table exists but has no row for this account (created between backfill and trigger, or
  // the trigger failed): the phone's copy is sent as a whole.
  const db2 = H.makeDb();
  const cloud2 = H.makeCloud();
  PS.ensureProfileRow(db2, U, META, { now: now() });
  await core.pullChanges(db2, cloud2, U);
  assert.equal(rows(db2)[0].sync_status, 'pending');
  await core.pushPending(db2, cloud2, U);
  assert.deepEqual(cloudPayload(cloud2), PROFILE_OF_META);
  assert.equal(rows(db2)[0].sync_status, 'synced');
});

test('PS-9: update over an old version — a 1.3.x install (profile only in user_metadata, no local table) updates: before and after the migration every key is there, nothing lost', async () => {
  // The old install: the same database without the table (1.3.1 never had it).
  const db = H.makeDb();
  db.execSync(`DROP TABLE ${T};`);
  for (const r of db.getAllSync(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '${T}'`)) db.execSync(`DROP TRIGGER "${r.name}";`);
  H.seedSyncedProtocol(db, U, { remote_id: 'p-1', updated_at: '000001', name: 'BPC-157' });
  const meta = JSON.parse(JSON.stringify(META));
  // The update: the app opens, the schema upgrade adds the table, the copy runs.
  require('../lib/schema').createSchema(db);
  assert.deepEqual(view(db, meta), PROFILE_OF_META, 'first frame after the update: every key, from user_metadata');
  PS.ensureProfileRow(db, U, meta, { now: now() });
  assert.deepEqual(payloadOf(rows(db)[0]), PROFILE_OF_META, 'the row exists with every key');
  // Server not migrated yet: pulls answer "table not found".
  const cloud = H.makeCloud();
  await core.pullChanges(db, withoutTable(cloud), U);
  assert.deepEqual(view(db, meta), PROFILE_OF_META, 'before the migration: unchanged');
  // An edit made then (mirror first: user_metadata has it; the local copy follows).
  meta.country = 'PT';
  PS.recordProfileWrite(db, U, { country: 'PT' }, { ready: ready(db), meta, now: now() });
  // The migration is applied: the backfill copies every account's user_metadata.
  backfill(cloud, meta);
  await core.pullChanges(db, cloud, U);
  await core.pushPending(db, cloud, U);
  assert.equal(ready(db), true);
  const after = view(db, meta);
  assert.deepEqual(after, { ...PROFILE_OF_META, country: 'PT' }, 'after the migration: every key, the edit included');
  assert.deepEqual(cloudPayload(cloud), { ...PROFILE_OF_META, country: 'PT' }, 'and the cloud row holds them all');
  assert.equal(rows(db).length, 1);
});

test('PS-10: a session hiccup or re-auth of the same user never wipes the row; the intended sign-out does; another account never sees this profile; the A-119 takeover rebuilds it from the cloud', async () => {
  const S = require('../lib/signedOut');
  const db = H.makeDb();
  PS.ensureProfileRow(db, U, META, { now: now() });
  let cleared = 0;
  const d = { stopSyncEngine() {}, clearLocalDatabase() { cleared++; db.execSync(`DELETE FROM ${T};`); }, waitForSyncIdle: async () => {}, runExclusive: async (fn) => fn() };
  assert.equal(await S.afterSignedOut(false, d), false, 'spurious SIGNED_OUT (token refresh, session hiccup)');
  assert.equal(cleared, 0);
  assert.equal(rows(db).length, 1, 'the profile row is kept; the same user re-auths onto it');
  assert.deepEqual(view(db, META), PROFILE_OF_META);
  // Another account on this phone: rows are read by user id.
  assert.deepEqual(PS.profileView({ row: PS.readProfileRow(db, 'user-2'), meta: { display_name: 'B' }, ready: false }), { display_name: 'B' });
  // A-119 takeover rebuild (cloud table there): the local copy is replaced by the account's row.
  const cloud = H.makeCloud();
  backfill(cloud, { ...META, display_name: 'from the account' });
  const rb = await core.rebuildFromCloud(db, cloud, U, { keep: { seq: require('../lib/changeSeq').readChangeSeq(db) } });
  assert.equal(rb.ok, true);
  assert.equal(rows(db).length, 1);
  assert.equal(payloadOf(rows(db)[0]).display_name, 'from the account');
  // The intended sign-out wipes it with the rest.
  assert.equal(await S.afterSignedOut(true, d), true);
  assert.ok(cleared >= 1);
  assert.equal(rows(db).length, 0);
});

test('PS-11: report_name — getNickname / getReportName / saveReportName on this storage; empty saves null; never filled from the nickname or a provider name', async () => {
  const user = { id: U, user_metadata: { display_name: ' Sam ', report_name: ' Samantha Carter ', full_name: 'Google Name' } };
  assert.equal(PN.getNickname(user), 'Sam');
  assert.equal(PN.getReportName(user), 'Samantha Carter');
  assert.equal(PN.getNickname(user.user_metadata), 'Sam', 'a metadata object works too');
  assert.equal(PN.getReportName({ user_metadata: { display_name: 'Sam', full_name: 'Google Name' } }), '', 'never the nickname or the provider name');
  assert.equal(PN.getReportName(null), '');
  const writes = [];
  const updateUser = async (a) => { writes.push(a); return { data: { user: { id: U } }, error: null }; };
  assert.deepEqual(await PN.saveReportName('  Samantha Carter ', { updateUser }), { ok: true, value: 'Samantha Carter' });
  assert.deepEqual(await PN.saveReportName('   ', { updateUser }), { ok: true, value: null });
  assert.deepEqual(writes, [{ data: { report_name: 'Samantha Carter' } }, { data: { report_name: null } }], 'one key, through the one wrapper (table + user_metadata)');
  const failed = await PN.saveReportName('X', { updateUser: async () => ({ data: { user: null }, error: { message: 'Network request failed' } }) });
  assert.equal(failed.ok, false);
  assert.equal(PS.isProfileKey('report_name'), true, 'report_name moves with the profile');
});

test('PS-12: old store versions — user_metadata keeps every key (the mirror), and their own writes reach the table through the server trigger', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  const server = { meta: JSON.parse(JSON.stringify(META)) };
  backfill(cloud, server.meta);
  await core.pullChanges(db, cloud, U);
  // This app saves Edit profile: the metadata write (GoTrue merges the keys sent), then the table.
  const data = { display_name: 'Sam C.', country: 'PT' };
  Object.assign(server.meta, data);
  triggerCopy(cloud, data);
  afterMetadataWrite({ data: { user: { id: U, user_metadata: server.meta } }, error: null }, data, (u, d) => PS.recordProfileWrite(db, u.id, d, { ready: ready(db), meta: u.user_metadata, now: now() }));
  await core.pushPending(db, cloud, U);
  assert.equal(server.meta.display_name, 'Sam C.', '1.3.0 / 1.3.1 and the server functions read the same value');
  assert.equal(server.meta.birth_year, 1985, 'no other key touched (merge)');
  assert.equal(cloudPayload(cloud).display_name, 'Sam C.');
  // 1.3.1 (same account, after a takeover) writes a key: user_metadata has it and the trigger brings it
  // into the table; this phone shows it.
  server.meta.food_reminders = true;
  triggerCopy(cloud, { food_reminders: true });
  await core.pullChanges(db, cloud, U);
  assert.equal(view(db, server.meta).food_reminders, true);
});

test('PS-13: no visible change — no new string, no new notice, no screen reads the table directly (the one view through getCachedUser / the gate)', () => {
  const app = read('lib/profile.js');
  assert.doesNotMatch(app, /\bt\(['"]/);
  for (const f of ['screens/SettingsScreen.js', 'screens/OnboardingFlowScreen.js', 'screens/AgeConfirmScreen.js']) {
    assert.doesNotMatch(read(f), /account_profile/, `${f} never reads the table itself`);
  }
});

test('PS-14: the copy runs after the account guard on both paths (cold start and sign-in), deferred — never inside onAuthStateChange', () => {
  const app = read('App.js');
  const listener = app.slice(app.indexOf('supabase.auth.onAuthStateChange((_event, session) => {'));
  const body = listener.slice(0, listener.indexOf('\n    });'));
  assert.doesNotMatch(body, /ensureProfileCopy/, 'onAuthStateChange stays synchronous (Gate B)');
  const signIn = app.slice(app.indexOf('const onSignedIn = (session) => {'), app.indexOf('setSignInHandler(onSignedIn);'));
  assert.match(signIn, /if \(step\.held\) return;\n\s+\/\/[^\n]*\n\s+ensureProfileCopy\(session\.user\);/);
  const cold = app.slice(app.indexOf('supabase.auth.getSession().then(async'), app.indexOf('const onSignedIn = (session) => {'));
  assert.match(cold, /if \(!step\.held\) \{\n\s+\/\/[^\n]*\n\s+ensureProfileCopy\(session\.user\);/);
});

test('PS-15: a profile write before the account guard ran (the Apple / Google name fill at sign-in) never creates a row next to another account\'s data; an unreadable owner counts as another account', () => {
  assert.equal(typeof PS.phoneHoldsOtherAccount, 'function');
  assert.equal(PS.phoneHoldsOtherAccount(() => 'user-A', 'user-B'), true);
  assert.equal(PS.phoneHoldsOtherAccount(() => null, 'user-B'), false, 'an empty phone');
  assert.equal(PS.phoneHoldsOtherAccount(() => 'user-B', 'user-B'), false, 'this account\'s own data');
  assert.equal(PS.phoneHoldsOtherAccount(() => { throw new Error('read failed'); }, 'user-B'), true, 'never written next to data whose owner is unknown');
  const src = read('lib/profile.js');
  assert.match(src, /export function ensureProfileCopy\(user\) \{[\s\S]*?if \(phoneHoldsOtherAccount\(getLocalDataUserId, user\.id\)\) return 'empty';[\s\S]*?ensureProfileRow\(/);
  assert.match(src, /export function noteProfileWrite\(user, data, sessionUserId\) \{[\s\S]*?noteWrite\(db, user, data, \{ sessionUserId, localOwner: getLocalDataUserId,/);
  const db = H.makeDb();
  H.seedLocalProtocol(db, 'user-A', { name: 'A protocol' });
  const owner = () => db.getFirstSync('SELECT user_id FROM protocols LIMIT 1').user_id;
  assert.equal(PS.noteWrite(db, { id: 'user-B', user_metadata: {} }, { display_name: 'B' }, { sessionUserId: 'user-B', localOwner: owner, ready: false, now: now() }), false);
  assert.equal(db.getAllSync(`SELECT * FROM ${T}`).length, 0, 'no row next to the other account\'s data');
});

test('PS-16 (Gate B F2): a metadata write whose answer lands after the intended sign-out (or after another account signed in) never puts the profile back on the phone', async () => {
  const S = require('../lib/signedOut');
  const db = H.makeDb();
  const user = { id: U, user_metadata: { ...META } };
  assert.equal(PS.noteWrite(db, user, { country: 'PT' }, { sessionUserId: U, localOwner: () => U, ready: false, now: now() }), true, 'signed in: written');
  assert.equal(rows(db).length, 1);
  // Sign out: the wipe runs; the session user becomes null (App.js noteSessionUser on SIGNED_OUT).
  const d = { stopSyncEngine() {}, clearLocalDatabase() { db.execSync(`DELETE FROM ${T};`); }, waitForSyncIdle: async () => {}, runExclusive: async (fn) => fn() };
  await S.afterSignedOut(true, d);
  assert.equal(rows(db).length, 0);
  // The Edit profile save sent just before Sign out answers now.
  assert.equal(PS.noteWrite(db, user, { display_name: 'late' }, { sessionUserId: null, localOwner: () => null, ready: false, now: now() }), false);
  assert.equal(rows(db).length, 0, 'nothing back on disk after the wipe');
  assert.equal(PS.noteWrite(db, user, { display_name: 'late' }, { sessionUserId: 'user-2', localOwner: () => null, ready: false, now: now() }), false, 'another account is signed in now');
  assert.equal(db.getAllSync(`SELECT * FROM ${T}`).length, 0);
  // lib/supabase passes the user App.js last saw (knownUser_, set synchronously on every auth event).
  assert.match(read('lib/supabase.js'), /function noteProfileWriteLazy\(user, data\) \{\n\s+require\('\.\/profile'\)\.noteProfileWrite\(user, data, knownUser_ \? knownUser_\.id : null\);\n\}/);
});

test('PS-17 (founder B1): a stale table — the table has Old, user_metadata has New — the app shows New, and an Edit profile save never writes Old back (not to user_metadata, not to the table)', async () => {
  const db = H.makeDb();
  const cloud = H.makeCloud();
  backfill(cloud, { ...META, display_name: 'Old', country: 'US' }); // the table missed a write (e.g. a failed trigger copy)
  const server = { meta: { ...META, display_name: 'New', country: 'BR' } };
  await core.pullChanges(db, cloud, U);
  assert.equal(payloadOf(rows(db)[0]).display_name, 'Old', 'the local copy is stale');
  const shown = PS.withProfileMeta({ id: U, user_metadata: server.meta }, { row: PS.readProfileRow(db, U), ready: ready(db) }).user_metadata;
  assert.equal(shown.display_name, 'New');
  assert.equal(shown.country, 'BR');
  // Edit profile loads what is shown and saves it (screens/SettingsScreen saveProfile: every field of the
  // form), here with one field changed: the metadata write first, then the table.
  const data = { display_name: shown.display_name, country: shown.country, birth_year: 1986 };
  Object.assign(server.meta, data);
  afterMetadataWrite({ data: { user: { id: U, user_metadata: server.meta } }, error: null }, data,
    (u, d) => PS.noteWrite(db, u, d, { sessionUserId: U, localOwner: () => U, ready: ready(db), now: now() }));
  await core.pushPending(db, cloud, U);
  assert.equal(server.meta.display_name, 'New', 'user_metadata never gets Old back');
  assert.equal(cloudPayload(cloud).display_name, 'New', 'the table is corrected, never the other way');
  assert.equal(cloudPayload(cloud).country, 'BR');
  assert.equal(cloudPayload(cloud).birth_year, 1986);
  assert.equal(PS.withProfileMeta({ id: U, user_metadata: server.meta }, { row: PS.readProfileRow(db, U), ready: true }).user_metadata.display_name, 'New');
});
