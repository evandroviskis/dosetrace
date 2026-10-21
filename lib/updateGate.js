'use strict';
// A-127: WHEN the required screen and the invitation may appear (review round 1, items 1-2). Plain
// CommonJS, every dependency injected (components/useUpdateNotice wires React state, the navigator,
// lib/sheetPresence and setTimeout; __tests__/updateNoticeReview.test.js wires fakes).
//
// Both WAIT for a calm screen (lib/updateRules screenAllows: no Modal open, the tab screens — or the
// sign-in screens for the required one) and are re-checked when it may have become calm: a Modal
// closes (sheets.subscribe), the route changes (poke, from the navigator's onStateChange), the app
// state around it changes (poke). They are checked again RIGHT BEFORE they are shown, after every
// await. The required screen therefore never replaces the app while a form is open (what was typed
// stays); turning it off is at once. An invitation waits while the app is in the foreground; going
// to the background drops it (the next open asks again).

const { screenAllows } = require('./updateRules');

function createUpdateGate(d) {
  const firstScreenMs = d.firstScreenMs != null ? d.firstScreenMs : 1500;
  let shownRequired = null;
  let pendingRequired = null;
  let pendingInvite = null; // { forced }
  let delayDone = false;
  let timer = null;
  let reading = Promise.resolve();
  let inFlight = false;
  let disposed = false;
  const ctx = () => d.ctx() || {};
  const calm = (kind) => screenAllows({ rootState: d.rootState(), sheets: d.sheets.count(), kind });
  const unsub = d.sheets.subscribe(() => tryApply());

  function inviteAllowed(c) {
    return !!pendingInvite && !shownRequired && !pendingRequired && !!c.uid && !!c.onMain && !c.blocked && calm('invite');
  }

  async function maybeInvite() {
    const c = ctx();
    if (!inviteAllowed(c)) return;
    inFlight = true;
    try {
      try { await reading; } catch { /* the cache decides */ }
      try { await d.flow.flushPending(c.uid); } catch { /* next open */ }
      const forced = !!(pendingInvite && pendingInvite.forced);
      let inv = null;
      try { inv = await d.flow.inviteCandidate({ meta: c.meta || {}, userId: c.uid, language: c.language, forced }); } catch { inv = null; }
      if (disposed) return;
      if (!inv) { pendingInvite = null; return; } // nothing to invite to on this open
      const now = ctx();
      // Re-checked right before showing: a sheet opened, the person left the tabs, signed out…
      if (now.uid !== c.uid || !inviteAllowed(now)) return; // stays pending: shown when calm
      pendingInvite = null;
      d.onInvite({ ...inv, userId: c.uid });
      try { await d.flow.recordShown(inv.version); } catch { /* best effort */ }
    } finally {
      inFlight = false;
    }
  }

  function tryApply() {
    if (disposed) return;
    if (pendingRequired && calm('required')) {
      shownRequired = pendingRequired;
      pendingRequired = null;
      d.onRequired(shownRequired);
    }
    if (pendingInvite && delayDone && !inFlight) maybeInvite();
  }

  return {
    // After every server read, a device-state change, a language change.
    async evalRequired() {
      const c = ctx();
      let st = null;
      try { st = await d.flow.state({ language: c.language, signedIn: !!c.uid }); } catch { return; }
      if (disposed) return;
      const next = st && st.required;
      if (!next) {
        pendingRequired = null;
        shownRequired = null;
        d.onRequired(null); // an unlock is always at once
        tryApply();
        return;
      }
      if (shownRequired) { shownRequired = next; d.onRequired(next); return; } // the reason line follows the language
      pendingRequired = next;
      tryApply();
    },
    // At app open (Main up for the first time, each foreground) or from a push tap (forced).
    requestInvite(forced) {
      pendingInvite = { forced: !!forced || !!(pendingInvite && pendingInvite.forced) };
      delayDone = false;
      if (timer != null) d.clearTimer(timer);
      timer = d.setTimer(() => { timer = null; delayDone = true; tryApply(); }, firstScreenMs);
    },
    setReading(p) { reading = p || Promise.resolve(); },
    poke: () => tryApply(),
    background() { pendingInvite = null; if (timer != null) { d.clearTimer(timer); timer = null; } },
    dispose() { disposed = true; unsub(); if (timer != null) d.clearTimer(timer); },
  };
}

module.exports = { createUpdateGate };
