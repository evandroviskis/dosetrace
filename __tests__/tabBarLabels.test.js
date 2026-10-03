'use strict';
// Founder 2026-10-02: the bottom tab bar truncated in Portuguese ("Meus proto…",
// "Configuraçõ…"). The tab bar has its own short labels (tabbar_*), so the screen titles and
// back links that use tab_* keep their full names. Portuguese: Protocolos / Ajustes (like the
// iPhone's own Settings). Every label must fit one tab of a 393-402 pt wide iPhone: about
// 68 pt for an 11 pt semibold label (measured with the system font, SF Pro: the widths below).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
  return mod.exports.translations;
}
const tr = load();
const APP = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

const WANT = {
  en: { tabbar_protocols: 'Protocols', tabbar_settings: 'Settings' },
  es: { tabbar_protocols: 'Protocolos', tabbar_settings: 'Ajustes' },
  pt: { tabbar_protocols: 'Protocolos', tabbar_settings: 'Ajustes' },
  fr: { tabbar_protocols: 'Protocoles', tabbar_settings: 'Paramètres' },
  de: { tabbar_protocols: 'Protokolle', tabbar_settings: 'Optionen' },
  it: { tabbar_protocols: 'Protocolli', tabbar_settings: 'Opzioni' },
};

// SF Pro 11 pt semibold widths (pt), measured with the system font on macOS (NSFont
// systemFont 11 semibold) — the labels the tab bar shows in each language.
const MEASURED = {
  'Today': 32.7, 'Protocols': 52.1, 'Journey': 44.2, 'My Body': 47.1, 'Settings': 45.7,
  'Hoy': 21.5, 'Protocolos': 58.9, 'Progreso': 49.5, 'Mi cuerpo': 54.2, 'Ajustes': 40.8,
  'Hoje': 24.9, 'Evolução': 49.1, 'Meu corpo': 57.9,
  "Aujourd'hui": 62.9, 'Protocoles': 58.7, 'Parcours': 48.6, 'Mon corps': 57.5, 'Paramètres': 62.7,
  'Heute': 32.8, 'Protokolle': 55.4, 'Verlauf': 39.2, 'Mein Körper': 66.2, 'Optionen': 50.0,
  'Oggi': 25.8, 'Protocolli': 52.2, 'Percorso': 48.8, 'Il mio corpo': 64.1, 'Opzioni': 41.4,
};
const FIT = 68; // one of five tabs on a 393 pt iPhone, minus the tab padding

test('the tab bar has its own short labels in all six languages', () => {
  for (const [l, keys] of Object.entries(WANT)) {
    for (const [k, v] of Object.entries(keys)) assert.equal(tr[l][k], v, `${l}.${k}`);
  }
});

test('App.js uses the tab-bar keys; the screen-title keys stay full', () => {
  assert.match(APP, /label: t\('tabbar_protocols'\)/);
  assert.match(APP, /label: t\('tabbar_settings'\)/);
  assert.doesNotMatch(APP, /label: t\('tab_protocols'\)|label: t\('tab_settings'\)/);
  assert.equal(tr.pt.tab_protocols, 'Meus protocolos', 'the full name stays for titles and back links');
  assert.equal(tr.pt.tab_settings, 'Ajustes', 'one name for Settings in Portuguese (founder 2026-10-02)');
  assert.equal(tr.es.tab_settings, 'Ajustes');
  assert.equal(tr.fr.tab_settings, 'Paramètres');
  assert.equal(tr.en.tab_protocols, 'My Protocols', 'English keeps My Protocols for the screen title');
});

test('every tab label fits a 393 pt iPhone tab (English Protocols too, founder 2026-10-02)', () => {
  const tabs = ['tab_today', 'tabbar_protocols', 'tab_journey', 'tab_body', 'tabbar_settings'];
  for (const l of Object.keys(WANT)) {
    for (const k of tabs) {
      const label = tr[l][k];
      const w = MEASURED[label];
      assert.ok(w != null, `${l}.${k} "${label}" has a measured width`);
      assert.ok(w <= FIT, `${l}.${k} "${label}" is ${w} pt, over ${FIT}`);
    }
  }
});
