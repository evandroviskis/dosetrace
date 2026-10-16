'use strict';
// A-134 (4) — both-theme render pass 2026-10-16 (pt): the Reminder check showed
// "Magnesium Bisglycinate · 21 lembretes…" while Today shows "Bisglicinato de Magnésio".
// Cause: the screen printed the scheduled notification's own title, and the dose reminder
// title was the protocol's stored name (protocol.name, typed or saved in English) — so the
// phone's reminders themselves said "Magnesium Bisglycinate" to a Portuguese user. DL-13: one
// display name per protocol everywhere (the translated compound), Today's rule.
// Fix: lib/protocolName.protocolDisplayName(p, t) = Today's rule (catalogue compound →
// t(compound_id), else the typed name). The Reminder check names the protocol the next
// reminder belongs to with it; the dose reminder title, the vial-running-low text and the
// morning summary list use it too (the reminders are re-planned on the next sync).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { protocolDisplayName } = require('../lib/protocolName');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tOf = (l) => (k) => tr[l][k] || tr.en[k] || k;
const MAG = { id: 'm1', compound_id: 'oral_mag_bisglycinate', name: 'Magnesium Bisglycinate' };

test('A-134 (4): the display name is the translated compound, else the typed name', () => {
  assert.equal(protocolDisplayName(MAG, tOf('pt')), 'Bisglicinato de Magnésio');
  assert.equal(protocolDisplayName(MAG, tOf('en')), tr.en.oral_mag_bisglycinate);
  assert.equal(protocolDisplayName({ name: 'My blend' }, tOf('pt')), 'My blend');
  assert.equal(protocolDisplayName(null, tOf('pt')), '');
});

test('A-134 (4): it is Today\'s rule', () => {
  const today = read('screens/TodayScreen.js');
  assert.match(today, /<Text style=\{s\.upName\}>\{p\.compound_id \? t\(p\.compound_id\) : p\.name\}<\/Text>/);
  assert.match(read('lib/protocolName.js'), /p\.compound_id \? t\(p\.compound_id\) : \(p\.name \|\| ''\)/);
});

test('A-134 (4): the Reminder check names the next reminder\'s protocol with the display name', () => {
  const screen = read('screens/ReminderCheckScreen.js');
  assert.match(screen, /import \{ protocolDisplayName \} from '\.\.\/lib\/protocolName';/);
  assert.match(screen, /health\.next\.protocol \? protocolDisplayName\(health\.next\.protocol, t\) : health\.next\.title/);
  assert.doesNotMatch(screen, /\[health\.next\.title, /, 'never the raw notification title first');
  const lib = read('lib/notifications.js');
  const fn = lib.slice(lib.indexOf('export async function readReminderHealth'), lib.indexOf('export async function sendTestReminder'));
  assert.match(fn, /protocolId: n\.content\.data\.protocolId/, 'the next reminder keeps its protocol id');
  assert.match(fn, /out\.next\.protocol = /, 'and the protocol it belongs to');
});

test('A-134 (4): the reminders themselves use the display name (dose title, vial low, morning summary)', () => {
  const lib = read('lib/notifications.js');
  assert.match(lib, /import \{ protocolDisplayName \} from '\.\/protocolName';/);
  assert.match(lib, /const title = showNames \? protocolDisplayName\(protocol, t\) : t\('notif_dose_title_private'\);/);
  assert.doesNotMatch(lib, /showNames \? protocol\.name/);
  assert.match(lib, /protocolNames\[p\.id\] = protocolDisplayName\(p, t\);/);
  assert.match(lib, /morningSummaryPlan\(protocols\.map\(\(p\) => \(\{ \.\.\.p, name: protocolDisplayName\(p, t\) \}\)\), todayKey/);
});
