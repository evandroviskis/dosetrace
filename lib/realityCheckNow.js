// Where the open reality check stands right now, read from the phone (founder 2026-10-09: Today kept
// asking for the weigh-in after it was done). The same inputs Progress uses: the open check, the
// weigh-ins (calc snapshots), the food log run and the average typed by hand (lib/realityCheckRules).
// DV-058 (DL-26): a ready check also carries its result (realityCheckTDEE: 'ok', or 'implausible' /
// 'too_short' = no number) and whether this person may see it (Premium or the free days), so Today's
// alert says what Progress will show (lib/realityCheckRules checkAlert).
import { getCachedUser } from './supabase';
import { getRealityStart, getCalcInputs } from './realityCheck';
import { getCalcSnapshots, getFoodLogsSince } from './database';
import { intakeRun } from './nutrition';
import { checkOutcome, typedIntakeFor } from './realityCheckRules';
import { REALITY_CHECK_DAYS } from './notifications';
import { localISO } from './localDate';
import { realityCheckTDEE } from './energyCalc';
import { realityCheckAccess } from './weighInAccess';
import { loadFoodAccess } from './foodLogActions';

export async function readCheckNow() {
  const start = await getRealityStart();
  if (!start) return { start: null, outcome: { state: 'none' }, run: null, result: null, canSeeResult: null };
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
  let result = null;
  let canSeeResult = null; // unknown → the plain "ready"
  if (outcome.state === 'ready') {
    result = realityCheckTDEE({ avgDailyCalories: outcome.avgDailyCalories, weightChangeKg: outcome.weightChangeKg, days: outcome.days });
    try {
      // The same access Progress uses (DV-101: the free days only, never a lapsed payer's grace week).
      const { access, premium } = await loadFoodAccess(uid, { persist: false });
      canSeeResult = realityCheckAccess({ premium, rcFree: !!(access && access.canLog && access.mode === 'free_days'), hasOpenCheck: true }).canSeeResult;
    } catch { canSeeResult = null; }
  }
  return { start, outcome, run, result, canSeeResult };
}
