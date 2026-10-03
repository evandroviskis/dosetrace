import AsyncStorage from '@react-native-async-storage/async-storage';
import { pendingProfilePatch } from './pendingProfile';

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
    const cur = discarded ? {} : await loadOnboarding(); // never merge into a discarded stash
    discarded = false;
    await AsyncStorage.setItem(DATA, JSON.stringify({ ...cur, ...patch }));
  } catch (e) { /* non-fatal */ }
}

export async function loadOnboarding() {
  if (discarded) return {};
  try {
    const s = await AsyncStorage.getItem(DATA);
    return s ? JSON.parse(s) : {};
  } catch (e) { return {}; }
}

export async function clearOnboarding() {
  fresh = false;
  try { await AsyncStorage.removeItem(DATA); } catch (e) { /* non-fatal */ }
  discarded = false;
}

// A real sign-out: from this moment the answers on the phone read as empty, even before the
// deferred clearOnboarding() lands (the welcome screen mounts at once — Gate B). Synchronous,
// no storage, safe inside the auth callback.
let discarded = false;
export function discardStashNow() { discarded = true; fresh = false; }

// The answers on the device are THIS person's only when they finished the onboarding in
// this run of the app (OnboardingFlowScreen marks them on its hand-off). Kept in memory on
// purpose: after a restart, or for whoever picks the phone up next, they are someone
// else's until proven otherwise and are never written into an account (lib/pendingProfile).
let fresh = false;
export function markStashFresh() { fresh = true; }
export function isStashFresh() { return fresh; }

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
 * Write the stashed onboarding answers into the account that just signed in, then clear
 * them from the device. Called on SIGNED_IN (deferred, never inside onAuthStateChange).
 * Only when the answers are this person's (fresh, see above); they fill ONLY the fields the
 * account is missing — new or existing account — and never overwrite a stored value
 * (lib/pendingProfile, decided 2026-10-03). A stash that is not fresh is cleared unwritten.
 */
export async function applyPendingProfile(supabase) {
  try {
    const d = await loadOnboarding();
    if (!d || !Object.keys(d).length) return;
    if (!fresh) { await clearOnboarding(); return; } // someone else's / an earlier run's
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data && data.user;
    } catch (e) { /* proceed with what we have */ }
    if (!user) return; // keep it for the next attempt (offline): nothing was written
    const out = pendingProfilePatch(d, user.user_metadata || {}, { fresh, nowISO: new Date().toISOString() });
    if (out) {
      const { error } = await supabase.auth.updateUser({ data: out });
      // Do NOT clear on a write failure: the person is still here and signed in, the next
      // SIGNED_IN retries. The SIGNED_OUT wipe remains the cross-account guard.
      if (error) return;
    }
    await clearOnboarding(); // written (or nothing missing): gone from the device
  } catch (e) {
    /* non-fatal — the profile gate still catches a missing profile */
  }
}
