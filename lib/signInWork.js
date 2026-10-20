// A-144: the app's sign-in work (App.js onSignedIn: cross-account guard, import, purchases, sync,
// reminders) runs on auth-js's SIGNED_IN event. setSession emits SIGNED_IN only for a token it trusts:
// when the DEVICE clock says the access token has expired (a phone 1 h or more ahead) it refreshes the
// token and emits TOKEN_REFRESHED instead, so a session taken that way (the password reset, lib/
// recoveryLink.js) signed the account in with none of that work. One function, registered by App.js,
// runs from both paths: the SIGNED_IN branch and setSessionSignedIn below. Plain CommonJS with no
// imports, so it runs under node's test runner (__tests__/a144ResetLinkClockAhead.test.js).

let handler = null;
let signedInRuns = 0;

// App.js registers its SIGNED_IN work on mount and clears it (null) on unmount.
function setSignInHandler(fn) { handler = typeof fn === 'function' ? fn : null; }

// The first line of App.js onSignedIn: counts every run of the sign-in work. auth-js calls App.js's
// listener (and so onSignedIn) while it notifies SIGNED_IN, before setSession returns.
function noteSignedIn() { signedInRuns += 1; }

// setSession on the main client, then the sign-in work once: by App.js when SIGNED_IN fired (the count
// moved), here when it did not. No listener of its own (Gate B review of A-144): a new subscription
// makes auth-js emit INITIAL_SESSION, which can refresh a stored token once more. An error in the work
// never turns a session already taken into a failed reset (lib/recoveryLink.js).
async function setSessionSignedIn(auth, tokens) {
  const before = signedInRuns;
  const res = await auth.setSession(tokens);
  const session = res && !res.error && res.data ? res.data.session : null;
  if (session && session.user && session.user.id && signedInRuns === before && handler) {
    try { handler(session); } catch { /* the next cold start runs the sign-in path */ }
  }
  return res;
}

module.exports = { setSignInHandler, noteSignedIn, setSessionSignedIn };
