'use strict';
// DV-034 (DL-03, AD-85; Q8 = C of 2026-10-15; founder 2026-11-01 option C): the streak in Today's tracker
// (the flame line in the dark block) and its week dots. Pure — no React Native / Expo imports (node --test,
// __tests__/dv034TrackerStreak.test.js). Moved out of TodayScreen fetchStreakData.
//
// - Days without a miss: today counts once every dose due today is taken (an untaken today never breaks
//   it); then each earlier day back to a year (LOOKBACK_DAYS, as the card streak of lib/doseStreak) — a day
//   with no dose due (rest day, before a protocol existed) neither adds nor breaks; the first due day not
//   fully taken stops it. Each day is judged by the schedule in force that day (DV-247, scheduleOn).
// - doseDays: no protocol still running is daily today, so the count is of DOSE days ("2 dose days
//   without a miss" — two weekly doses are two weeks, not two days). Anyone with a daily protocol keeps
//   "days without a miss".
// protocols: active + ended (A-83: an ended protocol's past days still count, nothing after its end).
// takenLogs: the rows logged in the app (the caller drops declared history, A-30); only Taken counts.
const { expectedDosesOn, existedOn } = require('./schedule');
const { scheduleOn } = require('./scheduleHistory');
const { LOOKBACK_DAYS } = require('./doseStreak');

const TRACKER_LOOKBACK_DAYS = LOOKBACK_DAYS;

const isRunning = (p) => p && p.active !== 0 && p.active !== false;

function trackerStreak({ protocols = [], takenLogs = [], now = new Date() }) {
  const list = (protocols || []).filter(Boolean);
  const takenByDay = {}; // { dateString: { protocol_id: count } }
  for (const l of takenLogs || []) {
    if (!l || l.outcome !== 'Taken') continue;
    const day = new Date(l.logged_at).toDateString();
    const m = takenByDay[day] || (takenByDay[day] = {});
    m[l.protocol_id] = (m[l.protocol_id] || 0) + 1;
  }
  const dueOn = (d) => list.filter((p) => existedOn(p, d) && expectedDosesOn(scheduleOn(p, d), d) > 0);
  const isDayComplete = (d) => {
    const due = dueOn(d);
    if (due.length === 0) return false;
    const dayData = takenByDay[d.toDateString()] || {};
    return due.every((p) => (dayData[p.id] || 0) >= expectedDosesOn(scheduleOn(p, d), d));
  };
  const isDayPartial = (d) => {
    const dayData = takenByDay[d.toDateString()];
    if (!dayData) return false;
    return dueOn(d).some((p) => dayData[p.id]) && !isDayComplete(d);
  };
  const dayBack = (i) => { const d = new Date(now); d.setDate(d.getDate() - i); return d; };

  let streak = 0;
  if (isDayComplete(new Date(now))) streak++;
  for (let i = 1; i <= TRACKER_LOOKBACK_DAYS; i++) {
    const d = dayBack(i);
    if (dueOn(d).length === 0) continue; // rest day — neither adds nor breaks
    if (isDayComplete(d)) streak++;
    else break;
  }

  const weekDots = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayBack(i);
    const status = dueOn(d).length === 0
      ? 'rest'
      : isDayComplete(d) ? 'complete' : isDayPartial(d) ? 'partial' : 'missed';
    weekDots.push({ dayIndex: d.getDay(), isToday: i === 0, status });
  }

  const doseDays = !list.some((p) => isRunning(p) && (Number(scheduleOn(p, now).interval_days) || 1) === 1);
  return { streak, weekDots, doseDays };
}

// The tracker's line: "{n} days without a miss" / "{n} dose days without a miss" (singular for 1), or
// "Start today" at 0. t: the app's translate function.
function trackerStreakLine({ streak, doseDays }, t) {
  const n = Number(streak) || 0;
  if (n <= 0) return t('today_streak_none');
  const key = doseDays
    ? (n === 1 ? 'today_streak_dose_day' : 'today_streak_dose_days')
    : (n === 1 ? 'today_streak_day' : 'today_streak_days');
  return `${n} ${t(key)}`;
}

module.exports = { trackerStreak, trackerStreakLine, TRACKER_LOOKBACK_DAYS };
