'use strict';
// The day of a food entry in the fix screen (founder 2026-10-02, Q3 = C; prototype
// foodEditor): a bar Today / Yesterday / Earlier day. Earlier day is 2…7 days ago
// (catch-ups are max 7 days, founder rule) with a stepper under the bar. Pure: every
// function takes the local "today" as "YYYY-MM-DD" (lib/localDate localISO()).
// An entry dated before this rule more than 7 days ago keeps its date unless the user
// moves it; nothing here ever changes a date on its own.

const EARLIER_MIN = 2;
const EARLIER_MAX = 7;

function utcDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
}

function isoFromUtc(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${mo < 10 ? '0' : ''}${mo}-${day < 10 ? '0' : ''}${day}`;
}

// Whole calendar days from dateISO to todayISO (0 = today). NaN for an unreadable date.
function daysAgo(dateISO, todayISO) {
  return Math.round((utcDay(todayISO) - utcDay(dateISO)) / 86400000);
}

function isoDaysAgo(n, todayISO) {
  return isoFromUtc(utcDay(todayISO) - n * 86400000);
}

// The segment an entry's date sits on: 'today' | 'yesterday' | 'earlier' (null if unreadable
// or in the future).
function dayChoice(dateISO, todayISO) {
  const d = daysAgo(dateISO, todayISO);
  if (!Number.isFinite(d) || d < 0) return null;
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return 'earlier';
}

// The date after a tap on a segment. Earlier day starts at 2 days ago, or keeps the day the
// entry already has when it is already earlier.
function pickDay(choice, currentISO, todayISO) {
  if (choice === 'today') return isoDaysAgo(0, todayISO);
  if (choice === 'yesterday') return isoDaysAgo(1, todayISO);
  if (choice === 'earlier') return dayChoice(currentISO, todayISO) === 'earlier' ? currentISO : isoDaysAgo(EARLIER_MIN, todayISO);
  return currentISO;
}

function earlierBounds(currentISO, todayISO) {
  const d = daysAgo(currentISO, todayISO);
  return { canOlder: d < EARLIER_MAX, canNewer: d > EARLIER_MIN };
}

// One step of the Earlier day stepper: delta -1 = one day older, +1 = one day newer,
// held within 2…7 days ago.
function stepEarlier(currentISO, delta, todayISO) {
  const b = earlierBounds(currentISO, todayISO);
  if (delta < 0 && !b.canOlder) return currentISO;
  if (delta > 0 && !b.canNewer) return currentISO;
  return isoDaysAgo(daysAgo(currentISO, todayISO) - delta, todayISO);
}

module.exports = { EARLIER_MIN, EARLIER_MAX, daysAgo, isoDaysAgo, dayChoice, pickDay, earlierBounds, stepEarlier };
