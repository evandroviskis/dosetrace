// Pure dose-schedule math — no React Native or Expo imports, so it runs under
// plain Node's test runner. CommonJS for the same reason (Metro imports it fine).
//
// A "protocol" here is a plain row: { start_date, interval_days, doses_per_day,
// reminder_time, created_at }. All functions are deterministic given their args
// (except toPastDateString, which reads the current date by design).

// A protocol's dose times, sorted chronologically (users may enter them out of order).
function sortedDoseTimes(p) {
  return (p.reminder_time || '').split(',').filter(Boolean).sort();
}

// How many doses of protocol p are expected on the given date.
// Honors start_date and interval_days, and — on the day the protocol was
// created — only counts dose slots from the creation time onward, so a
// protocol created at 4:30 PM never retroactively demands the 8 AM dose.
function expectedDosesOn(p, dayDate) {
  const dpd = p.doses_per_day || 1;
  const interval = p.interval_days || 1;
  const day = new Date(dayDate);
  day.setHours(0, 0, 0, 0);

  if (p.start_date) {
    const start = new Date(p.start_date + 'T00:00:00');
    const diffDays = Math.round((day - start) / 86400000);
    if (diffDays < 0) return 0;
    if (diffDays % interval !== 0) return 0;
  }

  if (p.created_at) {
    const created = new Date(p.created_at);
    if (!isNaN(created) && created.toDateString() === day.toDateString()) {
      const times = sortedDoseTimes(p).slice(0, dpd);
      if (times.length === dpd) {
        const graceMs = 60 * 60 * 1000; // a slot within the past hour still counts
        let remaining = 0;
        for (const t24 of times) {
          const [h, m] = t24.split(':').map(Number);
          const slot = new Date(day);
          slot.setHours(h, m, 0, 0);
          if (slot.getTime() >= created.getTime() - graceMs) remaining++;
        }
        return Math.min(remaining, dpd);
      }
    }
  }
  return dpd;
}

// Next date after fromDate on which p expects at least one dose.
function nextDueDate(p, fromDate) {
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 60; i++) {
    d.setDate(d.getDate() + 1);
    if (expectedDosesOn(p, d) > 0) return new Date(d);
  }
  return null;
}

// Did the protocol exist on this date? Days before creation must never
// count against streaks or adherence.
function existedOn(p, dayDate) {
  if (!p.created_at) return true;
  const created = new Date(p.created_at);
  if (isNaN(created)) return true;
  const endOfDay = new Date(dayDate);
  endOfDay.setHours(23, 59, 59, 999);
  return created <= endOfDay;
}

// Build YYYY-MM-DD from month+day resolving to the most recent occurrence
// (this year, or last year if that month/day hasn't happened yet).
// Returns null for impossible dates like Feb 31.
function toPastDateString(monthIdx, dayStr) {
  const day = parseInt(dayStr) || 1;
  const now = new Date();
  let year = now.getFullYear();
  let d = new Date(year, monthIdx, day);
  if (d.getMonth() !== monthIdx || d.getDate() !== day) return null;
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  if (d > todayEnd) {
    year -= 1;
    d = new Date(year, monthIdx, day);
    if (d.getMonth() !== monthIdx || d.getDate() !== day) return null;
  }
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = { sortedDoseTimes, expectedDosesOn, nextDueDate, existedOn, toPastDateString };
