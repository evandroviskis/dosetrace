'use strict';
// DV-243 (AD-97, Q18 = B; founder go 2026-11-01): "Não houve dose". A dose the app marked Missed for a
// slot that had no dose (the protocol had not started, a time-zone slip) can be answered "no dose" in
// the Dose log. The same row keeps its slot time (logged_at, or slot_at) and gets outcome 'NoDose':
// nothing is deleted and it syncs like any outcome (dose_logs.outcome is plain text in the cloud, no
// CHECK constraint — checked 2026-11-01). It is a neutral mark: the Missed scan treats it as an answer
// to its own slot (lib/missedDoses), and adherence (lib/adherenceRings, the report), the Dose log
// counts and the streaks never count that slot. Pure — runs under plain node --test.

const NO_DOSE = 'NoDose';
const SLOT_TOLERANCE_MS = 60000; // the scan writes the row at the slot's exact minute

const isNoDose = (l) => !!l && l.outcome === NO_DOSE;

// The slot a "no dose" row answers (the moment it was written for), or NaN.
function noDoseMs(l) {
  return Date.parse((l && (l.slot_at || l.logged_at)) || '');
}

// Removes from `slots` (epoch ms, any order) the ones answered by a "no dose" time in `times`; each
// time answers at most one slot, the one at its own minute. → { slots: the rest, unused: times that
// answered none }.
function dropAnsweredSlots(slots, times) {
  const left = (times || []).filter(Number.isFinite).slice();
  const kept = [];
  for (const s of slots || []) {
    const k = left.findIndex((t) => Math.abs(t - s) < SLOT_TOLERANCE_MS);
    if (k >= 0) left.splice(k, 1);
    else kept.push(s);
  }
  return { slots: kept, unused: left };
}

// { [protocol id]: { [local Date#toDateString()]: n } } — the slots answered "no dose", by day.
function noDoseByDay(logs) {
  const out = {};
  for (const l of logs || []) {
    if (!isNoDose(l)) continue;
    const t = noDoseMs(l);
    if (!Number.isFinite(t)) continue;
    const day = new Date(t).toDateString();
    const m = out[l.protocol_id] || (out[l.protocol_id] = {});
    m[day] = (m[day] || 0) + 1;
  }
  return out;
}

module.exports = { NO_DOSE, SLOT_TOLERANCE_MS, isNoDose, noDoseMs, dropAnsweredSlots, noDoseByDay };
