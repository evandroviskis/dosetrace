'use strict';
// One sync pass at a time (Gate B F2). run(): start a pass, or share the one already running.
// forceSync(): wait for the running pass, then run one fresh pass (so "is everything backed up?"
// is asked after a complete push). waitIdle(): resolves when no pass is running (the intended
// sign-out wipe waits for it before deleting). Pure — the pass is passed in.
function createSyncRunner(pass) {
  let running = null;
  // A-93: a job clears `running` only if it is still its own promise (a job queued after it must
  // never be marked idle by an earlier job's finally).
  // The job starts after a microtask, so `p` exists before its finally runs even when fn throws
  // synchronously (council 2: a synchronous throw used to leave `running` stuck).
  function launch(fn) {
    let p = null;
    p = (async () => {
      await null;
      try { await fn(); } finally { if (running === p) running = null; }
    })();
    running = p;
    return p;
  }
  function start() { return launch(pass); }
  return {
    run() { return running || start(); },
    async forceSync() {
      // Wait until NOTHING runs (an exclusive job may have been queued on the same pass), A-93.
      while (running) { try { await running; } catch { /* the fresh pass below retries */ } }
      return start();
    },
    async waitIdle() {
      while (running) { try { await running; } catch { /* idle either way */ } }
    },
    // Another job that must not overlap a pass (the first full import): waits, then runs alone;
    // passes requested meanwhile share it, and waitIdle waits for it too.
    async runExclusive(job) {
      while (running) { try { await running; } catch { /* idle */ } }
      return launch(job);
    },
    isRunning() { return !!running; },
  };
}

module.exports = { createSyncRunner };
