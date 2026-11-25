// Is the entry offer still open to this person (founder 2026-11-20)? The store's packages and its
// intro-eligibility answer, read the way the entry offer reads them (lib/entryOffer offerAvailable).
// false on any doubt (offline, no store), so the old paywall path is kept.
import { Platform } from 'react-native';
import { getOfferings, checkTrialEligibility } from './purchases';
import { offerAvailable, offerProductIds } from './entryOffer';

export async function introOfferOpen({ timeoutMs = 2500 } = {}) {
  const ask = (async () => {
    const pkgs = await getOfferings().catch(() => []);
    const ids = offerProductIds(pkgs);
    const eligibility = ids.length ? await checkTrialEligibility(ids).catch(() => null) : null;
    return offerAvailable({ pkgs, eligibility, platform: Platform.OS });
  })();
  try {
    return !!(await Promise.race([ask, new Promise((r) => setTimeout(() => r(false), timeoutMs))]));
  } catch { return false; }
}
