'use strict';
// Founder 2026-10-02 ("siga"): one natural name per screen in every language.
// - Settings: Portuguese and Spanish say Ajustes everywhere (tab, title, references), French
//   says Paramètres everywhere (it fits the tab: 62.7 pt of 68, tabBarLabels.test.js). The
//   phone's own Settings app keeps its real name (Ajustes on a Brazilian iPhone, Réglages on a
//   French iPhone) where a string sends the user there.
// - Journey in Portuguese is Evolução (Jornada was a calque).
// - French vials are Flacons; the bloodwork title is Bilan sanguin (FR) and Blutwerte (DE).
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
const all = (l) => Object.entries(tr[l]).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);

test('Settings has one name in Portuguese, Spanish and French', () => {
  for (const [l, name] of [['pt', 'Ajustes'], ['es', 'Ajustes'], ['fr', 'Paramètres']]) {
    assert.equal(tr[l].tab_settings, name, l);
    assert.equal(tr[l].settings_title, name, l);
    assert.equal(tr[l].tabbar_settings, name, l);
  }
  for (const [k, v] of all('pt')) assert.doesNotMatch(v, /Configurações/, `pt.${k}`);
  for (const [k, v] of all('es')) assert.doesNotMatch(v, /Configuración/, `es.${k}`);
  // French: "Réglages" only where it names the phone's own Settings app.
  const frOk = new Set(['rc_channel_block', 'settings_terms_body', 'blood_camera_denied', 'paywall_legal', 'paywall_legal_no_trial', 'settings_delete_apple_revoke_note', 'faq_categories', 'paywall_cancel_sub_msg']);
  for (const [k, v] of all('fr')) if (/Réglages|réglages/.test(v)) assert.ok(frOk.has(k), `fr.${k} names Réglages: ${v.slice(0, 80)}`);
  assert.match(tr.fr.consent_footer, /Paramètres > Données et confidentialité/);
  assert.match(tr.pt.consent_footer, /Ajustes > Dados e privacidade/);
});

test('Journey is Evolução in Portuguese', () => {
  assert.equal(tr.pt.tab_journey, 'Evolução');
  for (const [k, v] of all('pt')) assert.doesNotMatch(v, /Jornada/, `pt.${k}`);
});

test('French vials are Flacons; bloodwork is Bilan sanguin / Blutwerte', () => {
  assert.equal(tr.fr.tab_vials, 'Flacons');
  assert.equal(tr.fr.vials_title, 'Flacons');
  for (const [k, v] of all('fr')) assert.doesNotMatch(v, /\b[Ff]ioles?\b/, `fr.${k}`);
  assert.equal(tr.fr.blood_title, 'Bilan sanguin');
  assert.equal(tr.de.blood_title, 'Blutwerte');
  assert.doesNotMatch(JSON.stringify(tr.de.faq_categories), /Blutuntersuchung/);
});

test('French waist is Tour de taille (Taille alone reads as height)', () => {
  assert.equal(tr.fr.cal_snap_waist, 'Tour de taille');
});

test('Italian explainer wording follows the rest of the app', () => {
  assert.equal(tr.it.xp_energy_bmr, 'Consumo a riposo (BMR)');
  assert.equal(tr.it.xp_recon_title, 'Mai più tirare a indovinare quanto prelevare');
  assert.doesNotMatch(tr.it.xp_recon_body, /aspirare/);
});
