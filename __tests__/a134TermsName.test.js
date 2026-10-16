'use strict';
// A-134 (6) — both-theme render pass 2026-10-16 (pt): the terms screen was titled "Termos de uso"
// (Settings row, sheet title, sign-up and onboarding links: settings_terms) but its text opened
// with "TERMOS DE SERVIÇO". One name per concept: the app's name for this screen and its links
// is settings_terms ("Termos de uso", used in four places), so the heading inside the text is
// the same name, in every language.
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const norm = (s) => s.replace(/’/g, "'");

test('A-134 (6): the terms text opens with the same name as its title and links, ×6', () => {
  for (const l of LANGS) {
    const heading = tr[l].settings_terms_body.split('\n')[0].trim();
    assert.equal(norm(heading), norm(tr[l].settings_terms).toLocaleUpperCase(l), l);
  }
  assert.equal(tr.pt.settings_terms_body.split('\n')[0], 'TERMOS DE USO');
  assert.doesNotMatch(tr.pt.settings_terms_body, /servi[çc]o/i, 'no second name for the terms in pt');
});
