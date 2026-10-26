'use strict';
// One run at a time (Gate B F4): while a run is in progress further calls are ignored (they return
// undefined); onChange(busy) drives a spinner. A failing run frees the guard and rethrows.
function createBusyGuard(onChange = () => {}) {
  let busy = false;
  return {
    async run(job) {
      if (busy) return undefined;
      busy = true;
      onChange(true);
      try { return await job(); } finally { busy = false; onChange(false); }
    },
    isBusy() { return busy; },
  };
}
// One action per opening of a window (A-132 / AD-80 data review 2026-10-26): take() is true once,
// then false until release() — called when the window opens again or shows an error inside it.
// A double tap on Save never runs the save twice, also while the window fades out.
function createOpenLatch() {
  let taken = false;
  return {
    take() { if (taken) return false; taken = true; return true; },
    release() { taken = false; },
  };
}
module.exports = { createBusyGuard, createOpenLatch };
