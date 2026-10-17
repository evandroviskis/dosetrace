// The user's LOCAL calendar date as "YYYY-MM-DD".
//
// Use this — never `new Date().toISOString().split('T')[0]` (a UTC date) — for
// anything dated by the user's day: food logs, reality-check starts, snapshots.
// The UTC form dated a Brazilian 21:30 meal as TOMORROW and a Sydney morning
// start as YESTERDAY, which also desynced the reminder scheduler (it works in
// local days). Rows written before this fix keep their dates.
export function localISO(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

export function localDaysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}

// Whole LOCAL calendar days from `iso` to `now` (A-141): 0 on the same calendar day, 1 for
// yesterday (even at 23:50 → 00:10). Midnights are compared, rounded, so a DST day (23 or 25 h)
// still counts one. Never negative (a device clock behind the server); 0 for no / a bad date.
export function calendarDaysSince(iso, now = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return 0;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Recently deleted (A-141): "Deleted today" on the day it was deleted, then "Deleted {days}d ago".
export function deletedAgoText(deletedAt, t, now = new Date()) {
  const days = calendarDaysSince(deletedAt, now);
  return days === 0 ? t('protocols_deleted_today') : t('protocols_deleted_ago').replace('{days}', String(days));
}
