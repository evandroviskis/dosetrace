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
  // DV-139: the next reminder of any kind (lib/notificationPlan nextScheduled) keeps its protocol id.
  assert.match(fn, /out\.next = nextScheduled\(/);
  const next = require('../lib/notificationPlan').nextScheduled([{ identifier: 'dose-4-2026-10-03-t0', content: { title: 'x', data: { type: 'dose_reminder', protocolId: 4, slotMs: 5000 } } }], 1000, {});
  assert.equal(next.protocolId, 4, 'the next reminder keeps its protocol id');
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

// A-134 (4b) — coordinator 2026-10-16, same bug class: every other place the app shows a
// protocol's name (on screen, the provider report) used the stored p.name where Today shows the
// translated compound. All of them now go through protocolDisplayName. (The server's
// send-reminders function is not deployed; listed as a follow-up in the registry.)
test('A-134 (4b): the provider report names each protocol as Today does', () => {
  const s = read('screens/SettingsScreen.js');
  assert.match(s, /import \{ protocolDisplayName \} from '\.\.\/lib\/protocolName';/);
  assert.match(s, /name: isEnded\(p\) \? `\$\{protocolDisplayName\(p, t\)\} · \$\{t\('protocols_ended_on'\)/);
  assert.match(s, /` : protocolDisplayName\(p, t\),/);
  assert.doesNotMatch(s, /\$\{p\.name\} · /);
});

test('A-134 (4b): Today — skip sheet, vial-done prompt and site sheet use the display name', () => {
  const s = read('screens/TodayScreen.js');
  assert.match(s, /setSkipAsk\(\{ name: protocolDisplayName\(protocol, t\), onSkip: write \}\);/);
  // A-132: the vial window is screens/components/NewVialPrompt.js; Today hands it the display name.
  assert.match(s, /protocolName=\{continuationProtocol \? protocolDisplayName\(continuationProtocol, t\) : null\}/);
  assert.match(s, /protocolName=\{protocolDisplayName\(protocols\.find\(p => p\.id === bodyMapTarget\?\.protocolId\), t\) \|\| null\}/);
});

test('A-134 (4b): the Dose log and My Protocols "Last:" line translate the compound from the log join', () => {
  const { SQL_ALL_LOGS } = require('../lib/protocolEnd');
  assert.match(SQL_ALL_LOGS, /p\.compound_id as protocol_compound_id/);
  const log = read('screens/LogScreen.js');
  assert.match(log, /protocols: row\.protocol_name \? \{ name: row\.protocol_name, compound_id: row\.protocol_compound_id \|\| null,/);
  assert.match(log, /const logName = \(log\) => \(log && log\.protocols \? protocolDisplayName\(log\.protocols, t\) : t\('log_protocol_deleted'\)\);/);
  assert.doesNotMatch(log, /protocols\?\.name/, 'never the stored name on screen');
  const pr = read('screens/ProtocolsScreen.js');
  assert.match(pr, /\(lastLog && protocolDisplayName\(\{ compound_id: lastLog\.protocol_compound_id, name: lastLog\.protocol_name \}, t\)\) \|\| ''/);
});
