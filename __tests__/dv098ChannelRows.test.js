'use strict';
// DV-098 (DL-49; founder 2026-11-01, docs/design/rodada2-conta-exames.html #dv098): the Reminder check
// SHOWS the Android category of every other reminder kind the person switched on — "Check-ins e
// registro de comida" (the 20:00 food question, the check-in, the weigh-in) and "Alertas de frasco" —
// one row each, OK or off in red with "Ligar", counted in "{n} de {total} prontos".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const R = require('../lib/reminderHealth');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
function loadTranslations() {
  const src = read('i18n/translations.js');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const T = loadTranslations();
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const ON = 3; // AndroidImportance.DEFAULT as expo reports it

// Every Android item OK (notifications, alarms, battery, hibernation), not Samsung: 4 of 4.
const base = { os: 'android', manufacturer: 'Google', permission: 'granted', doseChannelImportance: ON, batteryOptimized: false,
  exactAlarms: true, hibernationExempt: true, remindersOn: true, activeWithTime: 1, scheduledCount: 20, syncedOnce: true,
  lastRefresh: { at: Date.now(), ok: true }, nowMs: Date.now() };

// The ROW table of components/ReminderSetupList.js, read from its source (the file is JSX/ESM).
function rowTable() {
  const ast = parse(read('components/ReminderSetupList.js'), { sourceType: 'module', plugins: ['jsx'] });
  const decl = ast.program.body.find((n) => n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.declarations && n.declaration.declarations[0].id.name === 'ROW');
  const out = {};
  for (const p of decl.declaration.declarations[0].init.properties) {
    const key = p.key.name || p.key.value;
    out[key] = Object.fromEntries(p.value.properties.map((q) => [q.key.name, q.value.value]));
  }
  return out;
}

test('DV-098: food reminders on + check-in category off → a block row on the screen, counted', () => {
  const h = { ...base, foodOn: true, checkinOn: false, vialOn: true, checkinChannelImportance: R.IMPORTANCE_NONE, vialChannelImportance: ON };
  const st = R.setupSteps(h, { withRefresh: true });
  const by = Object.fromEntries(st.rows.map((r) => [r.id, r]));
  assert.equal(by.channel_checkin && by.channel_checkin.state, 'block', 'the check-in row shows, off');
  assert.equal(by.channel_vial && by.channel_vial.state, 'ok', 'the vial row shows, OK');
  assert.equal(st.total, 6, '4 phone items + 2 categories');
  assert.equal(st.ready, 5, 'the picture: "5 de 6 prontos"');
  assert.equal(st.done, false);
  // The two category rows come last, as drawn.
  assert.deepEqual(st.rows.slice(-2).map((r) => r.id), ['channel_checkin', 'channel_vial']);
  // The Settings row is never "All set" with a category off.
  assert.notEqual(R.setupRowState(h).kind, 'ok');
});

test('DV-098: a row only for a kind switched on; unreadable → no row; all on → all ready', () => {
  const h = { ...base, foodOn: false, checkinOn: false, vialOn: false, checkinChannelImportance: R.IMPORTANCE_NONE, vialChannelImportance: R.IMPORTANCE_NONE };
  let st = R.setupSteps(h);
  assert.ok(!st.rows.some((r) => r.id.startsWith('channel_')), 'kinds off → no category rows');
  assert.equal(st.total, 4);
  st = R.setupSteps({ ...h, checkinOn: true, vialOn: true, checkinChannelImportance: null, vialChannelImportance: null });
  assert.equal(st.total, 4, 'a category the phone did not report is not shown or counted');
  st = R.setupSteps({ ...h, foodOn: true, vialOn: true, checkinChannelImportance: ON, vialChannelImportance: ON });
  assert.equal(st.ready, 6); assert.equal(st.total, 6); assert.equal(st.done, true);
  assert.equal(R.setupRowState({ ...h, foodOn: true, vialOn: true, checkinChannelImportance: ON, vialChannelImportance: ON }).kind, 'ok');
  // iPhone has no categories.
  assert.ok(!R.setupSteps({ ...h, os: 'ios', foodOn: true, checkinChannelImportance: R.IMPORTANCE_NONE }).rows.some((r) => r.id.startsWith('channel_')));
});

test('DV-098: the rows reuse the channel names, say where it is switched, and the fix is "Turn on"', () => {
  const ROW = rowTable();
  assert.deepEqual(ROW.channel_checkin, { icon: ROW.channel_checkin.icon, title: 'notif_channel_checkin', ok: 'rc_channel_on_android', block: 'rc_channel_block', fix: 'rc_fix_turn_on' });
  assert.deepEqual(ROW.channel_vial, { icon: ROW.channel_vial.icon, title: 'notif_channel_vials', ok: 'rc_channel_on_android', block: 'rc_channel_block', fix: 'rc_fix_turn_on' });
  assert.equal(T.pt.notif_channel_checkin, 'Check-ins e registro de comida');
  assert.equal(T.pt.notif_channel_vials, 'Alertas de frasco');
  assert.equal(T.pt.rc_channel_on_android, 'Ligada nas configurações do Android');
  assert.equal(T.pt.rc_channel_block, 'Desligada nas configurações do Android');
  assert.equal(T.pt.rc_fix_turn_on, 'Ligar');
  for (const l of LANGS) assert.ok(T[l].rc_channel_on_android, `${l}.rc_channel_on_android`);
  // The fix opens that category's Android screen (lib/notifications openReminderFix).
  assert.match(read('lib/notifications.js'), /fix === 'channel_checkin' \? 'checkin-reminders' : fix === 'channel_vial' \? 'vial-alerts'/);
});
