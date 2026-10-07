'use strict';
// A-107 (founder 2026-10-07, option B): the daily background refresh of the reminders scheduled on
// this phone, so they keep coming until the user deletes the protocol even if the app is never
// opened (docs/specs/background-refresh.md; journey review AC1-AC11). Plain CommonJS with every
// dependency injected (lib/backgroundTasks wires the real ones) so each rule is tested.
//
// What one run does: nothing if an account wipe is pending or no session is stored; otherwise
// open the database, switch the scheduler to background mode (stored session only, no network
// refresh, no immediate alerts, no writes that would be pushed), run the same non-destructive
// resync the app runs, leave background mode — always — and record when it ran and the result.

const LAST_RUN_KEY = 'dosetrace_refresh_last';

async function runReminderRefresh(d) {
  const at = d.now();
  const finish = async (ok, reason, scheduled = null) => {
    const r = { at, ok, reason, scheduled };
    try { await d.saveLastRun(r); } catch { /* best-effort */ }
    return r;
  };
  let wipe = null;
  try { wipe = await d.isWipePending(); } catch { wipe = null; }
  if (wipe) return finish(false, 'wipe_pending');
  try { d.ensureDb(); } catch { /* already open */ }
  d.setBackgroundRun(true);
  let outcome = null; // null = ran; otherwise the reason it did not
  try {
    const user = await d.readStoredUser();
    if (!user) outcome = 'signed_out';
    else await d.syncAllNotifications();
  } catch {
    outcome = 'error';
  } finally {
    d.setBackgroundRun(false); // every exit leaves background mode (council 3 QA P1)
  }
  if (outcome) return finish(false, outcome);
  let scheduled = null;
  try { scheduled = await d.countScheduled(); } catch { scheduled = null; }
  return finish(true, null, scheduled);
}

// A-110 RG-6: is this background notification the server's silent wake-up? It reaches the
// notification task in several shapes (direct data, a notification request, Android's dataString or
// body JSON); a user's tap on a real reminder never counts.
function isWakePayload(p, depth = 0) {
  if (!p || typeof p !== 'object' || depth > 5) return false;
  if (p.actionIdentifier) return false;
  if (p.type === 'refresh_wake') return true;
  for (const k of ['dataString', 'body']) {
    if (typeof p[k] === 'string' && p[k].includes('refresh_wake')) {
      try { const o = JSON.parse(p[k]); if (o && o.type === 'refresh_wake') return true; } catch { /* not JSON */ }
    }
  }
  for (const k of ['data', 'notification', 'request', 'content', 'payload']) {
    if (p[k] && typeof p[k] === 'object' && isWakePayload(p[k], depth + 1)) return true;
  }
  return false;
}

module.exports = { runReminderRefresh, isWakePayload, LAST_RUN_KEY };
