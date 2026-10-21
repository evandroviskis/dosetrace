'use strict';
// 1.3.2 — the reminder (REM) defects of the 1.3.0 audit, language and copy (×6).
// docs/product/DIVERGENCES.md DV-049, DV-050, DV-140, DV-141, DV-196, DV-215. Wording rows
// (DV-049, DV-140, DV-215) and the new Android channel names (DV-141) are written natively and wait
// for the founder's wording approval ("Approvals still owed").
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFn, read } = require('./helpers/extractFn');
const T = require('../i18n/translations.js').translations;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// ── DV-196 (DL-13): the device language rules the notifications when none was chosen ───────────
const { readAppLanguage, resolveLanguage } = require('../lib/appLanguage');
const store = (v) => ({ getItem: async () => v });
const phone = (code) => ({ getLocales: () => [{ languageCode: code }] });
test('DV-196: no dosetrace_language, device language pt → the notification path\'s translator returns the pt strings', async () => {
  assert.equal(await readAppLanguage(store(null), phone('pt')), 'pt');
  const getT = loadFn('lib/notifications.js', 'async function getT(', 'getT', { readAppLanguage: () => readAppLanguage(store(null), phone('pt')), translations: T });
  const t = await getT();
  assert.equal(t.language, 'pt');
  assert.equal(t('notif_dose_title_private'), T.pt.notif_dose_title_private);
  assert.equal(t('notif_action_complete'), T.pt.notif_action_complete);
});
test('DV-196: the stored choice wins; an unsupported phone language falls back to English', async () => {
  assert.equal(await readAppLanguage(store('en'), phone('pt')), 'en');
  assert.equal(await readAppLanguage(store(null), phone('ja')), 'en');
  assert.equal(await readAppLanguage(store(null), { getLocales: () => { throw new Error('x'); } }), 'en');
  assert.equal(resolveLanguage('xx', 'de'), 'de');
  // One rule for the screens and the notifications.
  const ctx = read('i18n/LanguageContext.js');
  assert.match(ctx, /import \{ resolveLanguage, deviceLanguage, LANGUAGE_KEY \} from '\.\.\/lib\/appLanguage';/);
  assert.match(ctx, /setLanguageState\(resolveLanguage\(saved, deviceLanguage\(Localization\)\)\)/);
  assert.match(read('lib/notificationActions.js'), /const lang = await readAppLanguage\(\);/);
  assert.doesNotMatch(read('lib/notifications.js'), /getItem\('dosetrace_language'\)/);
});

// ── DV-050: a language change re-plans the scheduled notifications ─────────────────────────────
test("DV-050: setLanguage('pt') → a resync is requested (after the choice is stored)", async () => {
  const order = [];
  const setLanguage = loadFn('i18n/LanguageContext.js', 'function setLanguage(code) {', 'setLanguage', {
    setLanguageState: (c) => order.push(['state', c]), LANGUAGE_KEY: 'dosetrace_language',
    AsyncStorage: { setItem: async (k, v) => { order.push(['stored', k, v]); } },
    require: () => ({ onAppLanguageChanged: async () => { order.push(['resync']); } }),
  });
  setLanguage('pt');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(order, [['state', 'pt'], ['stored', 'dosetrace_language', 'pt'], ['resync']]);
  const calls = [];
  const changed = loadFn('lib/notifications.js', 'export async function onAppLanguageChanged(', 'onAppLanguageChanged', {
    syncNotificationChannels: async () => calls.push('channels'), syncAllNotifications: async () => calls.push('resync'),
    restoreSnoozes: async () => calls.push('snoozes'), // Gate B F8: the snoozed copies are re-worded too
    registerPushToken: async () => calls.push('push'), // A-127 / A-156: the push row carries the language
  });
  await changed();
  assert.deepEqual(calls, ['channels', 'resync', 'snoozes', 'push']);
});

// ── DV-141: Android channel names in the app language ──────────────────────────────────────────
test('DV-141: channel name in pt is Portuguese (re-created on a language change)', async () => {
  const set = {};
  const N = { AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 }, setNotificationChannelAsync: async (id, cfg) => { set[id] = cfg; } };
  const t = Object.assign((k) => T.pt[k] || k, { language: 'pt' });
  const fn = loadFn('lib/notifications.js', 'export async function syncNotificationChannels(', 'syncNotificationChannels', { getNotifications: () => N, Platform: { OS: 'android' }, getT: async () => t });
  await fn();
  assert.equal(set['dose-reminders'].name, 'Lembretes de dose');
  assert.equal(set['vial-alerts'].name, T.pt.notif_channel_vials);
  assert.equal(set['checkin-reminders'].name, T.pt.notif_channel_checkin);
  assert.doesNotMatch(read('lib/notifications.js'), /name: '(Dose Reminders|Vial Alerts|Check-in Reminders)'/, 'no English literal');
  for (const l of LANGS) {
    for (const k of ['notif_channel_doses', 'notif_channel_vials', 'notif_channel_checkin']) assert.ok(T[l][k], `${l}.${k}`);
    // The Reminder check names the category the way Android now shows it.
    assert.ok(T[l].rc_channel.includes(T[l].notif_channel_doses), `${l}: rc_channel names the channel`);
    // One term per concept: the channel is the Settings switch of the same kind.
    assert.equal(T[l].notif_channel_doses, T[l].settings_dose_reminders, `${l}: dose channel = Settings switch`);
    assert.equal(T[l].notif_channel_vials, T[l].settings_vial_alerts, `${l}: vial channel = Settings switch`);
  }
});

// ── DV-049 (DL-48): the persistent-reminders line describes the two repeats ────────────────────
test('DV-049: settings_persistent_sub ×6 says +5 and +10, never "until acknowledged"', () => {
  const STEMS = { en: /until acknowledged/i, es: /hasta confirmar/i, pt: /até confirmar/i, fr: /jusqu'à confirmation/i, de: /bis du sie bestätigst|bis zur Bestätigung/i, it: /finché non confermi|fino a conferma/i };
  for (const l of LANGS) {
    const s = T[l].settings_persistent_sub;
    assert.doesNotMatch(s, STEMS[l], l);
    assert.doesNotMatch(s, /\bevery 5\b|\bcada 5\b|\ba cada 5\b|toutes les 5|alle 5|ogni 5/i, `${l}: not "every 5 min"`);
    assert.ok(s.includes('5') && s.includes('10'), `${l}: names both repeats`);
  }
  assert.match(read('lib/notifications.js'), /const FOLLOWUP_DELAYS = \[5, 10\];/, 'what the code sends');
});

// ── DV-140 (AD-26): one switch "Vial alerts" covers running low AND expiry ─────────────────────
test('DV-140: the switch is "Vial alerts" ×6 and its line names both alerts', () => {
  assert.equal(T.en.settings_vial_alerts, 'Vial alerts');
  const EXPIRY_ONLY = { en: /expiry/i, es: /vencimiento/i, pt: /vencimento/i, fr: /péremption/i, de: /Ablauf/, it: /scadenza/i };
  const LOW = { en: /running low/i, es: /acabando/i, pt: /acabando/i, fr: /bientôt vide/i, de: /knapp/i, it: /finendo/i };
  for (const l of LANGS) {
    assert.doesNotMatch(T[l].settings_vial_alerts, EXPIRY_ONLY[l], `${l}: the label is not expiry-only`);
    assert.match(T[l].settings_vial_alerts_sub, LOW[l], `${l}: the line names running low`);
  }
});

// ── DV-215: PT and ES reminder terms ──────────────────────────────────────────────────────────
test('DV-215: PT and ES reminder strings use "lembrete" / "recordatorio"; no "garantidos"', () => {
  assert.doesNotMatch(T.pt.rc_refresh_until, /garantid/i);
  assert.match(T.pt.rc_refresh_until, /lembretes agendados até \{date\}/);
  assert.match(T.es.rc_refresh_until, /recordatorios programados/);
  assert.match(T.pt.today_alert_reminders_body, /lembretes/i);
  assert.doesNotMatch(T.pt.today_alert_reminders_body, /avisos de dose/i);
  assert.match(T.es.today_alert_reminders_body, /recordatorios/i);
  assert.doesNotMatch(T.es.today_alert_reminders_body, /avisos de dosis/i);
});
