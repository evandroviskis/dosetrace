'use strict';
// Settings' sign-out flow as plain logic (Gate B F7: behaviour-tested, no source pins).
//   signOut(opts) → lib/accountActions signOutIntended; guard → lib/busyGuard (F4);
//   onFailed() → "Couldn't sign out" (F1); onBlocked(copy, signOutAnyway) → the sheet with the
//   two choices and the words for the cause (F3).
// → 'busy' | 'failed' | 'blocked' | 'done'
const { blockedCopy } = require('./signOutCore');

async function runSignOut({ signOut, guard, onFailed, onBlocked }) {
  const r = await guard.run(() => signOut()).catch(() => ({ failed: true }));
  if (r === undefined) return 'busy';
  if (r && r.failed) { onFailed(); return 'failed'; }
  if (r && r.blocked) {
    const anyway = async () => {
      const f = await guard.run(() => signOut({ force: true })).catch(() => ({ failed: true }));
      if (f && f.failed) onFailed();
      return f;
    };
    onBlocked(blockedCopy(r), anyway);
    return 'blocked';
  }
  return 'done';
}

module.exports = { runSignOut };
