'use strict';
// A-119 DL-102 / OD-14: only a sign-in the PERSON makes on a phone with no session takes the account
// over — email/password (and Create account), Google, Apple (iPhone and the Android web flow), the new
// password from a reset link. A session restored at start-up, a token refresh, a re-auth on a phone
// already signed in and an Android headless start never do. The screen that starts such a sign-in
// arms this flag (beginExplicitSignIn) and ends it in its finally (endExplicitSignIn). App.js's
// sign-in work reads it ONCE (consumeExplicitSignIn: synchronous and pure — safe at the top of the work
// that onAuthStateChange runs inline). isExplicitSignIn stays true until the starter ends it, so the
// profile write the same sign-in makes (the Apple name) is allowed before the takeover is settled.
// Plain CommonJS (node --test).

const TTL_MS = 3 * 60 * 1000; // an abandoned sign-in (e.g. the app left on Google's sheet)

let armedAt = null;
let used = false;
const now = () => Date.now();

function beginExplicitSignIn() { armedAt = now(); used = false; }
function endExplicitSignIn() { armedAt = null; used = false; }
function isExplicitSignIn() {
  if (armedAt == null) return false;
  const age = now() - armedAt;
  if (age < 0 || age > TTL_MS) { armedAt = null; used = false; return false; }
  return true;
}
// Once per sign-in: the takeover is asked for by one run of the sign-in work only.
function consumeExplicitSignIn() {
  const v = isExplicitSignIn() && !used;
  if (v) used = true;
  return v;
}

module.exports = { beginExplicitSignIn, endExplicitSignIn, isExplicitSignIn, consumeExplicitSignIn, TTL_MS };
