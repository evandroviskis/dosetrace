// A-110 RG-6 (founder 2026-10-07): the daily silent wake-up. Pure — imported by index.ts (Deno)
// and by __tests__/remindersGuaranteed.test.js (node).
//
// One data-only, high-priority message per Android device: no title, no body, no sound — nothing is
// shown and nothing private travels. It only wakes the app's background task, which runs the same
// reminder refresh as the 6-hourly Android task (lib/backgroundTasks). iOS is never sent one (it
// keeps its local reminders and no background mode).
export const WAKE_TYPE = 'refresh_wake';

export function wakeMessages(tokens) {
  const seen = new Set();
  const out = [];
  for (const t of tokens || []) {
    if (!t || t.platform !== 'android' || !t.expo_token || seen.has(t.expo_token)) continue;
    seen.add(t.expo_token);
    out.push({ to: t.expo_token, data: { type: WAKE_TYPE }, priority: 'high', _contentAvailable: true });
  }
  return out;
}

// Tokens Expo says no longer exist (app uninstalled) — removed so they stop being sent to.
export function deadTokens(slice, receipts) {
  const dead = [];
  for (let i = 0; i < (slice || []).length; i++) {
    const r = (receipts || [])[i];
    if (r && r.details && r.details.error === 'DeviceNotRegistered') dead.push(slice[i].to);
  }
  return dead;
}
