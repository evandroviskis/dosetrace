'use strict';
// Test harness for the sync engine: a real in-memory SQLite (better-sqlite3)
// wrapped to look like an expo-sqlite handle, plus an in-memory fake cloud that
// implements the same interface lib/sync.js's Supabase adapter does. This lets
// __tests__/sync.test.js drive the REAL lib/syncCore.js push/pull/merge logic.

const Database = require('better-sqlite3');
const { createSchema } = require('../../lib/schema');
const { TABLES } = require('../../lib/syncCore');

// ── expo-sqlite-shaped adapter over better-sqlite3 ───────────────
function makeDb() {
  const raw = new Database(':memory:');
  // better-sqlite3 rejects undefined/boolean binds; expo-sqlite tolerates them.
  const clean = (params) => (params || []).map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
  const db = {
    _raw: raw,
    execSync(sql) { raw.exec(sql); },
    runSync(sql, params) {
      const info = raw.prepare(sql).run(...clean(params));
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: info.changes };
    },
    getFirstSync(sql, params) {
      return raw.prepare(sql).get(...clean(params)) ?? null;
    },
    getAllSync(sql, params) {
      return raw.prepare(sql).all(...clean(params));
    },
  };
  createSchema(db);
  return db;
}

// ── In-memory fake cloud (same interface as the Supabase adapter) ─
function makeCloud() {
  // One bucket per synced table — derived from TABLES so new tables are covered
  // automatically (no more "store[table] is undefined" when a table is added).
  const store = {};
  for (const t of TABLES) store[t] = new Map();
  let clock = 0;
  // Monotonic, string-sortable cloud timestamps (so `updated_at > since` works).
  const stamp = () => String(++clock).padStart(6, '0');
  let idSeq = 0;
  const newId = () => `cloud-${++idSeq}`;
  const lost = []; // A-143: insert answers to lose
  const inserted = []; // A-143: every insert payload sent

  return {
    _store: store,
    _stamp: stamp,
    rows(table, userId) {
      return [...store[table].values()].filter((r) => !userId || r.user_id === userId);
    },
    async delete(table, remoteId) { store[table].delete(remoteId); return { error: null }; },
    // The account's live row ids (a purged protocol is a tombstone, not live), read under a
    // verified session (the self-heal).
    async fetchIds(table, userId) { return { data: this.rows(table, userId).filter((r) => !r.purged_at).map((r) => r.id), error: null, sessionVerified: true }; },
    async fetchIn(table, column, values, userId) {
      const want = new Set(values);
      return { data: this.rows(table, userId).filter((r) => want.has(r[column])), error: null };
    },
    // opts.ifUpdatedAt: only while the row still has that updated_at (lib/sync.js .eq('updated_at')).
    async update(table, remoteId, payload, opts = {}) {
      const existing = store[table].get(remoteId);
      if (!existing) return { data: [], error: null }; // gone → 0 rows affected
      if (opts.ifUpdatedAt && existing.updated_at !== opts.ifUpdatedAt) return { data: [], error: null };
      const updated_at = stamp();
      store[table].set(remoteId, { ...existing, ...payload, id: remoteId, updated_at });
      const after = store[table].get(remoteId);
      // lib/sync.js returns a protocol's status with the stamp (A-87).
      const status = table === 'protocols' ? { active: after.active, deleted_at: after.deleted_at ?? null, ended_at: after.ended_at ?? null } : {};
      // A-121 Gate B 1 / 2: also the planned end and the "Still going?" answer, when the cloud has them.
      if (table === 'protocols') for (const c of ['ends_on', 'still_going_at']) if (c in after) status[c] = after[c] ?? null;
      return { data: [{ id: remoteId, updated_at, ...status }], error: null };
    },
    // A-143: the answers to lose. loseInsertAnswers(n, how): the next n inserts LAND in the cloud,
    // then the phone gets no answer — 'error' (supabase-js reports the network failure) or 'throw'.
    _lost: lost,
    loseInsertAnswers(n = 1, how = 'error') { for (let i = 0; i < n; i++) lost.push(how); },
    insertedPayloads: inserted,
    async insert(table, payload) {
      inserted.push({ table, payload: { ...payload } });
      // Postgres: an id already taken is refused (primary key), whoever owns the row.
      if (payload.id && store[table].has(payload.id)) {
        return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${table}_pkey"` } };
      }
      const id = payload.id || newId(); // an explicit id is kept (the purge tombstone re-insert, A-143)
      const updated_at = stamp();
      store[table].set(id, { ...payload, id, created_at: payload.created_at || updated_at, updated_at });
      const lose = lost.shift();
      if (lose === 'throw') throw new Error('Network request failed');
      if (lose) return { data: null, error: { message: 'TypeError: Network request failed' } };
      return { data: { id, updated_at }, error: null };
    },
    async fetchSince(table, userId, since) {
      const rows = this.rows(table, userId)
        .filter((r) => !since || r.updated_at > since)
        .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1));
      return { data: rows, error: null };
    },
    async fetchAll(table, userId) {
      const rows = this.rows(table, userId)
        .sort((a, b) => ((a.created_at || '') < (b.created_at || '') ? -1 : 1));
      return { data: rows, error: null };
    },
  };
}

// ── Local-row seeders ────────────────────────────────────────────
let seedClock = 0;

// A locally-created protocol that hasn't synced yet (sync_status='pending').
function seedLocalProtocol(db, userId, over = {}) {
  const stamp = over.updated_at || `L${++seedClock}`;
  const info = db.runSync(
    `INSERT INTO protocols (user_id, name, type, color, amount, unit, water, diluent, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status)
     VALUES (?, ?, 'recon', '#185FA5', ?, 'mg', ?, ?, ?, 'mcg', 1, 1, 1, ?, ?, 'pending')`,
    [userId, over.name || 'BPC-157', over.amount || '10', over.water || '2', over.diluent || null, over.dose || '250', stamp, stamp]
  );
  return info.lastInsertRowId;
}

// A protocol already in synced state (as if previously pulled/pushed).
function seedSyncedProtocol(db, userId, { remote_id, updated_at, name = 'X' }) {
  const info = db.runSync(
    `INSERT INTO protocols (remote_id, user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status)
     VALUES (?, ?, ?, 'recon', '#185FA5', '100', 'mcg', 1, 1, 1, ?, ?, 'synced')`,
    [remote_id, userId, name, updated_at, updated_at]
  );
  return info.lastInsertRowId;
}

// Mark a synced local protocol as edited-but-unpushed again.
function editLocalProtocol(db, id, over = {}) {
  const stamp = over.updated_at || `L${++seedClock}`;
  db.runSync(`UPDATE protocols SET name = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [over.name || 'edited', stamp, id]);
}

function getProtocol(db, id) {
  return db.getFirstSync(`SELECT * FROM protocols WHERE id = ?`, [id]);
}
function watermark(db, table, userId) {
  const row = db.getFirstSync(
    `SELECT updated_at FROM ${table} WHERE sync_status = 'synced' AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [userId]);
  return row?.updated_at || null;
}

// ── A-119: the server's one-active-device rules, in memory ───────────
// A model of supabase/migrations/20261021010000_one_active_device.sql over the fake cloud above:
// account_devices (the active device + the session that claimed it), user_devices (each device's
// last full send, replaced_at, the rebuild and notice owed), the guard on every synced table
// (refuses reads and writes from a device that is not the active one with DT001, a request without
// a device id once the account has a device with DT002, an old version with DT003 — never an
// empty result), and the RPCs. cloud.as(deviceId, opts) is one phone's view: the same interface as
// lib/sync.js's adapter plus rpc(). Holding writes (view.hold()) models a request in flight: its
// check and its row land when released, in commit order (OD-3).
function makeDeviceCloud(base = makeCloud()) {
  const acc = new Map(); // userId -> { active, sess }
  const devs = new Map(); // `${userId}|${deviceId}` -> row
  const users = new Set();
  // min: the minimum app version (DT003). legacyUntil: DL-105 as amended 2026-10-20 — requests
  // without a device id (1.3.0 installs) keep working until this founder-set cutoff (null = none yet).
  const policy = { min: null, legacyUntil: null };
  const legacyAllowed = () => policy.legacyUntil == null || Date.now() < Date.parse(policy.legacyUntil);
  let t = Date.parse('2026-10-15T12:00:00Z');
  const now = () => new Date((t += 60000)).toISOString();
  const dkey = (u, d) => `${u}|${d}`;
  const crypto = require('node:crypto');
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const versionBelow = require('../../lib/deviceRules').versionBelow;
  const err = (code, message) => ({ code, message });

  function guard(userId, deviceId, version) {
    if (!userId) return null;
    if (policy.min && version && versionBelow(version, policy.min)) return err('DT003', 'update_required');
    const a = acc.get(userId);
    if (!deviceId) return a && !legacyAllowed() ? err('DT002', 'device_required') : null;
    if (!a || a.active !== deviceId) return err('DT001', 'device_not_active');
    return null;
  }
  function devRow(u, d) { return devs.get(dkey(u, d)) || null; }
  function label(row) { return row ? { platform: row.platform || null, name: row.name || null, brand: row.brand || null } : null; }
  function newSecret(row) { const s = crypto.randomBytes(12).toString('hex'); row.secret_hash = hash(s); return s; }

  const rpcs = {
    claim_device(ctx, a) {
      const u = ctx.userId;
      if (!users.has(u)) return { data: null, error: err('28000', 'not signed in') };
      if (!['signin', 'use_here', 'silent'].includes(a.p_mode)) return { data: null, error: err('22023', 'bad mode') };
      const at = now();
      let account = acc.get(u);
      if (!account) { account = { active: null, sess: null }; acc.set(u, account); }
      let me = devRow(u, a.p_device);
      if (!me) { me = { device_id: a.p_device, last_full_send_at: null, replaced_at: null, rebuild_owed: false, notice: null }; devs.set(dkey(u, a.p_device), me); }
      Object.assign(me, { platform: a.p_platform, name: a.p_name, brand: a.p_brand, app_version: a.p_app_version, last_seen_at: at });
      const sess = ctx.sessionCreatedAt || null;
      if (account.active === a.p_device) {
        if (sess && (!account.sess || sess > account.sess)) account.sess = sess;
        return { data: { status: 'active', took_over: false, rebuild_owed: me.rebuild_owed, notice: me.notice, secret: newSecret(me), server_time: at }, error: null };
      }
      const dropTokens = () => { if (base._store.push_tokens) for (const [id, r] of base._store.push_tokens) if (r.user_id === u && r.device_id !== a.p_device) base._store.push_tokens.delete(id); };
      if (account.active == null) {
        if (a.p_mode === 'silent' && me.replaced_at) return { data: { status: 'replaced', at: me.replaced_at, server_time: at }, error: null };
        // Gate B M2: another device held the account after this one: this copy is stale — rebuilt,
        // keeping its unsent rows (no other phone holds the account now; DL-103 "data kept").
        const stale = (account.last != null && account.last !== a.p_device) || !!me.rebuild_owed;
        account.active = a.p_device; account.last = a.p_device; account.sess = sess || at;
        Object.assign(me, { replaced_at: null, replaced_by: null, rebuild_owed: stale, rebuild_mode: stale ? 'stale' : null, notice: null });
        dropTokens(); // Gate B LOW: legacy tokens (no device id) go too
        return { data: { status: 'active', took_over: false, rebuild_owed: stale, rebuild_mode: me.rebuild_mode, notice: null, secret: newSecret(me), server_time: at }, error: null };
      }
      const prev = devRow(u, account.active);
      if (a.p_mode === 'silent') {
        if (me.replaced_at) return { data: { status: 'replaced', at: me.replaced_at, server_time: at }, error: null };
        return { data: { status: 'in_use', device: label(prev), server_time: at }, error: null };
      }
      if (a.p_mode === 'signin' && sess && account.sess && sess < account.sess) {
        me.replaced_at = me.replaced_at || at; me.replaced_by = account.active;
        return { data: { status: 'superseded', at: me.replaced_at, server_time: at }, error: null };
      }
      const notice = { id: `n-${at}`, platform: prev ? prev.platform : null, name: prev ? prev.name : null, brand: prev ? prev.brand : null, last_full_send_at: prev ? prev.last_full_send_at : null };
      if (prev) Object.assign(prev, { replaced_at: at, replaced_by: a.p_device, rebuild_owed: false, notice: null });
      Object.assign(me, { replaced_at: null, replaced_by: null, rebuild_owed: true, rebuild_mode: 'takeover', notice });
      account.active = a.p_device; account.last = a.p_device; account.sess = sess || at;
      dropTokens();
      return { data: { status: 'active', took_over: true, rebuild_owed: true, rebuild_mode: 'takeover', notice, secret: newSecret(me), server_time: at }, error: null };
    },
    device_status(ctx, a) {
      const u = ctx.userId;
      const at = now();
      if (!users.has(u)) return { data: { status: 'account_gone', server_time: at }, error: null };
      const account = acc.get(u);
      const me = devRow(u, a.p_device);
      const extra = { min_version: policy.min, server_time: at };
      if (account && account.active === a.p_device) return { data: { status: 'active', rebuild_owed: me.rebuild_owed, rebuild_mode: me.rebuild_mode || null, notice: me.notice, ...extra }, error: null };
      if (me && me.replaced_at) return { data: { status: 'replaced', at: me.replaced_at, ...extra }, error: null };
      if (!account || account.active == null) return { data: { status: 'none', ...extra }, error: null };
      return { data: { status: 'in_use', device: label(devRow(u, account.active)), ...extra }, error: null };
    },
    release_device(ctx, a) {
      const account = acc.get(ctx.userId);
      const released = !!(account && account.active === a.p_device);
      if (released) account.active = null;
      return { data: { released }, error: null };
    },
    device_mark_sent(ctx, a) {
      const account = acc.get(ctx.userId);
      if (!account || account.active !== a.p_device) return { data: { status: 'not_active' }, error: null };
      const at = now();
      devRow(ctx.userId, a.p_device).last_full_send_at = at;
      return { data: { status: 'active', at }, error: null };
    },
    device_ack(ctx, a) {
      const account = acc.get(ctx.userId);
      if (!account || account.active !== a.p_device) return { data: { ok: false }, error: null };
      const me = devRow(ctx.userId, a.p_device);
      if (a.p_what === 'rebuild') me.rebuild_owed = false;
      if (a.p_what === 'notice') me.notice = null;
      return { data: { ok: true }, error: null };
    },
    device_status_by_secret(_ctx, a) {
      const h = hash(a.p_secret);
      for (const [k, row] of devs) {
        if (row.secret_hash !== h) continue;
        const u = k.split('|')[0];
        const account = acc.get(u);
        if (row.replaced_at && !(account && account.active === row.device_id)) return { data: { status: 'replaced', at: row.replaced_at, user_id: u }, error: null };
        if (account && account.active === row.device_id) return { data: { status: 'active', user_id: u }, error: null };
        return { data: { status: 'unknown' }, error: null };
      }
      return { data: { status: 'unknown' }, error: null };
    },
    account_exists(_ctx, a) { return { data: users.has(a.p_user), error: null }; },
  };

  const WRITES = new Set(['insert', 'update', 'delete']);
  function as(deviceId, opts = {}) {
    const ctx = { userId: opts.userId || null, sessionCreatedAt: opts.sessionCreatedAt || null, version: opts.version || null };
    let holding = false;
    const held = [];
    const view = {
      _ctx: ctx,
      calls: [],
      rpcDown: false,
      offline: false,
      setSession(userId, sessionCreatedAt) { ctx.userId = userId; ctx.sessionCreatedAt = sessionCreatedAt || ctx.sessionCreatedAt; },
      async sessionUserId() { return ctx.userId; },
      async rpc(name, args) {
        view.calls.push(`rpc:${name}`);
        if (view.offline || view.rpcDown) return { data: null, error: { message: 'Network request failed' } };
        const fn = rpcs[name];
        if (!fn) return { data: null, error: err('PGRST202', 'Could not find the function') };
        return fn(ctx, args || {});
      },
      hold() { holding = true; },
      async release() { holding = false; const list = held.splice(0); for (const h of list) await h(); },
      rows: (table, userId) => base.rows(table, userId),
    };
    for (const m of ['delete', 'update', 'insert', 'fetchSince', 'fetchAll', 'fetchIds', 'fetchIn']) {
      view[m] = async (...args) => {
        view.calls.push(m);
        if (view.offline) return { data: null, error: { message: 'Network request failed' } };
        const run = async () => {
          const e = guard(ctx.userId, deviceId, ctx.version);
          if (e) return { data: null, error: e };
          return base[m](...args);
        };
        if (holding && WRITES.has(m)) return new Promise((resolve) => { held.push(async () => resolve(await run())); });
        return run();
      };
    }
    return view;
  }

  return {
    base,
    _acc: acc,
    _devs: devs,
    policy,
    addUser(u) { users.add(u); },
    deleteAccount(u) {
      users.delete(u);
      acc.delete(u);
      for (const k of [...devs.keys()]) if (k.startsWith(`${u}|`)) devs.delete(k);
      for (const tname of Object.keys(base._store)) for (const [id, r] of base._store[tname]) if (r.user_id === u) base._store[tname].delete(id);
    },
    active(u) { const a = acc.get(u); return a ? a.active : null; },
    device(u, d) { return devRow(u, d); },
    as,
  };
}

module.exports = {
  makeDb, makeCloud, makeDeviceCloud,
  seedLocalProtocol, seedSyncedProtocol, editLocalProtocol,
  getProtocol, watermark,
};
