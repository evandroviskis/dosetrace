// The date and time wheels of the add / edit protocol steps (My Protocols part 18, the
// prototype wheelCols()): three columns with the chosen row in the middle. Pure values only
// (CommonJS, unit-testable); screens/components/ProtocolParts.js DTWheel draws them.

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }

// Date: month (short names, e.g. "Sep"), day, year. A start date may be years back (a
// protocol started long ago) or a little ahead, so the years run from 10 back to 2 ahead,
// always including the chosen year.
function dateColumns(iso, now, monthLabels) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(iso || '');
  const y = ok ? Number(iso.slice(0, 4)) : now.getFullYear();
  const m = ok ? Number(iso.slice(5, 7)) - 1 : now.getMonth();
  const d = ok ? Number(iso.slice(8, 10)) : now.getDate();
  const y0 = Math.min(now.getFullYear() - 10, y), y1 = Math.max(now.getFullYear() + 2, y);
  const years = [];
  for (let k = y0; k <= y1; k++) years.push(k);
  const days = [];
  for (let k = 1; k <= daysIn(y, m); k++) days.push(k);
  return [
    { values: monthLabels.map(String), index: m },
    { values: days.map(String), index: Math.min(d, days.length) - 1 },
    { values: years.map(String), index: years.indexOf(y) },
  ];
}

// The date after turning one column; the day is clamped to the month (Feb 31 → Feb 28/29).
function dateAfter(iso, now, col, index) {
  const cols = dateColumns(iso, now, Array.from({ length: 12 }, (_, i) => String(i)));
  let m = cols[0].index, d = cols[1].index + 1, y = Number(cols[2].values[cols[2].index]);
  if (col === 0) m = Math.max(0, Math.min(11, index));
  if (col === 1) d = index + 1;
  if (col === 2) y = Number(cols[2].values[Math.max(0, Math.min(cols[2].values.length - 1, index))]);
  d = Math.max(1, Math.min(d, daysIn(y, m)));
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

// Time: hour, minute (every minute, as the old picker allowed) and AM/PM on a 12-hour
// clock; hour and minute on a 24-hour clock. `dayParts` = the locale's [AM, PM] words.
function timeColumns(hhmm, h12, dayParts) {
  const [H, M] = String(hhmm || '12:00').split(':').map(Number);
  const mins = [];
  for (let k = 0; k < 60; k++) mins.push(pad2(k));
  if (h12) {
    const hrs = [];
    for (let k = 1; k <= 12; k++) hrs.push(String(k));
    return [
      { values: hrs, index: ((H + 11) % 12) },
      { values: mins, index: M },
      { values: dayParts, index: H >= 12 ? 1 : 0 },
    ];
  }
  const hrs = [];
  for (let k = 0; k < 24; k++) hrs.push(pad2(k));
  return [{ values: hrs, index: H }, { values: mins, index: M }];
}

function timeAfter(hhmm, h12, col, index) {
  let [H, M] = String(hhmm || '12:00').split(':').map(Number);
  if (col === 1) M = Math.max(0, Math.min(59, index));
  if (h12) {
    const pm = H >= 12;
    if (col === 0) H = (index + 1) % 12 + (pm ? 12 : 0);
    if (col === 2) H = (H % 12) + (index === 1 ? 12 : 0);
  } else if (col === 0) H = Math.max(0, Math.min(23, index));
  return `${pad2(H)}:${pad2(M)}`;
}

module.exports = { dateColumns, dateAfter, timeColumns, timeAfter };
