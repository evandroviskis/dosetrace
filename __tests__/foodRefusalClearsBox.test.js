// Food chat (Galaxy S25, 2026-11-07, app in pt): after the assistant refused a diet-advice question,
// the typed question stayed in the input box — the user had to delete it before typing food. The
// question is not food and is never saved; the box clears like after any sent message, and only the
// fixed deflection card shows (FL-15). A message that IS food but could not be read ('fix'), or is
// too old, still comes back in the box so it can be corrected (FL-45: never lose what was typed).
// Runs the real onSubmit of screens/FoodChatScreen.js with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn } = require('./helpers/extractFn');

function run(res, typed) {
  const log = { text: [typed], notice: [], deleted: [], drafts: [] };
  const deps = {
    text: typed, busy: false, userId: 'u1', logDay: null, rows: [], question: null, language: 'pt',
    touch() {}, isDoneText: () => false, isNoText: () => false,
    setText: (v) => log.text.push(v), saveDraftNow: (v) => log.drafts.push(v), closeDay: async () => {},
    localISO: () => '2026-11-07', setNotice: (n) => log.notice.push(n), openFollowup: () => null,
    skipFollowup() {}, askNext() {}, mustAskWhichEarlier: () => false, recentForParse: () => [],
    getFoodLogsSince: () => [], setQuestion() {}, setConsentOpen() {}, askAIConsent: async () => true,
    updateItem() {}, setBusy() {}, ensureFreeStart() {}, insertFoodLog: () => 7, rememberTypedHere() {},
    inFlight: new Set(), setSendingId() {}, refresh: () => [], parseFood: async () => res,
    deleteFoodLog: (id) => log.deleted.push(id), requestSync() {},
    catchUpOutcome: () => ({ save: [], notice: 'too_old', putBack: typed }), saveParsed() {}, rememberAsked() {},
    sendFailureNotice: () => 'retry', isOnlineNow: () => true, scheduleCatchUp() {},
  };
  return loadFn('screens/FoodChatScreen.js', 'async function onSubmit(', 'onSubmit', deps)().then(() => log);
}

test('food chat: a refused diet-advice question clears the box; only the deflection card shows', async () => {
  const log = await run({ ok: true, refusal: true, items: [], totals: null, ask: null, daysAgo: null }, 'qual dieta devo fazer para emagrecer?');
  assert.equal(log.text[log.text.length - 1], '', 'the box is empty after the refusal');
  assert.ok(!log.text.slice(1).includes('qual dieta devo fazer para emagrecer?'), 'the question never comes back in the box');
  assert.deepEqual(log.drafts, [''], 'no draft of the question is kept');
  assert.deepEqual(log.notice[log.notice.length - 1], { kind: 'deflect' });
  assert.deepEqual(log.deleted, [7], 'the question is not saved as food');
});

test('food chat: food that could not be read, or is too old, still comes back in the box (FL-45)', async () => {
  const unread = await run({ ok: true, refusal: false, items: [], totals: null, ask: null, daysAgo: null }, 'aquilo de ontem');
  assert.equal(unread.text[unread.text.length - 1], 'aquilo de ontem');
  assert.deepEqual(unread.notice[unread.notice.length - 1], { kind: 'fix' });
  const old = await run({ ok: true, refusal: false, items: [{ food: 'ovo' }], totals: { kcal: 70 }, ask: null, daysAgo: 9 }, '2 ovos há 9 dias');
  assert.equal(old.text[old.text.length - 1], '2 ovos há 9 dias');
  assert.deepEqual(old.notice[old.notice.length - 1], { kind: 'too_old' });
});
