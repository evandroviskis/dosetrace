'use strict';
// Unrecorded period, option B — the screens (docs/specs/unrecorded-period.md): Today's trigger order (UP-20,
// UP-21), the lab trigger (UP-22, UP-23), the Dose log card and its filter link (UP-24, UP-34), the curve after an
// answer (UP-19), deleted protocols (UP-9), offline (UP-26), the Fold sheet (UP-32), screen readers (UP-33) and
// theme tokens (UP-31). Runs the real code where it is pure, reads the source where it is screen wiring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sliceBlock } = require('./helpers/extractFn');
const U = require('../lib/unrecordedPeriod');
const M = require('../lib/serumModel');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const TODAY = read('screens/TodayScreen.js');
const LOG = read('screens/LogScreen.js');
const BODY = read('screens/BodyScreen.js');
const SHEET = read('screens/components/UnrecordedSheet.js');
const HOST = read('screens/components/UnrecordedHost.js');
const ACTIONS = read('lib/doseActions.js');

const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const NOW = L(2026, 11, 3, 10);
const opts = { nowMs: NOW, pulledThroughMs: NOW - 60000, zoneHistory: null };
const testo = { id: 1, user_id: 'u', name: 'Testosterone Cypionate', type: 'recon', dose: '125', dose_unit: 'mg', reminder_time: '09:00', doses_per_day: 1, interval_days: 7, start_date: '2026-10-05', active: 1, created_at: new Date(L(2026, 10, 5, 8)).toISOString() };

test('UP-20: Today asks after "Ainda está usando?" (no protocol question left), never over a popup, a dose from a reminder or its Undo bar', () => {
  const check = sliceBlock(TODAY, 'async function checkTreatmentStillActive(');
  assert.match(check, /if \(!q\) \{ askUnrecordedToday\(\); return; \}/);
  const blocked = TODAY.slice(TODAY.indexOf('const unrecBlocked = '), TODAY.indexOf('async function askUnrecordedToday('));
  for (const r of ['focusedRef.current', 'todayPopupBusy()', 'siteQueueRef.current.length', 'logPopupOpenRef.current', 'vialPromptPendingRef.current', 'pendingVialsRef.current.length', 'doseFocusOpenRef.current', 'undoDataRef.current', 'unrecOpenRef.current']) {
    assert.ok(blocked.includes(r), r);
  }
  const busy = sliceBlock(TODAY, 'function todayPopupBusy(');
  assert.match(busy, /teamSheetOpenRef\.current/, 'the team message sheet');
  assert.match(busy, /unrecOpenRef\.current/, 'other popups wait for the queue');
  assert.match(sliceBlock(TODAY, 'async function openNextQuestion('), /unrecOpenRef\.current\) return;/);
  const ask = sliceBlock(TODAY, 'async function askUnrecordedToday(');
  assert.match(ask, /todayMayAsk\(st, \{ dayKey, newestMs \}\)/, 'once a day, three "Agora não"');
  assert.match(ask, /afterShown\(st, \{ dayKey, newestMs \}\)/);
  assert.match(ask, /await unrecordedQueue\(\)/);
  assert.match(TODAY, /onLater=\{\(\) => noteUnrecorded\(afterLater\)\} onAnswered=\{\(\) => noteUnrecorded\(afterAnswered\)\}/);
  // The check itself only runs after the first sync result and Today's first screen (A-122 / A-120).
  assert.match(sliceBlock(TODAY, 'function checkStillGoingWhenSynced('), /firstSyncGate\.whenOpen\(\), firstShownRef\.current\.p/);
});

test('UP-6: the queue reads the scan\'s own pull stamp and zone history (nothing before a successful pull)', () => {
  const q = sliceBlock(ACTIONS, 'export async function unrecordedQueue(');
  assert.match(q, /readDoseLogsPull\(AsyncStorage, user\.id, nowMs\)/);
  assert.match(q, /getMissedWatermark\(nowMs\)/);
  assert.match(q, /getActiveProtocols\(user\.id\).*getEndedProtocols\(user\.id\)/);
  assert.deepEqual(U.gapEntries(testo, [], { ...opts, pulledThroughMs: null }), []);
});

test('UP-9: deleted or purged protocols are never asked', () => {
  assert.deepEqual(U.gapEntries({ ...testo, deleted_at: '2026-11-01T00:00:00Z' }, [], opts), []);
  assert.deepEqual(U.gapEntries({ ...testo, purged_at: '2026-11-01T00:00:00Z' }, [], opts), []);
  assert.deepEqual(U.gapEntries({ ...testo, sync_status: 'deleted' }, [], opts), []);
  assert.equal(U.gapEntries(testo, [], opts).length, 3);
});

test('UP-22 / UP-23: the lab trigger — past dates only, Premium only, charted protocols only, one queue for several saves', () => {
  const ask = sliceBlock(BODY, 'function askUnrecordedForLab(');
  assert.match(ask, /day >= localISO\(new Date\(\)\)\) return;/, 'a test of today or later asks nothing');
  assert.match(ask, /day > labAskRef\.current \? day : labAskRef\.current/, 'several saves → one queue, the latest date');
  const open = sliceBlock(BODY, 'async function openLabAsk(');
  assert.match(open, /if \(!\(await hasPremium\(\)\)\) return;/, 'free accounts wait for Today');
  assert.match(open, /unrecordedQueue\(\{ examDay: day \}\)/);
  assert.match(open, /labDate: formatDate\(day\)/);
  assert.match(BODY, /askUnrecordedForLab\(date\); \/\/ UP-22/, 'after a photo import');
  assert.match(BODY, /askUnrecordedForLab\(mEdit\.card\.date\)/, 'after a value added to a past test');
  assert.match(BODY, /askUnrecordedForLab\(toDate\); \/\/ UP-22: moved earlier/);
  assert.match(BODY, /askUnrecordedForLab\(mDate\); \/\/ UP-22: moved earlier/);
  const q = sliceBlock(ACTIONS, 'export async function unrecordedQueue(');
  assert.match(q, /protocols = protocols\.filter\(\(p\) => days\.get\(p\.id\)\)/, 'only what the curve draws');
  assert.match(q, /labWindow\(examDay, days\.get\(p\.id\)\)/);
});

test('UP-22: what the curve draws, and for how many days (an oral protocol or a compound without data: nothing)', () => {
  const chart = sliceBlock(ACTIONS, 'export function unrecordedChartDays(');
  const fn = new Function('splitCurveProtocols', 'curveHistoryDays', 'getHalfLifeEntry', 'matchName', `${chart.replace(/^export /, '')}\nreturn unrecordedChartDays;`)(M.splitCurveProtocols, M.curveHistoryDays, require('../lib/halfLives').getHalfLifeEntry, M.matchName);
  assert.ok(fn(testo) >= 14);
  assert.equal(fn({ ...testo, type: 'oral' }), null);
  assert.equal(fn({ ...testo, name: 'Something unknown' }), null);
});

test('UP-19: after "Tomei todas" the doses enter the estimated level; after "Não tomei" it is unchanged', () => {
  const e = U.gapEntries(testo, [], opts);
  const taken = U.planUnrecordedAnswer({ protocol: testo, entries: e, choice: 'all', nowMs: NOW }).inserts.map((r) => ({ ...r, sync_status: 'pending' }));
  const skipped = U.planUnrecordedAnswer({ protocol: testo, entries: e, choice: 'none', nowMs: NOW }).inserts.map((r) => ({ ...r, sync_status: 'pending' }));
  const none = M.estimatedLevelNow(testo, NOW, { logs: [] }).value;
  assert.ok(M.estimatedLevelNow(testo, NOW, { logs: taken }).value > none + 1);
  assert.equal(M.estimatedLevelNow(testo, NOW, { logs: skipped }).value, none);
});

test('UP-24 / UP-34: the Dose log card opens the same queue; a link can open the Dose log on "Perdidas"', () => {
  assert.match(LOG, /unrecordedQueue\(\)\.then\(\(\{ asks, card \}\)/);
  assert.match(LOG, /onPress=\{answerUnrecorded\}/);
  assert.match(sliceBlock(LOG, 'function answerUnrecorded('), /if \(gate && gate\.busy\(\)\) \{ gate\.wait\(answerUnrecorded\); return; \}/, 'BK-20 on the Fold');
  assert.match(LOG, /useState\(\['Taken', 'Skipped', 'Missed'\]\.includes\(routeFilter\) \? routeFilter : 'All'\)/);
  assert.match(BODY, /navigation\.navigate\('Log', \{ filter: 'Missed' \}\)/);
  assert.match(BODY, /labMissedCount\(doseLogs, reportDetail\.date/);
  assert.match(BODY, /accessibilityRole="link" accessibilityLabel=\{ll\.a11y\}/);
});

test('UP-26: answers are ordinary pending rows written on the phone (offline works; the next sync sends them)', () => {
  const save = sliceBlock(ACTIONS, 'export function saveUnrecordedAnswer(');
  assert.match(save, /insertDoseLog\(r\)/);
  assert.doesNotMatch(save, /supabase|fetch\(/, 'no network in the write');
  assert.match(HOST, /requestSync\(\);/);
});

test('UP-15: a vial an answer finished gets its usual prompt only after the last question', () => {
  assert.match(HOST, /finished\.current\.push\(/);
  assert.match(sliceBlock(HOST, 'function close('), /flushPrompts\(\);/);
  assert.match(sliceBlock(HOST, 'function flushPrompts('), /for \(const v of list\) requestVialPrompt\(v\);/);
});

test('UP-32 / UP-33 / UP-31: the sheet — centred up to 560 wide (Fold), radio and checkbox roles, theme tokens only', () => {
  assert.match(SHEET, /maxWidth: 560, alignSelf: 'center'/);
  assert.match(SHEET, /accessibilityRole="radio" accessibilityState=\{\{ selected: choice === k \}\}/);
  assert.match(SHEET, /accessibilityRole="radio" accessibilityState=\{\{ selected: choice === 'unknown' \}\}/, '"Não lembro" is a radio too');
  assert.match(SHEET, /accessibilityRole="checkbox" accessibilityState=\{\{ checked: on \}\}/);
  assert.match(SHEET, /checked: k === w\.slots\.length \? true : k \? 'mixed' : false/);
  assert.match(SHEET, /accessibilityLabel=\{q\.counterA11y\}/);
  assert.match(SHEET, /accessibilityState=\{\{ disabled: !ready \}\}/);
  for (const src of [SHEET, HOST]) {
    const styles = src.slice(src.indexOf('StyleSheet.create('));
    assert.doesNotMatch(styles, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/, 'no raw colour');
  }
  assert.doesNotMatch(SHEET + HOST, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
});

test('UP-17: Salvar is guarded against a double tap; the toast undoes the whole answer', () => {
  assert.match(sliceBlock(SHEET, 'function save('), /if \(!ready \|\| busy\.current\) return;/);
  assert.match(sliceBlock(HOST, 'function undo('), /undoUnrecordedAnswer\(u\)/);
});
