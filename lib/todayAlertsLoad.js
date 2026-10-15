// A-120 (founder 2026-10-15): Today's alert inputs — where the reality check stands (A-118), the
// newest bloodwork date (biomarkers are ordered report_date DESC) and the snooze map — are read at
// the same time and returned together, so the alerts box is drawn once with all of them instead of
// growing one alert at a time. A read that fails gives its "unknown" value; the others are kept.
// Pure: every read comes in through deps (TodayScreen passes readCheckNow, getCachedUser,
// getBiomarkers and the AsyncStorage snooze read).
export async function loadAlertInputs({ readCheckNow, getUser, getBiomarkers, readSnooze }) {
  const check = Promise.resolve().then(() => readCheckNow()).catch(() => null);
  const lab = Promise.resolve().then(async () => {
    const user = await getUser();
    const bm = user ? (getBiomarkers(user.id) || []) : [];
    return bm.length ? bm[0].report_date : null;
  }).catch(() => null);
  const snooze = Promise.resolve().then(async () => {
    const raw = await readSnooze();
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  }).catch(() => ({}));
  const [now, latestLabDate, snoozeMap] = await Promise.all([check, lab, snooze]);
  return { now: now || null, latestLabDate, snooze: snoozeMap };
}
