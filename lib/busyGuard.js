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
module.exports = { createBusyGuard };
