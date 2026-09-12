// Loss-safe writes for accumulating, date-keyed lists kept in Supabase
// user_metadata (calc_snapshots, calc_reality_checks — the calculator's saved
// history).
//
// The old code rebuilt the array from a single cached read and rewrote the whole
// metadata key, so a STALE in-memory array (a second device, or a session token
// issued before an earlier write) could silently truncate or empty saved history
// on the next save. updateUser replaces the whole value of each key it's given.
//
// upsertMetaByDate re-reads the freshest cloud copy and UNIONs it with the
// in-memory copy by date — an entry present in EITHER source is kept — then
// upserts the new entry (latest wins for its date), sorts ascending, and caps.
// If the fresh read fails (offline) it unions with the in-memory copy only, so it
// can never shrink to empty. See the "NEVER lose user-entered data" rule in
// CLAUDE.md. (These lists have no per-entry delete in the UI — only a deliberate
// full clear, which writes [] directly — so union-never-drops is correct here.)

import { supabase } from './supabase';

export async function upsertMetaByDate(key, inMemory, entry, cap = 60) {
  let cloud = [];
  try {
    const { data } = await supabase.auth.getUser();
    const arr = data?.user?.user_metadata?.[key];
    if (Array.isArray(arr)) cloud = arr;
  } catch { /* offline — union with in-memory only; never truncate to empty */ }
  const byDate = new Map();
  for (const x of cloud) if (x && x.date) byDate.set(x.date, x);
  for (const x of (inMemory || [])) if (x && x.date) byDate.set(x.date, x); // local edits win ties
  if (entry && entry.date) byDate.set(entry.date, entry);                    // the new save wins its date
  const next = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-cap);
  await supabase.auth.updateUser({ data: { [key]: next } });
  return next;
}
