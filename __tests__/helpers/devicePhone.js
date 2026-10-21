'use strict';
// A-119 test helper: one phone of the two-device harness. The REAL lib code — lib/deviceFlow (the
// active-device state), lib/syncPassCore (one sync pass: the device check first, then push and
// pull), lib/syncCore (push / pull / rebuild) and lib/unsentSummary — over a real SQLite and one
// phone's view of the in-memory device cloud (syncHarness makeDeviceCloud).
const { makeDb } = require('./syncHarness');
const { pushPending, pullChanges, rebuildFromCloud } = require('../../lib/syncCore');
const { createDeviceFlow } = require('../../lib/deviceFlow');
const { runSyncPass, trackRefusals } = require('../../lib/syncPassCore');
const { summarizeUnsent } = require('../../lib/unsentSummary');
const { readChangeSeq } = require('../../lib/changeSeq');

function memKv(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    _m: m,
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, String(v)); },
    removeItem: async (k) => { m.delete(k); },
  };
}

// opts: info (what this phone says it is), session (when this phone's session was created),
// kv (storage that survives the wipe — pass the same one to model a restart), db.
function phone(cloud, deviceId, userId, opts = {}) {
  const db = opts.db || makeDb();
  const kv = opts.kv || memKv();
  const view = cloud.as(deviceId, { userId, sessionCreatedAt: opts.session || '2026-10-15T08:00:00.000Z', version: opts.version || '1.3.1' });
  const tracked = trackRefusals(view);
  const p = { db, kv, view, userId, deviceId, stopped: 0, cancelled: 0, changes: 0, secret: null };
  p.flow = createDeviceFlow({
    rpc: (name, args) => view.rpc(name, args),
    rpcAnon: (name, args) => view.rpc(name, args),
    deviceId: async () => (opts.noDeviceId ? null : deviceId),
    deviceInfo: () => opts.info || { platform: 'ios', name: 'iPhone' },
    appVersion: opts.version || '1.3.1',
    store: kv,
    secret: { get: async () => p.secret, set: async (v) => { p.secret = v; }, remove: async () => { p.secret = null; } },
    summarize: async (uid) => summarizeUnsent(db, [uid]),
    changeSeq: () => readChangeSeq(db),
    rebuild: async (uid, o) => rebuildFromCloud(db, view, uid, { keep: o && o.keep }),
    requestPass: () => { p.passesAsked = (p.passesAsked || 0) + 1; },
    stopSync: () => { p.stopped += 1; },
    cancelReminders: async () => { p.cancelled += 1; },
    onChange: () => { p.changes += 1; },
  });
  p.sync = () => runSyncPass({
    gate: (ctx) => p.flow.gate(userId, ctx),
    push: () => pushPending(db, tracked, userId),
    pull: () => pullChanges(db, tracked, userId),
    refused: () => tracked.takeRefused(),
    pendingCount: () => summarizeUnsent(db, [userId]).count,
    markSent: () => p.flow.markSent(userId),
  });
  // A sign-in the person makes; a rebuild it owes runs in the next pass (Gate B M1), as App asks.
  const thenPass = async (r) => {
    if (!(r && r.reason === 'rebuild_queued')) return r;
    const pass = await p.sync();
    return { go: !!pass.ran, outcome: pass.ran ? 'rebuilt' : pass.reason, reason: pass.reason };
  };
  p.signIn = async () => thenPass(await p.flow.afterExplicitSignIn(userId));
  p.useHere = async () => thenPass(await p.flow.useHere(userId));
  p.gate = async (ctx) => thenPass(await p.flow.gate(userId, ctx));
  p.state = () => p.flow.load();
  return p;
}

let clock = 0;
const stamp = () => `2026-10-1${2 + Math.min(2, Math.floor(clock / 10))}T0${clock++ % 10}:00:00.000Z`;

function addProtocol(db, userId, over = {}) {
  const now = stamp();
  return db.runSync(
    `INSERT INTO protocols (user_id, name, type, color, dose, dose_unit, interval_days, doses_per_day, active, created_at, updated_at, sync_status)
     VALUES (?, ?, 'recon', '#185FA5', '250', 'mcg', 1, 1, 1, ?, ?, 'pending')`,
    [userId, over.name || 'BPC-157', now, now]).lastInsertRowId;
}
function addDose(db, userId, protocolLocalId, over = {}) {
  const p = db.getFirstSync('SELECT remote_id FROM protocols WHERE id = ?', [protocolLocalId]);
  const now = stamp();
  return db.runSync(
    `INSERT INTO dose_logs (user_id, protocol_id, protocol_remote_id, outcome, logged_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, protocolLocalId, p ? p.remote_id : null, over.outcome || 'Taken', over.logged_at || '2026-10-12T09:00:00.000Z', now]).lastInsertRowId;
}
function addWeighIn(db, userId, entryDate, kg = 80) {
  const now = stamp();
  return db.runSync(
    `INSERT INTO calc_snapshots (user_id, entry_date, weight_kg, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [userId, entryDate, kg, now, now]).lastInsertRowId;
}
const doses = (db, userId) => db.getAllSync(`SELECT * FROM dose_logs WHERE user_id = ? AND sync_status != 'deleted'`, [userId]);

module.exports = { phone, memKv, addProtocol, addDose, addWeighIn, doses };
