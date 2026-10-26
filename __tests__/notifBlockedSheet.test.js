'use strict';
// Notifications blocked on the phone (docs/specs/notifications-blocked.md NB-1..NB-6; founder
// 2026-10-20 "1.3.2 recommendations accepted": "a short sheet when notifications are blocked on the
// phone"). One short DoseTrace sheet on Today, once per state change, never nagging; it opens the same
// system screen as the Reminder check's notifications row.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { read, sliceBlock } = require('./helpers/extractFn');

const { blockedSheetStep, blockedSheet, NOTIF_BLOCKED_KEY } = require('../lib/notifBlocked');

const h = (over = {}) => ({ permission: 'denied', remindersOn: true, silent: false, activeWithTime: 1, ...over });

test('NB-1 blocked while dose reminders matter, never shown before → show once and remember "denied"', () => {
  assert.deepEqual(blockedSheetStep(h(), null), { show: true, save: 'denied' });
  assert.deepEqual(blockedSheetStep(h(), 'granted'), { show: true, save: 'denied' });
});

test('NB-2 once per state change: still blocked → quiet; turned on → remembered, no sheet; blocked again → once more', () => {
  assert.deepEqual(blockedSheetStep(h(), 'denied'), { show: false, save: null });
  assert.deepEqual(blockedSheetStep(h({ permission: 'granted' }), 'denied'), { show: false, save: 'granted' });
  assert.deepEqual(blockedSheetStep(h({ permission: 'granted' }), 'granted'), { show: false, save: null });
  assert.deepEqual(blockedSheetStep(h(), 'granted'), { show: true, save: 'denied' });
});

test('NB-2 never asked (undetermined) or unreadable (null) is not "blocked on the phone": nothing shown, nothing remembered', () => {
  assert.deepEqual(blockedSheetStep(h({ permission: 'undetermined' }), null), { show: false, save: null });
  assert.deepEqual(blockedSheetStep(h({ permission: null }), null), { show: false, save: null });
  assert.deepEqual(blockedSheetStep(h({ permission: undefined }), 'granted'), { show: false, save: null });
});

test('NB-5 Silent mode, dose reminders off, or no protocol with a reminder time → no sheet (and it can still come once later)', () => {
  for (const over of [{ silent: true }, { remindersOn: false }, { activeWithTime: 0 }]) {
    assert.deepEqual(blockedSheetStep(h(over), null), { show: false, save: null }, JSON.stringify(over));
  }
  // Later the reminders matter and the phone is still blocked: it shows that once.
  assert.deepEqual(blockedSheetStep(h(), null), { show: true, save: 'denied' });
});

test('NB-1 / NB-3 the sheet: bell icon, title, body, "Agora não" then "Abrir ajustes do celular" (primary) which opens the fix', () => {
  const t = (k) => `[${k}]`;
  let opened = 0;
  const c = blockedSheet({ t, onOpen: () => { opened++; } });
  assert.equal(c.icon, 'bell');
  assert.equal(c.title, '[nb_title]');
  assert.equal(c.body, '[nb_body]');
  assert.equal(c.buttons.length, 2);
  assert.deepEqual(c.buttons.map((b) => [b.label, b.kind]), [['[nb_later]', 'secondary'], ['[nb_open]', 'primary']]);
  assert.equal(c.buttons[0].onPress, undefined, '"Agora não" only closes');
  c.buttons[1].onPress();
  assert.equal(opened, 1);
  assert.equal(c.locked, undefined, 'a tap outside closes it like "Agora não"');
});

// Coordinator 2026-10-26 (never nagging): "Não permitir" in the system dialog the app itself just
// showed is the person's own choice, seen seconds ago — the sheet never follows it. Only a later
// change counts: turned off afterwards in the phone's settings, or still off after it had been on.
function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, String(v)); } };
}

test('NB-2 "Não permitir" in the system dialog the app just showed is remembered as seen: no sheet after it; turned on later then off again → once', async () => {
  const { askAndRemember, rememberDialogAnswer } = require('../lib/notifBlocked');
  const store = memStore();
  const N = { requestPermissionsAsync: async () => ({ status: 'denied' }) };
  assert.equal(await askAndRemember(N, store), 'denied');
  assert.equal(store.m.get(NOTIF_BLOCKED_KEY), 'denied');
  assert.deepEqual(blockedSheetStep(h(), store.m.get(NOTIF_BLOCKED_KEY)), { show: false, save: null }, 'not right after the dialog');
  // Next opens: still off → still quiet.
  assert.deepEqual(blockedSheetStep(h(), 'denied'), { show: false, save: null });
  // Later turned on in the phone's settings (seen at an open), then off again → once.
  const on = blockedSheetStep(h({ permission: 'granted' }), 'denied');
  assert.equal(on.save, 'granted');
  assert.deepEqual(blockedSheetStep(h(), on.save), { show: true, save: 'denied' });
  // "Permitir" in the dialog is remembered too; an unreadable answer leaves the record alone.
  const s2 = memStore({ [NOTIF_BLOCKED_KEY]: 'denied' });
  await rememberDialogAnswer(s2, 'granted');
  assert.equal(s2.m.get(NOTIF_BLOCKED_KEY), 'granted');
  await rememberDialogAnswer(s2, null);
  await rememberDialogAnswer(s2, 'undetermined');
  assert.equal(s2.m.get(NOTIF_BLOCKED_KEY), 'granted');
  // A dialog that throws: no answer, nothing remembered, never throws itself.
  const s3 = memStore();
  assert.equal(await askAndRemember({ requestPermissionsAsync: async () => { throw new Error('x'); } }, s3), null);
  assert.equal(s3.m.size, 0);
  // A storage that fails never blocks the answer.
  assert.equal(await askAndRemember(N, { setItem: async () => { throw new Error('full'); } }), 'denied');
});

test('NB-2 both system dialogs the app shows remember the answer (the shared AD-88 ask and onboarding "Never miss a dose")', async () => {
  const { loadFn } = require('./helpers/extractFn');
  const store = memStore();
  const remembered = [];
  const ask = loadFn('lib/notifications.js', 'export async function askNotificationPermission(', 'askNotificationPermission', {
    getNotifications: () => ({ getPermissionsAsync: async () => ({ status: 'undetermined' }), requestPermissionsAsync: async () => ({ status: 'denied' }) }),
    AsyncStorage: store, DEVICE_VERDICT_KEY: 'V', syncAllNotifications: async () => {}, registerPushToken: async () => {}, _askInFlight: null,
    rememberDialogAnswer: async (st, status) => { remembered.push([st === store, status]); },
  });
  assert.equal(await ask(), true);
  assert.deepEqual(remembered, [[true, 'denied']]);
  assert.match(read('lib/notifications.js'), /import \{ rememberDialogAnswer \} from '\.\/notifBlocked';/);
  const onb = read('screens/OnboardingFlowScreen.js');
  assert.match(onb, /import \{ askAndRemember \} from '\.\.\/lib\/notifBlocked';/);
  assert.match(sliceBlock(onb, 'async function enableNotifications('), /await askAndRemember\(Notifications, AsyncStorage\);/);
  assert.doesNotMatch(onb, /Notifications\.requestPermissionsAsync\(/, 'no dialog left that skips the record');
});

test('NB-2 the state is kept on this phone (the permission belongs to the phone, not the account)', () => {
  assert.equal(NOTIF_BLOCKED_KEY, 'dosetrace_notif_blocked_seen');
});

test('NB-3 / NB-4 Today: read with the reminder health, after the Android setup step, never over a popup, never off Today, before the first screen; the key is written before it shows', () => {
  const src = read('screens/TodayScreen.js');
  assert.match(src, /import \{ blockedSheetStep, blockedSheet, NOTIF_BLOCKED_KEY \} from '\.\.\/lib\/notifBlocked';/);
  assert.match(src, /openReminderFix/);
  const rr = sliceBlock(src, 'const readReminders = useCallback(');
  // The setup screen (Android, once) goes first; the sheet is checked only when it did not open.
  assert.match(rr, /maybeOpenSetupForExisting\(navigation, h\.activeWithTime\)\.then\(\(opened\) => \{ if \(!opened\) checkNotifBlocked\(h\); \}\)/);
  assert.match(rr, /firstShownRef\.current\.p\.then/, 'after Today\'s first screen');
  const fn = sliceBlock(src, 'function checkNotifBlocked(');
  assert.match(fn, /AsyncStorage\.getItem\(NOTIF_BLOCKED_KEY\)/);
  assert.match(fn, /blockedSheetStep\(h, last\)/);
  assert.match(fn, /!focusedRef\.current \|\| todayPopupBusy\(\)/);
  assert.match(fn, /siteQueueRef\.current\.length/);
  assert.match(fn, /notifBlockedBusyRef/);
  const write = fn.indexOf('AsyncStorage.setItem(NOTIF_BLOCKED_KEY');
  const show = fn.indexOf('showTodaySheet(blockedSheet(');
  assert.ok(write > 0 && show > write, 'remembered before it shows (two reads at once never show it twice)');
  assert.match(fn, /onOpen: \(\) => \{ openReminderFix\('notifications'\)\.catch\(\(\) => \{\}\); \}/);
});

test('NB-6 the module is pure (no React Native) and has no raw colours', () => {
  const src = read('lib/notifBlocked.js');
  assert.doesNotMatch(src, /require\('react-native'\)|from 'react-native'/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba\(/);
});

function loadTranslations() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  return mod.exports.translations;
}

test('NB-6 the words in 6 languages; pt formal; "Agora não" is the same "Not now" as the rest of the app', () => {
  const tr = loadTranslations();
  const keys = ['nb_title', 'nb_body', 'nb_open', 'nb_later'];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(tr[l][k], `${l} ${k}`);
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) for (const k of ['nb_title', 'nb_body', 'nb_open']) assert.notEqual(tr[l][k], tr.en[k], `${l} ${k}`);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.equal(tr[l].nb_later, tr[l].today_vial_not_now, l);
  assert.equal(tr.pt.nb_title, 'Seus lembretes não podem chegar');
  assert.equal(tr.pt.nb_open, 'Abrir ajustes do celular');
  for (const k of keys) assert.doesNotMatch(tr.pt[k], /Não deu para|dá para|a gente|dê uma olhada/);
  // One term per concept: the Reminder check calls them "desligadas" (rc_notif_block).
  assert.match(tr.pt.rc_notif_block, /Desligadas/);
  assert.match(tr.pt.nb_body, /desligadas/);
});
