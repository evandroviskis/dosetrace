'use strict';
// Review of 61b2c33..ed5d8bf, item 3: doseSyncLock ran EVERY queued call, so an embedded Dose log
// edit re-planned twice (LogScreen, then Today's onChanged) and a burst of changes queued a run each.
// Now calls made while a run is going share ONE follow-up run (like syncAllNotifications' _rerun);
// the follow-up starts after the current run, so a stale run still never has the last word.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sliceBlock, read } = require('./helpers/extractFn');

function loadSync(fakes) {
  const s = read('lib/notifications.js');
  const parts = [];
  for (const decl of ['let doseSyncLock = Promise.resolve();', 'let doseSyncRunning = null;', 'let doseSyncNext = null;']) if (s.includes(decl)) parts.push(decl);
  parts.push(sliceBlock(s, 'export function syncAllDoseReminders(').replace(/^export\s+/, ''));
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(fakes), `${parts.join('\n')}\nreturn syncAllDoseReminders;`)(...Object.values(fakes));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('R3: N calls while a run is going → exactly one follow-up run; every caller resolves', async () => {
  let runs = 0;
  const syncAll = loadSync({ syncAllDoseRemindersNow: async () => { runs += 1; await sleep(20); } });
  const first = syncAll();
  await sleep(1);
  const waiting = [syncAll(), syncAll(), syncAll(), syncAll(), syncAll()];
  await Promise.all([first, ...waiting]);
  assert.equal(runs, 2, 'the running one + one follow-up');
  await syncAll();
  assert.equal(runs, 3, 'idle again: a new call runs at once');
});

test('R3: a call made while the follow-up runs gets its own follow-up after it (the latest state still wins)', async () => {
  const seen = [];
  let state = 0;
  const syncAll = loadSync({ syncAllDoseRemindersNow: async () => { const read = state; await sleep(15); seen.push(read); } });
  const a = syncAll();
  await sleep(1);
  state = 1;
  const b = syncAll(); // follow-up 1
  await a;
  await sleep(1); // follow-up 1 is running now
  state = 2;
  const c = syncAll(); // follow-up 2, after follow-up 1
  await Promise.all([b, c]);
  assert.deepEqual(seen, [0, 1, 2], 'runs in order, the last one read the latest state');
});

test('R3: a run that throws does not stop the follow-up', async () => {
  let n = 0;
  const syncAll = loadSync({ syncAllDoseRemindersNow: async () => { n += 1; await sleep(5); if (n === 1) throw new Error('boom'); } });
  const a = syncAll().catch(() => 'failed');
  const b = syncAll();
  assert.equal(await a, 'failed');
  await b;
  assert.equal(n, 2);
});
