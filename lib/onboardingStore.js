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
const FRESH_ACCOUNT_WINDOW_MS = 60 * 60 * 1000; // account created within 1h = this signup (tolerates signup→session latency; still far below any existing account's age)

export async function applyPendingProfile(supabase) {
  try {
    const d = await loadOnboarding();
    if (!d || (!d.display_name && !d.primary_goal && !d.activity_level)) return;

    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data && data.user;
    } catch (e) { /* proceed with what we have */ }
    const existing = (user && user.user_metadata) || {};

    // SECURITY: only apply the stash to a FRESHLY-CREATED account. On a shared
    // device, an existing user signing in (or a second person signing into their
    // own account after the first abandoned the intro) must NEVER inherit the
    // stashed name/sex/birth-year/goal. There is no SIGNED_OUT between those two,
    // so the created_at window is the guard. Non-fresh → skip; the `finally`
    // still clears the stash so it can't leak to anyone.
    const createdMs = user && user.created_at ? Date.parse(user.created_at) : NaN;
    const isFreshAccount = isFinite(createdMs) && (Date.now() - createdMs) < FRESH_ACCOUNT_WINDOW_MS;
    if (!isFreshAccount) return;

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
  } catch (e) {
    /* non-fatal — the profile gate will still catch a missing profile */
  } finally {
    // Always clear after an apply attempt (success, skip, or failure). Combined
    // with the SIGNED_OUT cleanup in App.js, a stash can never survive to reach
    // a different account. A rare offline-signup failure loses the answers (the
    // user re-enters once) — an acceptable trade for guaranteeing no PII leak.
    try { await clearOnboarding(); } catch (e) { /* non-fatal */ }
  }
}
