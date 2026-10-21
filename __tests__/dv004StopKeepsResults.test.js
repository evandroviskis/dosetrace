'use strict';
// DV-004 (S1, AD-91, founder 2026-10-15): "Stop reality check" soft-deleted EVERY saved
// reality_checks row (all the earlier measured daily burns, lib/database.js clearRealityChecks),
// not only the open check, and the Stop link also showed with no check open (the finished-result
// view and the locked view). AD-91: Stop appears only while a check is running and ends only that
// check; earlier results stay. Runs the REAL Stop handler of screens/components/CalculatorSection.js
// over the REAL lib/database.js reality-check functions on an in-memory SQLite (the sync harness),
// then the real sync engine, so a Stop on one phone never removes results from the cloud either.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDb, makeCloud } = require('./helpers/syncHarness');
const { loadFn, read, sliceBlock } = require('./helpers/extractFn');
const { pushPending } = require('../lib/syncCore');
const { typedIntakePatch } = require('../lib/realityCheckRules');
const { mergeCalcInputs } = require('../lib/realityCheckStore');
const babel = require('@babel/core');

const CALC = 'screens/components/CalculatorSection.js';
const USER = 'u1';
const t = (k) => k;

function phone() {
  const db = makeDb();
  const src = read('lib/database.js');
  const dedupeByDate = loadFn('lib/database.js', 'function dedupeByDate(', 'dedupeByDate');
  const fromDb = (name) => loadFn('lib/database.js', `export function ${name}(`, name, { getDB: () => db, dedupeByDate });
  return {
    db,
    upsertRealityCheck: fromDb('upsertRealityCheck'),
    getRealityChecks: fromDb('getRealityChecks'),
    // The old all-rows wipe, while it still exists (the test must fail on it, never crash).
    clearRealityChecks: src.includes('export function clearRealityChecks(') ? fromDb('clearRealityChecks') : () => { throw new Error('clearRealityChecks was removed'); },
  };
}

// The real stopRealityCheck: confirm in the DoseTrace sheet, then the sheet's Stop.
// inputs: the synced calc_inputs payload (a fake store over the real merge-never-clobber rule).
async function stopNow(p, { open = true, inputs = null } = {}) {
  const calls = { confirm: null, rcStart: [], realityLog: [], clearStart: 0, sync: 0, changed: 0, reminders: 0, inputs, shown: inputs };
  const stop = loadFn(CALC, 'function stopRealityCheck(', 'stopRealityCheck', {
    typedIntakePatch, mergeCalcInputs,
    getCalcInputs: async () => calls.inputs,
    saveCalcInputs: async (patch) => { calls.inputs = mergeCalcInputs(calls.inputs, patch); },
    setRcInputs: (fn) => { calls.shown = typeof fn === 'function' ? fn(calls.shown) : fn; },
    t,
    setConfirm: (v) => { calls.confirm = v; },
    setRcStart: (v) => calls.rcStart.push(v),
    setRealityLog: (v) => calls.realityLog.push(v),
    clearRealityStart: async () => { calls.clearStart++; },
    clearRealityChecks: p.clearRealityChecks,
    userIdRef: { current: USER },
    requestSync: () => { calls.sync++; },
    calcChanged: () => { calls.changed++; },
    syncRealityCheckReminder: async () => { calls.reminders++; },
    syncFoodLogReminder: async () => { calls.reminders++; },
    rcStart: open ? { date: '2026-10-15', weightKg: 88 } : null,
  });
  stop();
  assert.ok(calls.confirm, 'Stop asks first');
  const danger = calls.confirm.buttons.find((b) => b.kind === 'danger');
  await danger.onPress();
  return calls;
}

test('DV-004: a saved result (09-01) + an open check → Stop → reality_checks still holds the 09-01 result', async () => {
  const p = phone();
  p.upsertRealityCheck(USER, { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.4 });
  p.upsertRealityCheck(USER, { entry_date: '2026-09-22', tdee: 2380, rate_per_week_kg: 0.3 });
  const calls = await stopNow(p);
  assert.deepEqual(p.getRealityChecks(USER).map((r) => [r.entry_date, r.tdee]), [['2026-09-01', 2450], ['2026-09-22', 2380]], 'earlier results stay');
  const rows = p.db.getAllSync('SELECT sync_status FROM reality_checks');
  assert.ok(rows.every((r) => r.sync_status !== 'deleted'), 'no result is tombstoned');
  assert.equal(calls.clearStart, 1, 'the open check is ended (stopped in reality_check_open)');
  assert.deepEqual(calls.rcStart, [null], 'the open check closes on screen');
  assert.ok(!calls.realityLog.some((v) => Array.isArray(v) && v.length === 0), 'the results list is never blanked');
  assert.equal(calls.reminders, 2, 'both reminders are re-planned (weigh-in and the 8 PM food log)');
});

test('DV-004: after Stop, a sync never deletes the saved results from the cloud', async () => {
  const p = phone();
  const cloud = makeCloud();
  p.upsertRealityCheck(USER, { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.4 });
  await pushPending(p.db, cloud, USER);
  assert.equal(cloud.rows('reality_checks', USER).length, 1);
  await stopNow(p);
  await pushPending(p.db, cloud, USER);
  assert.equal(cloud.rows('reality_checks', USER).length, 1, 'the 09-01 result is still in the cloud (another phone keeps it too)');
});

test('DV-004: with no open check, a Stop reached anyway leaves every saved row', async () => {
  const p = phone();
  p.upsertRealityCheck(USER, { entry_date: '2026-09-01', tdee: 2450, rate_per_week_kg: 0.4 });
  await stopNow(p, { open: false });
  assert.equal(p.getRealityChecks(USER).length, 1);
});

test('DV-004: lib/database.js has no function that tombstones every reality-check result at once', () => {
  const src = read('lib/database.js');
  assert.doesNotMatch(src, /UPDATE reality_checks SET sync_status = 'deleted'[^`]*WHERE user_id = \?(?! AND entry_date)/);
  assert.doesNotMatch(src, /export function clearRealityChecks\(/);
});

// The card's branches (rcEl): locked (free plan), running, result, not run yet — RENDERED. The real
// JSX of stopLink … rcEl is compiled (Babel) and evaluated with the test's state; every other name
// the card uses is a harmless stub. A rendered element whose onPress is stopRealityCheck = the Stop link.
const STOP = function stopRealityCheck() {};
const stub = new Proxy(function stub() {}, {
  get: (o, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? undefined : stub),
  apply: () => stub,
});
function renderCard(state) {
  const src = read(CALC);
  const a = src.indexOf('  const stopLink = (');
  const b = src.indexOf('  // Weigh-ins (PO-6, part 13)');
  assert.ok(a > 0 && b > a, 'the reality check card source');
  const { code } = babel.transformSync(`${src.slice(a, b)}\nreturn rcEl;`, {
    babelrc: false, configFile: false, sourceType: 'script',
    parserOpts: { allowReturnOutsideFunction: true },
    plugins: [['@babel/plugin-transform-react-jsx', { pragma: 'h', pragmaFrag: 'Frag', runtime: 'classic' }]],
  });
  const h = (type, props, ...children) => ({ type, props: props || {}, children });
  const own = { h, Frag: 'Frag', stopRealityCheck: STOP, t: (k) => k, s: stub, colors: stub, ...state };
  const scope = new Proxy(own, {
    has: (o, k) => typeof k === 'string' && ((k in o) || !(k in globalThis)),
    get: (o, k) => (k === Symbol.unscopables ? undefined : (k in o ? o[k] : stub)),
  });
  // eslint-disable-next-line no-new-func
  return new Function('scope', `with (scope) { return (function () { ${code} })(); }`)(scope);
}
function hasStop(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasStop);
  if (node.props && node.props.onPress === STOP) return true;
  return hasStop(node.children);
}
const RESULT = [{ date: '2026-09-01', tdee: 2450, ratePerWeekKg: 0.4 }];
const OPEN = { date: '2026-10-15', weightKg: 88 };
const base = { rcAllowed: true, rcStart: null, checkSaved: false, scoreCheck: null, realityLog: [], soFar: null, soFarOpen: false, outcomeResult: null, foodRun: null, typedKcal: null, rcAccess: { canLogWeighIn: true } };

test('DV-004: the result view shows Stop exactly while a check is open (a check open but counted as saved keeps its Stop)', () => {
  const result = { ...base, scoreCheck: { tdee: 2450 }, realityLog: RESULT };
  assert.equal(hasStop(renderCard(result)), false, 'finished result, nothing running: no Stop');
  // A check open yet counted as saved (checkSaved: a result dated on/after its start, e.g. a check
  // restarted the day a result saved, or a kill between saving the result and closing the check):
  // the result view is what shows, so it must still offer Stop or the check can never be ended.
  assert.equal(hasStop(renderCard({ ...result, rcStart: OPEN, checkSaved: true })), true, 'open check on the result view: Stop');
});

test('DV-004: the locked view shows Stop only while a check is open; saved results alone never show it', () => {
  const locked = { ...base, rcAllowed: false, realityLog: RESULT };
  assert.equal(hasStop(renderCard(locked)), false);
  assert.equal(hasStop(renderCard({ ...locked, rcStart: OPEN })), true);
});

test('DV-004: a running check keeps Stop; "not run yet" has none', () => {
  assert.equal(hasStop(renderCard({ ...base, rcStart: OPEN })), true);
  assert.equal(hasStop(renderCard(base)), false);
});

test('DV-004: Stop clears the typed calorie average of the stopped check only (a new check on that start date never reuses it); result sources stay', async () => {
  const p = phone();
  const inputs = { weightKg: 88, rcTypedKcal: { start: '2026-10-15', kcal: 2100 }, rcResultSources: { '2026-09-01': 'typed' } };
  const calls = await stopNow(p, { inputs });
  assert.equal(calls.inputs.rcTypedKcal, null, 'the stopped check\'s typed average is cleared in the synced payload');
  assert.deepEqual(calls.inputs.rcResultSources, { '2026-09-01': 'typed' }, 'kept results keep their source');
  assert.equal(calls.inputs.weightKg, 88, 'nothing else in the payload changes (merge, never clobber)');
  assert.equal(calls.shown.rcTypedKcal, null, 'and on screen');
});

test('DV-004: a typed average tied to another start date is not touched by Stop', async () => {
  const p = phone();
  const inputs = { rcTypedKcal: { start: '2026-09-20', kcal: 1900 } };
  const calls = await stopNow(p, { inputs });
  assert.deepEqual(calls.inputs.rcTypedKcal, { start: '2026-09-20', kcal: 1900 });
  assert.deepEqual(calls.shown.rcTypedKcal, { start: '2026-09-20', kcal: 1900 });
});

test('DV-004: the Stop sheet no longer says the numbers are cleared; it says earlier results are kept (6 languages)', () => {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  const tr = mod.exports.translations;
  const want = {
    en: /earlier results/, es: /mediciones anteriores/, pt: /medições anteriores/,
    fr: /mesures précédentes/, de: /bisherigen Messungen/, it: /misurazioni precedenti/,
  };
  const wiped = { en: /clears your/, es: /Se borrarán/, pt: /apaga seus/, fr: /seront effacés/, de: /werden gelöscht/, it: /vengono cancellati/ };
  for (const lang of Object.keys(want)) {
    const body = tr[lang].cal_rc_stop_body;
    assert.match(body, want[lang], `${lang}: earlier results kept`);
    assert.doesNotMatch(body, wiped[lang], `${lang}: no "clears your numbers"`);
  }
  // The handler itself never calls a results wipe.
  assert.doesNotMatch(sliceBlock(read(CALC), 'function stopRealityCheck('), /clearRealityChecks|setRealityLog\(\[\]\)/);
});
