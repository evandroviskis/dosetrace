'use strict';
// DV-036 (DL-10 rewritten round 2, AD-79 item 9; founder 2026-11-01 option A of
// docs/design/rodada1-hoje-registro.html #dv036).
// (a) A reminder's BODY tap does what its Mark complete BUTTON does: the body tap opens Today on that dose
//     ("From your reminder"), and the take from that card writes the button's row — the reminder's own slot
//     through notificationTakeTarget, at the tap time — and cancels the same reminders
//     (cancelTodaysDoseReminders(protocolId, ti + 1)). Before: the focus take wrote the card's earliest open
//     slot and cancelled only up to that slot, so the 20:00 follow-ups kept firing after a 20:00 tap.
// (b) When the reminder's dose is already logged, Today says so in the ink toast for a few seconds, with the
//     time of the row ("Esta dose de {name} já foi registrada às {time}." / skipped: "… foi pulada às {time}.
//     Você ainda pode registrá-la em Hoje."). Before: Today opened and said nothing.
// A-171 stays: a dose already logged is never offered (no focus card), so it is never logged twice.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reminderFocus } = require('../lib/dosePageState');
const { notificationTakeTarget, planMarkTaken } = require('../lib/markTaken');
const { translations } = require('../i18n/translations');

const DAY = '2026-11-01';
const ms = (h, m = 0) => new Date(2026, 10, 1, h, m).getTime();
const iso = (h, m = 0) => new Date(ms(h, m)).toISOString();
const twice = { id: 3, name: 'Vit D', type: 'oral', interval_days: 1, doses_per_day: 2, reminder_time: '08:00,20:00', start_date: '2026-10-01', created_at: new Date(2026, 9, 1).toISOString(), active: 1 };
const testo = { id: 2, name: 'Testosterona', type: 'oral', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-10-11', created_at: new Date(2026, 9, 11).toISOString(), active: 1 };

test('DV-036 (a): focus on the 20:00 reminder while 08:00 is open → the take writes what the button writes and cancels ti + 1', () => {
  const nowMs = ms(20, 5);
  const focus = { protocolId: 3, dayKey: DAY, ti: 1, slotMs: ms(20, 0), nonce: 1 };
  const r = reminderFocus({ protocol: twice, logs: [], focus, nowMs });
  assert.equal(r.kind, 'open');
  const button = notificationTakeTarget({ dayKey: DAY, slotMs: ms(20, 0), snoozed: false, nowMs });
  assert.equal(r.slot.slotMs, button.slotMs, 'the reminder\'s own slot, as the button');
  assert.equal(r.slot.dayKey, button.dayKey);
  assert.equal(r.slot.ti, 1);
  assert.equal(r.slot.flipRowId, null);
  assert.equal(r.cancelUpTo, 2, 'cancelTodaysDoseReminders(protocolId, ti + 1), as the button');
  // One Taken row at the tap time — the same plan the button's recordDoseTaken runs.
  const fromFocus = planMarkTaken({ protocol: twice, todayLogs: [], dayKey: DAY, slotMs: r.slot.slotMs, nowMs });
  const fromButton = planMarkTaken({ protocol: twice, todayLogs: [], dayKey: button.dayKey, slotMs: button.slotMs, nowMs });
  assert.deepEqual(fromFocus.insert, fromButton.insert);
  assert.equal(fromFocus.insert.logged_at, new Date(nowMs).toISOString(), 'the tap time');
  assert.equal(fromFocus.update, null);
});

test('DV-036 (a): an auto-Missed 08:00 row is not flipped by a 20:00 reminder take (the button does not flip it either)', () => {
  const nowMs = ms(20, 5);
  const missed = { id: 7, protocol_id: 3, outcome: 'Missed', logged_at: iso(8, 0) };
  const r = reminderFocus({ protocol: twice, logs: [missed], focus: { protocolId: 3, dayKey: DAY, ti: 1, slotMs: ms(20, 0) }, nowMs });
  assert.equal(r.kind, 'open');
  const plan = planMarkTaken({ protocol: twice, todayLogs: [missed], dayKey: DAY, slotMs: r.slot.slotMs, nowMs });
  assert.equal(plan.update, null);
  assert.ok(plan.insert);
});

test('DV-036 (b): the reminder\'s dose already Taken → "logged" with the row\'s time, no take offered (A-171)', () => {
  const rows = [{ id: 11, protocol_id: 2, outcome: 'Taken', logged_at: iso(8, 12) }];
  const r = reminderFocus({ protocol: testo, logs: rows, focus: { protocolId: 2, dayKey: DAY, ti: 0, slotMs: ms(8, 0) }, nowMs: ms(9, 0) });
  assert.deepEqual(r, { kind: 'logged', outcome: 'Taken', loggedAt: iso(8, 12) });
});

test('DV-036 (b): the reminder\'s dose Skipped → "logged" Skipped with the skip\'s time', () => {
  const rows = [{ id: 12, protocol_id: 2, outcome: 'Skipped', logged_at: iso(8, 30) }];
  const r = reminderFocus({ protocol: testo, logs: rows, focus: { protocolId: 2, dayKey: DAY, ti: 0, slotMs: ms(8, 0) }, nowMs: ms(9, 0) });
  assert.deepEqual(r, { kind: 'logged', outcome: 'Skipped', loggedAt: iso(8, 30) });
});

test('DV-036: an auto-Missed row at the reminder\'s slot is still open (the button flips it)', () => {
  const rows = [{ id: 13, protocol_id: 2, outcome: 'Missed', logged_at: iso(8, 0) }];
  const r = reminderFocus({ protocol: testo, logs: rows, focus: { protocolId: 2, dayKey: DAY, ti: 0, slotMs: ms(8, 0) }, nowMs: ms(9, 0) });
  assert.equal(r.kind, 'open');
});

test('DV-036: a reminder without a slot named — logged only when every slot of today is filled', () => {
  const rows = [{ id: 14, protocol_id: 2, outcome: 'Taken', logged_at: iso(8, 12) }];
  const r = reminderFocus({ protocol: testo, logs: rows, focus: { protocolId: 2, dayKey: DAY, ti: null, slotMs: null }, nowMs: ms(9, 0) });
  assert.deepEqual(r, { kind: 'logged', outcome: 'Taken', loggedAt: iso(8, 12) });
  const open = reminderFocus({ protocol: testo, logs: [], focus: { protocolId: 2, dayKey: DAY, ti: null, slotMs: null }, nowMs: ms(9, 0) });
  assert.equal(open.kind, 'open');
  assert.equal(open.cancelUpTo, 1);
});

test('DV-036: a reminder for another day, or a protocol with no dose today → null', () => {
  assert.equal(reminderFocus({ protocol: testo, logs: [], focus: { protocolId: 2, dayKey: '2026-10-31', ti: 0, slotMs: ms(8, 0) - 86400000 }, nowMs: ms(9, 0) }), null);
  const offDay = { ...testo, start_date: '2026-10-12' };
  assert.equal(reminderFocus({ protocol: offDay, logs: [], focus: { protocolId: 2, dayKey: DAY, ti: 0, slotMs: ms(8, 0) }, nowMs: ms(9, 0) }), null);
});

// ── Today wiring ───────────────────────────────────────────────────
const TODAY = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');

test('DV-036: Today decides a reminder focus with reminderFocus; the focus card takes the reminder\'s slot', () => {
  assert.match(TODAY, /reminderFocus\(\{ protocol: p, logs: todayRows, focus: notifFocus, nowMs: Date\.now\(\) \}\)/);
  assert.match(TODAY, /renderDoseCard\(focusCard, \{ highlight: true, takeSlot: reminderPlan && reminderPlan\.kind === 'open' \? reminderPlan\.slot : null, cancelUpTo: reminderPlan && reminderPlan\.kind === 'open' \? reminderPlan\.cancelUpTo : null \}\)/);
  assert.match(TODAY, /handleTake\(p, rect, 0, \{ slot: opts\.takeSlot \|\| cp\.next, cancelUpTo: opts\.cancelUpTo \}\)/);
  // The oral write and the injectable's site question both carry the reminder's range.
  assert.match(TODAY, /const cancelUpTo = Math\.max\(Number\.isFinite\(slot\.ti\) \? slot\.ti \+ 1 : 0, opts\.cancelUpTo \|\| 0\);/);
});

test('DV-036: the "already logged" toast shows once per reminder tap, only for a row written before the tap (a take from the card never says "already")', () => {
  const i = TODAY.indexOf('focusNoticeRef.current === notifFocus.nonce');
  assert.ok(i > 0);
  const block = TODAY.slice(i, i + 1400);
  assert.match(block, /if \(Number\.isFinite\(notifFocus\.nonce\) && Date\.parse\(reminderPlan\.loggedAt\) > notifFocus\.nonce\) return;/);
  assert.match(block, /focusNoticeRef\.current = notifFocus\.nonce;/);
  assert.match(block, /'today_focus_already_skipped' : 'today_focus_already_taken'/);
  assert.match(block, /\.replace\('\{name\}', name\)\.replace\('\{time\}', /);
  assert.match(TODAY, /\{focusNotice && !undoData && !takeNotice && \(\s*<View style=\{toast\.takeNoticeBar\} accessibilityLiveRegion="polite">\s*<Text style=\{s\.takeNoticeText\}>\{focusNotice\}<\/Text>/);
});

test('DV-036: the notification button keeps its behaviour (same target, cancels ti + 1)', () => {
  const act = fs.readFileSync(path.join(__dirname, '../lib/notificationActions.js'), 'utf8');
  assert.match(act, /const target = notificationTakeTarget\(\{ dayKey: origDay, slotMs: r\.data\.slotMs,/);
  assert.match(act, /await cancelTodaysDoseReminders\(protocolId, ti \+ 1\);/);
});

test('DV-036: the toast texts in six languages, with {name} and {time}', () => {
  assert.equal(translations.pt.today_focus_already_taken, 'Esta dose de {name} já foi registrada às {time}.');
  assert.equal(translations.pt.today_focus_already_skipped, 'Esta dose de {name} foi pulada às {time}. Você ainda pode registrá-la em Hoje.');
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['today_focus_already_taken', 'today_focus_already_skipped']) {
      const v = translations[lang][k];
      assert.ok(v, `${lang}.${k}`);
      assert.match(v, /\{name\}/);
      assert.match(v, /\{time\}/);
    }
    assert.ok(translations[lang].today_focus_already_skipped.includes(translations[lang].tab_today), `${lang}: names the Today tab as the app does`);
  }
});
