'use strict';
// DV-247 (AD-95, founder 2026-10-15: every protocol change is stored with the date it took effect and the
// past uses the old values). Pure — no React Native / Expo imports (node --test).
//
// protocols.schedule_history (TEXT, JSON), like dose_history (lib/doseStamp): written only when the
// schedule changes — [{ from: null, interval_days, doses_per_day, reminder_time }, { from: ISO, … }, …];
// the first entry is the schedule before the first change (in force from the beginning), each next one
// from the moment the change was saved. No history = the schedule was never changed.
// A day uses the version in force that local day: the last one whose `from` falls on that day or before
// (the edit's own day already uses the new schedule). The start date is not versioned: moving it
// corrects when the protocol began (A-90) and applies to the whole past.
const { localISO } = require('./localDate');

const FIELDS = ['interval_days', 'doses_per_day', 'reminder_time'];
const MAX_ENTRIES = 100;

const pick = (p) => ({ interval_days: Number(p.interval_days) || 1, doses_per_day: Number(p.doses_per_day) || 1, reminder_time: p.reminder_time || null });
const same = (a, b) => FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));

function historyOf(p) {
  if (!p || !p.schedule_history) return [];
  try {
    const h = typeof p.schedule_history === 'string' ? JSON.parse(p.schedule_history) : p.schedule_history;
    return Array.isArray(h) ? h.filter((e) => e && typeof e === 'object') : [];
  } catch { return []; }
}

// The history to store after an edit (`changes` = the fields being saved), or null when the schedule
// does not change. prev: the row before the edit.
function nextScheduleHistory(prev, changes, atIso) {
  if (!prev) return null;
  const before = pick(prev);
  const after = pick({ ...prev, ...Object.fromEntries(FIELDS.filter((f) => changes && f in changes).map((f) => [f, changes[f]])) });
  if (same(before, after)) return null;
  const h = historyOf(prev);
  const list = h.length ? h.slice() : [{ from: null, ...before }];
  list.push({ from: atIso, ...after });
  return JSON.stringify(list.slice(-MAX_ENTRIES));
}

// The protocol as it was scheduled on dayDate: p with the schedule fields of the version in force.
function scheduleOn(p, dayDate) {
  const h = historyOf(p);
  if (!h.length) return p;
  const day = localISO(new Date(dayDate));
  let hit = h[0];
  for (const e of h) {
    if (e.from == null) { hit = e; continue; }
    const t = new Date(e.from);
    if (!Number.isNaN(t.getTime()) && localISO(t) <= day) hit = e;
  }
  return { ...p, interval_days: hit.interval_days, doses_per_day: hit.doses_per_day, reminder_time: hit.reminder_time };
}

module.exports = { nextScheduleHistory, scheduleOn, historyOf, SCHEDULE_FIELDS: FIELDS };
