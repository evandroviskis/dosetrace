// Parked since 2026-10-26 ("o corte de segurança de 64 lembretes pode cancelar o lembrete que leva a
// frase"), fixed on the spot 2026-10-31 (founder rule 19:08 EDT). On iPhone the window's last dose
// reminder ends with "Open DoseTrace to keep getting your reminders." (AD-87 A). The 64 safety cut
// (enforcePendingCap, DV-053) cancels the LATEST pending requests, so it could cancel exactly that
// one and the person would get no warning before the reminders stop. Now the sentence moves to the
// last dose reminder that is still scheduled (it and its +5/+10 repeats).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { windowEndMove } = require('../lib/notificationPlan');

const req = (id, fireMs, type, extra = {}) => ({ identifier: id, content: { title: 'T', body: `body ${id}`, data: { type, fireMs, ...extra } }, trigger: { type: 'date', value: fireMs } });

test('the cut removed the window-end reminder: the last kept dose reminder (and its repeats) takes the sentence', () => {
  const all = [
    req('dose-1-a', 100, 'dose_reminder'), req('dose-1-a-f5', 105, 'dose_followup'),
    req('dose-1-b', 200, 'dose_reminder'), req('dose-1-b-f5', 205, 'dose_followup'), req('dose-1-b-f10', 210, 'dose_followup'),
    req('dose-1-c', 300, 'dose_reminder', { windowEnd: true }), req('dose-1-c-f5', 305, 'dose_followup', { windowEnd: true }),
    req('vial-x', 250, 'vial_expiry'),
  ];
  const moved = windowEndMove(all, ['dose-1-c', 'dose-1-c-f5']);
  assert.deepEqual(moved.map((m) => m.identifier), ['dose-1-b', 'dose-1-b-f5', 'dose-1-b-f10']);
  for (const m of moved) { assert.equal(m.content.data.windowEnd, true); assert.equal(m.fireMs, all.find((x) => x.identifier === m.identifier).content.data.fireMs); }
});

test('nothing moves when the window-end reminder was kept, or nothing was cut, or no dose reminder is left', () => {
  const all = [req('dose-1-a', 100, 'dose_reminder'), req('dose-1-c', 300, 'dose_reminder', { windowEnd: true }), req('vial-x', 400, 'vial_expiry')];
  assert.deepEqual(windowEndMove(all, ['vial-x']), []);
  assert.deepEqual(windowEndMove(all, []), []);
  assert.deepEqual(windowEndMove([req('dose-1-c', 300, 'dose_reminder', { windowEnd: true })], ['dose-1-c']), []);
});

test('wiring: the window-end reminder is marked, and the cap re-arms the moved ones with the sentence', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/notifications.js'), 'utf8');
  assert.match(src, /data: \{ type: s\.kind === 'main' \? 'dose_reminder' : 'dose_followup', [^}]*\.\.\.\(lastOfWindow && \{ windowEnd: true \}\)/);
  const cap = src.slice(src.indexOf('async function enforcePendingCap('), src.indexOf('// ── VIAL ALERTS'));
  assert.match(cap, /windowEndMove\(all, cancel\)/);
  assert.match(cap, /fill\(t\('notif_window_end_body'\), \{ body: m\.content\.body \}\)/);
});

// Senior review 2026-10-31: a snoozed copy of an EARLIER window-end reminder (snz-…, data copied as is)
// must not count as "the sentence is still kept" — the new window would get no sentence.
test('a snoozed copy of an old window-end reminder does not block the move', () => {
  const all = [
    req('snz-dose-1-old', 50, 'dose_reminder', { windowEnd: true }),
    req('dose-1-a', 100, 'dose_reminder'), req('dose-1-a-f5', 105, 'dose_followup'),
    req('dose-1-c', 300, 'dose_reminder', { windowEnd: true }),
  ];
  assert.deepEqual(windowEndMove(all, ['dose-1-c']).map((m) => m.identifier), ['dose-1-a', 'dose-1-a-f5']);
});
