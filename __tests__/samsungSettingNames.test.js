'use strict';
// A-110 RG-7 (founder 2026-10-07, screenshot of App info on his Fold): a row must carry the name the
// phone shows on the screen its button opens. Samsung calls "Pause app activity if unused"
// "Manage app if unused". Names below are Samsung's own strings, read from the Fold's Settings
// (SecSettings) and Device care (SmartManager_v5) resources on 2026-10-07 — pt = pt-BR, es = es-US.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers/extractFn');
const R = require('../lib/reminderHealth');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

const SAMSUNG = {
  hibernation: { en: 'Manage app if unused', pt: 'Gerenciar aplicativo não usado', es: 'Administrar aplicación no usada',
    fr: "Gérer l'appli si inutilisée", de: 'App verwalten, wenn ungenutzt', it: 'Gestisci app se non utilizzate' },
  deepSleep: { en: 'Deep sleeping apps', pt: 'Aplicativos em suspensão profunda', es: 'Aplicaciones en suspensión profunda',
    fr: 'Applications en veille profonde', de: 'Apps in tiefem Standby', it: 'App in sospensione avanzata' },
  limits: { en: 'Background usage limits', pt: 'Limites de uso em segundo plano', es: 'Límites de uso en segundo plano',
    fr: 'Limites utilisation arrière-plan', de: 'Grenzen der Hintergrundnutzung', it: 'Limiti per l’uso in background' },
};
const LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it'];

test('RG-7 Samsung: the hibernation row is titled with Samsung\'s name on a Samsung phone only', () => {
  assert.equal(R.rowTitleKey('hibernation', 'samsung'), 'rc_hibernation_samsung');
  assert.equal(R.rowTitleKey('hibernation', 'SAMSUNG'), 'rc_hibernation_samsung');
  assert.equal(R.rowTitleKey('hibernation', 'Google'), 'rc_hibernation');
  assert.equal(R.rowTitleKey('hibernation', null), 'rc_hibernation');
  assert.equal(R.rowTitleKey('alarms', 'samsung'), null, 'other rows keep their own title');
  for (const l of LANGS) assert.equal(T[l].rc_hibernation_samsung, SAMSUNG.hibernation[l], l);
});

test('RG-7 Samsung: deep sleeping apps and its path use Samsung\'s own names in all 6 languages', () => {
  for (const l of LANGS) {
    assert.equal(T[l].rc_deep_sleep, SAMSUNG.deepSleep[l], `${l} rc_deep_sleep`);
    assert.ok(T[l].rc_deep_sleep_sub.includes(SAMSUNG.limits[l]), `${l} rc_deep_sleep_sub names "${SAMSUNG.limits[l]}"`);
  }
});

test('RG-7 Samsung: Check reminders and the setup step title rows through rowTitleKey', () => {
  const src = read('screens/ReminderCheckScreen.js');
  assert.match(src, /rowTitleKey\(c\.id, health\.manufacturer\)/);
});
