'use strict';
// One run at a time (council 2026-11-20): while a run is going, another call joins it (gets the same
// promise) instead of starting a second one; once it ends — resolved or thrown — the next call runs
// again. App.js uses it so the onboarding's draft is never inserted twice when the cold start and
// SIGNED_IN (or a confirmation link) overlap.
function singleRun(fn) {
  let running = null;
  return function run(...args) {
    if (running) return running;
    running = Promise.resolve().then(() => fn(...args));
    const clear = () => { running = null; };
    running.then(clear, clear);
    return running;
  };
}

module.exports = { singleRun };
