'use strict';
// A-120 (founder 2026-10-15, Galaxy Z Fold7, build 48 cold start, screenshots every ~300 ms): Today
// showed only its header, then its content with 1 alert, then the alerts box grew to 3 (weigh-in,
// bloodwork, vial) and pushed everything down, while the right page (Dose log) said "Nenhum registro
// ainda" with 0 / 0 / 0 before its rows arrived — "uma leve travadinha". Cause: Today's alert inputs
// were read one after another (readCheckNow, then the lab date, then the snooze map) and each set on
// its own; every first-load read committed on its own; the Dose log drew its empty state before its
// first load had finished. The rule: the first screen appears ONCE, complete; later updates (sync,
// data_changed, a dose written) still update in place.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read } = require('./helpers/extractFn');

// The lib files are ES modules: load their exports under plain node (no imports in them).
function loadEsm(file) {
  const src = read(file).replace(/^export\s+/gm, '');
  const names = [...src.matchAll(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/gm)].map((m) => m[1] || m[2]);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn { ${names.join(', ')} };`)();
}
const exists = (f) => fs.existsSync(path.join(__dirname, '..', f));

function deferred() { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }

// ── (a) Today's alert inputs: read together, returned together ─────────────────────────────────
test('A-120 (a): loadAlertInputs starts all three reads at once and returns them in one object', async () => {
  assert.ok(exists('lib/todayAlertsLoad.js'), 'lib/todayAlertsLoad.js');
  const { loadAlertInputs } = loadEsm('lib/todayAlertsLoad.js');
  const started = [];
  const check = deferred(); const user = deferred(); const snooze = deferred();
  const out = loadAlertInputs({
    readCheckNow: () => { started.push('check'); return check.p; },
    getUser: () => { started.push('user'); return user.p; },
    getBiomarkers: (uid) => (uid === 'u1' ? [{ report_date: '2026-03-01' }, { report_date: '2025-09-01' }] : []),
    readSnooze: () => { started.push('snooze'); return snooze.p; },
  });
  // Nothing has resolved yet, and every read has already started (concurrent, not one after another).
  await Promise.resolve();
  assert.deepEqual(started.sort(), ['check', 'snooze', 'user']);
  snooze.resolve(JSON.stringify({ bloodwork_due: 123 }));
  user.resolve({ id: 'u1' });
  const now = { start: { date: '2026-10-01' }, outcome: { state: 'running' }, run: null };
  check.resolve(now);
  assert.deepEqual(await out, { now, latestLabDate: '2026-03-01', snooze: { bloodwork_due: 123 } });
});

test('A-120 (a): one read failing never drops the other two', async () => {
  const { loadAlertInputs } = loadEsm('lib/todayAlertsLoad.js');
  const boom = () => Promise.reject(new Error('boom'));
  const ok = { readCheckNow: async () => ({ start: null, outcome: { state: 'none' }, run: null }), getUser: async () => ({ id: 'u1' }), getBiomarkers: () => [{ report_date: '2026-01-02' }], readSnooze: async () => '{"supply_low":5}' };
  assert.deepEqual(await loadAlertInputs({ ...ok, readCheckNow: boom }), { now: null, latestLabDate: '2026-01-02', snooze: { supply_low: 5 } });
  assert.deepEqual(await loadAlertInputs({ ...ok, getUser: boom }), { now: { start: null, outcome: { state: 'none' }, run: null }, latestLabDate: null, snooze: { supply_low: 5 } });
  assert.deepEqual(await loadAlertInputs({ ...ok, getBiomarkers: () => { throw new Error('db'); } }).then((r) => r.latestLabDate), null);
  assert.deepEqual((await loadAlertInputs({ ...ok, readSnooze: boom })).snooze, {});
  assert.deepEqual((await loadAlertInputs({ ...ok, readSnooze: async () => 'not json' })).snooze, {});
  assert.deepEqual((await loadAlertInputs({ ...ok, readSnooze: async () => 'null' })).snooze, {}, 'a stored null is no snooze, never a crash in alerts');
  assert.deepEqual((await loadAlertInputs({ ...ok, readSnooze: async () => null })).snooze, {});
  assert.equal((await loadAlertInputs({ ...ok, getUser: async () => null })).latestLabDate, null, 'signed out: no lab date');
});

test('A-120 (a): Today\'s fetchAlerts uses the loader and commits the three values in ONE state update', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /import \{ loadAlertInputs \} from '\.\.\/lib\/todayAlertsLoad';/);
  const i = today.indexOf('async function fetchAlerts()');
  assert.ok(i >= 0, 'fetchAlerts');
  const body = today.slice(i, today.indexOf('\n  }\n', i));
  assert.match(body, /await loadAlertInputs\(\{/);
  assert.equal((body.match(/await /g) || []).length, 1, 'one await: the loader');
  assert.equal((body.match(/set[A-Z]\w*\(/g) || []).length, 1, 'one state update');
  assert.match(body, /setAlertInputs\(\{ rcNow: now, latestLabDate, snooze \}\);/);
  // The old separate setters are gone (rebuild = replace).
  for (const old of ['setRcStart(', 'setRcNow(', 'setLatestLabDate(', 'setAlertSnooze(']) assert.ok(!today.includes(old), old);
  // The alerts still read the same names (snooze, A-118 states, the 182-day bloodwork rule).
  assert.match(today, /const rcStart = rcNow && rcNow\.start \? rcNow\.start : null;/);
  assert.match(today, /const alertSnooze = alertInputs\.snooze;/);
  // A snooze still writes through at once and is kept on the phone.
  const snz = today.slice(today.indexOf('async function snoozeAlert('), today.indexOf('\n  }\n', today.indexOf('async function snoozeAlert(')));
  assert.match(snz, /setAlertInputs\(\(prev\) => \(\{ \.\.\.prev, snooze: \{ \.\.\.prev\.snooze, \[id\]: until \} \}\)\);/);
  assert.match(snz, /AsyncStorage\.setItem\(ALERT_SNOOZE_KEY/);
});

// ── (b) Dose log: never the empty state before its first load ──────────────────────────────────
test('A-120 (b): logListState is loading until the first load, then empty or list', () => {
  assert.ok(exists('lib/firstLoad.js'), 'lib/firstLoad.js');
  const { logListState } = loadEsm('lib/firstLoad.js');
  assert.equal(logListState({ loaded: false, rows: [] }), 'loading');
  assert.equal(logListState({ loaded: false, rows: undefined }), 'loading');
  assert.equal(logListState({ loaded: false, rows: [{ id: 1 }] }), 'loading', 'never empty and never half a list before the load');
  assert.equal(logListState({ loaded: true, rows: [] }), 'empty');
  assert.equal(logListState({ loaded: true, rows: null }), 'empty');
  assert.equal(logListState({ loaded: true, rows: [{ id: 1 }] }), 'list');
});

test('A-120 (b): LogScreen shows the app\'s spinner while loading; "no doses yet" and the 0 counts only after', () => {
  const log = read('screens/LogScreen.js');
  assert.match(log, /import \{ logListState \} from '\.\.\/lib\/firstLoad';/);
  assert.match(log, /const listState = logListState\(\{ loaded, rows: logs \}\);/);
  // The list (with its header counts and the empty text) is drawn only once the first load finished.
  assert.match(log, /\{listState === 'loading' \? \(\s*<View style=\{s\.loadingBox\}>\s*<ActivityIndicator size="large" color=\{colors\.accent\} \/>/);
  assert.match(log, /listState === 'empty' && filter === 'All'\s*\? t\('log_empty_title'\)/);
  assert.equal((log.match(/t\('log_empty_title'\)/g) || []).length, 1);
  // The first load ends even when there is no user or the read fails (never a spinner forever).
  const f = log.slice(log.indexOf('async function fetchLogs()'), log.indexOf('\n  }\n', log.indexOf('async function fetchLogs()')));
  assert.match(f, /finally \{ setLoaded\(true\); \}/);
});

// ── (c) Today: content appears once, after the first load ──────────────────────────────────────
test('A-120 (c): whenAllSettled waits for every read, failures included, with a safety cap', async () => {
  const { whenAllSettled } = loadEsm('lib/firstLoad.js');
  const a = deferred(); const b = deferred();
  let done = null;
  const p = whenAllSettled([a.p, b.p], { capMs: 10000 }).then((r) => { done = r; });
  a.resolve(1);
  await new Promise((r) => setImmediate(r));
  assert.equal(done, null, 'not before the last read');
  b.reject(new Error('read failed'));
  await p;
  assert.deepEqual(done, { timedOut: false }, 'a failed read still ends the first load');
  // A read that never ends (e.g. a hung token refresh) cannot keep Today on the spinner.
  const hung = new Promise(() => {});
  assert.deepEqual(await whenAllSettled([Promise.resolve(1), hung], { capMs: 20 }), { timedOut: true });
  assert.deepEqual(await whenAllSettled([], { capMs: 20 }), { timedOut: false });
});

// A-135 (founder 2026-10-17, picture a135-today-skeleton, "aprovo, pulso ligado") replaced A-120's
// spinner and its "hidden until everything is read" block with the skeleton: each block waits for
// ITS reads as a placeholder of its final size (__tests__/a135TodaySkeleton.test.js). What A-120
// guaranteed still holds and is checked here: every read that fills the first screen is waited
// for, the 4 s cap ends the wait, the food card is mounted (it reads) while hidden, the empty state
// never shows before the protocols were read, and the ring fills once the content appears.
test('A-120 (c) / A-135: Today waits for every first read; no spinner, no false empty state, the food card loads hidden', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /import \{ whenAllSettled(, deferred)? \} from '\.\.\/lib\/firstLoad';/);
  assert.match(today, /const \[firstLoaded, setFirstLoaded\] = useState\(false\);/);
  const fx = today.slice(today.indexOf('const firstReads = ['), today.indexOf('];', today.indexOf('const firstReads = [')));
  for (const f of ['fetchProtocols()', 'fetchTodayLogs()', 'fetchPendingYesterday()', 'fetchStreakData()', 'fetchProtocolStreaks()', 'fetchLastSites()', 'fetchAlerts()', 'heroReadyRef.current.p']) {
    assert.ok(fx.includes(f), `first load waits for ${f}`);
  }
  assert.match(today, /if \(!firstLoadedRef\.current\) whenAllSettled\(firstReads\)\.then\(\(\) => \{ firstLoadedRef\.current = true; setFirstLoaded\(true\); \}\);/);
  assert.ok(!/ActivityIndicator/.test(today), 'no spinner on Today (A-135)');
  const left = today.slice(today.indexOf('const leftPage = ('), today.indexOf('\n  );\n', today.indexOf('const leftPage = (')));
  // Each block shows only once its part is read (lib/todaySkeleton sectionsReady).
  for (const part of ['{ready.alerts && alerts.length > 0 && (', '{ready.pending && pendingYest.length > 0 && (', '{ready.tracker && protocols.length > 0 && (', '{ready.doses && protocols.length === 0 && !loading && (', '{ready.doses && protocols.length > 0 && (']) {
    assert.ok(left.includes(part), part);
  }
  // The food card is mounted (it reads its data) but hidden until its read is done.
  assert.match(left, /<View style=\{ready\.food \? null : s\.hiddenUntilLoaded\} onLayout=\{onBlock\('food'\)\}>/);
  assert.match(today, /hiddenUntilLoaded: \{ display: 'none' \}/);
  assert.match(left, /<FoodLogHero variant="today" onReady=\{heroReadyRef\.current\.resolve\} \/>/);
  const hero = read('screens/components/FoodLogHero.js');
  assert.match(hero, /export default function FoodLogHero\(\{ variant = 'journey', onChanged, onReady \}\)/);
  assert.match(hero, /try \{ await read\(\); \} finally \{ if \(onReady\) onReady\(\); \}/);
  // The ring still fills from zero where the user can see it: once more when the content appears.
  assert.match(today, /useEffect\(\(\) => \{ if \(firstLoaded\) playRingIntro\(\); \}, \[firstLoaded\]\);/);
});

test('A-120: theme tokens only for the Dose log\'s loading view (both themes)', () => {
  const src = read('screens/LogScreen.js');
  const box = src.match(/loadingBox: \{[^}]*\}/);
  assert.ok(box, 'LogScreen loadingBox');
  assert.ok(!/#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/.test(box[0]), 'no hardcoded color');
});

// ── Coordinator follow-up: Android startup work around Today's first load ──────────────────────
// The one-time "Make sure your reminders arrive" setup (A-112 SP-5, Android) used to open 600 ms
// after the reminder read, even while Today was still loading — it now waits until Today's first
// screen is shown (and still only when Today is the focused screen).
test('A-120: the reminder setup screen opens only after Today\'s first screen is shown', async () => {
  const { deferred } = loadEsm('lib/firstLoad.js');
  const d = deferred();
  let v = null;
  d.p.then((x) => { v = x; });
  d.resolve(7);
  await d.p;
  assert.equal(v, 7);
  const today = read('screens/TodayScreen.js');
  assert.match(today, /import \{ whenAllSettled, deferred \} from '\.\.\/lib\/firstLoad';/);
  assert.match(today, /const firstShownRef = useRef\(null\);\s*if \(!firstShownRef\.current\) firstShownRef\.current = deferred\(\);/);
  const rr = today.slice(today.indexOf('const readReminders = useCallback('), today.indexOf('useFocusEffect(readReminders);'));
  assert.match(rr, /setTimeout\(\(\) => \{\s*firstShownRef\.current\.p\.then\(\(\) => \{\s*if \(!navigation\.isFocused\(\)\) return;[^]*maybeOpenSetupForExisting\(navigation, h\.activeWithTime\)/);
  assert.match(today, /useEffect\(\(\) => \{ if \(firstLoaded\) firstShownRef\.current\.resolve\(\); \}, \[firstLoaded\]\);/);
  assert.match(today, /if \(!heroReadyRef\.current\) heroReadyRef\.current = deferred\(\);/);
});
