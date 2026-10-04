'use strict';
// Pre-build pass 2026-10-03, m4: the My Body hub promised vaccine "next-due reminders" (the app
// has no vaccine reminders, only the next-due DATE the user enters) and a half-life "you enter"
// (the user never enters one: the curve uses published half-lives, as its disclaimer says).
// Never promise what does not exist — in all six languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;

const NO_REMINDER = { en: /reminder/i, es: /recordatorio/i, pt: /lembrete/i, fr: /rappels d'échéance/i, de: /erinnerung/i, it: /promemoria/i };
const NO_TYPED_HALF_LIFE = { en: /you enter/i, es: /tú introduces/i, pt: /você digita/i, fr: /vous saisissez/i, de: /du eingibst/i, it: /inserisci tu/i };
const PUBLISHED = { en: /published half-lives/, es: /vidas medias publicadas/, pt: /meias-vidas publicadas/, fr: /demi-vies publiées/, de: /veröffentlichter Halbwertszeiten/, it: /emivite pubblicate/ };

test('the vaccine card speaks of next-due dates, never reminders', () => {
  for (const l of Object.keys(NO_REMINDER)) assert.doesNotMatch(tr[l].body_card_vax_desc, NO_REMINDER[l], l);
  assert.match(tr.en.body_card_vax_desc, /next-due dates/);
});

test('the dose-accumulation card says published half-lives, never one the user enters', () => {
  for (const l of Object.keys(PUBLISHED)) {
    assert.doesNotMatch(tr[l].body_card_dosing_desc, NO_TYPED_HALF_LIFE[l], l);
    assert.match(tr[l].body_card_dosing_desc, PUBLISHED[l], l);
  }
});
