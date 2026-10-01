'use strict';
// S-25 (founder 2026-10-01): an injectable dose is written as Taken only AFTER the app
// asks where it was injected. Mark taken → site question → write (at the TAP time) →
// then, if the vial ran out, the "All doses logged" prompt. The site stays optional
// (Skip = Taken with no site); Cancel / X / a confirmed Android back write nothing.
// Journey review 2026-10-01: the open question is kept on the device (app killed →
// asked again), the S-17 day prompt comes first and commits once, the notification
// Taken button opens the app for injectables, the Dose log asks too, and the Undo bar
// has no "Add site". Checklist: docs/specs/fixes-1.2.5.md FX-22…FX-29.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { planSitePickerAction } = require('../lib/sitePickerActions');
const { planMarkTaken } = require('../lib/markTaken');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const q = () => require('../lib/siteQuestion');
// a function body up to its closing brace at its own indent (2 spaces in a component, 0 at top level)
const fnBody = (src, sig) => { const i = src.indexOf(sig); assert.ok(i >= 0, sig + ' exists'); const ind = src.slice(src.lastIndexOf('\n', i) + 1, i); return src.slice(i, src.indexOf('\n' + ind + '}\n', i)); };

const CLOSED = { close: true, commit: false, writeSite: false, notice: false, confirm: false };

/* ---------- FX-23: the question decides the write ---------- */
test('FX-23: in the site question, Save writes the dose with its site, Skip writes it with no site', () => {
  assert.deepEqual(planSitePickerAction({ mode: 'ask', action: 'save' }), { ...CLOSED, commit: true, writeSite: true });
  assert.deepEqual(planSitePickerAction({ mode: 'ask', action: 'skip' }), { ...CLOSED, commit: true });
});

test('FX-23: Cancel / X and a confirmed Android back write nothing and say the dose was not marked; a bare back asks first', () => {
  assert.deepEqual(planSitePickerAction({ mode: 'ask', action: 'cancel' }), { ...CLOSED, notice: true });
  assert.deepEqual(planSitePickerAction({ mode: 'ask', action: 'leave' }), { ...CLOSED, notice: true });
  assert.deepEqual(planSitePickerAction({ mode: 'ask', action: 'back' }), { ...CLOSED, close: false, confirm: true });
});

test('FX-23: editing a saved dose\'s site (Dose log) — Cancel / back only close; Save writes the site; nothing else changes', () => {
  for (const action of ['cancel', 'back']) assert.deepEqual(planSitePickerAction({ mode: 'edit', action }), CLOSED);
  assert.deepEqual(planSitePickerAction({ mode: 'edit', action: 'save' }), { ...CLOSED, writeSite: true });
});

test('FX-23: only injectables are asked; oral doses are written at once', () => {
  const { needsSiteQuestion } = q();
  assert.equal(needsSiteQuestion('recon'), true);
  assert.equal(needsSiteQuestion('rtu'), true);
  assert.equal(needsSiteQuestion('oral'), false);
  assert.equal(needsSiteQuestion(undefined), false);
});

test('FX-23: two quick taps on the same protocol make ONE question; another protocol gets its own', () => {
  const { newQuestion, addQuestion } = q();
  const tap = new Date(2026, 9, 1, 8, 2).getTime();
  const a1 = newQuestion({ protocolId: 'A', tapMs: tap });
  const a2 = newQuestion({ protocolId: 'A', tapMs: tap + 400 });
  const b = newQuestion({ protocolId: 'B', tapMs: tap + 800 });
  let list = addQuestion([], a1);
  list = addQuestion(list, a2);
  list = addQuestion(list, b);
  assert.deepEqual(list.map((x) => x.protocolId), ['A', 'B']);
  assert.equal(list[0].tapMs, tap, 'the first tap is kept');
});

test('FX-23: a site goes into the same write as the dose (no follow-up update), also when a Missed row is flipped', () => {
  const protocol = { id: 'p1', user_id: 'u', type: 'recon', doses_per_day: 1 };
  const nowMs = new Date(2026, 9, 1, 8, 2).getTime();
  const stored = '{"type":"subq","sites":["abdomen_ul"]}';
  const ins = planMarkTaken({ protocol, todayLogs: [], nowMs, injectionSite: stored });
  assert.equal(ins.insert.injection_site, stored);
  const missed = { id: 'm1', protocol_id: 'p1', outcome: 'Missed', logged_at: new Date(2026, 9, 1, 7, 0).toISOString() };
  const flip = planMarkTaken({ protocol, todayLogs: [missed], nowMs, injectionSite: stored });
  assert.deepEqual(flip.update, { id: 'm1', outcome: 'Taken', injection_site: stored });
  const skip = planMarkTaken({ protocol, todayLogs: [], nowMs });
  assert.equal('injection_site' in skip.insert, false, 'Skip: no site field at all');
});

/* ---------- FX-24: the tap time ---------- */
test('FX-24: tapped at 23:58, answered at 00:03 — the dose is on the previous day at 23:58', () => {
  const { newQuestion, commitOpts } = q();
  const tap = new Date(2026, 9, 1, 23, 58).getTime();
  const qq = newQuestion({ protocolId: 'p1', tapMs: tap });
  assert.equal(qq.dayKey, '2026-10-01');
  const opts = commitOpts(qq);
  assert.equal(opts.tapMs, tap);
  assert.equal(opts.dayKey, '2026-10-01');
  const plan = planMarkTaken({ protocol: { id: 'p1', user_id: 'u', doses_per_day: 1 }, todayLogs: [], dayKey: opts.dayKey, nowMs: opts.tapMs });
  assert.equal(plan.insert.logged_at, new Date(tap).toISOString());
});

test('FX-24: recordDoseTaken plans with the tap time when it has one (never the answer time)', () => {
  const body = fnBody(read('lib', 'doseActions.js'), 'export function recordDoseTaken(');
  assert.match(body, /opts\.tapMs/);
  assert.match(body, /injectionSite/);
});

/* ---------- FX-25: never lost ---------- */
test('FX-25: an open question is kept on the device and comes back after a restart; answered ones go', async () => {
  const { newQuestion, saveQuestion, dropQuestion, loadQuestions } = q();
  const mem = {}; const store = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; } };
  const tap = Date.now();
  const a = newQuestion({ protocolId: 'A', tapMs: tap });
  const b = newQuestion({ protocolId: 'B', tapMs: tap });
  await saveQuestion(store, a);
  await saveQuestion(store, b);
  await dropQuestion(store, a.key);
  const after = await loadQuestions(store, tap + 60000);
  assert.deepEqual(after.map((x) => x.protocolId), ['B']);
  assert.equal(after[0].tapMs, tap);
});

test('FX-25: a question is never dropped for its age — only an answer, or a dose already logged, removes it (never lose a Taken the user pressed)', async () => {
  const { newQuestion, saveQuestion, loadQuestions } = q();
  const mem = {}; const store = { getItem: async (k) => mem[k] ?? null, setItem: async (k, v) => { mem[k] = v; } };
  const tap = new Date(2026, 8, 1, 8, 0).getTime();
  await saveQuestion(store, newQuestion({ protocolId: 'A', tapMs: tap }));
  assert.equal((await loadQuestions(store, tap + 40 * 86400000)).length, 1);
});

test('FX-25: TodayScreen keeps the question before showing it and asks the kept ones again when Today opens', () => {
  const src = read('screens', 'TodayScreen.js');
  const ask = fnBody(src, 'function askSite(');
  assert.match(ask, /saveQuestion\(/, 'saved before the picker opens');
  assert.match(src, /loadQuestions\(AsyncStorage/, 'Today reads the kept questions');
  const commit = fnBody(src, 'function commitQuestion(');
  assert.match(commit, /dropQuestion\(/, 'an answered question is removed');
});

/* ---------- FX-26: S-17 day prompt first, one commit ---------- */
test('FX-26: today with skip-yesterday carries the skip into the question; the Skipped row for yesterday is written only at the commit', () => {
  const { newQuestion, commitOpts } = q();
  const qq = newQuestion({ protocolId: 'A', tapMs: Date.now(), skipYesterday: { dayKey: '2026-09-30', slotMs: 1 } });
  assert.deepEqual(commitOpts(qq).skipYesterday, { dayKey: '2026-09-30', slotMs: 1 });
  const src = read('screens', 'TodayScreen.js');
  const h = fnBody(src, 'function handleTake(');
  assert.doesNotMatch(h, /recordSkipPending\(/, 'the day prompt writes nothing');
  assert.match(fnBody(src, 'function commitQuestion('), /recordSkipPending\(/, 'the Skipped row is written in the commit');
});

test('FX-26: the Pending block\'s Taken and "Log for yesterday" ask the site and log at yesterday\'s slot', () => {
  const { newQuestion, commitOpts } = q();
  const slot = new Date(2026, 8, 30, 19, 20).getTime();
  const qq = newQuestion({ protocolId: 'A', tapMs: Date.now(), dayKey: '2026-09-30', slotMs: slot, source: 'pending' });
  assert.equal(commitOpts(qq).slotMs, slot);
  assert.equal(commitOpts(qq).dayKey, '2026-09-30');
  const src = read('screens', 'TodayScreen.js');
  assert.match(fnBody(src, 'function takePending('), /askSite\(/);
});

/* ---------- FX-27: the notification ---------- */
test('FX-27: injectable reminders use their own categories whose Taken button opens the app', () => {
  const src = read('lib', 'notifications.js');
  assert.match(src, /setNotificationCategoryAsync\('dose-reminder-inj'/);
  assert.match(src, /setNotificationCategoryAsync\('dose-reminder-long-inj'/);
  assert.match(src, /setNotificationCategoryAsync\('dose-snoozed-inj'/);
  assert.match(src, /TAKEN_OPEN = \{[^}]*opensAppToForeground: true/);
  assert.match(src, /needsSiteQuestion\(protocol\.type\)/, 'the category follows the protocol type');
});

test('FX-27: the notification handler writes nothing for an injectable — it keeps the question for the app', () => {
  const body = fnBody(read('lib', 'notificationActions.js'), 'async function markTaken(');
  const ask = body.indexOf('needsSiteQuestion(');
  const write = body.indexOf('recordDoseTaken(');
  assert.ok(ask > 0 && write > 0 && ask < write, 'the type is checked before any write');
  assert.match(body.slice(ask, write), /saveQuestion\(/);
});

/* ---------- FX-28: the Dose log ---------- */
test('FX-28: Dose log — a Missed injectable changed to Taken asks the site first', () => {
  const src = read('screens', 'LogScreen.js');
  const body = fnBody(src, 'function setMissedOutcome(');
  assert.match(body, /needsSiteQuestion\(/);
  assert.match(src, /openSiteEditor\(log, 'ask'\)/);
});

/* ---------- FX-29 / FX-22: after the write ---------- */
test('FX-29: the Undo bar offers Undo only — no "Add site"', () => {
  const src = read('screens', 'TodayScreen.js');
  assert.doesNotMatch(src, /today_undo_add_site/);
});

test('FX-22: the vial prompt follows the write and opens after the picker has closed; the old picker-after-prompt path is gone', () => {
  const src = read('screens', 'TodayScreen.js');
  assert.doesNotMatch(src, /siteAfterVialRef|planTakeFollowups|openBodyMapForUndo/);
  const commit = fnBody(src, 'function commitQuestion(');
  assert.match(commit, /vialPromptDelay/);
  assert.match(fnBody(src, 'function closeVialPrompt('), /setTimeout\(openNextQuestion/, 'a waiting question opens after the prompt');
});

test('FX-23: on an injectable card the button does not show "Taken" before the answer', () => {
  const src = read('screens', 'TodayScreen.js');
  assert.match(src, /function TakeButton\(\{[^}]*askFirst/);
  assert.match(src, /askFirst=\{needsSiteQuestion\(p\.type\)\}/);
});

/* ---------- code review 2026-10-01 (fix first) ---------- */
test('FX-23: an open 08:00 question and the 20:00 banner question of a twice-a-day protocol are two questions', () => {
  const { newQuestion, addQuestion } = q();
  const d = (h) => new Date(2026, 9, 1, h, 0).getTime();
  let list = addQuestion([], newQuestion({ protocolId: 'A', tapMs: d(8), slotMs: d(8), source: 'notification' }));
  list = addQuestion(list, newQuestion({ protocolId: 'A', tapMs: d(20), slotMs: d(20), source: 'notification' }));
  assert.equal(list.length, 2);
});

test('FX-25: a question already answered is recognised by its own row (tap time, or the slot it flipped) — never written twice', () => {
  const { newQuestion, questionAnswered } = q();
  const tap = new Date(2026, 9, 1, 8, 2).getTime();
  const slot = new Date(2026, 9, 1, 8, 0).getTime();
  const qq = newQuestion({ protocolId: 'A', tapMs: tap });
  const qs = newQuestion({ protocolId: 'A', tapMs: tap, slotMs: slot });
  const row = (ms, outcome = 'Taken') => ({ protocol_id: 'A', outcome, logged_at: new Date(ms).toISOString() });
  assert.equal(questionAnswered([row(tap)], qq), true);
  assert.equal(questionAnswered([row(slot)], qs), true);
  assert.equal(questionAnswered([row(slot, 'Missed')], qs), false);
  assert.equal(questionAnswered([row(tap + 60000)], qq), false);
  assert.match(fnBody(read('lib', 'doseActions.js'), 'export function isDoseAlreadyLogged('), /questionAnswered\(/);
});

test('FX-27: answering a banner question cancels that slot and every earlier one (ti + 1), as the background path did', () => {
  const { newQuestion, reminderCancelCount } = q();
  assert.equal(reminderCancelCount(newQuestion({ protocolId: 'A', tapMs: 1, source: 'notification', ti: 1 }), 1), 2);
  assert.equal(reminderCancelCount(newQuestion({ protocolId: 'A', tapMs: 1 }), 1), 1);
  assert.match(fnBody(read('screens', 'TodayScreen.js'), 'function commitQuestion('), /reminderCancelCount\(/);
});

test('FX-22: one modal at a time — a question waits for the vial prompt AND the "still going?" prompt; the inactivity prompt waits for questions', () => {
  const src = read('screens', 'TodayScreen.js');
  const open = fnBody(src, 'async function openNextQuestion(');
  assert.match(open, /inactivePromptOpenRef\.current/);
  assert.match(open, /focusedRef\.current/, 'never over another tab');
  const chk = fnBody(src, 'async function checkTreatmentStillActive(');
  assert.match(chk, /bodyMapOpenRef\.current \|\| siteQueueRef\.current\.length/);
  assert.match(fnBody(src, 'async function snoozeInactiveProtocol('), /openNextQuestion/);
  assert.match(fnBody(src, 'function closeVialPrompt('), /clearTimeout\(vialTimerRef\.current\)/, 'a late timer never reopens a closed prompt');
});

test('FX-26: the answer writes first and forgets the question after; an already-logged dose writes no Skipped row', () => {
  const body = fnBody(read('screens', 'TodayScreen.js'), 'function commitQuestion(');
  const check = body.indexOf('isDoseAlreadyLogged(');
  const skip = body.indexOf('recordSkipPending(');
  assert.ok(check > 0 && check < skip, 'checked before the Skipped row');
  assert.ok(body.lastIndexOf('dropQuestion(') > body.indexOf('markTaken('), 'forgotten only after the write');
});

test('FX-26: Undo after a pending take carries the vial prompt and the Skipped row of yesterday', () => {
  const body = fnBody(read('screens', 'TodayScreen.js'), 'function writePending(');
  assert.match(body, /vialFinished/);
  assert.match(body, /extraDeleteIds/);
});

test('FX-27: an Android banner from before the update stays up until the site is answered (no silent dismiss)', () => {
  const src = read('lib', 'notificationActions.js');
  assert.match(src, /return 'asked'/);
  assert.match(src, /!keepBanner/);
});

test('FX-25: an intentional sign-out forgets the open questions with the other local data', () => {
  assert.match(read('App.js'), /QUESTIONS_KEY/);
});
