'use strict';
// A-183 (council 2026-10-25, regulatory; founder "Pode executar todas as pendências do build 1.3.1"):
// expo-updates ships in build 7, so the in-app privacy policy says, in all six languages, that Expo
// delivers app updates and that only the platform, the app version and a random installation ID
// are sent — never the account or health data. The date moves with the change.
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../i18n/translations.js');
const T = t.default || t.translations || t;

const SENTENCE = {
  en: /App updates that fix problems are delivered by Expo.*random installation ID, never your account or health data\./,
  es: /actualizaciones de la app que corrigen problemas las entrega Expo.*nunca tu cuenta ni datos de salud\./,
  pt: /atualizações do app que corrigem problemas são entregues pelo Expo.*nunca a sua conta nem dados de saúde\./,
  fr: /mises à jour de l'app qui corrigent des problèmes sont fournies par Expo.*jamais votre compte ni vos données de santé\./,
  de: /App-Updates, die Fehler beheben, liefert Expo.*nie dein Konto oder Gesundheitsdaten\./,
  it: /aggiornamenti dell'app che correggono problemi sono forniti da Expo.*mai il tuo account né dati sanitari\./,
};
const DATE = { en: 'October 30, 2026', es: '30 de octubre de 2026', pt: '30 de outubro de 2026', fr: '30 octobre 2026', de: '30. Oktober 2026', it: '30 ottobre 2026' };

test('A-183: the privacy policy names Expo app updates and what they send, in six languages', () => {
  for (const k of Object.keys(SENTENCE)) {
    const body = T[k].settings_privacy_body;
    assert.match(body, SENTENCE[k], k);
    assert.ok(body.includes(DATE[k]), `${k} date`);
  }
});
