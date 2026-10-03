// The My Protocols Dose log hero's last line (part 1, prototype dash(): "Last: TB-500 ·
// Mon 7:42 PM"). Pure, CommonJS so it's unit-testable under Node.

// The newest completed dose in the log (a Missed or Skipped row is not "the last dose").
function lastCompleteLog(logs) {
  let best = null, bestMs = -Infinity;
  for (const l of logs || []) {
    if (!l || l.outcome !== 'Taken' || !l.logged_at) continue;
    const ms = new Date(l.logged_at).getTime();
    if (Number.isFinite(ms) && ms > bestMs) { best = l; bestMs = ms; }
  }
  return best;
}

const { formatDate } = require('./localeFormat');

// "Mon 7:42 PM": the weekday within the last week, else the month and day ("Sep 21"),
// then the time in the user's format. `fmtTime("HH:MM")` is lib/timeFormat formatTime.
// language: the app language ('pt'; a locale such as 'en-US' is read by its language).
function lastLogWhen(loggedAt, now, language, fmtTime) {
  const lang = String(language || 'en').slice(0, 2);
  const d = new Date(loggedAt);
  if (isNaN(d.getTime())) return '';
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = Math.round((startToday - startDay) / 86400000);
  const day = daysAgo >= 0 && daysAgo < 7
    ? formatDate(d, lang, 'weekday')
    : formatDate(d, lang, 'dayMonth');
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${fmtTime(`${hh}:${mm}`)}`;
}

module.exports = { lastCompleteLog, lastLogWhen };
