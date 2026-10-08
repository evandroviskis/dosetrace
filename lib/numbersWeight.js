'use strict';
// A-101e (found 2026-10-06): Progress "Your numbers" showed 87 kg while the newest weigh-in was 84.6 —
// the weight came only from the saved calculator inputs, so a weigh-in edited, backfilled or synced
// from another phone never reached it. The newest weigh-in wins unless the user typed the weight on
// that day or later (weightAt, saved with the inputs). Returns the weigh-in to adopt, or null. Pure.
function numbersWeight({ weightAt, snapshots }) {
  let latest = null;
  for (const s of snapshots || []) {
    if (s == null || s.weightKg == null || !s.date) continue;
    if (!latest || s.date > latest.date) latest = s;
  }
  if (!latest) return null;
  const typed = weightAt ? String(weightAt).slice(0, 10) : null;
  if (typed && typed >= latest.date) return null;
  return { date: latest.date, weightKg: latest.weightKg };
}
module.exports = { numbersWeight };
