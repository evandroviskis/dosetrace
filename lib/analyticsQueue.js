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
// Council regulatory review (1.3.1): each entry carries the account that queued it (uid, on the
// entry only — the row itself stays anonymous); flush(uid) sends only that account's rows and drops
// every other one (another account's, or an untagged 1.3.0 row), so one account never sends
// another's rows. flush() without an account sends and drops nothing.
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
    add(row, uid) {
      return locked(async () => {
        const list = await read();
        list.push({ qid: `${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 8)}`, uid: uid || null, row });
        await write(list.slice(-max));
      }).catch(() => {});
    },
    clear() { return locked(() => write([])).catch(() => {}); },
    flush(uid) {
      if (!uid) return Promise.resolve();
      if (flushing) return flushing;
      flushing = (async () => {
        const list = await locked(read);
        const sent = new Set();
        for (const e of list) if (e.uid !== uid) sent.add(e.qid); // dropped, never sent: another account's
        for (const e of list) {
          if (e.uid !== uid) continue;
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

// The phone's last-known analytics choice ({ uid, out }), written whenever the account's choice is
// read (a foreground event, Settings) or changed (the Settings switch), and checked BEFORE a
// background event is queued (council regulatory review, 1.3.1). mayQueue(storedUser) is true only
// for a readable account that is not opted out:
//   - the stored session says opted out → false (and remembered);
//   - the phone remembers THIS account opted out → false (an opt-out wins over a stale session);
//   - the account's choice is unknown (not explicitly opted in) and the phone remembers an opt-out
//     (of any account) → false;
//   - the flag cannot be read → false (never queue on a maybe).
function createOptOutFlag({ storage, key }) {
  const UNREAD = {};
  let cache = UNREAD;
  const readFlag = async () => {
    if (cache !== UNREAD) return cache;
    const raw = await storage.getItem(key); // a throw → the caller treats it as unreadable
    let v = null;
    try { v = raw ? JSON.parse(raw) : null; } catch { v = null; }
    cache = v && typeof v === 'object' && typeof v.out === 'boolean' ? { uid: v.uid || null, out: v.out } : null;
    return cache;
  };
  async function remember(uid, out) {
    const next = { uid: uid || null, out: !!out };
    try {
      const cur = await readFlag();
      if (cur && cur.uid === next.uid && cur.out === next.out) return;
    } catch { /* write it anyway */ }
    cache = next;
    try { await storage.setItem(key, JSON.stringify(next)); } catch { /* the in-memory value still holds */ }
  }
  async function mayQueue(user) {
    const uid = user && user.id;
    if (!uid) return false;
    const choice = user.user_metadata ? user.user_metadata.analytics_opt_in : undefined;
    if (choice === false) { await remember(uid, true); return false; }
    let f;
    try { f = await readFlag(); } catch { return false; }
    if (f && f.out && (f.uid === uid || choice !== true)) return false;
    return true;
  }
  return { remember, mayQueue };
}

module.exports = { createAnalyticsQueue, createOptOutFlag };
