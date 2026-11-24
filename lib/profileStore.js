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
//
// Reads (profileView): once this phone read the cloud table in full (lib/syncCore cloudTableReady),
// the table wins and user_metadata only fills keys it lacks. Before that (the migration not applied,
// or the first start after the update), exactly user_metadata, as every earlier version showed it.
// No row → user_metadata, never an empty profile; the row is then created from it (ensureProfileRow).
//
// Writes (recordProfileWrite) come ONLY after user_metadata accepted the same keys (lib/supabase.js
// updateUser wrapper, lib/profileWrite.js): while 1.3.0 / 1.3.1 are in the stores user_metadata stays
// a full mirror. Once the cloud table was read here the keys go up as a patch (lib/syncCore push).

const T = 'account_profile';

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

// What the app shows. ready = this phone read the cloud table in full.
function profileView({ row, meta, ready }) {
  const fromMeta = pickProfile(meta);
  if (!row) return fromMeta;
  const payload = pickProfile(row.payload);
  return ready ? { ...fromMeta, ...payload } : { ...payload, ...fromMeta };
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
  for (const o of db.getAllSync(`SELECT * FROM ${T} WHERE user_id = ? AND id != ? AND sync_status != 'deleted'`, [uid, local.id]) || []) {
    if (o.sync_status === 'pending') patch = { ...(asObject(o.pending_patch) || {}), ...patch };
    db.runSync(`DELETE FROM ${T} WHERE id = ?`, [o.id]);
  }
  const fill = asKeys(local.pending_fill).filter((k) => !(k in cloudPayload) && (k in localPayload));
  const merged = { ...cloudPayload };
  for (const k of fill) merged[k] = localPayload[k];
  Object.assign(merged, pickProfile(patch));
  const pending = Object.keys(patch).length > 0 || fill.length > 0;
  db.runSync(`UPDATE ${T} SET remote_id = ?, payload = ?, pending_patch = ?, pending_fill = ?, sync_status = ?, updated_at = ? WHERE id = ?`,
    [cloudRow.id, JSON.stringify(merged), Object.keys(patch).length ? JSON.stringify(patch) : null, fill.length ? JSON.stringify(fill) : null,
      pending ? 'pending' : 'synced', pending ? local.updated_at : stamp, local.id]);
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

module.exports = {
  TABLE: T, EXCLUDED_KEYS, isProfileKey, pickProfile, readProfileRow, profileView, withProfileMeta,
  ensureProfileRow, recordProfileWrite, mergePulledProfile, noCloudProfile, pushProfileRow, phoneHoldsOtherAccount,
};
