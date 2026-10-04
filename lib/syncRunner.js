'use strict';
// One sync pass at a time (Gate B F2). run(): start a pass, or share the one already running.
// forceSync(): wait for the running pass, then run one fresh pass (so "is everything backed up?"
// is asked after a complete push). waitIdle(): resolves when no pass is running (the intended
// sign-out wipe waits for it before deleting). Pure — the pass is passed in.
function createSyncRunner(pass) {
  let running = null;
  function start() {
    running = (async () => {
      try { await pass(); } finally { running = null; }
    })();
    return running;
  }
  return {
    run() { return running || start(); },
    async forceSync() {
      if (running) { try { await running; } catch { /* the fresh pass below retries */ } }
      return start();
    },
    async waitIdle() {
      while (running) { try { await running; } catch { /* idle either way */ } }
    },
    // Another job that must not overlap a pass (the first full import): waits, then runs alone;
    // passes requested meanwhile share it, and waitIdle waits for it too.
    async runExclusive(job) {
      while (running) { try { await running; } catch { /* idle */ } }
      running = (async () => { try { await job(); } finally { running = null; } })();
      return running;
    },
    isRunning() { return !!running; },
  };
}

module.exports = { createSyncRunner };
