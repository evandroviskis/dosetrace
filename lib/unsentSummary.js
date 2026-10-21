'use strict';
// A-119 (OD-6, OD-9, DL-106): what this phone holds that is not in the account yet — how many
// changes, of which kinds, from which day to which day — never the values. The same rows the
// deliberate sign-out counts (lib/recoveryFlow pendingForSignOut: pending or deleted rows of the
// local data owner and the signed-in user), so the number on screen is the number at risk. Plain
// CommonJS (node --test); throws when a table cannot be read ("could not count" is never "nothing").

const { TABLES, getPendingChanges } = require('./syncCore');
const { countOrphanedPending } = require('./orphanedPending');

// One word per kind (docs/design/a119-more-texts.html, part 4), in the order the list is written.
const KIND_ORDER = ['dose', 'weighIn', 'food', 'lab', 'vaccine', 'vial', 'protocol', 'target', 'result', 'calc'];

// The local calendar day of a stored date ("YYYY-MM-DD" stays as it is; a timestamp is read in this
// phone's time zone). null when there is none.
function dayKey(v) {
  if (v == null || v === '') return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

// → { kind, day } for one pending row. Protocol changes, targets and the calculator inputs have no
// date of their own: they count, but not in the date range.
function describe(table, row) {
  switch (table) {
    case 'dose_logs': return { kind: 'dose', day: dayKey(row.logged_at) };
    case 'calc_snapshots': {
      const calc = row.bmr != null || row.tdee != null || row.lbm != null;
      return { kind: calc ? 'calc' : 'weighIn', day: dayKey(row.entry_date) };
    }
    case 'food_logs': return { kind: 'food', day: dayKey(row.entry_date) };
    case 'biomarkers': return { kind: 'lab', day: dayKey(row.report_date) };
    case 'vaccines': return { kind: 'vaccine', day: dayKey(row.date_given) };
    case 'vials': return { kind: 'vial', day: dayKey(row.mixed_on) };
    case 'protocols': return { kind: 'protocol', day: null };
    case 'calc_targets': return { kind: 'target', day: null };
    case 'reality_checks': return { kind: 'result', day: dayKey(row.entry_date) };
    case 'reality_check_open': return { kind: 'result', day: null };
    case 'calc_inputs': return { kind: 'calc', day: null };
    default: return { kind: 'protocol', day: null };
  }
}

// A-119 Gate B H3 / round 2: is this unsent row one a rebuild keeps? keep = { all: true } (a stale
// copy on a phone that becomes active with no other phone holding the account: never discard,
// DL-103) or { seq: n } (a takeover: what was changed on this phone after the takeover started — its
// local change sequence, lib/changeSeq, above n — is kept and re-sent; older unsent rows, the old
// copy of DL-104, are discarded). No seq keeps nothing. Never updated_at: not every local write
// moves it (the Delete forever) and the phone clock can be set back.
function keptByRebuild(row, keep) {
  if (!keep) return false;
  if (keep.all) return true;
  return keep.seq != null && row.dt_seq != null && Number(row.dt_seq) > Number(keep.seq);
}

// Round 3 (screen 4 counts what the rebuild discards): a vial or dose changed after the keep point
// whose protocol was created here, never sent, and is itself discarded goes with that protocol — the
// rule of lib/syncCore rebuildFromCloud, which un-numbers such children before it counts.
function goesWithItsProtocol(db, table, row, uid, keep) {
  if ((table !== 'vials' && table !== 'dose_logs') || keep.all || keep.seq == null || row.protocol_id == null) return false;
  const p = db.getFirstSync('SELECT remote_id, sync_status, dt_seq FROM protocols WHERE id = ? AND user_id = ?', [row.protocol_id, uid]);
  if (!p || p.remote_id != null) return false;
  return p.sync_status === 'synced' || p.dt_seq == null || Number(p.dt_seq) <= Number(keep.seq);
}

// ownerIds: the local data owner and the signed-in user (either may be null).
// opts.keep: count only what a rebuild with this keep rule would discard.
// → { count, byKind: { dose: 2, weighIn: 1, ... }, from, to, refused }
function summarizeUnsent(db, ownerIds, opts = {}) {
  if (!db) throw new Error('summarizeUnsent: no database');
  const ids = [...new Set((ownerIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('summarizeUnsent: no owner known');
  const byKind = {};
  let count = 0;
  let from = null;
  let to = null;
  for (const uid of ids) {
    for (const table of TABLES) {
      for (const row of getPendingChanges(db, table, uid) || []) {
        if (opts.keep && keptByRebuild(row, opts.keep) && !goesWithItsProtocol(db, table, row, uid, opts.keep)) continue;
        const { kind, day } = describe(table, row);
        byKind[kind] = (byKind[kind] || 0) + 1;
        count += 1;
        if (day) {
          if (!from || day < from) from = day;
          if (!to || day > to) to = day;
        }
      }
    }
  }
  let refused = 0;
  if (!opts.keep) { try { refused = countOrphanedPending(db, ids); } catch { refused = 0; } }
  return { count, byKind, from, to, refused: Math.min(refused, count) };
}

module.exports = { summarizeUnsent, keptByRebuild, KIND_ORDER, dayKey, describe };
