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

// Reset the "seen the intro" flag so the app returns to the splash / value-first
// flow. Called on sign-out and account deletion, so the user lands on the branded
// splash (with its "Sign in" escape) rather than a bare auth form.
export async function clearSeenOnboarding() {
  try { await AsyncStorage.removeItem(SEEN); } catch (e) { /* non-fatal */ }
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
    // Non-fresh account: deliberately do NOT apply the stash (leak guard), and
    // clear it so it can't linger for a later account.
    if (!isFreshAccount) { try { await clearOnboarding(); } catch (e) { /* non-fatal */ } return; }

    const out = {};
    const put = (k, v) => {
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return;
      if (existing[k] != null && existing[k] !== '' && !(Array.isArray(existing[k]) && existing[k].length === 0)) return;
      out[k] = v;
    };
    put('display_name', d.display_name);
    put('country', d.country);
    put('primary_goal', d.primary_goal);
    put('activity_level', d.activity_level);
    put('gender', d.gender);
    put('birth_year', d.birth_year);
    put('birth_month', d.birth_month);
    put('tracking_types', d.tracking_types);
    put('has_provider', d.has_provider);
    // Consent: a boolean the generic `put` would skip when false — write the
    // binding acceptance explicitly if the intro captured it and the account
    // hasn't already recorded consent.
    if (d.consent_accepted && !existing.consent_accepted) {
      out.consent_accepted = true;
      out.consent_date = d.consent_date || new Date().toISOString();
    }
    if (Object.keys(out).length) {
      out.onboarded_at = existing.onboarded_at || new Date().toISOString();
      const { error } = await supabase.auth.updateUser({ data: out });
      // Do NOT clear on a write failure. App.js routes a brand-new user to the
      // profile gate synchronously on SIGNED_IN, before this deferred write lands;
      // if the write fails (offline/transient signup), wiping the stash here would
      // strand them on the gate with an EMPTY form. Keep it for the next attempt —
      // the SIGNED_OUT wipe in App.js remains the cross-account PII guard.
      if (error) return;
    }
    // Success, or nothing new to apply → safe to clear.
    try { await clearOnboarding(); } catch (e) { /* non-fatal */ }
  } catch (e) {
    /* non-fatal — the profile gate will still catch a missing profile; the stash
       is intentionally kept so a transient failure can be retried on next sign-in. */
  }
}
