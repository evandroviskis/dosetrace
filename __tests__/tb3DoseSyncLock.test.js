'use strict';
// DT Council, test build 3 (2026-10-17), item 1: syncAllDoseReminders runs were not serialized.
// Skip / Undo now start extra runs; an older run that read the state BEFORE the Skip and finishes
// LAST re-armed the skipped slot. Runs now go one at a time through a promise chain (like
// withSnoozeLock), so the run started last — with the latest state — always has the last word.
// The real syncAllDoseReminders from lib/notifications.js, with its collaborators faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock, read } = require('./helpers/extractFn');

function loadSync(fakes) {
  const src = read('lib/notifications.js');
  const parts = [];
  for (const decl of ['let doseSyncLock = Promise.resolve();', 'let doseSyncRunning = null;', 'let doseSyncNext = null;']) if (src.includes(decl)) parts.push(decl);
  const outer = src.includes('export function syncAllDoseReminders(') ? 'export function syncAllDoseReminders(' : 'export async function syncAllDoseReminders(';
  parts.push(sliceBlock(src, outer).replace(/^export\s+/, ''));
  if (src.includes('async function syncAllDoseRemindersNow(')) parts.push(sliceBlock(src, 'async function syncAllDoseRemindersNow('));
  const body = `${parts.join('\n')}\nreturn syncAllDoseReminders;`;
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(fakes), body)(...Object.values(fakes));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('TB3-1: an older run that finishes last never re-arms a slot handled after it started', async () => {
  const state = { handled: false }; // the 12:25 slot: owed, then Skipped
  const scheduled = new Set(['dose-3-2026-10-17-t0']);
  let calls = 0;
  const fakes = {
    usesServerPush: () => false,
    getCachedUser: async () => ({ id: 'u', user_metadata: {} }),
    cancelAllDoseReminders: async () => {},
    getActiveProtocols: () => [{ id: 3 }],
    getNotifications: () => ({ getAllScheduledNotificationsAsync: async () => [...scheduled].map((identifier) => ({ identifier })), cancelScheduledNotificationAsync: async (id) => { scheduled.delete(id); } }),
    orphanDoseIds: () => [],
    getActiveVials: () => [],
    Platform: { OS: 'ios' },
    doseBudget: () => ({ perProtocol: 24, windowDays: 3 }),
    // The real one reads the day's rows, then awaits the notification calls: model that gap.
    scheduleDoseReminder: async () => {
      calls += 1;
      const handled = state.handled; // read at the start of the run
      await sleep(calls === 1 ? 60 : 5); // the first (older) run is the slow one
      if (handled) scheduled.delete('dose-3-2026-10-17-t0'); else scheduled.add('dose-3-2026-10-17-t0');
    },
  };
  const syncAll = loadSync(fakes);
  const older = syncAll(); // e.g. the foreground resync
  await sleep(1);
  state.handled = true; // the user taps Skip
  const newer = syncAll(); // Skip re-plans (A-141 (6))
  await Promise.all([older, newer]);
  assert.ok(!scheduled.has('dose-3-2026-10-17-t0'), 'the skipped slot stays without a reminder');
  assert.equal(calls, 2, 'both runs ran');
});

test('TB3-1: a run that throws does not block the next one', async () => {
  let n = 0;
  const fakes = {
    usesServerPush: () => false,
    getCachedUser: async () => { n += 1; if (n === 1) throw new Error('boom'); return null; },
    cancelAllDoseReminders: async () => {}, getActiveProtocols: () => [], getNotifications: () => null,
    orphanDoseIds: () => [], getActiveVials: () => [], Platform: { OS: 'ios' }, doseBudget: () => ({}), scheduleDoseReminder: async () => {},
  };
  const syncAll = loadSync(fakes);
  await syncAll();
  await syncAll();
  assert.equal(n, 2);
});

test('TB3-1: the runs go one at a time; calls during a run share one follow-up (tb3DoseSyncCoalesce)', () => {
  const src = read('lib/notifications.js');
  assert.match(src, /let doseSyncRunning = null;\s*let doseSyncNext = null;/);
  assert.match(src, /if \(doseSyncRunning\) \{\s*if \(!doseSyncNext\) \{/);
  assert.match(src, /const run = Promise\.resolve\(\)\.then\(syncAllDoseRemindersNow\);/);
});
