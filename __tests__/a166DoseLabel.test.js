'use strict';
// A-166 (founder 2026-10-22, picture dose-label.html option A). Apple rejected iOS 1.3.0
// under 1.4.2: the protocol page must make it obvious that every number comes from the user
// and that the app only does arithmetic.
//  1. The protocol page's Dose details row "Desired dose" becomes "Dose you entered" (6 languages).
//     The editor field keeps "Dose per injection" (AP-13, signed 2026-10-02).
//  2. Every COMPUTED value gets "*" and one small ink3 line under it with the arithmetic, in the
//     user's own numbers, formatted per language: the powder Concentration row, the syringe draw
//     (big number + Volume reading) on the protocol page, the enlarged syringe sheet and the Today
//     dose card. Values the user typed (Dose, ready-to-use concentration) get no asterisk.
//  3. The pt disclaimer says "informou" (one term per concept with the note).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: TR } = require('../i18n/translations.js');
const { computeDraw } = require('../lib/doseMath');
const { concentrationText, concentrationNote, volumeNote } = require('../lib/calcNote');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SCREEN = read('screens', 'ProtocolsScreen.js');
const TODAY = read('screens', 'TodayScreen.js');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const tFor = (lang) => (k) => TR[lang][k];
const plainSp = (s) => String(s).replace(/ /g, ' ');
const styleOf = (src, name) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{[^\\n]*\\}`, 'g'));
  assert.ok(m && m.length, `style ${name} not found`);
  return m[m.length - 1];
};
// The body of a function component in a screen source, up to the next top-level function.
const fnBody = (src, name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > -1, `${name} exists`);
  const j = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, j > -1 ? j : undefined);
};

test('A-166 (1): the Dose details row reads "Dose you entered" in all 6 languages', () => {
  const want = {
    en: 'Dose you entered',
    pt: 'Dose informada por você',
    es: 'Dosis introducida por ti',
    fr: 'Dose que vous avez saisie',
    de: 'Von dir eingegebene Dosis',
    it: 'Dose che hai inserito',
  };
  for (const l of LANGS) assert.equal(TR[l].protocols_desired_dose, want[l], l);
  assert.match(SCREEN, /\{ label: t\('protocols_desired_dose'\), value: /);
});

test('A-166 (1): the editor dose field keeps "Dose per injection" (AP-13)', () => {
  const want = {
    en: 'Dose per injection',
    pt: 'Dose por injeção',
    es: 'Dosis por inyección',
    fr: 'Dose par injection',
    de: 'Dosis pro Injektion',
    it: 'Dose per iniezione',
  };
  for (const l of LANGS) assert.equal(TR[l].protocols_dose_per_injection, want[l], l);
  assert.match(SCREEN, /const doseLabel = t\('protocols_dose_per_injection'\);/);
});

// The reviewer's capture: 30 mg in 2 ml, dose 7.5 mg, 1 ml / 100 u syringe.
const POWDER = { type: 'recon', amount: '30', unit: 'mg', water: '2', dose: '7.5', dose_unit: 'mg', syringe_size: 100 };
const drawOf = (p) => computeDraw({
  type: p.type, amount: p.amount, water: p.water, dose: p.dose, doseUnit: p.dose_unit, unit: p.unit,
  concentration: p.concentration, concentrationUnit: p.concentration_unit, syringeSize: p.syringe_size,
});

test('A-166 (2a): the concentration note in 6 languages, with the protocol\'s own numbers', () => {
  const want = {
    en: '* Concentration = 30 mg ÷ 2 ml, from the values you entered.',
    pt: '* Concentração = 30 mg ÷ 2 ml, a partir dos valores que você informou.',
    es: '* Concentración = 30 mg ÷ 2 ml, a partir de los valores que has introducido.',
    fr: '* Concentration = 30 mg ÷ 2 ml, à partir des valeurs que vous avez saisies.',
    de: '* Konzentration = 30 mg ÷ 2 ml, aus den von dir eingegebenen Werten.',
    it: '* Concentrazione = 30 mg ÷ 2 ml, dai valori che hai inserito.',
  };
  for (const l of LANGS) {
    const note = concentrationNote(POWDER, tFor(l), l);
    assert.equal(plainSp(note), want[l], l);
    assert.match(note, /30 mg ÷ 2 ml/, `${l}: a number never wraps away from its unit`);
  }
  // Decimals per language, never a hardcoded separator.
  const p = { ...POWDER, amount: '2.5', water: '1.5', unit: 'mg' };
  assert.match(plainSp(concentrationNote(p, tFor('en'), 'en')), /= 2\.5 mg ÷ 1\.5 ml,/);
  for (const l of ['pt', 'es', 'fr', 'de', 'it']) assert.match(plainSp(concentrationNote(p, tFor(l), l)), /= 2,5 mg ÷ 1,5 ml,/, l);
  // IU written the language's way (A-134).
  assert.match(plainSp(concentrationNote({ ...POWDER, unit: 'IU', amount: '10' }, tFor('de'), 'de')), /= 10 IE ÷ 2 ml,/);
  // Nothing to explain without both numbers, and never for ready to use (the user typed it).
  assert.equal(concentrationNote({ ...POWDER, water: null }, tFor('en'), 'en'), null);
  assert.equal(concentrationNote({ type: 'rtu', concentration: '15', dose: '7.5', dose_unit: 'mg' }, tFor('en'), 'en'), null);
});

test('A-166 (2b): the volume note in 6 languages on an insulin syringe, from the same draw the page shows', () => {
  const draw = drawOf(POWDER);
  assert.equal(draw.drawML, '0.50');
  assert.equal(draw.drawUnits, '50.0');
  // The units part is the big draw number exactly as shown ("50.0", the decimal kept: trimZeros
  // is never used on the draw in units).
  const want = {
    en: '* Volume = 7.5 mg ÷ 15 mg/ml = 0.5 ml, or 50.0 units (100 units per ml).',
    pt: '* Volume = 7,5 mg ÷ 15 mg/ml = 0,5 ml, ou 50,0 unidades (100 unidades por ml).',
    es: '* Volumen = 7,5 mg ÷ 15 mg/ml = 0,5 ml, o 50,0 unidades (100 unidades por ml).',
    fr: '* Volume = 7,5 mg ÷ 15 mg/ml = 0,5 ml, soit 50,0 unités (100 unités par ml).',
    de: '* Volumen = 7,5 mg ÷ 15 mg/ml = 0,5 ml, also 50,0 Einheiten (100 Einheiten pro ml).',
    it: '* Volume = 7,5 mg ÷ 15 mg/ml = 0,5 ml, cioè 50,0 unità (100 unità per ml).',
  };
  for (const l of LANGS) {
    const note = volumeNote(POWDER, draw, 100, tFor(l), l);
    assert.equal(plainSp(note), want[l], l);
    assert.match(note, / mg ÷ 15 mg\/ml = 0[.,]5 ml/, `${l}: no-break spaces join numbers and units`);
  }
});

test('A-166 (2b): on an ml syringe (2 / 3 / 5 ml) the volume note ends at the ml, no units part', () => {
  const rtu = { type: 'rtu', concentration: '200', concentration_unit: 'mg', dose: '100', dose_unit: 'mg', syringe_size: 300 };
  const draw = drawOf(rtu);
  assert.equal(plainSp(volumeNote(rtu, draw, 300, tFor('en'), 'en')), '* Volume = 100 mg ÷ 200 mg/ml = 0.5 ml.');
  assert.equal(plainSp(volumeNote(rtu, draw, 300, tFor('pt'), 'pt')), '* Volume = 100 mg ÷ 200 mg/ml = 0,5 ml.');
  assert.equal(plainSp(volumeNote(rtu, draw, 300, tFor('de'), 'de')), '* Volumen = 100 mg ÷ 200 mg/ml = 0,5 ml.');
  for (const l of LANGS) assert.doesNotMatch(volumeNote(rtu, draw, 300, tFor(l), l), /\(100 /, l);
});

test('A-166 (2b): the note\'s concentration is the one the page shows (rounded row value, typed RTU value)', () => {
  // 10 mg in 3 ml: the row shows 3.33 mg/ml; the note quotes the same text.
  const p = { ...POWDER, amount: '10', water: '3', dose: '1', dose_unit: 'mg' };
  assert.equal(plainSp(concentrationText(p, 'en')), '3.33 mg/ml');
  assert.equal(plainSp(concentrationText(p, 'pt')), '3,33 mg/ml');
  assert.match(plainSp(volumeNote(p, drawOf(p), 100, tFor('pt'), 'pt')), /= 1 mg ÷ 3,33 mg\/ml = 0,3 ml, ou 30,0 unidades/);
  // A mcg dose against a mg vial stays in the user's own units: plain dimensional arithmetic.
  const mcg = { ...POWDER, amount: '5', water: '2', dose: '250', dose_unit: 'mcg' };
  assert.equal(plainSp(volumeNote(mcg, drawOf(mcg), 100, tFor('en'), 'en')), '* Volume = 250 mcg ÷ 2.5 mg/ml = 0.1 ml, or 10.0 units (100 units per ml).');
  // Ready to use: the typed concentration, trailing zeros dropped like its row.
  const rtu = { type: 'rtu', concentration: '15.0', concentration_unit: 'mg', dose: '7.5', dose_unit: 'mg', syringe_size: 100 };
  assert.equal(plainSp(concentrationText(rtu, 'fr')), '15 mg/ml');
  assert.equal(plainSp(volumeNote(rtu, drawOf(rtu), 100, tFor('fr'), 'fr')), '* Volume = 7,5 mg ÷ 15 mg/ml = 0,5 ml, soit 50,0 unités (100 unités par ml).');
  // No draw, no note.
  assert.equal(volumeNote(POWDER, null, 100, tFor('en'), 'en'), null);
  assert.equal(volumeNote(POWDER, drawOf({ ...POWDER, dose: null }), 100, tFor('en'), 'en'), null);
});

test('A-166 (2a): the powder Concentration row has the asterisk + note; the ready-to-use one does not', () => {
  // Both concentration rows show the shared concentrationText, so the note and the row agree.
  assert.match(SCREEN, /\{\s*label: t\('protocols_concentration'\),\s*value: concentrationText\(p, language\) \|\| `—\\u00A0\$\{unitText\(p\.unit, language\)\}\/ml`,\s*mono: true,\s*mark: true,\s*note: concentrationNote\(p, t, language\),\s*\}/);
  assert.match(SCREEN, /p\.concentration \? \{ label: t\('protocols_concentration'\), value: concentrationText\(p, language\), mono: true \} : null/);
  const rtuRows = SCREEN.slice(SCREEN.indexOf("} else if (p.type === 'rtu') {\n    doseRows"), SCREEN.indexOf("} else if (p.type === 'oral') {\n    doseRows"));
  assert.ok(rtuRows.length > 0);
  assert.doesNotMatch(rtuRows, /mark: true|note:/, 'nothing the user typed is starred');
  // RowsBlock draws the star after the value and the note under the row.
  const rows = fnBody(SCREEN, 'RowsBlock');
  assert.match(rows, /\{r\.value\}\{r\.mark \? <Text style=\{s\.calcMark\}>\*<\/Text> : null\}/);
  assert.match(rows, /\{r\.note \? <Text style=\{\[s\.calcNote, s\.rwNote\]\}>\{r\.note\}<\/Text> : null\}/);
  assert.match(rows, /r\.note && s\.rwWithNote/);
});

test('A-166 (2b): the protocol page starred the big draw and the Volume reading, not the Dose reading', () => {
  const hero = fnBody(SCREEN, 'ProtocolDrawHero');
  assert.match(hero, /<Text style=\{\[s\.drawBig, over && s\.drawBigRisk\]\}>\{decimalText\(reading\.ml \? trimZeros\(reading\.value\) : reading\.value, language\)\}<\/Text>\s*<Text style=\{s\.calcMarkBig\}>\*<\/Text>/);
  assert.match(hero, /<ReadValue s=\{s\} mark text=\{`\$\{decimalText\(trimZeros\(draw\.drawML\), language\)\}\\u00A0ml`\} \/>/);
  assert.match(hero, /<ReadValue s=\{s\} text=\{`\$\{decimalText\(p\.dose, language\)\}\\u00A0\$\{unitText\(p\.dose_unit, language\)\}`\} \/>/);
  // ONE line under the readings, before the disclaimer.
  assert.match(hero, /<\/View>\s*<Text style=\{s\.calcNote\}>\{volumeNote\(p, draw, syringeMax, t, language\)\}<\/Text>\s*<Text style=\{s\.disclaimer\}>\{t\('protocols_calc_disclaimer'\)\}<\/Text>/);
  // ReadValue counts the star in its width and draws it in the mark colour.
  const rv = fnBody(SCREEN, 'ReadValue');
  assert.match(rv, /readPieces\(mark \? `\$\{text\}\*` : text\)/);
  assert.match(rv, /<Text style=\{s\.calcMark\}>\*<\/Text>/);
});

test('A-166 (2c): the enlarged syringe sheet stars the draw and carries the same note', () => {
  const zoom = fnBody(SCREEN, 'SyringeZoomSheet');
  assert.match(zoom, /<Text style=\{s\.calcMark\}>\*<\/Text>/);
  assert.match(zoom, /<Text style=\{s\.calcNote\}>\{volumeNote\(p, draw, syringeMax, t, language\)\}<\/Text>/);
  // under the ruler, before Done
  assert.ok(zoom.indexOf('volumeNote(') > zoom.indexOf('<SyringeRuler'));
  assert.ok(zoom.indexOf('volumeNote(') < zoom.indexOf("t('done')"));
});

test('A-166 (2c): the Today dose card stars "Draw to" and adds only the note (no disclaimer)', () => {
  assert.match(TODAY, /import \{ volumeNote \} from '\.\.\/lib\/calcNote';/);
  assert.match(TODAY, /\{drawLine\(draw, syr, language\)\.big\}<Text style=\{s\.drawUnit\}>\{drawLine\(draw, syr, language\)\.small\}<\/Text><Text style=\{s\.calcMark\}>\*<\/Text><\/Text>/);
  assert.match(TODAY, /<Text style=\{s\.calcNote\}>\{volumeNote\(p, draw, syr, t, language\)\}<\/Text>/);
  const card = TODAY.slice(TODAY.indexOf('function renderDoseCard('), TODAY.indexOf('function renderDoseCard(') + 12000);
  assert.doesNotMatch(card, /protocols_calc_disclaimer/);
});

test('A-166: notes are ink3 and small, the star is ink2 — theme tokens only (both themes)', () => {
  for (const src of [SCREEN, TODAY]) {
    const note = styleOf(src, 'calcNote');
    assert.match(note, /fontSize: 13, lineHeight: 18, color: c\.ink3/);
    assert.match(styleOf(src, 'calcMark'), /color: c\.ink2/);
    for (const name of ['calcNote', 'calcMark']) assert.doesNotMatch(styleOf(src, name), /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/);
  }
  assert.match(styleOf(SCREEN, 'calcMarkBig'), /color: c\.ink2/);
  assert.doesNotMatch(styleOf(SCREEN, 'calcMarkBig'), /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/);
});

test('A-166 (2d): the disclaimer uses the note\'s wording in every language', () => {
  assert.match(TR.pt.protocols_calc_disclaimer, /valores que você informou/);
  assert.doesNotMatch(TR.pt.protocols_calc_disclaimer, /inseriu/);
  const same = {
    en: 'values you entered',
    es: 'valores que has introducido',
    fr: 'valeurs que vous avez saisies',
    de: 'von dir eingegebenen Werten',
    it: 'valori che hai inserito',
  };
  for (const [l, w] of Object.entries(same)) {
    assert.ok(TR[l].protocols_calc_disclaimer.includes(w), `${l} disclaimer: ${w}`);
    assert.ok(TR[l].protocols_calc_note_conc.includes(w), `${l} note: ${w}`);
  }
  assert.ok(TR.pt.protocols_calc_note_conc.includes('valores que você informou'));
});
