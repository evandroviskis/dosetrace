'use strict';
// The streak on a protocol's card (founder 2026-10-05): DOSES taken in a row, never days — a weekly
// protocol taken twice is 2 doses. dayCounts: { dateString: Taken doses logged that day }. Walks back
// over due days (rest days skipped) until one is not fully taken or the protocol did not exist yet;
// today counts only once fully taken (an untaken today never breaks it). Looks back up to a year.
const { expectedDosesOn, existedOn } = require('./schedule');

const LOOKBACK_DAYS = 365;

function doseStreak(p, dayCounts, now = new Date()) {
  const taken = (d) => dayCounts[d.toDateString()] || 0;
  // A fully taken day adds the doses really taken (up to the day's slots): on the creation day only
  // the slots after setup are owed, but a dose taken before it still counts.
  const add = (d, due) => Math.max(due, Math.min(taken(d), p.doses_per_day || 1));
  let doses = 0;
  const today = expectedDosesOn(p, now);
  if (today > 0 && taken(now) >= today) doses += add(now, today);
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (!existedOn(p, d)) break;
    const due = expectedDosesOn(p, d);
    if (due === 0) continue; // rest day
    if (taken(d) >= due) doses += add(d, due);
    else break;
  }
  return doses;
}

module.exports = { doseStreak, LOOKBACK_DAYS };
