// Distinguishes an INTENTIONAL sign-out (the user tapped Sign Out / Delete
// Account) from a SPURIOUS one (a token-refresh failure / expired session that
// Supabase surfaces as a SIGNED_OUT event).
//
// Why it matters: the SIGNED_OUT handler wipes local data (clearLocalDatabase +
// AsyncStorage), which is correct on a real sign-out (it's also the
// anti-cross-account-leak guard on a shared device) but wrong on a spurious one —
// that wipe is what erased an in-progress reality-check on a mere update/session
// hiccup. All user data is now cloud-backed, so on a spurious sign-out we KEEP the
// local data (the same user will re-auth; no re-import churn, no loss) and rely on
// the sign-in user-switch guard for cross-account safety.
//
// Module-level singleton (one per JS runtime). Set the flag right before calling
// supabase.auth.signOut(); the SIGNED_OUT handler consumes it exactly once.

let intentional = false;

export function markIntentionalSignOut() { intentional = true; }

// Read-and-reset. Safe to call from inside onAuthStateChange (pure, synchronous,
// no supabase calls — never blocks the auth lock).
export function consumeIntentionalSignOut() {
  const v = intentional;
  intentional = false;
  return v;
}
