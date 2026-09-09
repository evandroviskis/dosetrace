import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Value-before-signup onboarding: the intro flow collects the user's profile
 * (name, birthday, gender, goal, activity) BEFORE an account exists, stashes it
 * locally, and applies it to the Supabase profile right after sign-up — so the
 * app starts with real data and new users skip the post-login profile gate.
 */
const DATA = 'dt_onboarding_data';
const SEEN = 'dt_seen_onboarding';

export async function saveOnboarding(patch) {
  try {
    const cur = await loadOnboarding();
    await AsyncStorage.setItem(DATA, JSON.stringify({ ...cur, ...patch }));
  } catch (e) { /* non-fatal */ }
}

export async function loadOnboarding() {
  try {
    const s = await AsyncStorage.getItem(DATA);
    return s ? JSON.parse(s) : {};
  } catch (e) { return {}; }
}

export async function clearOnboarding() {
  try { await AsyncStorage.removeItem(DATA); } catch (e) { /* non-fatal */ }
}

export async function hasSeenOnboarding() {
  try { return (await AsyncStorage.getItem(SEEN)) === '1'; } catch (e) { return false; }
}

export async function markSeenOnboarding() {
  try { await AsyncStorage.setItem(SEEN, '1'); } catch (e) { /* non-fatal */ }
}

/**
 * Write the stashed onboarding answers to the freshly-created account, then clear
 * the stash. Called on SIGNED_IN (deferred, never inside onAuthStateChange). Only
 * fills fields the user actually provided; never overwrites an existing profile
 * value with a blank. Safe to call for returning users (no stash → no-op).
 */
export async function applyPendingProfile(supabase) {
  try {
    const d = await loadOnboarding();
    if (!d || (!d.display_name && !d.primary_goal && !d.activity_level)) return;

    // Skip if the account already has a complete profile (e.g. an existing user
    // who happened to also run the intro) — don't clobber real data.
    let existing = {};
    try {
      const { data } = await supabase.auth.getUser();
      existing = (data && data.user && data.user.user_metadata) || {};
    } catch (e) { /* proceed with what we have */ }

    const out = {};
    const put = (k, v) => { if (v != null && v !== '' && !existing[k]) out[k] = v; };
    put('display_name', d.display_name);
    put('country', d.country);
    put('primary_goal', d.primary_goal);
    put('activity_level', d.activity_level);
    put('gender', d.gender);
    put('birth_year', d.birth_year);
    put('birth_month', d.birth_month);
    if (Object.keys(out).length) {
      out.onboarded_at = existing.onboarded_at || new Date().toISOString();
      await supabase.auth.updateUser({ data: out });
    }
    await clearOnboarding();
  } catch (e) { /* non-fatal — the profile gate will still catch a missing profile */ }
}
