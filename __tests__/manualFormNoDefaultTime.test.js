'use strict';
// The manual protocol form never pre-fills a reminder time (founder 2026-11-04, "A, pode publicar";
// docs/decisions.md last entry; picture docs/design/manual-form-no-default-time.html, proposal A).
// Spec rows MF-1..MF-14 (docs/specs/manual-form-no-default-time.md).
//
// Root cause these tests reproduce: the form opened with the clock time rounded to 5 minutes
// (ProtocolsScreen initial state, lib/protocolForm newProtocolForm), "Duas vezes" / "3 vezes" padded
// the extra doses with 14:00 / 21:00 (handleDosesPerDayChange, formFromProtocol), the iOS wheel
// opened on the clock on an empty slot and its Done saved the clock time, a tap outside the wheel ran
// the same Done, and the Android time dialog saved its opening value on Cancel (no 'dismissed' check).
// NOW below is 14:37 so the old behaviour shows as "14:35".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../lib/protocolForm');
const { loadFn, sliceBlock } = require('./helpers/extractFn');
const { isClockTime } = require('../lib/assistantTime');
const W = require('../lib/wheelPick');
const NP = require('../lib/notificationPlan');
const RH = require('../lib/reminderHealth');
const SERVER = require('../supabase/functions/send-reminders/plan.ts');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const PARTS = read('screens', 'components', 'ProtocolParts.js');
const src = read('i18n', 'translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const TR = mod.exports.translations;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const NOW = new Date(2026, 10, 4, 14, 37);
const style = (file, name) => { const m = file.match(new RegExp(`\\n\\s+${name}: \\{[^\\n]*`)); return m ? m[0] : ''; };

test('MF-1: a new protocol starts with no reminder time (never the clock)', () => {
  assert.deepEqual(F.newProtocolForm(NOW).reminderTimes, ['']);
  assert.match(SCREEN, /const \[reminderTimes, setReminderTimes\] = useState\(\[''\]\);/, 'the screen\'s first state is empty too');
});

test('MF-2: the dose count adds EMPTY slots and drops extra ones (no 14:00 / 21:00)', () => {
  assert.deepEqual(F.resizeTimes([''], 2), ['', '']);
  assert.deepEqual(F.resizeTimes(['08:00'], 3), ['08:00', '', '']);
  assert.deepEqual(F.resizeTimes(['08:00', '20:00', '22:00'], 1), ['08:00']);
  assert.deepEqual(F.resizeTimes([], 1), ['']);
  // the screen's handler runs the same rule (the real code, cut out of the screen)
  for (const [prev, n, want] of [[[''], 2, ['', '']], [[''], 3, ['', '', '']], [['08:00'], 2, ['08:00', '']], [['08:00', ''], 1, ['08:00']]]) {
    let next = null;
    const fn = loadFn('screens/ProtocolsScreen.js', 'function handleDosesPerDayChange(', 'handleDosesPerDayChange', {
      touch() {}, setDosesPerDay() {}, setActiveTimeIndex() {}, resizeTimes: F.resizeTimes, editStartRef: { current: null },
      setReminderTimes: (u) => { next = typeof u === 'function' ? u(prev) : u; },
    });
    fn(n);
    assert.deepEqual(next, want, `${JSON.stringify(prev)} -> ${n}`);
  }
  // an interval over 2 days keeps one dose: its time, or empty
  for (const [prev, want] of [[['', ''], ['']], [['08:00', ''], ['08:00']], [[], ['']]]) {
    let next = null;
    const fn = loadFn('screens/ProtocolsScreen.js', 'function handleIntervalChange(', 'handleIntervalChange', {
      touch() {}, setIntervalDays() {}, setDosesPerDay() {}, setActiveTimeIndex() {}, resizeTimes: F.resizeTimes,
      setReminderTimes: (u) => { next = typeof u === 'function' ? u(prev) : u; },
    });
    fn(7);
    assert.deepEqual(next, want, JSON.stringify(prev));
  }
});

test('MF-3: no app-picked time is left anywhere in the form code', () => {
  assert.doesNotMatch(SCREEN, /currentTimeRounded5/, 'the screen never reads the clock for a time');
  assert.doesNotMatch(SCREEN, /\btimeRounded5\b/);
  // the schedule state and handlers (the only '21:00' left in the screen is the AM/PM word sample)
  const sched = SCREEN.slice(SCREEN.indexOf('// ── Schedule state ──'), SCREEN.indexOf('const [vialMonth, setVialMonth]'));
  assert.ok(sched.length > 1000);
  assert.doesNotMatch(sched, /'\d\d:\d\d'/, 'no 14:00 / 21:00 padding, no fixed time');
  assert.deepEqual([...SCREEN.matchAll(/'(?:14|21):00'/g)].map((m) => SCREEN.slice(m.index - 11, m.index + 7)), ["formatTime('21:00'"]);
  const lib = read('lib', 'protocolForm.js');
  const forms = sliceBlock(lib, 'function newProtocolForm(') + sliceBlock(lib, 'function formFromProtocol(');
  assert.doesNotMatch(forms, /timeRounded5|'14:00'|'21:00'/);
});

test('MF-4: editing an old protocol with fewer stored times than doses, or none, gives empty slots', () => {
  const row = (x) => ({ name: 'Test C', type: 'rtu', interval_days: 1, start_date: '2026-09-01', ...x });
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 1, reminder_time: null }), null, NOW).reminderTimes, ['']);
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 1, reminder_time: '' }), null, NOW).reminderTimes, ['']);
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 2, reminder_time: null }), null, NOW).reminderTimes, ['', '']);
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 3, reminder_time: '08:00' }), null, NOW).reminderTimes, ['08:00', '', '']);
});

test('MF-5: stored times stay exactly as they are', () => {
  const row = (x) => ({ name: 'Test C', type: 'rtu', interval_days: 1, start_date: '2026-09-01', ...x });
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 1, reminder_time: '07:40' }), null, NOW).reminderTimes, ['07:40']);
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 2, reminder_time: '08:00,21:00' }), null, NOW).reminderTimes, ['08:00', '21:00']);
  assert.deepEqual(F.formFromProtocol(row({ doses_per_day: 3, reminder_time: '06:15,13:05,22:50' }), null, NOW).reminderTimes, ['06:15', '13:05', '22:50']);
  // an unchanged edit writes no reminder_time
  const p = row({ doses_per_day: 2, reminder_time: '08:00,21:00', dose: 1, dose_unit: 'ml', concentration: 250, concentration_unit: 'mg' });
  const f = F.formFromProtocol(p, null, NOW);
  const label = (n) => `every ${n}`;
  const patch = F.editPatch(f, { ...f, reminderTimes: [...f.reminderTimes] }, label, 'en');
  assert.ok(!('reminder_time' in patch));
  assert.equal(F.protocolPayload(f, label, 'en').reminder_time, '08:00,21:00');
});

test('MF-6: an empty slot shows "—" and the placeholder "Escolha o horário" in the empty-field grey', () => {
  const rows = SCREEN.slice(SCREEN.indexOf('{/* 4 — Time pickers */}'), SCREEN.indexOf('{/* Wellness goals */}'));
  assert.match(rows, /isClockTime\(rt\) \? \(\s*<Text style=\{s\.pickTime\}>\{formatTimeAMPM\(rt\)\}<\/Text>\s*\) : \(\s*<>\s*<Text style=\{s\.pickTime\}>—<\/Text>\s*<Text style=\{s\.pickPh\} numberOfLines=\{1\}>\{t\('protocols_time_missing_title'\)\}<\/Text>/);
  assert.match(style(SCREEN, 'pickPh'), /pickPh: \{ fontSize: 17, color: c\.ink3 \}/, 'ink3 = the app\'s placeholder colour, both themes');
  for (const l of LANGS) assert.ok(TR[l].protocols_time_missing_title, `${l}.protocols_time_missing_title`);
  assert.equal(TR.pt.protocols_time_missing_title, 'Escolha o horário');
});

test('MF-7: Save with any slot empty stops on the existing sheet and goes back to the time step (step 4, also from step 5)', async () => {
  for (const [type, step] of [['oral', 4], ['rtu', 4], ['recon', 5]]) {
    for (const times of [[''], ['08:00', ''], ['', '', '']]) {
      const calls = { steps: [], sheets: [], saving: [], inserted: 0 };
      const fn = loadFn('screens/ProtocolsScreen.js', 'async function saveProtocol(', 'saveProtocol', {
        name: 'X', doseStepBlocked: false, editingId: null, type, skipVial: true, step, reminderTimes: times, t: (k) => k, isClockTime,
        setStep: (n) => calls.steps.push(n), setWizSheet: (x) => calls.sheets.push(x), setSaving: (v) => calls.saving.push(v),
        showMissingName() {}, showCheckValues() {}, insertProtocol: () => { calls.inserted++; return 1; },
      });
      await fn();
      assert.deepEqual(calls.steps, [4], `${type} ${JSON.stringify(times)}`);
      assert.equal(calls.sheets[0].title, 'protocols_time_missing_title');
      assert.equal(calls.sheets[0].body, 'protocols_time_missing_body');
      assert.deepEqual(calls.saving, []);
      assert.equal(calls.inserted, 0);
    }
  }
  assert.equal(TR.pt.protocols_time_missing_body, 'Escolha o horário de cada dose. O lembrete será enviado nesse horário.');
});

test('MF-8: the time wheel opens at 12:00 on an empty slot (never the clock) and on the stored time otherwise', () => {
  assert.equal(F.wheelStartTime(''), '12:00');
  assert.equal(F.wheelStartTime(undefined), '12:00');
  assert.equal(F.wheelStartTime('30:00'), '12:00');
  assert.equal(F.wheelStartTime('08:05'), '08:05');
  assert.equal(F.wheelStartTime('8:05'), '08:05');
  const sheet = SCREEN.slice(SCREEN.indexOf("title={t('protocols_what_time')}"), SCREEN.indexOf('</DTPickerSheet>', SCREEN.indexOf("title={t('protocols_what_time')}")));
  assert.match(sheet, /columns=\{timeColumns\(wheelStartTime\(reminderTimes\[activeTimeIndex\]\), wheel12h, dayParts\)\}/);
  assert.match(sheet, /const hm = timeAfter\(wheelStartTime\(reminderTimes\[activeTimeIndex\]\), wheel12h, col, i\);/, 'turning only the hour keeps :00, never the clock minutes');
  // Android: the native dialog opens at 12:00 too
  const d = loadFn('screens/ProtocolsScreen.js', 'function timePickerValue(', 'timePickerValue', { reminderTimes: [''], activeTimeIndex: 0, wheelStartTime: F.wheelStartTime })();
  assert.deepEqual([d.getHours(), d.getMinutes()], [12, 0]);
  const d2 = loadFn('screens/ProtocolsScreen.js', 'function timePickerValue(', 'timePickerValue', { reminderTimes: ['08:00', '21:40'], activeTimeIndex: 1, wheelStartTime: F.wheelStartTime })();
  assert.deepEqual([d2.getHours(), d2.getMinutes()], [21, 40]);
});

test('MF-9: "Concluído" is dimmed and disabled on an empty slot until the wheel is turned', () => {
  const sheet = SCREEN.slice(SCREEN.indexOf("title={t('protocols_what_time')}") - 200, SCREEN.indexOf('</DTPickerSheet>', SCREEN.indexOf("title={t('protocols_what_time')}")));
  assert.match(sheet, /doneDisabled=\{timeDoneDisabled\(reminderTimes\[activeTimeIndex\], timeWheel\)\}/);
  assert.equal(F.timeDoneDisabled('', W.WHEEL_IDLE), true, 'empty, untouched: dimmed');
  assert.equal(F.timeDoneDisabled('08:00', W.WHEEL_IDLE), false, 'a slot with its time: Done works');
  const pick = sliceBlock(PARTS, 'export function DTPickerSheet(');
  assert.match(pick, /<TouchableOpacity onPress=\{onDone\} disabled=\{!!doneDisabled\} style=\{doneDisabled \? s\.pickDoneOff : null\}/);
  assert.match(pick, /accessibilityState=\{\{ disabled: !!doneDisabled \}\}/);
  assert.match(style(PARTS, 'pickDoneOff'), /pickDoneOff: \{ opacity: 0\.35 \}/, 'the screen\'s trashBtnOff');
  assert.match(style(SCREEN, 'trashBtnOff'), /opacity: 0\.35/);
});

test('MF-10: turning the wheel fills the field (and Done lights up)', () => {
  const sheet = SCREEN.slice(SCREEN.indexOf("title={t('protocols_what_time')}"), SCREEN.indexOf('</DTPickerSheet>', SCREEN.indexOf("title={t('protocols_what_time')}")));
  assert.match(sheet, /applyPickedTime\(d\);/);
  let times = ['', ''];
  const apply = loadFn('screens/ProtocolsScreen.js', 'function applyPickedTime(', 'applyPickedTime', {
    touch() {}, activeTimeIndex: 1, dosesPerDay: 2, setReminderTimes: (u) => { times = u(times); },
  });
  const { timeAfter } = require('../lib/wheelPick');
  const [h, m] = timeAfter(F.wheelStartTime(times[1]), false, 0, 8).split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  apply(d);
  assert.deepEqual(times, ['', '08:00']);
  assert.ok(isClockTime(times[1]), 'the slot is filled, so Done is enabled');
});

test('MF-11: a tap outside the wheel closes it without saving; Done on an empty slot never saves the clock', () => {
  const pick = sliceBlock(PARTS, 'export function DTPickerSheet(');
  assert.match(pick, /export function DTPickerSheet\(\{ visible, title, doneLabel, onDone, onCancel, doneDisabled, children \}\)/);
  assert.match(pick, /const close = onCancel \|\| onDone;/, 'other wheels keep today\'s behaviour');
  assert.match(pick, /onRequestClose=\{close\}/);
  assert.match(pick, /<Pressable style=\{\[s\.scrim, s\.scrimBottom, \{ paddingBottom: gap \}\]\} onPress=\{close\}>/);
  const at = SCREEN.indexOf("title={t('protocols_what_time')}");
  const head = SCREEN.slice(SCREEN.lastIndexOf('<DTPickerSheet', at), SCREEN.indexOf('<DTWheel', at));
  assert.match(head, /onDone=\{timeWheelDone\}/);
  assert.match(head, /onCancel=\{\(\) => setShowTimePicker\(false\)\}/, 'outside closes, writes nothing');
  assert.doesNotMatch(head, /applyPickedTime|new Date\(\)/, 'no clock time on Done');
  // Done on a filled slot (turning already saved) or an untouched one: closes, writes nothing
  const idle = W.WHEEL_IDLE, touched = W.wheelMotion(W.wheelMotion(idle, 'dragStart', 0), 'settled', 0);
  for (const [rt, motion] of [['08:00', idle], ['08:00', touched], ['', idle]]) {
    assert.equal(F.timeDoneValue(rt, motion), null, JSON.stringify([rt, motion]));
    const calls = { closed: 0, applied: [] };
    loadFn('screens/ProtocolsScreen.js', 'function timeWheelDone(', 'timeWheelDone', {
      reminderTimes: [rt], activeTimeIndex: 0, timeWheel: motion, timeDoneValue: F.timeDoneValue,
      setShowTimePicker: (v) => { if (v === false) calls.closed++; }, applyPickedTime: (d) => calls.applied.push(d),
    })();
    assert.equal(calls.closed, 1);
    assert.equal(calls.applied.length, 0, JSON.stringify([rt, motion]));
  }
});

test('MF-12: Android Cancel on the time dialog saves nothing; OK saves the time on screen', () => {
  for (const [event, date, saved] of [[{ type: 'dismissed' }, new Date(2026, 0, 1, 12, 0), false], [{ type: 'set' }, new Date(2026, 0, 1, 12, 0), true], [{ type: 'set' }, undefined, false]]) {
    const calls = { closed: 0, applied: [] };
    const fn = loadFn('screens/ProtocolsScreen.js', 'function onAndroidTime(', 'onAndroidTime', {
      setShowTimePicker: (v) => { if (v === false) calls.closed++; }, applyPickedTime: (d) => calls.applied.push(d),
    });
    fn(event, date);
    assert.equal(calls.closed, 1, 'the dialog closes');
    assert.equal(calls.applied.length, saved ? 1 : 0, event.type);
  }
  const rows = SCREEN.slice(SCREEN.indexOf('{/* 4 — Time pickers */}'), SCREEN.indexOf('{/* Wellness goals */}'));
  assert.match(rows, /onChange=\{onAndroidTime\}/);
});

test('MF-13: the other wheels keep their behaviour (no onCancel / doneDisabled passed)', () => {
  for (const f of ['screens/SerumCurveScreen.js', 'screens/BodyScreen.js', 'screens/AgeConfirmScreen.js', 'screens/components/SyringePicker.js', 'screens/components/VaccinesSection.js', 'screens/components/CalculatorSection.js', 'screens/components/ProtocolAssistant.js']) {
    const tags = read(f).split('<DTPickerSheet').slice(1).map((x) => x.slice(0, x.indexOf('}>') + 2));
    assert.ok(tags.length, f);
    for (const tag of tags) assert.doesNotMatch(tag, /doneDisabled|onCancel/, `${f}: ${tag}`);
    assert.doesNotMatch(read(f), /onInteract/, `${f}: no wheel touch hook`);
  }
  assert.equal([...SCREEN.matchAll(/onInteract=/g)].length, 1, 'only the reminder-time wheel');
  const start = SCREEN.slice(SCREEN.indexOf("title={t('protocols_start_date')}") - 120, SCREEN.indexOf("title={t('protocols_start_date')}") + 200);
  assert.doesNotMatch(start, /doneDisabled|onCancel/);
});

test('MF-15: any touch on the reminder-time wheel enables "Concluído", so exactly 12:00 can be chosen (nudge and come back)', () => {
  // the touch state (lib/wheelPick wheelMotion): a drag that ends on the same row, a row tap, a VoiceOver adjust
  const idle = W.WHEEL_IDLE;
  assert.deepEqual(idle, { touched: false, moving: [] });
  const nudged = W.wheelMotion(W.wheelMotion(idle, 'dragStart', 0), 'settled', 0);
  assert.deepEqual(nudged, { touched: true, moving: [] });
  assert.deepEqual(W.wheelMotion(idle, 'tap', 1), { touched: true, moving: [] });
  assert.equal(F.timeDoneDisabled('', nudged), false, 'touched and settled on 12: Done lights up');
  // Done after a touch on an empty slot saves the time on the wheel (12:00), never the clock
  assert.equal(F.timeDoneValue('', nudged), '12:00');
  assert.equal(F.timeDoneValue('30:00', nudged), '12:00', 'a time off the clock opened the wheel at 12:00 too');
  const out = { closed: 0, applied: [] };
  loadFn('screens/ProtocolsScreen.js', 'function timeWheelDone(', 'timeWheelDone', {
    reminderTimes: ['08:00', ''], activeTimeIndex: 1, timeWheel: nudged, timeDoneValue: F.timeDoneValue,
    setShowTimePicker: (v) => { if (v === false) out.closed++; }, applyPickedTime: (d) => out.applied.push(d),
  })();
  assert.equal(out.closed, 1);
  assert.deepEqual(out.applied.map((d) => [d.getHours(), d.getMinutes()]), [[12, 0]]);
  // opening the wheel clears the touch
  const calls = { idx: [], wheel: [], shown: [] };
  loadFn('screens/ProtocolsScreen.js', 'function openTimePicker(', 'openTimePicker', {
    WHEEL_IDLE: W.WHEEL_IDLE, setActiveTimeIndex: (i) => calls.idx.push(i), setTimeWheel: (v) => calls.wheel.push(v), setShowTimePicker: (v) => calls.shown.push(v),
  })(1);
  assert.deepEqual(calls, { idx: [1], wheel: [W.WHEEL_IDLE], shown: [true] });
  // wiring: only the reminder-time wheel passes onInteract; DTWheel hands each column's events up with its index
  const at = SCREEN.indexOf("title={t('protocols_what_time')}");
  const sheet = SCREEN.slice(at, SCREEN.indexOf('</DTPickerSheet>', at));
  assert.match(sheet, /onInteract=\{\(ev, col\) => setTimeWheel\(\(s\) => wheelMotion\(s, ev, col\)\)\}/);
  assert.match(sliceBlock(PARTS, 'export function DTWheel('), /onInteract=\{onInteract \? \(ev\) => onInteract\(ev, ci\) : undefined\}/);
});

test('MF-16: Done stays disabled while the wheel is still moving, so a quick Done never saves 12:00 over the row the wheel lands on', () => {
  const dragging = W.wheelMotion(W.WHEEL_IDLE, 'dragStart', 0);
  assert.deepEqual(dragging, { touched: true, moving: [0] });
  assert.equal(F.timeDoneDisabled('', dragging), true, 'drag in progress');
  assert.equal(F.timeDoneDisabled('08:00', dragging), true, 'also on a filled slot: the new row is not settled yet');
  assert.equal(F.timeDoneValue('', dragging), null, 'nothing is saved while moving');
  const coasting = W.wheelMotion(W.wheelMotion(dragging, 'settled', 0), 'momentumStart', 0);
  assert.equal(F.timeDoneDisabled('', coasting), true, 'momentum after the finger left');
  const twoCols = W.wheelMotion(W.wheelMotion(W.WHEEL_IDLE, 'dragStart', 0), 'dragStart', 1);
  assert.equal(F.timeDoneDisabled('', W.wheelMotion(twoCols, 'settled', 0)), true, 'the minutes column is still moving');
  const settled = W.wheelMotion(W.wheelMotion(twoCols, 'settled', 0), 'settled', 1);
  assert.equal(F.timeDoneDisabled('', settled), false);
  assert.equal(W.wheelMotion(W.WHEEL_IDLE, 'settled', 0).touched, false, 'a programmatic scroll end is not a touch');
  // the column reports its motion: drag start, momentum start, and every settle
  const col = sliceBlock(PARTS, 'function WheelColumn(');
  assert.match(col, /onScrollBeginDrag=\{\(\) => \{ tapped\.current = false; if \(onInteract\) onInteract\('dragStart'\); \}\}/);
  assert.match(col, /onMomentumScrollBegin=\{\(\) => \{ if \(onInteract\) onInteract\('momentumStart'\); \}\}/);
  const settle = sliceBlock(PARTS, 'const settle = (');
  assert.match(settle, /if \(onInteract\) onInteract\('settled'\);/);
});

test('MF-17: an empty or broken stored time gives no reminder (app and server), never an app-picked 08:00', () => {
  for (const raw of [null, undefined, '', ',']) {
    assert.deepEqual(NP.reminderTimes(raw), [], String(raw));
    assert.deepEqual(SERVER.reminderSlots({ reminder_time: raw }), [], `server ${raw}`);
  }
  // a piece without numbers keeps its slot index but is never fired (no 08:xx made up)
  for (const raw of ['x:y', ':30', '08:00,:15']) {
    const app = NP.reminderTimes(raw), srv = SERVER.reminderSlots({ reminder_time: raw });
    assert.deepEqual(srv, app, raw);
    assert.ok(app.filter((s) => !s.invalid).every((s) => raw.includes(`${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`)), raw);
  }
  assert.ok(NP.reminderTimes(':30')[0].invalid);
  // nothing is planned and nothing counts as a protocol with a time
  const p = { id: 1, name: 'X', start_date: '2026-11-01', interval_days: 1, reminder_time: '' };
  assert.deepEqual(NP.doseSlots({ protocol: p, now: new Date(2026, 10, 4, 6, 0), windowDays: 3 }), []);
  assert.equal(RH.dueInWindow([p], new Date(2026, 10, 4, 6, 0), 3), 0);
  assert.deepEqual(RH.duePerProtocol([p], new Date(2026, 10, 4, 6, 0), 3), {});
  assert.equal([p].filter((x) => NP.reminderTimes(x.reminder_time).length > 0).length, 0, 'activeWithTime / askPermissionForReminders count');
});

test('MF-18: Edit, 2 → 1 → 2 doses brings Dose 2 back with its stored time', () => {
  assert.deepEqual(F.resizeTimes(['08:00'], 2, ['08:00', '21:00']), ['08:00', '21:00']);
  assert.deepEqual(F.resizeTimes(['07:30'], 3, ['08:00', '21:00']), ['07:30', '21:00', ''], 'Dose 1 as changed; Dose 3 never stored stays empty');
  assert.deepEqual(F.resizeTimes([''], 2, ['', '30:00']), ['', ''], 'a stored time off the clock is not brought back');
  assert.deepEqual(F.resizeTimes(['08:00'], 2), ['08:00', ''], 'a new protocol: empty');
  const row = { name: 'T', type: 'rtu', interval_days: 1, start_date: '2026-09-01', doses_per_day: 2, reminder_time: '08:00,21:00' };
  const stored = F.formFromProtocol(row, null, NOW);
  for (const [prev, n, want] of [[['08:00'], 2, ['08:00', '21:00']], [['08:00', '21:00'], 1, ['08:00']]]) {
    let next = null;
    loadFn('screens/ProtocolsScreen.js', 'function handleDosesPerDayChange(', 'handleDosesPerDayChange', {
      touch() {}, setDosesPerDay() {}, setActiveTimeIndex() {}, resizeTimes: F.resizeTimes, editStartRef: { current: stored },
      setReminderTimes: (u) => { next = typeof u === 'function' ? u(prev) : u; },
    })(n);
    assert.deepEqual(next, want, `${JSON.stringify(prev)} -> ${n}`);
  }
});

test('MF-19: a picked reminder time counts as typed input, so Cancel asks before throwing it away', () => {
  const f = F.newProtocolForm(NOW);
  assert.equal(F.hasNewProtocolInput(f, ''), false, 'a fresh form (no time) has nothing to lose');
  assert.equal(F.hasNewProtocolInput({ ...f, reminderTimes: ['', ''] }, ''), false, 'empty slots are not input');
  assert.equal(F.hasNewProtocolInput({ ...f, reminderTimes: ['08:00'] }, ''), true);
  assert.equal(F.hasNewProtocolInput({ ...f, reminderTimes: ['', '21:15'] }, ''), true);
});

test('MF-20: the unused clock rounding (timeRounded5) is gone', () => {
  assert.equal(F.timeRounded5, undefined);
  assert.doesNotMatch(read('lib', 'protocolForm.js'), /timeRounded5/);
});

test('MF-21: VoiceOver reads an empty time row as "Dose 1, Escolha o horário" (no dash), in 6 languages', () => {
  for (const l of LANGS) {
    const t = (k) => TR[l][k];
    const fmt = (x) => `T${x}`;
    assert.equal(F.timeRowLabel('', 0, 2, t, fmt), `${TR[l].protocols_dose_label} 1, ${TR[l].protocols_time_missing_title}`, l);
    assert.equal(F.timeRowLabel('', 0, 1, t, fmt), `${TR[l].protocols_what_time}, ${TR[l].protocols_time_missing_title}`, l);
    assert.equal(F.timeRowLabel('08:00', 1, 2, t, fmt), `${TR[l].protocols_dose_label} 2, T08:00`, l);
    assert.doesNotMatch(F.timeRowLabel('', 1, 3, t, fmt), /—/);
  }
  assert.equal(F.timeRowLabel('', 0, 2, (k) => TR.pt[k], String), 'Dose 1, Escolha o horário');
  const rows = SCREEN.slice(SCREEN.indexOf('{/* 4 — Time pickers */}'), SCREEN.indexOf('{/* Wellness goals */}'));
  assert.match(rows, /accessibilityLabel=\{timeRowLabel\(rt, idx, reminderTimes\.length, t, formatTimeAMPM\)\}/);
});
