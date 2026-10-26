'use strict';
// S-08 / FX-13 (A-07, journey review F3): the curve disclaimer says what the curve is drawn from, in all 6
// languages. UPDATED 1.3.2 (AD-96 B, docs/specs/curve-logged-doses.md user-visible copy): the past is drawn
// from the doses the person logged (before Now) and the future from the planned schedule (after Now) —
// the disclaimer names both ("…the doses you logged (before Now), and your planned schedule (after Now)").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('S-08 / AD-96 B: the curve disclaimer names the logged doses (before Now) and the planned schedule (after Now), 6 languages', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8');
  const v = [...src.matchAll(/\n\s+curve_disclaimer: (['"])(.*)\1,/g)].map((m) => m[2]);
  assert.equal(v.length, 6);
  const logged = [/the doses you logged \(before Now\)/, /las dosis que registraste \(antes de «Ahora»\)/, /doses que você registrou \(antes de “Agora”\)/, /doses que vous avez enregistrées \(avant « Maintenant »\)/, /von dir erfassten Dosen \(vor „Jetzt“\)/, /dosi che hai registrato \(prima di «Ora»\)/];
  const planned = [/your planned schedule \(after Now\)/, /tu esquema planificado \(después de «Ahora»\)/, /seu esquema planejado \(depois de “Agora”\)/, /votre schéma prévu \(après « Maintenant »\)/, /deines geplanten Schemas \(nach „Jetzt“\)/, /orari che hai pianificato \(dopo «Ora»\)/];
  v.forEach((s, i) => {
    assert.match(s, logged[i], s.slice(0, 120));
    assert.match(s, planned[i], s.slice(0, 120));
  });
  // The Now marker's own word, in each language, is the one the disclaimer quotes.
  const { translations } = require('../i18n/translations');
  ['en', 'es', 'pt', 'fr', 'de', 'it'].forEach((l, i) => assert.ok(v[i].includes(translations[l].curve_now), l));
});
