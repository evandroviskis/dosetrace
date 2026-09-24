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
