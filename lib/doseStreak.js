'use strict';
// The streak on a protocol's card (founder 2026-10-05): DOSES taken in a row, never days — a weekly
// protocol taken twice is 2 doses. dayCounts: { dateString: Taken doses logged that day }. Walks back
// over due days (rest days skipped) until one is not fully taken or the protocol did not exist yet;
// today counts only once fully taken (an untaken today never breaks it). Looks back up to a year.
// DV-243: noDose { dateString: slots answered "no dose" } — those slots are not owed; a day whose slots
// were all answered "no dose" is skipped like a rest day (it neither breaks nor adds).
const { expectedDosesOn, existedOn } = require('./schedule');
// DV-247 (AD-95): a past day is judged by the schedule in force that day.
const { scheduleOn } = require('./scheduleHistory');
const { noDoseByDay } = require('./noDose');

const LOOKBACK_DAYS = 365;

function doseStreak(p, dayCounts, now = new Date(), noDose = {}) {
  const taken = (d) => dayCounts[d.toDateString()] || 0;
  const answered = (d) => noDose[d.toDateString()] || 0;
  // A fully taken day adds the doses really taken (up to the day's slots): on the creation day only
  // the slots after setup are owed, but a dose taken before it still counts.
  const add = (d, due) => Math.max(due, Math.min(taken(d), (scheduleOn(p, d).doses_per_day || 1) - answered(d)));
  let doses = 0;
  const today = expectedDosesOn(scheduleOn(p, now), now) - answered(now);
  if (today > 0 && taken(now) >= today) doses += add(now, today);
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (!existedOn(p, d)) break;
    const due = expectedDosesOn(scheduleOn(p, d), d) - answered(d);
    if (due <= 0) continue; // rest day (or every slot answered "no dose")
    if (taken(d) >= due) doses += add(d, due);
    else break;
  }
  return doses;
}

// DV-032 (DL-02): every protocol's streak from its Taken rows (logged in the app — the caller filters
// declared history, A-30): grouped by local day, then doseStreak. Today's cards and the adherence report
// call this one function, so the report a provider receives shows the card's number. DV-243: rows
// answered "no dose" in the same list (lib/database getTakenLogsSince reads both) are not owed.
function reportStreaks(protocols, takenLogs, now = new Date()) {
  const noDose = noDoseByDay(takenLogs);
  const byProtocol = {};
  for (const l of takenLogs || []) {
    if (!l || l.outcome !== 'Taken') continue;
    const day = new Date(l.logged_at).toDateString();
    const m = byProtocol[l.protocol_id] || (byProtocol[l.protocol_id] = {});
    m[day] = (m[day] || 0) + 1;
  }
  const out = {};
  for (const p of protocols || []) out[p.id] = doseStreak(p, byProtocol[p.id] || {}, now, noDose[p.id] || {});
  return out;
}

module.exports = { doseStreak, reportStreaks, LOOKBACK_DAYS };
