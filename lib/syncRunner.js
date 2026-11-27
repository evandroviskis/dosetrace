'use strict';
// One sync pass at a time (Gate B F2). run(): start a pass, or share the one already running —
// except a request that arrives once a pass has started, which gets ONE follow-up pass after it
// (2026-11-27, see below).
// forceSync(): wait for the running pass, then run one fresh pass (so "is everything backed up?"
// is asked after a complete push). waitIdle(): resolves when no pass is running (the intended
// sign-out wipe waits for it before deleting). Pure — the pass is passed in.
function createSyncRunner(pass) {
  let running = null;
  // The running job: { kind: 'pass' | 'exclusive', started }. `started` only matters for two run()
  // calls in the same tick (the pass has not read anything yet, so they share it).
  let current = null;
  // How-to recording 2026-11-27: a request that arrives once a pass has started (an Undo ~2 s
  // after Mark complete) must not just share it — that pass already read its pending rows, so the
  // change would wait for some later sync. It asks for ONE more pass right after (shared by every
  // such request), launched inside the finally so `running` never drops to null in between
  // (waitIdle / forceSync / runExclusive keep waiting; never two at once).
  let again = null;
  // A-93: a job clears `running` only if it is still its own promise (a job queued after it must
  // never be marked idle by an earlier job's finally).
  // The job starts after a microtask, so `p` exists before its finally runs even when fn throws
  // synchronously (council 2: a synchronous throw used to leave `running` stuck).
  function launch(fn, kind = 'exclusive') {
    const job = { kind, started: false };
    let p = null;
    p = (async () => {
      await null;
      job.started = true;
      try { await fn(); } finally {
        if (running === p) {
          running = null; current = null;
          if (again) { const a = again; again = null; launch(pass, 'pass').then(a.resolve, a.reject); }
        }
      }
    })();
    running = p; current = job;
    return p;
  }
  function start() { return launch(pass, 'pass'); }
  return {
    run() {
      if (!running) return start();
      if (current && current.kind === 'pass' && current.started) {
        if (!again) {
          let resolve, reject;
          const promise = new Promise((ok, ko) => { resolve = ok; reject = ko; });
          promise.catch(() => {}); // a caller that ignores it never raises an unhandled rejection
          again = { promise, resolve, reject };
        }
        return again.promise;
      }
      return running;
    },
    async forceSync() {
      // Wait until NOTHING runs (an exclusive job may have been queued on the same pass), A-93.
      while (running) { try { await running; } catch { /* the fresh pass below retries */ } }
      return start();
    },
    async waitIdle() {
      while (running) { try { await running; } catch { /* idle either way */ } }
    },
    // Another job that must not overlap a pass (the first full import): waits, then runs alone;
    // passes requested while IT runs share it, and waitIdle waits for it too. A follow-up asked
    // during the pass it waits on runs first (that request's change is pushed before the import).
    async runExclusive(job) {
      while (running) { try { await running; } catch { /* idle */ } }
      return launch(job, 'exclusive');
    },
    isRunning() { return !!running; },
  };
}

module.exports = { createSyncRunner };
