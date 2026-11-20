'use strict';
// Where people stop in the onboarding (council 2026-11-20, product + UX): the steps shown, in order,
// and whether the intro video was watched to the end or skipped. Step names only — no answers, no
// health data, no account. Before the account exists nothing can be sent (analytics_events takes
// signed-in inserts only), so the steps wait on the phone and go as ONE anonymous event
// ('onboarding_funnel') right after the sign-in; lib/analytics applies the account's opt-out.
// Pure and storage-injected (node --test): lib/onboardingFunnelStore binds it to AsyncStorage.
const MAX_STEPS = 40;

function createFunnel({ storage, key = 'dosetrace_onboarding_funnel' }) {
  let chain = Promise.resolve();
  const locked = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const read = async () => {
    try {
      const raw = await storage.getItem(key);
      const v = raw ? JSON.parse(raw) : null;
      return v && Array.isArray(v.steps) ? { steps: v.steps.filter((x) => typeof x === 'string'), intro: v.intro || null } : { steps: [], intro: null };
    } catch { return { steps: [], intro: null }; }
  };
  const write = (v) => storage.setItem(key, JSON.stringify(v));
  return {
    // A step shown: added once, in the order first seen.
    note(step) {
      if (typeof step !== 'string' || !/^[a-z_]+$/.test(step)) return Promise.resolve();
      return locked(async () => {
        const v = await read();
        if (v.steps.includes(step) || v.steps.length >= MAX_STEPS) return;
        v.steps.push(step);
        await write(v);
      }).catch(() => {});
    },
    // The intro video: 'skipped' wins over a later 'finished' (she skipped, then tapped Começar).
    intro(kind) {
      if (kind !== 'skipped' && kind !== 'finished') return Promise.resolve();
      return locked(async () => {
        const v = await read();
        if (v.intro === 'skipped') return;
        v.intro = kind;
        await write(v);
      }).catch(() => {});
    },
    // After the sign-in: one event with the steps, then the record is cleared. Nothing noted = nothing sent.
    flush(log) {
      return locked(async () => {
        const v = await read();
        if (!v.steps.length && !v.intro) return false;
        await storage.removeItem(key);
        await log('onboarding_funnel', { steps: v.steps.join(','), last_step: v.steps[v.steps.length - 1] || null, intro: v.intro });
        return true;
      }).catch(() => false);
    },
  };
}

module.exports = { createFunnel, MAX_STEPS };
