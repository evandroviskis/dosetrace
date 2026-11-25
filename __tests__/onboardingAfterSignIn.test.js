'use strict';
// Council 2026-11-20 (backend + senior): the onboarding's draft goes into the account only when the
// sign-in's device step allows writes (not while a takeover's rebuild is queued: step.migrate), and
// two overlapping runs (cold start + SIGNED_IN, or a confirmation link) never insert it twice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { singleRun } = require('../lib/singleRun');

const APP = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('every afterSignInOnboarding call waits for a device step that allows writes (step.migrate)', () => {
  const calls = APP.match(/[^\n]*await afterSignInOnboarding\([^)]*\)[^\n]*/g) || [];
  assert.equal(calls.length, 3, calls.join('\n'));
  for (const c of calls) assert.match(c, /if \(step\.migrate\) await afterSignInOnboarding\(/, c);
});

test('afterSignInOnboarding runs one at a time (singleRun): an overlapping call joins the running one', async () => {
  assert.match(APP, /const afterSignInOnboarding = useMemo\(\(\) => singleRun\(\(user\) => obRunImpl\.current\(user\)\), \[\]\);/);
  assert.match(APP, /import \{ singleRun \} from '\.\/lib\/singleRun';/);
  let n = 0; let release;
  const run = singleRun(async () => { n += 1; await new Promise((r) => { release = r; }); return n; });
  const a = run('u'); const b = run('u');
  await new Promise((r) => setImmediate(r));
  release();
  assert.deepEqual(await Promise.all([a, b]), [1, 1]);
  assert.equal(n, 1, 'the draft is applied once');
  const c = run('u'); await new Promise((r) => setImmediate(r)); release();
  assert.equal(await c, 2, 'a later call runs again');
});

test('singleRun: a throw ends the run, the next call runs', async () => {
  let n = 0;
  const run = singleRun(async () => { n += 1; if (n === 1) throw new Error('x'); return n; });
  await assert.rejects(run());
  assert.equal(await run(), 2);
});

test('OB-26 / OB-28 (council 2026-11-20): the builder saves and shows the free count of the real session user (with created_at), never a bare id', () => {
  const OA = fs.readFileSync(path.join(__dirname, '..', 'lib', 'onboardingApp.js'), 'utf8');
  assert.match(OA, /export async function saveBuilderProtocol\(user, protocol, language\) \{\s+const account = \(await getCachedUser\(\)\.catch\(\(\) => null\)\) \|\| user;/);
  assert.match(OA, /freeProtocols: freeProtocolLimit\(account\)/);
  assert.match(OA, /deps\(store, language, account\)/);
  const { freeProtocolLimit, NEW_FREE_PLAN_FROM } = require('../lib/freePlan');
  const after = new Date(Date.parse(NEW_FREE_PLAN_FROM) + 86400000).toISOString();
  assert.equal(freeProtocolLimit({ id: 'u', created_at: after }), 1, 'a new-rule account reaching the builder sees 1');
  assert.equal(freeProtocolLimit({ id: 'u' }), 3, 'a bare id is the old 3: why the session user is needed');
});
