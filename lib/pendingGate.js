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

// A write that could not reach the server (no internet): the answer waits on the phone.
function isOfflineError(err) {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  if (err.status === 0) return true;
  const m = String(err.message || err.error || err || '').toLowerCase();
  return /network request failed|failed to fetch|fetch failed|network ?error|internet|offline|timed? ?out|econn|enotfound|socket/.test(m);
}
// Temporary — the answer waits on the phone and is tried again later without telling anyone:
// offline, or the server busy / down (429, 5xx). The gate and the flush use this ONE rule (Gate B 4);
// anything else the server said is a refusal and is said as such (never "saved on this phone").
function isRetryableError(err) {
  if (isOfflineError(err)) return true;
  const st = Number(err && err.status);
  return st === 429 || (st >= 500 && st < 600);
}

// deps: { storage (getItem/setItem/removeItem), getSessionUserId: async () => id | null,
//         updateUser: async (patch) => ({ error }) }
//
// Gate B 1: one kept answer PER ACCOUNT (stored as { byUser: { <id>: { patch, at } } }) — another
// account answering a gate on this phone never drops the first one's answer; each is written only
// for its own account. It counts as one unsent change for the deliberate sign-out (countFor) and goes
// only with that account (clear: after the sign-out, "Sign out anyway" included, or a deletion).
function createPendingGate(deps) {
  let answers = {}; // userId → { userId, patch, at }
  let ready = false;
  let inFlight = null;
  // Gate B 3: every change of the kept answers (save, clear, the clear after a write) runs one after
  // the other, each reading them as the one before left them — a save that lands while the written
  // answer is being removed is never erased, in memory or on the phone.
  let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  const listeners = new Set();
  const emit = (event) => { for (const fn of [...listeners]) { try { fn(event); } catch { /* ignore */ } } };

  // The stored form → { userId: entry }. The one-answer form written before Gate B 1
  // ({ userId, patch }) is read as that account's answer.
  function parse(raw) {
    const v = raw ? JSON.parse(raw) : null;
    const out = {};
    if (v && v.byUser && typeof v.byUser === 'object') {
      for (const id of Object.keys(v.byUser)) {
        const e = v.byUser[id];
        if (e && e.patch && typeof e.patch === 'object') out[id] = { userId: id, patch: e.patch, at: e.at || null };
      }
    } else if (v && v.userId && v.patch && typeof v.patch === 'object') {
      out[v.userId] = { userId: v.userId, patch: v.patch, at: v.at || null };
    }
    return out;
  }
  // Writes the given answers to the phone (removes the key when none is left). Throws on failure.
  async function persist(next) {
    const ids = Object.keys(next);
    if (!ids.length) { await deps.storage.removeItem(KEY); return; }
    const byUser = {};
    for (const id of ids) byUser[id] = { patch: next[id].patch, at: next[id].at };
    await deps.storage.setItem(KEY, JSON.stringify({ byUser }));
  }
  const without = (id) => { const next = { ...answers }; delete next[id]; return next; };

  async function load() {
    try { answers = parse(await deps.storage.getItem(KEY)); } catch { /* unreadable: keep what memory has */ }
    ready = true;
    emit({ type: 'change' });
    return answers;
  }

  // Keep an answer on the phone (merged with an earlier one of the same account). true only when it
  // is stored durably — otherwise the screen must not say it was saved.
  function save(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return Promise.resolve(false);
    return serial(async () => {
      const base = answers[userId] ? answers[userId].patch : {};
      const next = { ...answers, [userId]: { userId, patch: { ...base, ...patch }, at: new Date().toISOString() } };
      try { await persist(next); } catch { return false; }
      answers = next;
      ready = true;
      emit({ type: 'change' });
      emit({ type: 'saved' });
      return true;
    });
  }

  // The account's kept answer goes from the phone (its deliberate sign-out or deletion).
  function clear(userId) {
    return serial(async () => {
      if (!userId || !answers[userId]) return;
      const next = without(userId);
      try { await persist(next); } catch { return; } // still on the phone: kept in memory too
      answers = next;
      emit({ type: 'change' });
    });
  }

  // Gate B 2: the account saved these keys itself (Settings > Edit profile) — newer than the kept
  // answer, so they leave it and are never sent over the newer values; the rest is still sent. An
  // answer left with no key goes from the phone.
  function drop(userId, keys) {
    return serial(async () => {
      const cur = userId && answers[userId];
      if (!cur || !Array.isArray(keys) || !keys.some((k) => k in cur.patch)) return;
      const patch = { ...cur.patch };
      for (const k of keys) delete patch[k];
      const next = Object.keys(patch).length ? { ...answers, [userId]: { ...cur, patch } } : without(userId);
      try { await persist(next); } catch { return; } // unchanged on the phone: unchanged in memory
      answers = next;
      emit({ type: 'change' });
    });
  }

  // Write the signed-in account's answer to it, once. → { status: 'none' | 'other_user' | 'written'
  // | 'offline' | 'refused', error? }. One write at a time; a call while one runs shares it.
  function flush() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      if (!ready) await load();
      if (!Object.keys(answers).length) return { status: 'none' };
      let uid = null;
      try { uid = await deps.getSessionUserId(); } catch { uid = null; }
      if (!uid) return { status: 'offline' }; // no session readable yet: later
      const p = answers[uid];
      if (!p) return { status: 'other_user' }; // only other accounts' answers: kept for them
      let error = null;
      try { ({ error } = (await deps.updateUser(p.patch)) || {}); } catch (e) { error = e || new Error('write failed'); }
      if (error) {
        if (isRetryableError(error)) return { status: 'offline', error };
        emit({ type: 'refused', error });
        return { status: 'refused', error };
      }
      // Written. Removed from the phone only if no newer answer arrived meanwhile (in the queue, so
      // no save can land between the check and the removal).
      await serial(async () => {
        if (answers[uid] !== p) return; // a newer answer (it holds these keys too): sent by the next flush
        const next = without(uid);
        try { await persist(next); } catch { /* the next flush writes the same keys again: harmless */ }
        answers = next;
        emit({ type: 'change' });
      });
      return { status: 'written' };
    })();
    const done = inFlight;
    done.finally(() => { if (inFlight === done) inFlight = null; }).catch(() => {});
    return done;
  }

  return {
    load, save, clear, drop, flush,
    get: (userId) => (userId && answers[userId]) || null,
    countFor: (userId) => (userId && answers[userId] ? 1 : 0),
    isReady: () => ready,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// Gate B 1: the deliberate sign-out's "not in your account yet" facts with the kept answer in them —
// one more change, of the kind "profile" (lib/unsentSummary KIND_ORDER). An unreadable count (null)
// stays unreadable.
function addGateToSummary(summary, n) {
  if (!summary || typeof summary.count !== 'number' || !(n > 0)) return summary;
  return { ...summary, count: summary.count + n, byKind: { ...(summary.byKind || {}), profile: ((summary.byKind || {}).profile || 0) + n } };
}

// The gate screen's save: the write to the account first; offline or the server busy / down → kept
// on the phone and the person goes on ({ status: 'pending' }, the toast); a refusal → { status:
// 'failed', error } and the screen says so and stays.
async function answerGate({ userId, patch, write, gate, knownOffline = false }) {
  let error = null;
  if (!knownOffline) {
    try { ({ error } = (await write()) || {}); } catch (e) { error = e || new Error('write failed'); }
    if (!error) return { status: 'saved' };
    if (!isRetryableError(error)) return { status: 'failed', error };
  }
  const kept = await gate.save(userId, patch);
  if (!kept) return { status: 'failed', error: error || new Error('not stored') };
  return { status: 'pending' };
}

module.exports = { KEY, withPendingAnswer, isOfflineError, isRetryableError, createPendingGate, answerGate, addGateToSummary };
