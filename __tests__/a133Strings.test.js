'use strict';
// A-133 (3) — store capture 2026-10-16, strings:
//  a. es Today header "1 de 3 completada": the participle agrees with the TOTAL (the doses of the
//     day), so the singular is picked by y, not by x — same rule in all 6 languages
//     ("1 de 3 completadas", "1 sur 3 effectuées", "1 de 1 completada").
//  b. fr "Depuis 14 juil.:": French puts a space before ":" (the app's fr strings all do). The
//     colon was hardcoded after a translated word in the JSX; the since line is now one key with
//     {date} ("Depuis le {date} :"), and the other visible label colons use labelColon(language)
//     (fr: no-break space + ":", so the colon never wraps alone onto the next line).
//  c. nutri_ask_* used straight quotes around {food} (pt, en identity): each language's own
//     quotes now — pt “ ”, en “ ”, fr « » with spaces, de „ “, es/it « » (the app's es/it
//     convention, i18n review 2026-10-15); it "Quanto «{food}»?" was not Italian.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { dosesTakenLabel } = require('../lib/todayFormat.js');
const { labelColon } = require('../lib/localeFormat');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tOf = (l) => (k) => (tr[l][k] != null ? tr[l][k] : k);

test('A-133 a: "x of y complete" agrees with the total in every language', () => {
  const want = {
    es: ['1 de 3 completadas', '0 de 3 completadas', '1 de 1 completada', '0 de 1 completada'],
    pt: ['1 de 3 concluídas', '0 de 3 concluídas', '1 de 1 concluída', '0 de 1 concluída'],
    it: ['1 di 3 completate', '0 di 3 completate', '1 di 1 completata', '0 di 1 completata'],
    fr: ['1 sur 3 effectuées', '0 sur 3 effectuées', '1 sur 1 effectuée', '0 sur 1 effectuée'],
    en: ['1 of 3 complete', '0 of 3 complete', '1 of 1 complete', '0 of 1 complete'],
    de: ['1 von 3 erledigt', '0 von 3 erledigt', '1 von 1 erledigt', '0 von 1 erledigt'],
  };
  for (const [l, [a, b, c, d]] of Object.entries(want)) {
    assert.equal(dosesTakenLabel(1, 3, tOf(l), l), a, l);
    assert.equal(dosesTakenLabel(0, 3, tOf(l), l), b, l);
    assert.equal(dosesTakenLabel(1, 1, tOf(l), l), c, l);
    assert.equal(dosesTakenLabel(0, 1, tOf(l), l), d, l);
  }
});

test('A-133 b: the since line is one key with {date}; French has the space before ":"', () => {
  for (const l of LANGS) {
    assert.ok(tr[l].cal_since_date, `${l}.cal_since_date`);
    assert.match(tr[l].cal_since_date, /\{date\}/, l);
    assert.match(tr[l].cal_since_date, /:$/, l);
    assert.equal(tr[l].cal_since, undefined, `${l}: the old word-only key is gone`);
  }
  assert.equal(tr.fr.cal_since_date, 'Depuis le {date} :');
  assert.equal(tr.de.cal_since_date, 'Seit dem {date}:');
  for (const f of ['screens/JourneyScreen.js', 'screens/components/CalculatorSection.js']) {
    const src = read(f);
    assert.match(src, /t\('cal_since_date'\)\.replace\('\{date\}'/, f);
    assert.doesNotMatch(src, /t\('cal_since'\)/, f);
  }
});

test('A-133 b: visible label colons follow the language (fr no-break space)', () => {
  assert.equal(labelColon('fr'), ' :');
  for (const l of ['en', 'es', 'pt', 'de', 'it']) assert.equal(labelColon(l), ':');
  const body = read('screens/components/BodyMapModal.js');
  assert.match(body, /String\(selected\.length\)\)\}\{labelColon\(language\)\}<\/Text>/);
  const vax = read('screens/components/VaccinesSection.js');
  assert.match(vax, /\{t\('vax_next_due'\)\}\{labelColon\(language\)\} /);
});

test('A-133 b guard: no French string has a colon, semicolon, ? or ! glued to the word before it', () => {
  const out = [];
  const walk = (v, p) => { if (typeof v === 'string') out.push([p, v]); else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`); };
  walk(tr.fr, 'fr');
  const bad = out.filter(([, s]) => !/https?:/.test(s) && /[^\s  ]([:;?!])(\s|$)/.test(s)).map(([p]) => p);
  assert.deepEqual(bad, []);
});

test('A-133 c: the follow-up questions quote {food} with each language\'s own quotes', () => {
  const kinds = ['amount', 'brand', 'size', 'preparation', 'identity'];
  const quoted = { pt: '“{food}”', fr: '« {food} »', de: '„{food}“', es: '«{food}»', it: '«{food}»' };
  for (const l of LANGS) for (const k of kinds) {
    const s = tr[l][`nutri_ask_${k}`];
    assert.ok(s, `${l}.${k}`);
    assert.doesNotMatch(s, /"/, `${l}.nutri_ask_${k} has no straight quotes`);
    if (quoted[l]) assert.ok(s.includes(quoted[l]), `${l}.nutri_ask_${k}: ${s}`);
  }
  assert.equal(tr.en.nutri_ask_identity, 'What was “{food}” exactly?');
});

test('A-133 c: Italian asks read as Italian', () => {
  assert.equal(tr.it.nutri_ask_amount, 'Che quantità di «{food}» hai preso?');
  assert.equal(tr.it.nutri_ask_brand, 'Di che marca era «{food}»?');
  assert.notEqual(tr.it.nutri_ask_amount, 'Quanto «{food}»?');
});
