'use strict';
// What's New 1.3.1 (founder 2026-10-25 "Pode executar todas as pendências do build 1.3.1"): Google Play
// takes at most 500 characters per language, the iOS block equals the Play text and never names
// Android (founder 2026-10-21), and the release says what users will notice first (the missed-dose fix).
const test = require('node:test');
const assert = require('node:assert/strict');
const j = require('../store/whats-new-1.3.1.json');
const LANGS = ['pt', 'en', 'es', 'fr', 'de', 'it'];

test('What\'s New 1.3.1: six languages, each within Play\'s 500 characters', () => {
  for (const k of LANGS) {
    assert.ok(typeof j[k] === 'string' && j[k].length > 0, k);
    assert.ok(j[k].length <= 500, `${k} has ${j[k].length}`);
  }
});

test('What\'s New 1.3.1: the iOS block equals the Play text and never names Android', () => {
  for (const k of LANGS) {
    assert.equal(j.ios[k], j[k], k);
    assert.doesNotMatch(j.ios[k], /android/i, k);
  }
});

test('What\'s New 1.3.1: leads with the missed-dose fix in every language', () => {
  const first = { pt: /Doses perdidas/, en: /Missed doses/, es: /Dosis omitidas/, fr: /Doses manquées/, de: /Verpasste Dosen/, it: /Dosi saltate/ };
  for (const k of LANGS) assert.match(j[k].split('\n')[0], first[k], k);
});
