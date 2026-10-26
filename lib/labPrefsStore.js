'use strict';
// DV-006, 1.3.2 part (founder 2026-10-20: "the synced table ships in 1.3.2"; spec
// docs/specs/dv006-lab-table.md; behaviour-tested in __tests__/dv006LabPrefsTable). My Body's lab
// stars and test labels in the synced table lab_prefs (lib/schema.js, synced by lib/syncCore.js) —
// durable, written offline, with tombstones — instead of user_metadata. Plain CommonJS on an
// expo-sqlite-style handle, no React Native imports (lib/labPrefs.js wires it to the app).
//
// Rows: one per starred marker (kind 'star', test_key '', grouped by the canonical marker key, so a
// star stored under an older name variant is the same star) and one per label of a test (kind
// 'label', test_key = the report date, grouped case-insensitively). Removing one sets removed_at (a
// tombstone: the row stays and syncs); starring or labelling again clears it on the same rows. Every
// write changes ALL rows of its group, so duplicate rows (an import next to a local one) converge.
//
// Where the values live, per account and phone:
//   - the cloud table is not known here yet (never read in full on this phone, e.g. the migration
//     is not applied) and the account was never copied → user_metadata, exactly the 1.3.1 path
//     (lib/bodyPrefs: one operation on the FRESH server value, only that key written, refused
//     offline) — nothing is written to a table the cloud may not have;
//   - otherwise → the table (works offline; the sync engine sends it).
// The one-time copy: once the cloud table was read in full on this phone, every metadata star and
// label whose key has NO row (live or removed) is inserted — merge-only, so a newer table value
// (a removal included) is never copied over, and the metadata itself is never changed or deleted.
// When every copied value is in the cloud, lab_prefs_migrated = true is written to user_metadata
// (that one key). Until then, and on a phone that has not read the table yet, the metadata values
// without a row are still shown (read-only fallback); after it, only the table counts.

const { canonicalMarker } = require('./exportRecords');
const { asList, asTags, saveBodyPref, setFavorite, setReportTag, dropReportDate } = require('./bodyPrefs');

const MIGRATED_KEY = 'lab_prefs_migrated';
const labelKey = (s) => String(s == null ? '' : s).trim().toLowerCase();
const starKey = (s) => canonicalMarker(s);
const keyOf = (kind, testKey, value) => (kind === 'star' ? `s|${starKey(value)}` : `l|${testKey || ''}|${labelKey(value)}`);
const rowKey = (r) => keyOf(r.kind, r.test_key, r.value);

function readRows(db, userId) {
  return db.getAllSync(`SELECT * FROM lab_prefs WHERE user_id = ? AND sync_status != 'deleted' ORDER BY id ASC`, [userId]) || [];
}

// key → rows, in first-row order.
function groups(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (r.kind !== 'star' && r.kind !== 'label') continue;
    const k = rowKey(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

// The row that speaks for a group: an unsent change on this phone first (the person's latest here),
// then the latest stamp, then the newest local row.
const stampMs = (r) => { const t = Date.parse(r.updated_at); return Number.isFinite(t) ? t : -Infinity; };
function winner(list) {
  return list.slice().sort((a, b) => {
    const pa = a.sync_status === 'pending' ? 1 : 0;
    const pb = b.sync_status === 'pending' ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = stampMs(a); const tb = stampMs(b);
    if (ta !== tb) return tb - ta;
    const sa = String(a.updated_at || ''); const sb = String(b.updated_at || '');
    if (sa !== sb) return sa < sb ? 1 : -1;
    return b.id - a.id;
  })[0];
}

// Metadata values as { kind, test_key, value } in their stored order (stars, then labels by date).
function metaItems(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const items = [];
  for (const f of asList(m.favorite_markers)) if (f.trim()) items.push({ kind: 'star', test_key: '', value: f });
  const tags = asTags(m.report_tags);
  for (const date of Object.keys(tags)) {
    for (const tg of Array.isArray(tags[date]) ? tags[date] : []) {
      if (typeof tg === 'string' && tg.trim()) items.push({ kind: 'label', test_key: date, value: tg });
    }
  }
  return items;
}

// What the screen shows: { favorites: [marker], tags: { date: [label] } }. fallback adds the metadata
// values that have no row (live or removed) in the table.
function view(rows, meta, { fallback = false } = {}) {
  const favorites = [];
  const tags = {};
  const gs = groups(rows);
  for (const list of gs.values()) {
    const w = winner(list);
    if (w.removed_at) continue;
    if (w.kind === 'star') favorites.push(w.value);
    else (tags[w.test_key || ''] ||= []).push(w.value);
  }
  if (fallback) {
    for (const it of metaItems(meta)) {
      if (gs.has(keyOf(it.kind, it.test_key, it.value))) continue;
      if (it.kind === 'star') {
        if (!favorites.some((f) => starKey(f) === starKey(it.value))) favorites.push(it.value);
      } else {
        const cur = (tags[it.test_key] ||= []);
        if (!cur.some((x) => labelKey(x) === labelKey(it.value))) cur.push(it.value);
      }
    }
  }
  return { favorites, tags };
}

function insertRow(db, userId, { kind, test_key, value, removed_at }, nowIso) {
  db.runSync(
    `INSERT INTO lab_prefs (user_id, kind, test_key, item_key, value, removed_at, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, kind, test_key || '', kind === 'star' ? starKey(value) : labelKey(value), value, removed_at || null, nowIso, nowIso],
  );
}

// Star / label on or off: every row of the group that is not in that state yet changes (a tombstone
// when off); no row yet → one is written (a tombstone too, so a metadata-only value removed here
// never comes back through the copy).
function setItem(db, userId, kind, testKey, value, on, nowIso) {
  const list = groups(readRows(db, userId)).get(keyOf(kind, testKey, value));
  if (!list) { insertRow(db, userId, { kind, test_key: testKey, value, removed_at: on ? null : nowIso }, nowIso); return; }
  for (const r of list) {
    if (on ? !r.removed_at : !!r.removed_at) continue;
    db.runSync(`UPDATE lab_prefs SET removed_at = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`, [on ? null : nowIso, nowIso, r.id]);
  }
}

// Any label change, written as the difference between the labels shown (cur) and the result of the
// screen's operation on them (next): { date: [label] } objects, compared per date case-insensitively.
// A label gone from next is removed (a tombstone — also for one only in the metadata fallback, so the
// copy never brings it back); a new one is added. One transaction: a label moved to another date
// (AD-100) leaves the old date and joins the new one together, or not at all.
function labelSet(tags) {
  const out = new Map();
  const t = asTags(tags);
  for (const date of Object.keys(t)) {
    for (const v of Array.isArray(t[date]) ? t[date] : []) {
      if (typeof v === 'string' && v.trim()) { const k = keyOf('label', date, v); if (!out.has(k)) out.set(k, { date, value: v }); }
    }
  }
  return out;
}
function writeTagDiff(db, userId, cur, next, nowIso) {
  const a = labelSet(cur);
  const b = labelSet(next);
  db.execSync('BEGIN');
  try {
    for (const [k, it] of a) if (!b.has(k)) setItem(db, userId, 'label', it.date, it.value, false, nowIso);
    for (const [k, it] of b) if (!a.has(k)) setItem(db, userId, 'label', it.date, it.value, true, nowIso);
    db.execSync('COMMIT');
  } catch (e) {
    try { db.execSync('ROLLBACK'); } catch { /* nothing to roll back */ }
    throw e;
  }
}

// The one-time copy: the metadata values whose key has no row at all (merge-only).
function planCopy(rows, meta) {
  const have = groups(rows);
  const seen = new Set();
  const plan = [];
  for (const it of metaItems(meta)) {
    const k = keyOf(it.kind, it.test_key, it.value);
    if (have.has(k) || seen.has(k)) continue;
    seen.add(k);
    plan.push(it);
  }
  return plan;
}
// Every planned row lands, or none.
function commitCopy(db, userId, plan, nowIso) {
  if (!plan.length) return;
  db.execSync('BEGIN');
  try {
    for (const it of plan) insertRow(db, userId, { ...it, removed_at: null }, nowIso);
    db.execSync('COMMIT');
  } catch (e) {
    try { db.execSync('ROLLBACK'); } catch { /* nothing to roll back */ }
    throw e;
  }
}
// Confirmed: every metadata value has a row that reached the cloud (remote_id).
function copyConfirmed(rows, meta) {
  const gs = groups(rows);
  return metaItems(meta).every((it) => (gs.get(keyOf(it.kind, it.test_key, it.value)) || []).some((r) => !!r.remote_id));
}

// deps: { db, userId, meta() → the session's cached user_metadata, readFresh() → user_metadata from
// the server (throws when it cannot be read), writeMeta(data) → { error }, ready() → the cloud table
// was read in full on this phone (lib/syncCore cloudTableReady), requestSync(), now() → ISO }.
// Every write answers { ok, favorites, tags }.
function createLabPrefs(deps) {
  const now = () => (deps.now ? deps.now() : new Date().toISOString());
  const rows = () => readRows(deps.db, deps.userId);
  async function state() {
    let meta = {};
    try { meta = (await deps.meta()) || {}; } catch { meta = {}; }
    const r = rows();
    const ready = !!deps.ready();
    const migrated = meta[MIGRATED_KEY] === true;
    return { meta, ready, migrated, table: ready || migrated || r.length > 0 };
  }
  const fallbackOf = (s) => !(s.migrated && s.ready);
  const answer = (s) => ({ ok: true, ...view(rows(), s.meta, { fallback: fallbackOf(s) }) });

  // → the fresh metadata the copy used (null when it could not be read).
  async function copy() {
    let fresh;
    try { fresh = await deps.readFresh(); } catch { return null; }
    if (!fresh || typeof fresh !== 'object') return null;
    if (fresh[MIGRATED_KEY] === true) return fresh;
    const plan = planCopy(rows(), fresh);
    if (plan.length) {
      try { commitCopy(deps.db, deps.userId, plan, now()); } catch { return fresh; }
      try { deps.requestSync(); } catch { /* the next sync sends it */ }
    }
    if (copyConfirmed(rows(), fresh)) {
      let res;
      try { res = await deps.writeMeta({ [MIGRATED_KEY]: true }); } catch { res = { error: true }; }
      if (!(res && res.error)) return { ...fresh, [MIGRATED_KEY]: true };
    }
    return fresh;
  }

  async function load() {
    let s = await state();
    if (s.ready && !s.migrated) {
      const fresh = await copy();
      if (fresh) s = { ...s, meta: fresh, migrated: fresh[MIGRATED_KEY] === true };
    }
    return view(rows(), s.meta, { fallback: fallbackOf(s) });
  }

  // The 1.3.1 path (user_metadata), while the table is not usable on this phone.
  async function viaMeta(s, key, apply) {
    const r = await saveBodyPref({ readFresh: deps.readFresh, write: deps.writeMeta }, key, apply);
    if (!r.ok) return { ok: false };
    return { ok: true, ...view(rows(), { ...s.meta, [key]: r.value }, { fallback: true }) };
  }
  function viaTable(s, write) {
    try { write(); } catch { return { ok: false }; }
    try { deps.requestSync(); } catch { /* the next sync sends it */ }
    return answer(s);
  }

  async function star(marker, on) {
    const s = await state();
    if (!s.table) return viaMeta(s, 'favorite_markers', (cur) => setFavorite(asList(cur), marker, on));
    return viaTable(s, () => setItem(deps.db, deps.userId, 'star', '', marker, on, now()));
  }
  // THE label write: apply(tags) → tags, a pure operation on the { date: [label] } object the screen
  // shows (lib/bodyPrefs setReportTag / dropReportDate, lib/labDateMove moveReportTags). Metadata
  // path: applied to the FRESH report_tags (1.3.1). Table path: applied to the labels shown, and the
  // difference is written (writeTagDiff).
  async function tags(apply) {
    const s = await state();
    if (!s.table) return viaMeta(s, 'report_tags', (cur) => apply(asTags(cur)));
    const cur = view(rows(), s.meta, { fallback: fallbackOf(s) }).tags;
    let next;
    try { next = apply(JSON.parse(JSON.stringify(cur))); } catch { return { ok: false }; }
    return viaTable(s, () => writeTagDiff(deps.db, deps.userId, cur, next, now()));
  }
  const label = (date, tag, on) => tags((t) => setReportTag(t, date, tag, on));
  const dropLabels = (date) => tags((t) => dropReportDate(t, date));

  return { load, star, tags, label, dropLabels };
}

module.exports = { createLabPrefs, view, planCopy, copyConfirmed, readRows, MIGRATED_KEY };
