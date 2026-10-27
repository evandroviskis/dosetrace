'use strict';
// Founder 2026-10-27: "se o usuário colocar que o frasco vai durar 30 dias… faltando 7 dias para o vencimento,
// a gente também avisa… de acordo com a informação dada pelo cliente… faltam só 7 dias" — a vial rarely
// carries its date (it is on the box, often thrown away). The reconstituted vial's expiry alert names the
// validity the person gave; a ready-to-use box date keeps its own short line.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vialExpiryPlan } = require('../lib/notificationPlan');
const { expiryAlertBody } = require('../lib/vialExpiryText');
const { translations } = require('../i18n/translations');

const tPt = (k) => translations.pt[k];
tPt.language = 'pt';

test('the plan carries the validity the person gave (reconstituted) and stays 7 days ahead + the day', () => {
  const now = new Date(2026, 9, 27, 12).getTime();
  const p = { id: 1, type: 'recon', vial_valid_days: 30 };
  const plan = vialExpiryPlan({ vials: [{ id: 'v', protocol_id: 1, mixed_on: '2026-10-26' }], protocolsById: { 1: p }, nowMs: now });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].daysLeft, 7);
  assert.equal(plan[0].validDays, 30);
  assert.equal(new Date(plan[0].fireAtMs).getDate(), 18, '26/10 + 30 = 25/11, 7 days before = 18/11');
  const rtu = vialExpiryPlan({ vials: [{ id: 'w', protocol_id: 2, expires_on: '2026-12-31' }], protocolsById: { 2: { id: 2, type: 'rtu' } }, nowMs: now });
  assert.equal(rtu[0].validDays, null, 'a box date is not a validity in days');
});

test('the text: the validity the person gave, in the app language; the box date and the day itself keep theirs', () => {
  assert.equal(expiryAlertBody({ daysLeft: 7, validDays: 30 }, 'GHK-Cu', tPt), 'GHK-Cu: pela validade que você informou (30 dias após reconstituir), vence em 7 dias.');
  assert.equal(expiryAlertBody({ daysLeft: 1, validDays: 30 }, 'GHK-Cu', tPt), 'GHK-Cu: pela validade que você informou (30 dias após reconstituir), vence em 1 dia.');
  assert.equal(expiryAlertBody({ daysLeft: 7, validDays: null }, 'Testo', tPt), translations.pt.today_alert_vial_expiry_days.replace('{name}', 'Testo').replace('{n}', '7'));
  assert.equal(expiryAlertBody({ daysLeft: 0, validDays: 30 }, 'GHK-Cu', tPt), translations.pt.today_alert_vial_expired_one.replace('{name}', 'GHK-Cu'));
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['notif_vial_exp_valid', 'notif_vial_exp_valid_one']) {
      const v = translations[l][k];
      assert.ok(v && v.includes('{name}') && v.includes('{days}') && v.includes('{n}'), `${l}.${k}`);
    }
  }
});

test('wired: the scheduled alert, its snoozed copy and the name-hidden copy use the same text', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/notifications.js'), 'utf8');
  assert.equal((src.match(/expiryAlertBody\(/g) || []).length, 3);
  assert.doesNotMatch(src, /pluralKey\('today_alert_vial_expiry_days'/, 'one text builder');
  assert.match(src, /validDays: e\.validDays/);
});

// Journey review 2026-10-27: (F2) the box's month means the vial is good through its LAST day — "expired" only
// from the next day; the 7-day alert is 7 days before that. (note) An unset validity (the 30-day default) is
// never quoted as "the validity you gave". (F3) A vial whose protocol is gone sends no low alert.
test('journey: box date good through its last day; default validity not quoted; orphan vial silent', () => {
  const now = new Date(2026, 10, 30, 12).getTime(); // 30 Nov, the box's last day
  const rtu = vialExpiryPlan({ vials: [{ id: 'w', protocol_id: 2, expires_on: '2026-11-30' }], protocolsById: { 2: { id: 2, type: 'rtu' } }, nowMs: now });
  assert.equal(rtu[0].daysLeft, 0);
  assert.equal(new Date(rtu[0].fireAtMs).getDate(), 1, 'the "expired" alert comes on 1 Dec');
  const early = vialExpiryPlan({ vials: [{ id: 'w', protocol_id: 2, expires_on: '2026-11-30' }], protocolsById: { 2: { id: 2, type: 'rtu' } }, nowMs: new Date(2026, 10, 1, 12).getTime() });
  assert.equal(new Date(early[0].fireAtMs).getDate(), 24, '7 days before 1 Dec');
  const unset = vialExpiryPlan({ vials: [{ id: 'v', protocol_id: 1, mixed_on: '2026-11-01' }], protocolsById: { 1: { id: 1, type: 'recon', vial_valid_days: null } }, nowMs: new Date(2026, 10, 2).getTime() });
  assert.equal(unset[0].validDays, null, 'the default is not the person\'s');
  const today = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  assert.match(today, /daysLeft = Math\.ceil\(\(new Date\(v\.expires_on \+ 'T00:00:00'\)\.getTime\(\) \+ 86400000 - nowMs\) \/ 86400000\);/);
  const notif = fs.readFileSync(path.join(__dirname, '../lib/notifications.js'), 'utf8');
  assert.match(notif, /states = vials\.filter\(\(v\) => protocolById\[v\.protocol_id\]\)\.map/);
});
