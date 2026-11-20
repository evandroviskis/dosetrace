'use strict';
// Council 2026-11-20 (product + UX): the onboarding funnel — step names only, kept on the phone before
// the account, sent as one anonymous event after the sign-in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createFunnel } = require('../lib/onboardingFunnel');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const mem = () => { const m = new Map(); return { getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } }; };

test('steps once each, in order; skipped wins over finished; one event after the sign-in, then nothing', async () => {
  const f = createFunnel({ storage: mem() });
  for (const s of ['splash', 'intro', 'help', 'intro', 'goal', 'compound']) await f.note(s);
  await f.intro('skipped');
  await f.intro('finished');
  await f.note('Bad Name!'); // never anything but a step name
  const sent = [];
  assert.equal(await f.flush(async (e, p) => { sent.push([e, p]); }), true);
  assert.deepEqual(sent, [['onboarding_funnel', { steps: 'splash,intro,help,goal,compound', last_step: 'compound', intro: 'skipped' }]]);
  assert.equal(await f.flush(async () => { throw new Error('never'); }), false, 'cleared');
});

test('nothing noted, nothing sent; a failing store never throws', async () => {
  const f = createFunnel({ storage: mem() });
  assert.equal(await f.flush(async () => assert.fail('no event')), false);
  const broken = createFunnel({ storage: { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); }, removeItem: async () => {} } });
  await broken.note('help');
  await broken.intro('finished');
});

test('wired: each step shown is noted (signed out) or logged (signed in), the video says skipped / finished, the sign-in sends it through logEvent (opt-out respected)', () => {
  const FLOW = read('screens/OnboardingFlowScreen.js');
  assert.match(FLOW, /useEffect\(\(\) => \{\s+if \(!cur\) return;\s+if \(signedIn\) Analytics\.viewed\('ob_' \+ cur\);\s+else onboardingFunnel\.note\(cur\);\s+\}, \[cur, signedIn\]\);/);
  const INTRO = read('components/OnboardingIntro.js');
  assert.match(INTRO, /function skip\(\) \{ onboardingFunnel\.intro\('skipped'\);/);
  assert.match(INTRO, /function start\(\) \{ if \(startOn && onDone\) \{ onboardingFunnel\.intro\('finished'\); onDone\(\); \} \}/);
  const APP = read('App.js');
  assert.match(APP, /onboardingFunnel\.flush\(logEvent\)\.catch\(\(\) => \{\}\);/);
  const AN = read('lib/analytics.js');
  assert.match(AN, /analytics_opt_in === false/);
});
