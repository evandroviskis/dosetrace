'use strict';
// The deliberate sign-out flow as plain logic (Gate B F7: behaviour-tested, no source pins), shared
// by every entry point: Settings, the 18+ sheet, the profile gate and the reset-link account switch
// (A-119 OD-9: one flow, one sheet).
//   signOut(opts) → lib/accountActions signOutIntended; guard → lib/busyGuard (F4);
//   onFailed() → "Couldn't sign out" (F1); onBlocked(r, signOutAnyway) → the one sheet
//   (lib/deviceCopy signOutSheet) built from r: { offline, summary, lastBackup } — sign-out is never
//   refused: "Sign out anyway" is always offered.
// → 'busy' | 'failed' | 'blocked' | 'done'

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
    onBlocked(r, anyway);
    return 'blocked';
  }
  if (!r || r.blocked !== false) { onFailed(); return 'failed'; } // no answer is never "done"
  return 'done';
}

module.exports = { runSignOut };
