'use strict';
// Profile synced (founder 2026-11-24 13:13 EST; spec docs/specs/profile-synced.md; picture
// docs/design/perfil-sincronizado.html; behaviour-tested in __tests__/profileSynced.test.js).
// The account's profile — name, report name, birth year and month, sex at birth, country, goals, what
// she uses, activity, provider, the onboarding answers and the reminder / privacy choices — lives in
// the synced table account_profile: ONE row per account, ONE JSON payload, merged per key (the
// calc_inputs pattern, DV-010). Before this it lived only in Supabase Auth user_metadata (no history,
// no tombstones, overwrite-prone — against CLAUDE.md "never lose user-entered data").
// Plain CommonJS on an expo-sqlite-style handle, no React Native (lib/profile.js wires it to the app).
//
// Which keys: every user_metadata key EXCEPT the sign-in provider's identity claims (Apple / Google
// rewrite them at each sign-in), the values that have their own synced table (user_metadata keeps
// only a mirror of them) and the app's migration markers. The SQL (dt_profile_keys in
// supabase/migrations/*_account_profile.sql) filters with the same list (the test compares them).
//
// Local columns (lib/schema.js): payload (the profile as this phone knows it, JSON text),
// pending_patch (keys written here and not sent yet: they override the cloud's value), pending_fill
// (keys copied from user_metadata: they go up only where the cloud has none, never over a value).
// A key set to null is a cleared value (a tombstone): it is kept as null, never refilled by a copy.
// pending_meta (founder 2026-11-24, B: "Guardar no celular e enviar quando a internet voltar"): an Edit
// profile save made without internet — the keys and values user_metadata has NOT accepted yet. They win
// on read over user_metadata and over the payload (profileView), the cloud table waits for them
// (pushProfileRow: mirror first), and sendProfileEdits sends them to user_metadata as one merge write when
// the internet is back; only then do they reach the table, through the same step as any accepted write.
//
// Reads (profileView): during the mirror period user_metadata wins and the table only fills keys it
// lacks (founder B1, MIRROR_PERIOD below). An edit still waiting for user_metadata (pending_meta) wins over
// both, per key, in every period, until user_metadata accepts that same value. After the cutover, the table wins once this phone read the
// cloud table in full (lib/syncCore cloudTableReady); before that, exactly user_metadata.
// No row → user_metadata, never an empty profile; the row is then created from it (ensureProfileRow).
//
// Writes (recordProfileWrite) come ONLY after user_metadata accepted the same keys (lib/supabase.js
// updateUser wrapper, lib/profileWrite.js): while 1.3.0 / 1.3.1 are in the stores user_metadata stays
// a full mirror. Once the cloud table was read here the keys go up as a patch (lib/syncCore push).

const T = 'account_profile';
// DV-114: the one "try again later" rule (offline, 429, 5xx) — the gates and the profile edit alike.
const { isRetryableError } = require('./pendingGate');

const EXCLUDED_KEYS = [
  // Identity claims of the sign-in provider (Supabase writes them from Apple / Google at each sign-in).
  'iss', 'sub', 'aud', 'email', 'email_verified', 'phone', 'phone_verified', 'name', 'full_name',
  'given_name', 'family_name', 'nickname', 'avatar_url', 'picture', 'provider_id', 'custom_claims',
  'is_private_email', 'user_name', 'preferred_username', 'slug',
  // Values with their own synced table; user_metadata only mirrors them (calc_inputs, reality_check_open,
  // reality_checks / calc_snapshots, lab_prefs).
  'calc_inputs', 'calc_reality_open', 'calc_reality_checks', 'calc_snapshots', 'favorite_markers', 'report_tags',
  // Granted by the server, never the person's value.
  'bloodwork_credits',
];
const EXCLUDED = new Set(EXCLUDED_KEYS);
const isProfileKey = (k) => typeof k === 'string' && k !== '' && !EXCLUDED.has(k) && !/migrated/.test(k);

function asObject(v) {
  if (v == null) return null;
  let o = v;
  if (typeof v === 'string') { try { o = JSON.parse(v); } catch { return null; } }
  return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
}
function asKeys(v) {
  if (v == null) return [];
  let a = v;
  if (typeof v === 'string') { try { a = JSON.parse(v); } catch { return []; } }
  return Array.isArray(a) ? a.filter((k) => typeof k === 'string') : [];
}
// The profile keys of a metadata / payload object (undefined values dropped; null kept: a cleared value).
function pickProfile(meta) {
  const m = asObject(meta) || {};
  const out = {};
  for (const k of Object.keys(m)) if (isProfileKey(k) && m[k] !== undefined) out[k] = m[k];
  return out;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// The edit on this phone that user_metadata has not accepted yet ({} when none).
const pendingMetaOf = (row) => (row ? pickProfile(row.pending_meta) : {});
// Does this row hold something the ACCOUNT does not have yet? Only an edit user_metadata has not accepted
// (Gate B F1 stands: a row waiting only to mirror user_metadata into the table is never at risk).
const owesAccount = (row) => Object.keys(pendingMetaOf(row)).length > 0;
function sameObject(a, b) {
  const ka = Object.keys(a); const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && same(a[k], b[k]));
}

// The account's row on this phone (one per account; a linked row first, then the newest).
function readProfileRow(db, userId) {
  if (!db || !userId) return null;
  return db.getFirstSync(
    `SELECT * FROM ${T} WHERE user_id = ? AND sync_status != 'deleted' ORDER BY (remote_id IS NOT NULL) DESC, updated_at DESC, id DESC LIMIT 1`,
    [userId],
  ) || null;
}

// Founder B1 (2026-11-24): while user_metadata is written FIRST (the mirror period, 1.3.0 / 1.3.1 in the
// stores), user_metadata wins on read — the table only fills keys it lacks. A stale table (a missed
// trigger copy, a pull not yet made) can then never show an old value, and Edit profile, which saves
// what it shows, never writes an old value back. FLIP AT THE CUTOVER: set MIRROR_PERIOD to false in the
// same change that removes the mirror (lib/supabase updateUser wrapper) and the auth.users trigger;
// then the table wins once this phone read it in full. __tests__/profileSynced.test.js PS-4 documents
// both orders, PS-17 the stale-table case.
const MIRROR_PERIOD = true;

// What the app shows. ready = this phone read the cloud table in full.
// Founder 2026-11-24 (B): a key edited here that user_metadata has not accepted yet wins over both, in
// every period — the stale user_metadata read back (a restart, a token refresh, another key saved) never
// shows the old value, and Edit profile, which saves what it shows, never writes it back.
function profileView({ row, meta, ready, mirror = MIRROR_PERIOD }) {
  const fromMeta = pickProfile(meta);
  if (!row) return fromMeta;
  const payload = pickProfile(row.payload);
  const owed = pendingMetaOf(row);
  if (mirror || !ready) return { ...payload, ...fromMeta, ...owed };
  return { ...fromMeta, ...payload, ...owed };
}
// The user object every reader gets: user_metadata with the profile view laid over it (the other
// keys — calc_inputs mirror, markers, provider claims — exactly as they are).
function withProfileMeta(user, { row, ready }) {
  if (!user || typeof user !== 'object') return user;
  const meta = user.user_metadata || {};
  return { ...user, user_metadata: { ...meta, ...profileView({ row, meta, ready }) } };
}

function insertRow(db, userId, payload, fillKeys, nowIso) {
  return db.runSync(
    `INSERT INTO ${T} (user_id, payload, pending_patch, pending_fill, created_at, updated_at, sync_status) VALUES (?, ?, NULL, ?, ?, ?, 'synced')`,
    [userId, JSON.stringify(payload), fillKeys.length ? JSON.stringify(fillKeys) : null, nowIso, nowIso],
  ).lastInsertRowId;
}

// No row → the row is created from user_metadata; a row → the metadata keys it LACKS are added
// (merge-only: a key it has, a cleared null included, is never overwritten). The copied keys are
// fill-only for the cloud. Not an unsent change (status stays 'synced': the account already holds
// these values in user_metadata, and the migration's backfill copies them).
// → 'created' | 'filled' | 'kept' | 'empty' (nothing to copy, no row written)
function ensureProfileRow(db, userId, meta, { now }) {
  if (!db || !userId) return 'empty';
  const m = pickProfile(meta);
  const row = readProfileRow(db, userId);
  const nowIso = now || new Date().toISOString();
  if (!row) {
    if (!Object.keys(m).length) return 'empty';
    insertRow(db, userId, m, Object.keys(m), nowIso);
    return 'created';
  }
  const payload = asObject(row.payload) || {};
  const add = {};
  for (const k of Object.keys(m)) if (!(k in payload)) add[k] = m[k];
  if (!Object.keys(add).length) return 'kept';
  const fill = [...new Set([...asKeys(row.pending_fill), ...Object.keys(add)])];
  db.runSync(`UPDATE ${T} SET payload = ?, pending_fill = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify({ ...payload, ...add }), JSON.stringify(fill), nowIso, row.id]);
  return 'filled';
}

// A profile write user_metadata already accepted (only the profile keys of it). ready (the cloud
// table was read here) or a row already waiting → a per-key patch to send. Otherwise the local copy
// follows and the keys are fill-only (the backfill / trigger carry the metadata value to the cloud).
function recordProfileWrite(db, userId, changes, { ready, meta, now }) {
  const ch = pickProfile(changes);
  if (!db || !userId || !Object.keys(ch).length) return null;
  const nowIso = now || new Date().toISOString();
  let row = readProfileRow(db, userId);
  if (!row) {
    ensureProfileRow(db, userId, meta, { now: nowIso });
    row = readProfileRow(db, userId);
  }
  if (!row) {
    const id = insertRow(db, userId, {}, [], nowIso);
    row = db.getFirstSync(`SELECT * FROM ${T} WHERE id = ?`, [id]);
  }
  const payload = { ...(asObject(row.payload) || {}), ...ch };
  const toPatch = !!ready || row.sync_status === 'pending';
  if (toPatch) {
    const patch = { ...(asObject(row.pending_patch) || {}), ...ch };
    const fill = asKeys(row.pending_fill).filter((k) => !(k in ch));
    db.runSync(`UPDATE ${T} SET payload = ?, pending_patch = ?, pending_fill = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
      [JSON.stringify(payload), JSON.stringify(patch), fill.length ? JSON.stringify(fill) : null, nowIso, row.id]);
  } else {
    const fill = [...new Set([...asKeys(row.pending_fill), ...Object.keys(ch)])];
    db.runSync(`UPDATE ${T} SET payload = ?, pending_fill = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(payload), JSON.stringify(fill), nowIso, row.id]);
  }
  return row.id;
}

// ── Sync engine side (called by lib/syncCore with its engine-marked db) ─────────────────────────

// One pulled cloud row: every key takes the cloud's value, except the keys written here and not sent
// yet (pending_patch) and the copied keys the cloud lacks (pending_fill, which then still go up).
// The local copy (no remote_id) links to the cloud row: one row per account, never a duplicate.
function mergePulledProfile(db, cloudRow) {
  if (!cloudRow || !cloudRow.id || !cloudRow.user_id) return;
  const uid = cloudRow.user_id;
  const cloudPayload = pickProfile(cloudRow.payload);
  const stamp = cloudRow.updated_at || new Date().toISOString();
  const local = db.getFirstSync(`SELECT * FROM ${T} WHERE remote_id = ?`, [cloudRow.id]) || readProfileRow(db, uid);
  if (!local) {
    db.runSync(`INSERT INTO ${T} (remote_id, user_id, payload, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'synced')`,
      [cloudRow.id, uid, JSON.stringify(cloudPayload), cloudRow.created_at || stamp, stamp]);
    return;
  }
  // Another local row of the same account (should not exist): its unsent keys fold into this one.
  let patch = local.sync_status === 'pending' ? (asObject(local.pending_patch) || {}) : {};
  const localPayload = asObject(local.payload) || {};
  // An edit waiting for user_metadata (pending_meta) is never touched by a pull: it stays and still wins.
  let owed = pendingMetaOf(local);
  for (const o of db.getAllSync(`SELECT * FROM ${T} WHERE user_id = ? AND id != ? AND sync_status != 'deleted'`, [uid, local.id]) || []) {
    if (o.sync_status === 'pending') patch = { ...(asObject(o.pending_patch) || {}), ...patch };
    owed = { ...pendingMetaOf(o), ...owed };
    db.runSync(`DELETE FROM ${T} WHERE id = ?`, [o.id]);
  }
  const fill = asKeys(local.pending_fill).filter((k) => !(k in cloudPayload) && (k in localPayload));
  const merged = { ...cloudPayload };
  for (const k of fill) merged[k] = localPayload[k];
  Object.assign(merged, pickProfile(patch));
  const hasOwed = Object.keys(owed).length > 0;
  const pending = Object.keys(patch).length > 0 || fill.length > 0 || hasOwed;
  db.runSync(`UPDATE ${T} SET remote_id = ?, payload = ?, pending_patch = ?, pending_fill = ?, pending_meta = ?, sync_status = ?, updated_at = ? WHERE id = ?`,
    [cloudRow.id, JSON.stringify(merged), Object.keys(patch).length ? JSON.stringify(patch) : null, fill.length ? JSON.stringify(fill) : null,
      hasOwed ? JSON.stringify(owed) : null, pending ? 'pending' : 'synced', pending ? local.updated_at : stamp, local.id]);
}

// The cloud table answered in full and holds no row for this account: this phone's copy goes up
// (fill-only over nothing = the whole copy). A row that was linked before is left alone (only the
// account deletion removes the cloud row).
function noCloudProfile(db, userId) {
  const row = readProfileRow(db, userId);
  if (!row || row.remote_id || row.sync_status === 'pending') return;
  const keys = Object.keys(asObject(row.payload) || {});
  if (!keys.length) return;
  db.runSync(`UPDATE ${T} SET pending_fill = ?, sync_status = 'pending' WHERE id = ?`, [JSON.stringify(keys), row.id]);
}

// Is another account's data on this phone (the cross-account guard has not settled it yet)? A read
// error counts as yes: never write a profile row next to data whose owner is unknown.
function phoneHoldsOtherAccount(localOwner, userId) {
  let owner = null;
  try { owner = localOwner(); } catch { return true; }
  return !!owner && owner !== userId;
}

// The step after user_metadata accepted a write (lib/profile noteProfileWrite). Written only when the
// session App.js last saw is still this user (Gate B F2: an answer landing after the intended sign-out,
// or after another account signed in, never puts the profile back on the phone) and no other
// account's data is here. user_metadata already has the value either way. → written?
function noteWrite(db, user, data, { sessionUserId, localOwner, ready, now }) {
  if (!db || !user || !user.id) return false;
  if (!sessionUserId || sessionUserId !== user.id) return false;
  if (phoneHoldsOtherAccount(localOwner, user.id)) return false;
  return recordProfileWrite(db, user.id, data, { ready: !!ready, meta: user.user_metadata || {}, now }) != null;
}

function finish(db, row, remoteId, merged, stamp) {
  db.runSync(`UPDATE ${T} SET remote_id = ? WHERE id = ?`, [remoteId, row.id]);
  // Only when the row was not written again while the push was out (that write stays pending).
  db.runSync(`UPDATE ${T} SET payload = ?, pending_patch = NULL, pending_fill = NULL, sync_status = 'synced', updated_at = ? WHERE id = ? AND updated_at = ?`,
    [JSON.stringify(merged), stamp || row.updated_at, row.id, row.updated_at]);
}

// Push one pending row: the cloud's payload as read now + the copied keys it lacks + the keys written
// here, only over that same cloud row (updated_at), else retried. Never an object computed from a
// stale or empty read. → 'done' | 'retry' | 'stop' (the cloud table is not there: rows wait).
async function pushProfileRow(db, cloud, userId, row, { missing } = {}) {
  // Mirror first (founder 2026-11-24, B): while an edit waits for user_metadata the row waits too — the
  // cloud table never holds a value user_metadata lacks. sendProfileEdits sends it; the accepted write
  // then goes up from here like any other.
  if (owesAccount(row)) return 'wait';
  const isMissing = (e) => !!(missing && missing(e));
  const local = asObject(row.payload) || {};
  const patch = pickProfile(row.pending_patch);
  const fill = asKeys(row.pending_fill);
  let got;
  try { got = await cloud.fetchSince(T, userId, null); } catch { return 'retry'; }
  if (got && isMissing(got.error)) return 'stop';
  if (!got || got.error || !Array.isArray(got.data)) return 'retry';
  const mine = got.data.filter((r) => r && r.user_id === userId)
    .sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? 1 : -1));
  const target = (row.remote_id && mine.find((r) => r.id === row.remote_id)) || mine[0] || null;
  if (target) {
    const base = pickProfile(target.payload);
    const merged = { ...base };
    for (const k of fill) if (!(k in merged) && (k in local)) merged[k] = local[k];
    Object.assign(merged, patch);
    if (sameObject(merged, base)) { finish(db, row, target.id, merged, target.updated_at); return 'done'; }
    let res;
    try { res = await cloud.update(T, target.id, { payload: merged, user_id: userId }, { ifUpdatedAt: target.updated_at }); } catch { return 'retry'; }
    if (res && isMissing(res.error)) return 'stop';
    if (!res || res.error || !Array.isArray(res.data) || !res.data.length) return 'retry';
    finish(db, row, target.id, merged, res.data[0].updated_at);
    return 'done';
  }
  const full = { ...pickProfile(local), ...patch };
  let res;
  try { res = await cloud.insert(T, { payload: full, user_id: userId }); } catch { return 'retry'; }
  if (res && isMissing(res.error)) return 'stop';
  // A row created meanwhile (unique user_id, DO NOTHING): no row back → retried, then merged into it.
  if (!res || res.error || !res.data || !res.data.id) return 'retry';
  finish(db, row, res.data.id, full, res.data.updated_at);
  return 'done';
}

// ── Offline edit (founder 2026-11-24, B: "Guardar no celular e enviar quando a internet voltar") ──

// Keep an Edit profile save on this phone: its profile keys join the edit already waiting (the later
// value wins per key), the row is an unsent change of this phone (pending, numbered for A-119). A row is
// created from user_metadata first when missing (merge-only, ensureProfileRow). → true only when stored
// (read back from the table): otherwise the screen must not say it was saved.
function keepProfileEdit(db, userId, changes, { meta, now } = {}) {
  const ch = pickProfile(changes);
  if (!db || !userId || !Object.keys(ch).length) return false;
  const nowIso = now || new Date().toISOString();
  let row = readProfileRow(db, userId);
  if (!row) { ensureProfileRow(db, userId, meta || {}, { now: nowIso }); row = readProfileRow(db, userId); }
  if (!row) {
    const id = insertRow(db, userId, {}, [], nowIso);
    row = db.getFirstSync(`SELECT * FROM ${T} WHERE id = ?`, [id]);
  }
  const owed = { ...pendingMetaOf(row), ...ch };
  db.runSync(`UPDATE ${T} SET pending_meta = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`, [JSON.stringify(owed), nowIso, row.id]);
  const back = pendingMetaOf(readProfileRow(db, userId));
  return Object.keys(ch).every((k) => k in back && same(back[k], ch[k]));
}

// user_metadata accepted a write of these keys, sent while `snapshot` was waiting: a waiting key leaves
// only while it is still what it was when the write went out (an edit saved meanwhile is newer and
// stays). The row stays pending: the accepted write was recorded as a patch (lib/profileWrite) and goes
// up with the next push.
function clearSentEdits(db, userId, keys, snapshot) {
  const row = readProfileRow(db, userId);
  const cur = pendingMetaOf(row);
  if (!row || !Object.keys(cur).length) return;
  for (const k of keys) if (k in cur && k in snapshot && same(cur[k], snapshot[k])) delete cur[k];
  db.runSync(`UPDATE ${T} SET pending_meta = ? WHERE id = ?`, [Object.keys(cur).length ? JSON.stringify(cur) : null, row.id]);
}

// One send to user_metadata: the edit waiting on this phone + `edit` (an Edit profile save; null for the
// flush when the internet is back), as ONE merge write of only those keys, through the one updateUser
// wrapper (the A-119 guard, then the table step). opts: { updateUser: async (data) => ({ error }),
// knownOffline (the phone knows it is offline: no request), meta (user_metadata, for a missing row),
// now, canKeep: () => may this phone keep it (the signed-in account, no other account's data here) }.
// → { status, error? }: 'saved' | 'kept' (offline or the server busy: on this phone, sent later) |
//   'failed' (the edit was NOT saved: refused, or it could not be stored) | 'offline' / 'refused' (the
//   flush: the waiting edit stays and is tried again) | 'none' (nothing to send, no request).
async function sendProfileEdits(db, userId, edit, opts = {}) {
  const { updateUser, knownOffline = false, meta, now, canKeep = () => true } = opts;
  const own = edit && typeof edit === 'object' ? edit : null;
  let snapshot = {};
  try { snapshot = pendingMetaOf(readProfileRow(db, userId)); } catch { snapshot = {}; }
  const data = { ...snapshot, ...(own || {}) };
  if (!userId || !Object.keys(data).length) return { status: 'none' };
  const keep = (error) => {
    if (!own) return { status: 'offline', error };
    try { if (canKeep() && keepProfileEdit(db, userId, own, { meta, now })) return { status: 'kept', error }; } catch { /* not stored */ }
    return { status: 'failed', error: error || new Error('not stored on this phone') };
  };
  if (knownOffline) return keep(null);
  let error = null;
  try { ({ error } = (await updateUser(data)) || {}); } catch (e) { error = e || new Error('write failed'); }
  if (!error) {
    try { clearSentEdits(db, userId, Object.keys(data), snapshot); } catch { /* sent again later: the same values, harmless */ }
    return { status: 'saved' };
  }
  if (isRetryableError(error)) return keep(error);
  return own ? { status: 'failed', error } : { status: 'refused', error };
}

module.exports = {
  TABLE: T, MIRROR_PERIOD, EXCLUDED_KEYS, isProfileKey, pickProfile, readProfileRow, profileView, withProfileMeta,
  ensureProfileRow, recordProfileWrite, mergePulledProfile, noCloudProfile, pushProfileRow, phoneHoldsOtherAccount, noteWrite,
  pendingMetaOf, owesAccount, keepProfileEdit, clearSentEdits, sendProfileEdits,
};
