'use strict';
// A-101e (found 2026-10-06): Progress "Your numbers" showed 87 kg while the newest weigh-in was 84.6 —
// the weight came only from the saved calculator inputs, so a weigh-in edited, backfilled or synced
// from another phone never reached it. The newest weigh-in wins unless the user typed the weight on
// that day or later (weightAt, saved with the inputs). Returns the weigh-in to adopt, or null. Pure.
function numbersWeight({ weightAt, typedKg = null, snapshots }) {
  let latest = null;
  for (const s of snapshots || []) {
    if (s == null || s.weightKg == null || !s.date) continue;
    if (!latest || s.date > latest.date) latest = s;
  }
  if (!latest) return null;
  const typed = weightAt ? String(weightAt).slice(0, 10) : null;
  if (typed && typed > latest.date) return null;
  // Same day: typing always writes that day's weigh-in, so a different number there was written
  // after the typing (a weigh-in edit, A-212 Update) — it wins. The same number changes nothing.
  if (typed && typed === latest.date && (typedKg == null || Math.abs(typedKg - latest.weightKg) < 0.05)) return null;
  return { date: latest.date, weightKg: latest.weightKg };
}
// DV-062: the weigh-in of the day the Your numbers weight came from (weightAt) was deleted — the
// newest weigh-in left becomes the weight (null: another day was deleted, or nothing is left).
function afterWeighInDelete({ weightAt, deletedDate, snapshots }) {
  const typed = weightAt ? String(weightAt).slice(0, 10) : null;
  if (!typed || typed !== String(deletedDate || '').slice(0, 10)) return null;
  let latest = null;
  for (const s of snapshots || []) {
    if (s == null || s.weightKg == null || !s.date || s.date === typed) continue;
    if (!latest || s.date > latest.date) latest = s;
  }
  return latest ? { date: latest.date, weightKg: latest.weightKg } : null;
}
module.exports = { numbersWeight, afterWeighInDelete };
