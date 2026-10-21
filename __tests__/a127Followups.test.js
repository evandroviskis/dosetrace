'use strict';
// A-127 follow-ups after the final review (coordinator 2026-10-20), test first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');

// (1) "Atualizar" with the opt-in switch ON: the answer (which may show the iOS permission dialog)
// finishes BEFORE the App Store opens — otherwise the dialog never resolves, the yes is stored OFF
// and the question is never asked again.
test('F-1 invitation "Atualizar": the opt-in answer is awaited before the store opens', async () => {
  const order = [];
  let release;
  const flow = {
    answerOptIn: (uid, v) => { order.push(['answer:start', uid, v]); return new Promise((r) => { release = () => { order.push(['answer:done']); r({ on: true }); }; }); },
    update: async (kind) => { order.push(['update', kind]); return 'store'; },
  };
  const answerThenUpdate = loadFn('components/useUpdateNotice.js', 'export async function answerThenUpdate(', 'answerThenUpdate');
  const p = answerThenUpdate(flow, { userId: 'u1', askOptIn: true }, true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, [['answer:start', 'u1', true]], 'the store waits for the permission dialog');
  release();
  await p;
  assert.deepEqual(order, [['answer:start', 'u1', true], ['answer:done'], ['update', 'invite']]);
  // No question on this invitation (or no answer): straight to the store.
  const o2 = [];
  await answerThenUpdate({ answerOptIn: async () => o2.push('answer'), update: async () => o2.push('update') }, { userId: 'u1', askOptIn: false }, null);
  assert.deepEqual(o2, ['update']);
  // A failed answer never blocks the update.
  const o3 = [];
  await answerThenUpdate({ answerOptIn: async () => { throw new Error('x'); }, update: async () => o3.push('update') }, { userId: 'u1', askOptIn: true }, true);
  assert.deepEqual(o3, ['update']);
  // The hook uses it.
  assert.match(read('components/useUpdateNotice.js'), /onUpdate: \(optIn\) => \{ const inv = invite; setInvite\(null\); answerThenUpdate\(updateFlow\(\), inv, optIn\)\.catch\(\(\) => \{\}\); \}/);
});

// (2) Settings shows "Novidades do DoseTrace" ON only when the account says yes AND this phone can
// receive notifications; display only — the account is never rewritten.
test('F-2 the version-news switch shows ON only with version_news true and the permission granted (never writes the account)', async () => {
  const shown = (granted) => loadFn('screens/SettingsScreen.js', 'async function versionNewsShown(', 'versionNewsShown', {
    notificationsGranted: async () => { if (granted instanceof Error) throw granted; return granted; },
  });
  assert.equal(await shown(true)({ version_news: true }), true);
  assert.equal(await shown(false)({ version_news: true }), false, 'notifications denied on this phone');
  assert.equal(await shown(new Error('x'))({ version_news: true }), false);
  assert.equal(await shown(true)({ version_news: false }), false);
  assert.equal(await shown(true)({}), false);
  assert.equal(await shown(true)(null), false);
  const src = read('screens/SettingsScreen.js');
  const fetchUser = src.slice(src.indexOf('async function fetchUser('), src.indexOf('async function toggleNotificationPref('));
  assert.match(fetchUser, /versionNewsShown\(user\.user_metadata\)\.then\(setVersionNews\)/);
  assert.doesNotMatch(fetchUser, /setVersionNews\(user\.user_metadata\?\.version_news === true\)/);
  assert.doesNotMatch(fetchUser, /version_news: /, 'display only: no write of version_news here');
});
