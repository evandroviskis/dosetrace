'use strict';
// The cross-account guard (DV-242, AD-102 = B; behaviour-tested in __tests__/dv242CrossAccountWarn).
// When an account signs in on a phone whose local data belongs to ANOTHER account:
//   - nothing of the previous account is unsent → the discard runs at once, as before;
//   - rows were never backed up (or the count cannot be read: never discard on a maybe) → a
//     DoseTrace sheet names the previous account and offers "Sign in as {previous} first, to save"
//     (this account is signed out locally, nothing discarded) or "Discard and continue".
// The new account never sees the old data: App holds the UI on an empty screen while the owner is
// another account, and lib/sync runs no pass then (ownerBlocksSync).
// Pure: every effect is injected (App.js wires the real ones).

const OWNER_KEY = 'dosetrace_local_owner'; // { id, email } of the account the local data belongs to

function ownerBlocksSync(localOwnerId, sessionUserId) {
  return !!localOwnerId && !!sessionUserId && localOwnerId !== sessionUserId;
}

// → { action: 'none' | 'discard' | 'ask', pending }
function crossAccountDecision({ localOwnerId, sessionUserId, countPending }) {
  if (!ownerBlocksSync(localOwnerId, sessionUserId)) return { action: 'none', pending: 0 };
  let n = null;
  try { n = countPending(localOwnerId); } catch { n = null; }
  if (n === 0) return { action: 'discard', pending: 0 };
  return { action: 'ask', pending: Number.isFinite(n) ? n : null };
}

// The stored label names the owner only when it is for that same id (an update over 1.3.0 has none).
function ownerLabelFor(raw, localOwnerId) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v && v.id === localOwnerId && typeof v.email === 'string' && v.email ? v.email : null;
  } catch { return null; }
}

// The previous account's local data, reminders, drafts, open items, questions and AI consent. One
// failing step never stops the rest.
// Gate B 5: the reminders are cancelled and the delivered ones dismissed FIRST, so a kill before
// the database is cleared never leaves the previous account's reminders firing for the new one.
async function discardPreviousAccount(d) {
  const steps = [
    d.cancelAllNotifications, d.dismissAllNotifications,
    d.clearLocalDatabase, d.removeRcStart, d.clearRealityDeviceFlags,
    d.clearAllDrafts, d.resetAllSelections, d.removeQuestions, d.clearAIConsent, d.forgetLocalOwner,
    d.clearAnalyticsQueue, // council regulatory review (1.3.1): the previous account's queued analytics rows
    d.clearTeamMessages, // A-163: the previous account's kept team messages
  ];
  for (const step of steps) {
    try { await step(); } catch { /* keep discarding */ }
  }
}

// App's deferred sign-in work (SIGNED_IN and the cold start), before any import or sync.
// → 'continue' (go on with the import) | 'held' (the sheet is up; nothing more until the choice)
// Gate B 3 + re-verification 2: fails closed — an owner that cannot be read (a read error, never
// "no rows") holds and asks Try again / Sign out. Never Discard: the unread data may be this same
// account's unsent rows. A fresh install (no owner, no error) goes straight on.
async function guardSignedIn(d, { sessionUser }) {
  let owner = null;
  try { owner = d.getLocalOwner(); } catch {
    d.ask({ unreadable: true, previous: null, pending: null, userId: sessionUser && sessionUser.id });
    return 'held';
  }
  const decision = crossAccountDecision({ localOwnerId: owner, sessionUserId: sessionUser && sessionUser.id, countPending: d.countPending });
  if (decision.action === 'ask') {
    let raw = null;
    try { raw = await d.readOwnerLabel(); } catch { raw = null; }
    d.ask({ previous: ownerLabelFor(raw, owner), pending: decision.pending, userId: sessionUser.id });
    return 'held';
  }
  if (decision.action === 'discard') await discardPreviousAccount(d);
  try { await d.rememberOwner(sessionUser); } catch { /* the next sign-in writes it */ }
  return 'continue';
}

// The person's choice on the sheet. 'save': this account is signed out locally (not an intended
// sign-out, so nothing is wiped) and the sign-in screen opens. 'discard': the discard, then go on.
async function resolveAccountAsk(choice, d, { sessionUser, lastAsk = null }) {
  if (choice === 'discard') {
    await discardPreviousAccount(d);
    try { await d.rememberOwner(sessionUser); } catch { /* the next sign-in writes it */ }
    return 'continue';
  }
  // Gate B 4 (same rule): a sign-out that did not happen brings the sheet back with an error.
  let r = null;
  try { r = await d.signOutLocally(); } catch { r = null; }
  if (!(r && r.signedOut)) {
    d.ask({ ...(lastAsk || { previous: null, pending: null }), error: true });
    return 'retry';
  }
  return 'signed_out';
}

// Gate B 4: "Discard and continue" needs the current session; when it cannot be read the sheet comes
// back (with an error line) instead of leaving the holding screen without buttons. Nothing is
// discarded until the session is known. → { status: 'continue', session } | { status: 'retry' }
async function discardAndContinue(d, { lastAsk }) {
  let s = null;
  try { s = await d.getSession(); } catch { s = null; }
  if (!s || !s.user) {
    d.ask({ ...(lastAsk || { previous: null, pending: null }), error: true });
    return { status: 'retry' };
  }
  await resolveAccountAsk('discard', d, { sessionUser: s.user });
  return { status: 'continue', session: s };
}

// The DoseTrace sheet (DTSheet config). Locked: no way out without one of the two choices.
// error: the last choice could not be carried out — the app's generic "try again" line under it.
// unreadable: the owner could not be read — its own title and line (DV-242 option B, founder
// 2026-10-20: says what happened, that nothing was deleted, and what to do), Try again (the guard
// runs again) and Sign out (on this phone only, nothing wiped).
function accountAskSheet(t, { previous, error = false, unreadable = false, onSave, onDiscard, onRetry, onSignOut }) {
  if (unreadable) {
    return {
      icon: 'alert',
      locked: true,
      title: t('account_guard_unreadable_title'),
      body: t('account_guard_unreadable_msg'),
      buttons: [
        { label: t('settings_signout'), kind: 'secondary', onPress: onSignOut },
        { label: t('pw_try_again'), kind: 'primary', onPress: onRetry },
      ],
    };
  }
  const fill = (s) => String(s || '').split('{previous}').join(previous || '');
  return {
    icon: 'alert',
    locked: true,
    ...(error ? { note: t('error_generic') } : {}),
    title: t('account_guard_title'),
    body: fill(t(previous ? 'account_guard_msg' : 'account_guard_msg_unknown')),
    buttons: [
      { label: t('account_guard_discard'), kind: 'danger', onPress: onDiscard },
      { label: fill(t(previous ? 'account_guard_save' : 'account_guard_save_unknown')), kind: 'primary', onPress: onSave },
    ],
  };
}

module.exports = { OWNER_KEY, ownerBlocksSync, crossAccountDecision, ownerLabelFor, discardPreviousAccount, guardSignedIn, resolveAccountAsk, discardAndContinue, accountAskSheet };
