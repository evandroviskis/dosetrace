'use strict';
// A-166 (founder 2026-10-22, "aprovo, pode implementar"): under the calculation note on Today's dose
// card, one short line says the number comes from the user's own values and the app neither sets nor
// verifies the dose (Today had no arithmetic disclaimer near the card; Apple 1.4.2).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LINE = {
  pt: 'Conta feita com os valores que você informou. O DoseTrace não define nem verifica a dose.',
  en: 'Arithmetic from the values you entered. DoseTrace does not set or verify the dose.',
  es: 'Cálculo hecho con los valores que introdujiste. DoseTrace no define ni verifica la dosis.',
  fr: 'Calcul fait à partir des valeurs que vous avez saisies. DoseTrace ne fixe ni ne vérifie la dose.',
  de: 'Berechnet aus den von dir eingegebenen Werten. DoseTrace legt die Dosis weder fest noch prüft sie.',
  it: 'Calcolo fatto con i valori che hai inserito. DoseTrace non stabilisce né verifica la dose.',
};

test('A-166 Today line: the approved text in 6 languages', () => {
  const { translations: tr } = require('../i18n/translations');
  for (const [l, s] of Object.entries(LINE)) assert.equal(tr[l].today_calc_line, s, l);
});

test('A-166 Today line: shown only with the note, right under it, in the note style', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/TodayScreen.js'), 'utf8');
  const i = src.indexOf('{drawNote ? <Text style={s.calcNote}>{drawNote}</Text> : null}');
  assert.ok(i > 0, 'the note');
  const after = src.slice(i, i + 300);
  assert.match(after, /\{drawNote \? <Text style=\{s\.calcNote\}>\{t\('today_calc_line'\)\}<\/Text> : null\}/);
});
