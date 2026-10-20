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

// ownerIds: the local data owner and the signed-in user (either may be null).
// → { count, byKind: { dose: 2, weighIn: 1, ... }, from, to, refused }
function summarizeUnsent(db, ownerIds) {
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
  try { refused = countOrphanedPending(db, ids); } catch { refused = 0; }
  return { count, byKind, from, to, refused: Math.min(refused, count) };
}

module.exports = { summarizeUnsent, KIND_ORDER, dayKey, describe };
