// The one read of the Progress numbers outside the Progress screen (docs/specs/food-plan-actual.md
// PA-10): the saved calculator inputs, the profile, the weigh-ins and the reality checks into
// lib/progressTile. Journey's Progress tile, the food card (Today / Journey) and the food chat all read
// the plan through here, so the plan they show is the Progress card's, computed once, the same way.
import { getCachedUser } from './supabase';
import { getCalcInputs } from './realityCheck';
import { profileMeta } from './pendingGateStore';
import { getCalcSnapshots, getRealityChecks } from './database';
import { progressTile } from './progressTile';

// → the tile (lib/progressTile: weight, burn, planKcal, plan …) or null until the numbers give an estimate.
export async function readProgressTile() {
  const saved = await getCalcInputs().catch(() => null);
  const user = await getCachedUser().catch(() => null);
  const uid = user && user.id;
  let snapshots = [], checks = [];
  try { if (uid) { snapshots = getCalcSnapshots(uid); checks = getRealityChecks(uid); } } catch { /* empty */ }
  return progressTile({ saved, meta: profileMeta(user), snapshots, checks }); // DV-114 Gate B 2
}
