'use strict';
// DV-114 (DL-92; founder 2026-11-01, picture docs/design/rodada2-conta-exames.html #dv114): the two
// account gates — "Confirm your age" (screens/AgeConfirmScreen) and "Finish your profile" (the
// signed-in onboarding, screens/OnboardingFlowScreen) — can be answered without internet. The answer
// is kept on the phone (durable, survives a restart), the person goes on into the app, and the answer
// is written to the account when the phone is online (on the next app open, sign-in, connection back
// or return to the app). Pure core (node --test); lib/pendingGateStore wires it to the phone.
//
// How the gate decides with an answer still on the phone (App.js): the gates read the account's
// user_metadata with this phone's pending answer laid over it (withPendingAnswer) — only for the same
// account. So the gate passes on exactly the keys the write will send, before and after it lands
// (after it lands, the account itself has them and the pending answer is removed).
//
// Never lost: the answer leaves the phone only after the account accepted it; a write that fails
// (offline, server down) or is refused keeps it and tries again later. The write is merge-only: it
// sends only the answer's own keys, never the whole metadata object.

const KEY = 'dosetrace_pending_gate';

// The account's user with this phone's pending answer laid over its metadata (same account only).
function withPendingAnswer(user, pending) {
  if (!user || !pending || !pending.patch || pending.userId !== user.id) return user;
  return { ...user, user_metadata: { ...(user.user_metadata || {}), ...pending.patch } };
}

// A write that could not reach the server (no internet): the answer waits on the phone. Anything
// else the server said is a refusal and is said as such (never "saved on this phone").
function isOfflineError(err) {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  if (err.status === 0) return true;
  const m = String(err.message || err.error || err || '').toLowerCase();
  return /network request failed|failed to fetch|fetch failed|network ?error|internet|offline|timed? ?out|econn|enotfound|socket/.test(m);
}
// Worth trying again later without telling anyone: offline, or the server busy / down.
function isRetryableError(err) {
  if (isOfflineError(err)) return true;
  const st = Number(err && err.status);
  return st === 429 || (st >= 500 && st < 600);
}

// deps: { storage (getItem/setItem/removeItem), getSessionUserId: async () => id | null,
//         updateUser: async (patch) => ({ error }) }
function createPendingGate(deps) {
  let pending = null;
  let ready = false;
  let inFlight = null;
  const listeners = new Set();
  const emit = (event) => { for (const fn of [...listeners]) { try { fn(event); } catch { /* ignore */ } } };

  async function load() {
    try {
      const raw = await deps.storage.getItem(KEY);
      const v = raw ? JSON.parse(raw) : null;
      pending = v && v.userId && v.patch && typeof v.patch === 'object' ? v : null;
    } catch { pending = pending || null; }
    ready = true;
    emit({ type: 'change' });
    return pending;
  }

  // Keep an answer on the phone (merged with an earlier one of the same account). true only when it
  // is stored durably — otherwise the screen must not say it was saved.
  async function save(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return false;
    const base = pending && pending.userId === userId ? pending.patch : {};
    const next = { userId, patch: { ...base, ...patch }, at: new Date().toISOString() };
    try { await deps.storage.setItem(KEY, JSON.stringify(next)); } catch { return false; }
    pending = next;
    ready = true;
    emit({ type: 'change' });
    emit({ type: 'saved' });
    return true;
  }

  // Write the answer to the account, once. → { status: 'none' | 'other_user' | 'written' |
  // 'offline' | 'refused', error? }. One write at a time; a call while one runs shares it.
  function flush() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      if (!ready) await load();
      const p = pending;
      if (!p) return { status: 'none' };
      let uid = null;
      try { uid = await deps.getSessionUserId(); } catch { uid = null; }
      if (!uid) return { status: 'offline' }; // no session readable yet: later
      if (uid !== p.userId) return { status: 'other_user' }; // kept for its own account
      let error = null;
      try { ({ error } = (await deps.updateUser(p.patch)) || {}); } catch (e) { error = e || new Error('write failed'); }
      if (error) {
        if (isRetryableError(error)) return { status: 'offline', error };
        emit({ type: 'refused', error });
        return { status: 'refused', error };
      }
      // Written. Removed from the phone only if no newer answer arrived meanwhile.
      if (pending === p) {
        try { await deps.storage.removeItem(KEY); } catch { /* the next flush writes the same keys again: harmless */ }
        pending = null;
        emit({ type: 'change' });
      }
      return { status: 'written' };
    })();
    const done = inFlight;
    done.finally(() => { if (inFlight === done) inFlight = null; }).catch(() => {});
    return done;
  }

  return {
    load, save, flush,
    get: () => pending,
    isReady: () => ready,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// The gate screen's save: the write to the account first; offline → kept on the phone and the
// person goes on ({ status: 'pending' }, the toast); a refusal → { status: 'failed', error } and the
// screen says so and stays.
async function answerGate({ userId, patch, write, gate, knownOffline = false }) {
  let error = null;
  if (!knownOffline) {
    try { ({ error } = (await write()) || {}); } catch (e) { error = e || new Error('write failed'); }
    if (!error) return { status: 'saved' };
    if (!isOfflineError(error)) return { status: 'failed', error };
  }
  const kept = await gate.save(userId, patch);
  if (!kept) return { status: 'failed', error: error || new Error('not stored') };
  return { status: 'pending' };
}

module.exports = { KEY, withPendingAnswer, isOfflineError, isRetryableError, createPendingGate, answerGate };
