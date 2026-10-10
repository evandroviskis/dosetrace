// Where the open reality check stands right now, read from the phone (founder 2026-10-09: Today kept
// asking for the weigh-in after it was done). The same inputs Progress uses: the open check, the
// weigh-ins (calc snapshots), the food log run and the average typed by hand (lib/realityCheckRules).
import { getCachedUser } from './supabase';
import { getRealityStart, getCalcInputs } from './realityCheck';
import { getCalcSnapshots, getFoodLogsSince } from './database';
import { intakeRun } from './nutrition';
import { checkOutcome, typedIntakeFor } from './realityCheckRules';
import { REALITY_CHECK_DAYS } from './notifications';
import { localISO } from './localDate';

export async function readCheckNow() {
  const start = await getRealityStart();
  if (!start) return { start: null, outcome: { state: 'none' }, run: null };
  const user = await getCachedUser();
  const uid = user?.id || null;
  const startISO = String(start.date).slice(0, 10);
  const today = localISO();
  let snapshots = [];
  let run = null;
  try {
    if (uid) {
      snapshots = (getCalcSnapshots(uid) || []).map((r) => ({ date: r.entry_date, weightKg: r.weight_kg }));
      run = intakeRun(getFoodLogsSince(uid, startISO) || [], startISO, today);
    }
  } catch { /* unknown: the date-only state below */ }
  let typedKcal = null;
  try { typedKcal = typedIntakeFor(await getCalcInputs(), startISO); } catch { typedKcal = null; }
  const outcome = checkOutcome({ start, snapshots, run, typedKcal, todayISO: today, days: REALITY_CHECK_DAYS });
  return { start, outcome, run };
}
