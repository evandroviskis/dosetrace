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
async function discardPreviousAccount(d) {
  const steps = [
    d.clearLocalDatabase, d.removeRcStart, d.clearRealityDeviceFlags, d.cancelAllNotifications,
    d.clearAllDrafts, d.resetAllSelections, d.removeQuestions, d.clearAIConsent, d.forgetLocalOwner,
  ];
  for (const step of steps) {
    try { await step(); } catch { /* keep discarding */ }
  }
}

// App's deferred sign-in work (SIGNED_IN and the cold start), before any import or sync.
// → 'continue' (go on with the import) | 'held' (the sheet is up; nothing more until the choice)
async function guardSignedIn(d, { sessionUser }) {
  let owner = null;
  try { owner = d.getLocalOwner(); } catch { owner = null; }
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
async function resolveAccountAsk(choice, d, { sessionUser }) {
  if (choice === 'discard') {
    await discardPreviousAccount(d);
    try { await d.rememberOwner(sessionUser); } catch { /* the next sign-in writes it */ }
    return 'continue';
  }
  try { await d.signOutLocally(); } catch { /* the sheet comes back on the next start */ }
  return 'signed_out';
}

// The DoseTrace sheet (DTSheet config). Locked: no way out without one of the two choices.
function accountAskSheet(t, { previous, onSave, onDiscard }) {
  const fill = (s) => String(s || '').split('{previous}').join(previous || '');
  return {
    icon: 'alert',
    locked: true,
    title: t('account_guard_title'),
    body: fill(t(previous ? 'account_guard_msg' : 'account_guard_msg_unknown')),
    buttons: [
      { label: t('account_guard_discard'), kind: 'danger', onPress: onDiscard },
      { label: fill(t(previous ? 'account_guard_save' : 'account_guard_save_unknown')), kind: 'primary', onPress: onSave },
    ],
  };
}

module.exports = { OWNER_KEY, ownerBlocksSync, crossAccountDecision, ownerLabelFor, discardPreviousAccount, guardSignedIn, resolveAccountAsk, accountAskSheet };
