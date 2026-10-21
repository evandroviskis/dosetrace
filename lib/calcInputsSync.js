'use strict';
// DV-010 (DL-29, S1): calc_inputs is merged per key on push, never replaced whole.
//
// calc_inputs is one JSON payload per user shared by the calculator and the reality check (typed
// average calories rcTypedKcal, rcResultSources, the kept daily burn legacyBurn, ...). Sync is
// row-level, so before this a phone's push sent its WHOLE local copy and replaced the cloud's: a key
// another phone had changed meanwhile went back to this phone's stale value or vanished. Now:
//   - every local save records the keys it really changed (pending_patch, local column only);
//   - the push reads the account's cloud row and writes cloud payload + those keys (rcResultSources
//     per date), so a key this phone never changed always keeps the cloud's value;
//   - a first save on a payload another phone created merges into that row (never the old
//     upsert-on-user_id replace); if the row appears between the read and the insert, the insert
//     is refused (lib/sync.js ignoreDuplicates) and the next pass merges.
// A row an older build left pending has no pending_patch: its whole payload is the patch, merged
// over the cloud's, so a cloud-only key still survives (update over 1.3.0).
// CommonJS, no React Native: driven by node --test with the sync harness.
const { mergeCalcInputs } = require('./realityCheckStore');

function asObject(v) {
  if (v == null) return null;
  let o = v;
  if (typeof v === 'string') { try { o = JSON.parse(v); } catch { return null; } }
  return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// The keys of a save that differ from what is saved (rcResultSources per date). The calculator's
// debounced save sends its whole state, so only this tells which keys the user changed here.
function calcInputsChanges(base, patch) {
  const b = asObject(base) || {};
  const p = asObject(patch) || {};
  const out = {};
  for (const k of Object.keys(p)) {
    if (p[k] === undefined) continue;
    if (k === 'rcResultSources' && asObject(p[k])) {
      const old = asObject(b.rcResultSources) || {};
      const d = {};
      for (const day of Object.keys(p[k])) if (!same(p[k][day], old[day])) d[day] = p[k][day];
      if (Object.keys(d).length) out.rcResultSources = d;
      continue;
    }
    if (!same(p[k], b[k])) out[k] = p[k];
  }
  return out;
}

function newestRow(db, userId) {
  return db.getFirstSync(
    `SELECT * FROM calc_inputs WHERE user_id = ? AND sync_status != 'deleted' ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [userId]
  );
}

// The local write (lib/database.js upsertCalcInputs): the merged payload, plus the changed keys
// accumulated since the last sync. changes == null (the one-time legacy migration): the whole
// payload is this phone's to send.
function recordCalcInputs(db, userId, payloadText, changes, now) {
  const row = newestRow(db, userId);
  if (row) {
    const unknown = changes == null || (row.sync_status === 'pending' && row.pending_patch == null);
    const prev = row.sync_status === 'pending' ? asObject(row.pending_patch) : null;
    const patch = unknown ? null : JSON.stringify(mergeCalcInputs(prev || {}, changes));
    db.runSync(`UPDATE calc_inputs SET payload = ?, pending_patch = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
      [payloadText, patch, now, row.id]);
    return row.id;
  }
  return db.runSync(
    `INSERT INTO calc_inputs (user_id, payload, pending_patch, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, 'pending')`,
    [userId, payloadText, changes == null ? null : JSON.stringify(changes), now, now]
  ).lastInsertRowId;
}

function finish(db, row, remoteId, merged, stamp) {
  db.runSync('UPDATE calc_inputs SET remote_id = ? WHERE id = ?', [remoteId, row.id]);
  // Only when the row was not saved again while the push was out (that save stays pending, with its
  // keys added to the patch, and goes up on the next pass).
  db.runSync(`UPDATE calc_inputs SET payload = ?, pending_patch = NULL, sync_status = 'synced', updated_at = ? WHERE id = ? AND updated_at = ?`,
    [JSON.stringify(merged), stamp || row.updated_at, row.id, row.updated_at]);
}

// Push one pending calc_inputs row. → 'done' | 'retry' (kept pending) | 'fallback' (its cloud row is
// gone and the account has none: the ordinary path, deleted elsewhere wins as before).
async function pushCalcInputsRow(db, cloud, userId, row) {
  const local = asObject(row.payload) || {};
  const patch = row.pending_patch == null ? local : (asObject(row.pending_patch) || {});
  let got;
  try { got = await cloud.fetchSince('calc_inputs', userId, null); } catch { return 'retry'; }
  if (!got || got.error || !Array.isArray(got.data)) return 'retry';
  const mine = got.data.filter((r) => r && r.user_id === userId)
    .sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? 1 : -1));
  const target = (row.remote_id && mine.find((r) => r.id === row.remote_id)) || mine[0] || null;
  if (target) {
    const merged = mergeCalcInputs(asObject(target.payload) || {}, patch);
    const res = await cloud.update('calc_inputs', target.id, { payload: merged, user_id: userId });
    if (!res || res.error || !Array.isArray(res.data) || !res.data.length) return 'retry';
    finish(db, row, target.id, merged, res.data[0].updated_at);
    return 'done';
  }
  if (row.remote_id) return 'fallback';
  const merged = mergeCalcInputs(local, patch);
  const res = await cloud.insert('calc_inputs', { payload: merged, user_id: userId });
  if (!res || res.error || !res.data || !res.data.id) return 'retry';
  finish(db, row, res.data.id, merged, res.data.updated_at);
  return 'done';
}

module.exports = { calcInputsChanges, recordCalcInputs, pushCalcInputsRow };
