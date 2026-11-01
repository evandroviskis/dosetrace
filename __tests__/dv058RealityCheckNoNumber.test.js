'use strict';
// DV-058 + the close-once-seen part of DV-104 (DL-26, AD-79 item 7, AD-92; founder go 2026-11-01, picture
// docs/design/rodada1-hoje-registro.html #dv058). Today's reality-check alert said "ready — tap to see it" in
// every case. For a free user the result is locked (Premium), and a check that ended without a number
// (implausible / too_short) had nothing to see: the person tapped, found no result, and the alert and the
// 8 PM food question never stopped. Now:
//   - Today says what Progress will show: 'locked' (result is Premium) or 'no_result' (ended without one);
//   - Progress: "Pronto · o resultado faz parte do Premium" + "Ver Premium" for the locked case;
//     "Encerrada · sem resultado", the reason, the closed line and "Começar de novo" for no result;
//   - a check without a number CLOSES when its card is seen on Progress (no extra tap): the open check is
//     stopped (as Stop does: food logs and weigh-ins kept) and the closed card is kept in the synced
//     calc_inputs payload (rcClosed), so the alert and the 8 PM question stop.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const { checkAlert, closedCheckPatch, closedCheckShown, CLEAR_CLOSED_CHECK, rcStatusKey } = require('../lib/realityCheckRules');
const { realityCheckTDEE } = require('../lib/energyCalc');
const { realityCheckAccess } = require('../lib/weighInAccess');
const { translations: T } = require('../i18n/translations');

const READY = { state: 'ready', dueISO: '2026-10-22' };

test('outcome ready + status implausible → the alert key is not ready (no_result)', () => {
  const a = checkAlert(READY, { current: 9 }, { result: { status: 'implausible', tdee: 700 }, canSeeResult: true });
  assert.notEqual(a.body, 'ready');
  assert.deepEqual(a, { body: 'no_result' });
  assert.deepEqual(checkAlert(READY, null, { result: { status: 'too_short', tdee: null }, canSeeResult: true }), { body: 'no_result' });
});

test('a free user whose result is locked: the alert says so (locked); no number beats locked', () => {
  assert.deepEqual(checkAlert(READY, { current: 9 }, { result: { status: 'ok', tdee: 2400 }, canSeeResult: false }), { body: 'locked' });
  assert.deepEqual(checkAlert(READY, { current: 9 }, { result: { status: 'ok', tdee: 2400 }, canSeeResult: true }), { body: 'ready' });
  // Nothing to unlock when there is no number: the reason, never the paywall.
  assert.deepEqual(checkAlert(READY, null, { result: { status: 'implausible', tdee: 6200 }, canSeeResult: false }), { body: 'no_result' });
  // Unknown access / result (older callers): the plain ready, as before.
  assert.deepEqual(checkAlert(READY, { current: 7 }), { body: 'ready' });
  // The other states are unchanged.
  assert.deepEqual(checkAlert({ state: 'due', dueISO: '2026-10-22' }, null, { canSeeResult: false }), { body: 'due' });
});

test('the closed card: kept for its check, shown until a new check or a newer result', () => {
  const patch = closedCheckPatch({ date: '2026-10-01', weightKg: 80 }, { status: 'implausible', tdee: 6200, ratePerWeekKg: 0.1 });
  assert.deepEqual(patch, { rcClosed: { start: '2026-10-01', weightKg: 80, status: 'implausible', tdee: 6200 } });
  assert.equal(rcStatusKey(patch.rcClosed), 'cal_rc_implausible_high', 'the same reason as before the close');
  const c = patch.rcClosed;
  assert.deepEqual(closedCheckShown(c, { rcStart: null, realityLog: [] }), c);
  assert.deepEqual(closedCheckShown(c, { rcStart: null, realityLog: [{ date: '2026-09-01' }] }), c, 'an older result');
  assert.equal(closedCheckShown(c, { rcStart: { date: '2026-10-30', weightKg: 79 }, realityLog: [] }), null, 'a new check runs');
  assert.equal(closedCheckShown(c, { rcStart: null, realityLog: [{ date: '2026-11-25' }] }), null, 'a newer result');
  assert.equal(closedCheckShown(null, { rcStart: null, realityLog: [] }), null);
  assert.equal(closedCheckShown({ start: 'x' }, { rcStart: null, realityLog: [] }), null);
  assert.deepEqual(CLEAR_CLOSED_CHECK, { rcClosed: null });
  assert.equal(closedCheckPatch(null, { status: 'too_short' }), null);
});

test('readCheckNow hands Today the result status and whether the result can be seen', async () => {
  const fakes = (premium, mode) => ({
    getRealityStart: async () => ({ date: '2026-10-01', weightKg: 80 }),
    getCachedUser: async () => ({ id: 'u1' }),
    getCalcSnapshots: () => [{ entry_date: '2026-10-01', weight_kg: 80 }, { entry_date: '2026-10-22', weight_kg: 79 }],
    getFoodLogsSince: () => [],
    intakeRun: () => ({ ok: false, current: 0 }),
    typedIntakeFor: () => 600, // typed by hand: 600 kcal a day → implausibly low
    getCalcInputs: async () => ({}),
    checkOutcome: require('../lib/realityCheckRules').checkOutcome,
    REALITY_CHECK_DAYS: 21,
    localISO: () => '2026-10-23',
    realityCheckTDEE, weeklyRateKg: () => 0,
    realityCheckAccess,
    loadFoodAccess: async () => ({ access: { canLog: mode === 'free_days', mode }, premium }),
  });
  const readCheckNow = (f) => loadFn('lib/realityCheckNow.js', 'export async function readCheckNow(', 'readCheckNow', f);
  const now = await readCheckNow(fakes(true, 'premium'))();
  assert.equal(now.outcome.state, 'ready');
  assert.equal(now.result.status, 'implausible');
  assert.equal(now.canSeeResult, true);
  assert.deepEqual(checkAlert(now.outcome, now.run, now), { body: 'no_result' });
  const free = await readCheckNow(fakes(false, 'locked'))();
  assert.equal(free.canSeeResult, false);
});

test('Today shows the locked / no-result wording', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /checkAlert\(rcNow\.outcome, rcNow\.run, rcNow\)/);
  assert.match(today, /kind === 'locked' \? t\('today_alert_rc_locked'\)/);
  assert.match(today, /kind === 'no_result' \? t\('today_alert_rc_no_result'\)/);
});

test('Progress: the status lines, Ver Premium, and the check closing once its card is seen', () => {
  const src = read('screens/components/CalculatorSection.js');
  assert.match(src, /const st = checkAlert\(outcome, foodRun, \{ result: outcomeResult, canSeeResult: rcAccess\.canSeeResult \}\);/);
  assert.match(src, /st && st\.body === 'no_result' \? t\('cal_rc_sb_closed'\)/);
  assert.match(src, /st && st\.body === 'locked' \? t\('cal_rc_sb_locked'\)/);
  // Locked: the Ver Premium button opens the paywall.
  assert.match(src, /st && st\.body === 'locked' \? \(\s*<TouchableOpacity style=\{s\.btnP\} onPress=\{\(\) => navigation\.navigate\('Paywall', \{ source: 'reality_check' \}\)\}/);
  assert.match(src, /t\('nutri_grace_cta'\)/);
  // Seen = the card is laid out on the focused Progress screen; then it closes, once.
  assert.match(src, /if \(!isFocused \|\| !loaded \|\| rcY == null \|\| !rcStart \|\| !outcomeResult \|\| outcomeResult\.status === 'ok' \|\| closingRef\.current\) return;/);
  const close = src.slice(src.indexOf('async function closeCheckWithoutResult('), src.indexOf('async function closeCheckWithoutResult(') + 2000);
  assert.match(close, /const patch = closedCheckPatch\(rcStart, res\);/);
  assert.match(close, /await saveCalcInputs\(patch\)/);
  assert.match(close, /await clearRealityStart\(\);/);
  assert.match(close, /syncAllNotifications\(\)/);
  // Never lose user-entered data: no food log or weigh-in is deleted by the close.
  assert.doesNotMatch(close, /deleteFoodLog|deleteCalcSnapshot|removeCalcSnapshot|deleteRealityCheck/);
  // The closed card: status, reason, the closed line and Começar de novo (opens the start sheet).
  assert.match(src, /t\('cal_rc_closed_note'\)/);
  assert.match(src, /t\(rcStatusKey\(closedCheck\)\)/);
  // A new check clears the closed card (it belongs to the old one).
  const begin = src.slice(src.indexOf('async function beginRealityCheck('), src.indexOf('async function beginRealityCheck(') + 2400);
  assert.match(begin, /saveCalcInputs\(CLEAR_CLOSED_CHECK\)/);
  // The closed record is read back on every focus.
  assert.match(src, /rcClosed: savedForBody\.rcClosed \?\? null/);
});

// The card rendered from its real source (the harness of dv004StopKeepsResults.test.js): JSX → plain nodes.
const babel = require('@babel/core');
const STOP = function stopRealityCheck() {};
const OPEN_START = function openRcStart() {};
const stub = new Proxy(function stub() {}, {
  get: (o, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? undefined : stub),
  apply: () => stub,
});
function renderCard(state) {
  const src = read('screens/components/CalculatorSection.js');
  const a = src.indexOf('  const stopLink = (');
  const b = src.indexOf('  // Weigh-ins (PO-6, part 13)');
  const { code } = babel.transformSync(`${src.slice(a, b)}\nreturn rcEl;`, {
    babelrc: false, configFile: false, sourceType: 'script',
    parserOpts: { allowReturnOutsideFunction: true },
    plugins: [['@babel/plugin-transform-react-jsx', { pragma: 'h', pragmaFrag: 'Frag', runtime: 'classic' }]],
  });
  const h = (type, props, ...children) => ({ type, props: props || {}, children });
  const own = { h, Frag: 'Frag', stopRealityCheck: STOP, openRcStart: OPEN_START, t: (k) => k, s: stub, colors: stub, checkAlert, closedCheckShown, rcStatusKey, ...state };
  const scope = new Proxy(own, {
    has: (o, k) => typeof k === 'string' && ((k in o) || !(k in globalThis)),
    get: (o, k) => (k === Symbol.unscopables ? undefined : (k in o ? o[k] : stub)),
  });
  // eslint-disable-next-line no-new-func
  return new Function('scope', `with (scope) { return (function () { ${code} })(); }`)(scope);
}
const texts = (n) => (!n || typeof n !== 'object' ? (typeof n === 'string' ? [n] : []) : Array.isArray(n) ? n.flatMap(texts) : texts(n.children));
const presses = (n) => (!n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(presses) : [...(n.props && n.props.onPress ? [n.props.onPress] : []), ...presses(n.children)]);
const BASE = { rcAllowed: true, rcStart: null, checkSaved: false, scoreCheck: null, realityLog: [], soFar: null, soFarOpen: false, outcomeResult: null, foodRun: null, typedKcal: null, rcInputs: null, rcAccess: { canStart: true, canSeeResult: true, canLogWeighIn: true }, outcome: { state: 'none' } };

test('Progress, rendered: the closed card (status, reason, closed line, Começar de novo; no Stop)', () => {
  const rcInputs = { rcClosed: { start: '2026-10-01', weightKg: 80, status: 'too_short', tdee: null } };
  const node = renderCard({ ...BASE, rcInputs });
  const tx = texts(node);
  for (const k of ['cal_rc_sb_closed', 'cal_rc_too_short', 'cal_rc_closed_note', 'cal_rc_reset']) assert.ok(tx.includes(k), k);
  assert.ok(presses(node).includes(OPEN_START), 'Começar de novo opens the start sheet');
  assert.ok(!presses(node).includes(STOP), 'a closed check has no Stop');
  // A newer saved result, or a new check, replaces it.
  assert.ok(!texts(renderCard({ ...BASE, rcInputs, realityLog: [{ date: '2026-11-20', tdee: 2400 }], scoreCheck: { tdee: 2400 } })).includes('cal_rc_closed_note'));
});

test('Progress, rendered: a free user whose result is ready sees "the result is Premium" and Ver Premium', () => {
  const node = renderCard({
    ...BASE, rcAllowed: false, rcStart: { date: '2026-10-01', weightKg: 80 },
    outcome: READY, outcomeResult: { status: 'ok', tdee: 2400 }, foodRun: { ok: true, days: 9, avgKcal: 2150, current: 9 },
    rcAccess: { canStart: false, canSeeResult: false, canLogWeighIn: true },
  });
  const tx = texts(node);
  assert.ok(tx.includes('cal_rc_sb_locked'));
  assert.ok(tx.includes('nutri_grace_cta'), 'Ver Premium');
  assert.ok(!tx.includes('cal_rc_sb_ready'));
  assert.ok(!tx.includes('cal_log_today_weight'), 'the weigh-in is done: the button is Ver Premium');
  assert.ok(presses(node).includes(STOP), 'Stop stays');
});

test('new lines in all 6 languages', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['today_alert_rc_locked', 'today_alert_rc_no_result', 'cal_rc_sb_locked', 'cal_rc_sb_closed', 'cal_rc_closed_note', 'nutri_grace_cta', 'cal_rc_reset']) assert.ok(T[l][k], `${l} ${k}`);
  }
  assert.equal(T.pt.today_alert_rc_locked, 'Seus números reais estão prontos. O resultado faz parte do Premium — toque para ver.');
  assert.equal(T.pt.today_alert_rc_no_result, 'Seus números reais terminaram sem um resultado — toque para ver o motivo.');
  assert.equal(T.pt.cal_rc_sb_locked, 'Pronto · o resultado faz parte do Premium');
  assert.equal(T.pt.cal_rc_sb_closed, 'Encerrada · sem resultado');
  assert.equal(T.pt.cal_rc_closed_note, 'Esta medição foi encerrada. Você pode começar uma nova quando quiser.');
  assert.equal(T.pt.nutri_grace_cta, 'Ver Premium');
  assert.equal(T.pt.cal_rc_reset, 'Começar de novo');
});
