'use strict';
// The background analytics queue (re-verification E, DV-184 / INV-06). In background mode
// lib/analytics never touches the auth client, so an event's anonymous row waits here (AsyncStorage)
// and goes with the next event logged in the foreground.
//   - a row leaves the queue only after its send succeeded (an { error } reply or a throw keeps it,
//     and the rows after it, for the next flush);
//   - one flush at a time (a second call joins the running one), so no row is sent twice;
//   - the queue's read-modify-writes run one after another, and a flush removes only the rows it
//     sent (by id), so an event queued while a flush is sending is never lost.
// At least once: a process killed between a send and its removal sends that row again later.
// CommonJS, no React Native: driven by __tests__/analyticsQueue.test.js.
function createAnalyticsQueue({ storage, key, send, max = 50 }) {
  let chain = Promise.resolve();
  const locked = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const read = async () => {
    try {
      const raw = await storage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((e) => e && e.qid && e.row) : [];
    } catch { return []; }
  };
  const write = (list) => storage.setItem(key, JSON.stringify(list));
  let seq = 0;
  let flushing = null;
  return {
    add(row) {
      return locked(async () => {
        const list = await read();
        list.push({ qid: `${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 8)}`, row });
        await write(list.slice(-max));
      }).catch(() => {});
    },
    clear() { return locked(() => write([])).catch(() => {}); },
    flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        const list = await locked(read);
        const sent = new Set();
        for (const e of list) {
          let ok = false;
          try { const res = await send(e.row); ok = !(res && res.error); } catch { ok = false; }
          if (!ok) break;
          sent.add(e.qid);
        }
        if (sent.size) await locked(async () => { const now = await read(); await write(now.filter((e) => !sent.has(e.qid))); });
      })().catch(() => {}).finally(() => { flushing = null; });
      return flushing;
    },
  };
}

module.exports = { createAnalyticsQueue };
