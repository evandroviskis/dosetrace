'use strict';
// Review of 61b2c33..ed5d8bf, item 2: Today's take cancels today's reminder (cancelTodaysDoseReminders)
// outside the reminder lock. A run that started before the take — it read the day's rows while the
// slot was still owed — finishes after the cancel and re-arms t0. markTaken now re-plans after its
// cancel, so the lock's next run (which reads the take) has the last word.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const { sliceBlock, read } = require('./helpers/extractFn');

const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'TodayScreen.js'), 'utf8');
function fnCode(name) {
  let hit = null;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string' || hit) return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.name === name) { hit = src.slice(node.start, node.end); return; }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }));
  assert.ok(hit, `function ${name} exists`);
  return hit;
}

test('R2: markTaken re-plans the reminders right after its cancel', () => {
  const m = fnCode('markTaken');
  const cancel = m.indexOf('cancelTodaysDoseReminders(protocol.id');
  const replan = m.indexOf('syncAllDoseReminders().catch(() => {});', cancel);
  assert.ok(cancel > 0, 'the take cancels today\'s slots');
  assert.ok(replan > cancel, 'then re-plans through the lock');
});

// The real syncAllDoseReminders (lock included) with a slow older run.
function loadSync(fakes) {
  const s = read('lib/notifications.js');
  const parts = [];
  for (const decl of ['let doseSyncLock = Promise.resolve();', 'let doseSyncRunning = null;', 'let doseSyncNext = null;']) if (s.includes(decl)) parts.push(decl);
  parts.push(sliceBlock(s, 'export function syncAllDoseReminders(').replace(/^export\s+/, ''));
  parts.push(sliceBlock(s, 'async function syncAllDoseRemindersNow('));
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(fakes), `${parts.join('\n')}\nreturn syncAllDoseReminders;`)(...Object.values(fakes));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('R2: a run that read the rows before the take and finishes after the cancel does not leave t0 armed', async () => {
  const state = { taken: false };
  const scheduled = new Set(['dose-3-2026-10-17-t0']);
  let calls = 0;
  const syncAll = loadSync({
    usesServerPush: () => false, getCachedUser: async () => ({ id: 'u', user_metadata: {} }), cancelAllDoseReminders: async () => {},
    getActiveProtocols: () => [{ id: 3 }], orphanDoseIds: () => [], getActiveVials: () => [], Platform: { OS: 'ios' },
    doseBudget: () => ({ perProtocol: 24, windowDays: 3 }),
    getNotifications: () => ({ getAllScheduledNotificationsAsync: async () => [...scheduled].map((identifier) => ({ identifier })), cancelScheduledNotificationAsync: async (id) => { scheduled.delete(id); } }),
    scheduleDoseReminder: async () => { calls += 1; const handled = state.taken; await sleep(calls === 1 ? 50 : 1); if (handled) scheduled.delete('dose-3-2026-10-17-t0'); else scheduled.add('dose-3-2026-10-17-t0'); },
  });
  const older = syncAll(); // e.g. the foreground resync, started before the take
  await sleep(1);
  // markTaken: the row is written, today's slot cancelled (outside the lock), then the re-plan.
  state.taken = true;
  scheduled.delete('dose-3-2026-10-17-t0');
  const replan = syncAll();
  await Promise.all([older, replan]);
  assert.ok(!scheduled.has('dose-3-2026-10-17-t0'), 'the take\'s re-plan has the last word');
});
