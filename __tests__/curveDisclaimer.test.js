'use strict';
// S-08 / FX-13 (A-07, journey review F3): the dose-accumulation curve is drawn from
// the PLANNED schedule (start date + interval), not only from logged doses — the
// disclaimer must say so, in all 6 languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('S-08: the curve disclaimer says "planned schedule", never "logged doses" (6 languages)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8');
  const v = [...src.matchAll(/\n\s+curve_disclaimer: (['"])(.*)\1,/g)].map((m) => m[2]);
  assert.equal(v.length, 6);
  const planned = [/your planned schedule/, /tu esquema planificado/, /seu esquema planejado/, /votre schéma prévu/, /deines geplanten Schemas/, /tuo schema pianificato/];
  v.forEach((s, i) => {
    assert.match(s, planned[i], s.slice(0, 80));
    assert.doesNotMatch(s, /logged doses|dosis registradas|doses que você registrou|doses enregistrées|protokollierten Dosen|dosi registrate/, s.slice(0, 80));
  });
});
