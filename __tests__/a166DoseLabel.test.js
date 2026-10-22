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
    // Council (5): a no-break space on both sides of every operator, so no line starts with "÷" or "=".
    assert.match(note, /30\u00A0mg\u00A0÷\u00A02\u00A0ml/, `${l}: a number never wraps away from its unit`);
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
    assert.match(note, /\u00A0mg\u00A0÷\u00A015\u00A0mg\/ml\u00A0=\u00A00[.,]5\u00A0ml/, `${l}: no-break spaces join numbers, units and operators`);
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
  // A mcg dose against a mg vial. Replaced (council (1), 2026-10-22): the old line locked
  // "250 mcg ÷ 2.5 mg/ml = 0.1 ml", which reads as wrong arithmetic (250 ÷ 2.5 is 100); the
  // dose now also shows in the concentration's unit, so the formula is true as printed.
  const mcg = { ...POWDER, amount: '5', water: '2', dose: '250', dose_unit: 'mcg' };
  assert.equal(plainSp(volumeNote(mcg, drawOf(mcg), 100, tFor('en'), 'en')), '* Volume = 250 mcg (0.25 mg) ÷ 2.5 mg/ml = 0.1 ml, or 10.0 units (100 units per ml).');
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
  // Council (4): the star only when there is a note ("—" with amount or water missing has none).
  assert.match(SCREEN, /const concNote = concentrationNote\(p, t, language\);/);
  assert.match(SCREEN, /\{\s*label: t\('protocols_concentration'\),\s*value: concentrationText\(p, language\) \|\| `—\\u00A0\$\{unitText\(p\.unit, language\)\}\/ml`,\s*mono: true,\s*mark: !!concNote,\s*note: concNote,\s*\}/);
  assert.match(SCREEN, /p\.concentration \? \{ label: t\('protocols_concentration'\), value: concentrationText\(p, language\), mono: true \} : null/);
  const rtuRows = SCREEN.slice(SCREEN.indexOf("} else if (p.type === 'rtu') {\n    doseRows"), SCREEN.indexOf("} else if (p.type === 'oral') {\n    doseRows"));
  assert.ok(rtuRows.length > 0);
  assert.doesNotMatch(rtuRows, /mark: |note:/, 'nothing the user typed is starred');
  // RowsBlock draws the star after the value (its unit included: "15 mg/ml*") and the note under the row.
  const rows = fnBody(SCREEN, 'RowsBlock');
  assert.match(rows, /\{r\.value\}\{r\.mark \? <Text style=\{s\.calcMark\}>\*<\/Text> : null\}/);
  assert.match(rows, /\{r\.note \? <Text style=\{\[s\.calcNote, s\.rwNote\]\}>\{r\.note\}<\/Text> : null\}/);
  assert.match(rows, /r\.note && s\.rwWithNote/);
});

test('A-166 (2b): the protocol page starred the big draw and the Volume reading, not the Dose reading', () => {
  const hero = fnBody(SCREEN, 'ProtocolDrawHero');
  assert.match(hero, /const note = volumeNote\(p, draw, syringeMax, t, language\);/);
  // Council (4): the star comes after the whole value, its unit included ("50.0 units*",
  // "0.5 ml*"), and only when there is a note. It replaced the large star that sat between
  // the number and its unit.
  assert.match(hero, /<Text style=\{\[s\.drawBig, over && s\.drawBigRisk\]\}>\{decimalText\(reading\.ml \? trimZeros\(reading\.value\) : reading\.value, language\)\}<\/Text>\s*<Text style=\{s\.drawBigUnit\}>\{reading\.ml \? 'ml' : t\('protocols_syringe_units'\)\}\{note \? <Text style=\{s\.calcMark\}>\*<\/Text> : null\}<\/Text>/);
  assert.doesNotMatch(SCREEN, /calcMarkBig/, 'the star between number and unit is gone');
  assert.match(hero, /<ReadValue s=\{s\} mark=\{!!note\} text=\{`\$\{decimalText\(trimZeros\(draw\.drawML\), language\)\}\\u00A0ml`\} \/>/);
  assert.match(hero, /<ReadValue s=\{s\} text=\{`\$\{decimalText\(p\.dose, language\)\}\\u00A0\$\{unitText\(p\.dose_unit, language\)\}`\} \/>/);
  // ONE line under the readings, before the disclaimer.
  assert.match(hero, /<\/View>\s*\{note \? <Text style=\{s\.calcNote\}>\{note\}<\/Text> : null\}\s*<Text style=\{s\.disclaimer\}>\{t\('protocols_calc_disclaimer'\)\}<\/Text>/);
  // ReadValue counts the star in its width and draws it in the mark colour, after the unit.
  const rv = fnBody(SCREEN, 'ReadValue');
  assert.match(rv, /readPieces\(mark \? `\$\{text\}\*` : text\)/);
  assert.match(rv, /<Text style=\{s\.calcMark\}>\*<\/Text>/);
});

test('A-166 (2c): the enlarged syringe sheet stars the draw and carries the same note', () => {
  const zoom = fnBody(SCREEN, 'SyringeZoomSheet');
  assert.match(zoom, /const note = ok \? volumeNote\(p, draw, syringeMax, t, language\) : null;/);
  // After the whole reading ("… · 0.5 ml*"), only with a note (council (4)).
  assert.match(zoom, / ml<\/Text>\s*: <>.* ml<\/>\}\s*\{note \? <Text style=\{s\.calcMark\}>\*<\/Text> : null\}\s*<\/Text>/);
  assert.match(zoom, /\{note \? <Text style=\{s\.calcNote\}>\{note\}<\/Text> : null\}/);
  // under the ruler, before Done
  assert.ok(zoom.indexOf('{note ? <Text style={s.calcNote}>') > zoom.indexOf('<SyringeRuler'));
  assert.ok(zoom.indexOf('{note ? <Text style={s.calcNote}>') < zoom.indexOf("t('done')"));
});

test('A-166 (2c): the Today dose card stars "Draw to" and adds only the note (no disclaimer)', () => {
  assert.match(TODAY, /import \{ volumeNote \} from '\.\.\/lib\/calcNote';/);
  assert.match(TODAY, /const drawNote = draw && draw\.drawUnits && !draw\.unitMismatch \? volumeNote\(p, draw, syr, t, language\) : null;/);
  // After the whole value ("50.0 u · 0.5 ml*"), only with a note (council (4)).
  assert.match(TODAY, /\{drawLine\(draw, syr, language\)\.big\}<Text style=\{s\.drawUnit\}>\{drawLine\(draw, syr, language\)\.small\}<\/Text>\{drawNote \? <Text style=\{s\.calcMark\}>\*<\/Text> : null\}<\/Text>/);
  assert.match(TODAY, /\{drawNote \? <Text style=\{s\.calcNote\}>\{drawNote\}<\/Text> : null\}/);
  const card = TODAY.slice(TODAY.indexOf('function renderDoseCard('), TODAY.indexOf('function renderDoseCard(') + 12000);
  assert.doesNotMatch(card, /protocols_calc_disclaimer/);
});

test('A-166 council (4): every star on the protocol page and Today is conditional (no note, no star)', () => {
  for (const [name, src] of [['ProtocolsScreen', SCREEN], ['TodayScreen', TODAY]]) {
    const re = /<Text style=\{s\.calcMark\}>\*<\/Text>/g;
    let m; let n = 0;
    while ((m = re.exec(src))) {
      n += 1;
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      assert.match(before, /(\? |\? <>\{w\.slice\(0, -1\)\})$/, `${name}: a star at ${m.index} is drawn without a condition`);
    }
    assert.ok(n > 0, name);
  }
  // The concentration row with amount or water missing ("—") has no note, so no star.
  assert.equal(concentrationNote({ ...POWDER, water: '' }, tFor('en'), 'en'), null);
  assert.equal(concentrationNote({ ...POWDER, amount: null }, tFor('en'), 'en'), null);
});

test('A-166: notes are ink3 and small, the star is ink2 — theme tokens only (both themes)', () => {
  for (const src of [SCREEN, TODAY]) {
    const note = styleOf(src, 'calcNote');
    assert.match(note, /fontSize: 13, lineHeight: 18, color: c\.ink3/);
    assert.match(styleOf(src, 'calcMark'), /color: c\.ink2/);
    for (const name of ['calcNote', 'calcMark']) assert.doesNotMatch(styleOf(src, name), /#[0-9a-fA-F]{3,8}|'white'|'black'|rgba\(/);
  }
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

// ── Council findings on A-166 (2026-10-22) ──
const { normalizeDoseValue } = require('../lib/doseMath');
const CALC = read('lib', 'calcNote.js');
// Every note a few protocols give, in every language (used by the spacing rule below).
const SAMPLES = [
  POWDER,
  { ...POWDER, amount: '5', water: '2', dose: '250', dose_unit: 'mcg' },
  { type: 'recon', amount: '0.005', unit: 'mg', water: '3', dose: '1', dose_unit: 'mcg', syringe_size: 100 },
  { type: 'rtu', concentration: '200', concentration_unit: 'mg', dose: '100', dose_unit: 'mg', syringe_size: 300 },
  { type: 'recon', amount: '2,5', unit: 'mg', water: '1,5', dose: '0,5', dose_unit: 'mg', syringe_size: 100 },
];
const allNotes = () => SAMPLES.flatMap((p) => LANGS.flatMap((l) => [
  concentrationNote(p, tFor(l), l),
  volumeNote(p, drawOf(p), p.syringe_size, tFor(l), l),
])).filter(Boolean);

test('A-166 council (1): a dose in another mass unit also shows in the concentration\'s unit, in 6 languages', () => {
  const mcg = { ...POWDER, amount: '5', water: '2', dose: '250', dose_unit: 'mcg' };
  const want = {
    en: '* Volume = 250 mcg (0.25 mg) ÷ 2.5 mg/ml = 0.1 ml, or 10.0 units (100 units per ml).',
    pt: '* Volume = 250 mcg (0,25 mg) ÷ 2,5 mg/ml = 0,1 ml, ou 10,0 unidades (100 unidades por ml).',
    es: '* Volumen = 250 mcg (0,25 mg) ÷ 2,5 mg/ml = 0,1 ml, o 10,0 unidades (100 unidades por ml).',
    fr: '* Volume = 250 mcg (0,25 mg) ÷ 2,5 mg/ml = 0,1 ml, soit 10,0 unités (100 unités par ml).',
    de: '* Volumen = 250 mcg (0,25 mg) ÷ 2,5 mg/ml = 0,1 ml, also 10,0 Einheiten (100 Einheiten pro ml).',
    it: '* Volume = 250 mcg (0,25 mg) ÷ 2,5 mg/ml = 0,1 ml, cioè 10,0 unità (100 unità per ml).',
  };
  for (const l of LANGS) assert.equal(plainSp(volumeNote(mcg, drawOf(mcg), 100, tFor(l), l)), want[l], l);
  // The other way round (a mg dose, a mcg/ml vial), and no float noise (0.7 mg is 700 mcg).
  const rtu = { type: 'rtu', concentration: '500', concentration_unit: 'mcg', dose: '0.5', dose_unit: 'mg', syringe_size: 100 };
  assert.equal(plainSp(volumeNote(rtu, drawOf(rtu), 100, tFor('en'), 'en')), '* Volume = 0.5 mg (500 mcg) ÷ 500 mcg/ml = 1 ml, or 100.0 units (100 units per ml).');
  const noise = { ...rtu, concentration: '1000', dose: '0.7' };
  assert.match(plainSp(volumeNote(noise, drawOf(noise), 100, tFor('pt'), 'pt')), /^\* Volume = 0,7 mg \(700 mcg\) ÷ 1000 mcg\/ml = 0,7 ml,/);
  // The same conversion the draw uses (normalizeDoseValue), never a second computation.
  assert.match(CALC, /normalizeDoseValue\(p\.dose, massUnit, p\.dose_unit\)/);
  assert.match(CALC, /require\('\.\/doseMath'\)/);
  assert.equal(normalizeDoseValue('250', 'mg', 'mcg'), 0.25);
  // Same unit, or IU: nothing in brackets.
  assert.doesNotMatch(volumeNote(POWDER, drawOf(POWDER), 100, tFor('en'), 'en'), /(mg|mcg)\s\(/);
  const iu = { type: 'recon', amount: '10', unit: 'IU', water: '1', dose: '2', dose_unit: 'IU', syringe_size: 100 };
  assert.equal(plainSp(volumeNote(iu, drawOf(iu), 100, tFor('de'), 'de')), '* Volumen = 2 IE ÷ 10 IE/ml = 0,2 ml, also 20,0 Einheiten (100 Einheiten pro ml).');
});

test('A-166 council (2): a very low concentration never prints as 0 and the formula holds as printed', () => {
  const low = { type: 'recon', amount: '0.005', unit: 'mg', water: '3', dose: '1', dose_unit: 'mcg', syringe_size: 100 };
  assert.equal(plainSp(concentrationText(low, 'en')), '0.001667 mg/ml');
  assert.equal(plainSp(concentrationText(low, 'pt')), '0,001667 mg/ml');
  assert.equal(plainSp(concentrationNote(low, tFor('en'), 'en')), '* Concentration = 0.005 mg ÷ 3 ml, from the values you entered.');
  assert.equal(plainSp(volumeNote(low, drawOf(low), 100, tFor('en'), 'en')), '* Volume = 1 mcg (0.001 mg) ÷ 0.001667 mg/ml = 0.6 ml, or 60.0 units (100 units per ml).');
  assert.equal(plainSp(volumeNote(low, drawOf(low), 100, tFor('it'), 'it')), '* Volume = 1 mcg (0,001 mg) ÷ 0,001667 mg/ml = 0,6 ml, cioè 60,0 unità (100 unità per ml).');
  // Under 1, 4 significant digits; from 1 up, 2 decimals as before.
  assert.equal(plainSp(concentrationText({ ...low, amount: '1', water: '3' }, 'en')), '0.3333 mg/ml');
  assert.equal(plainSp(concentrationText({ ...low, amount: '1', water: '2' }, 'en')), '0.5 mg/ml');
  assert.equal(plainSp(concentrationText({ ...low, amount: '0.1', water: '3' }, 'en')), '0.03333 mg/ml');
  assert.equal(plainSp(concentrationText({ ...low, amount: '10', water: '3' }, 'en')), '3.33 mg/ml');
  // Every case on a grid: never "0 mg/ml", and dose ÷ concentration = volume as printed.
  const num = (s) => Number(s);
  for (const amount of ['0.001', '0.005', '0.01', '0.05', '0.1', '0.3', '1', '2', '5', '10', '15', '30', '100']) {
    for (const water of ['0.5', '1', '2', '3', '5', '10']) {
      const conc = Number(amount) / Number(water);
      for (const ml of [0.05, 0.1, 0.25, 0.37, 1, 2.5]) {
        for (const unit of ['mg', 'mcg']) {
          const doseMg = Number((conc * ml).toPrecision(3));
          const dose = unit === 'mg' ? String(doseMg) : String(Number((doseMg * 1000).toPrecision(3)));
          const p = { type: 'recon', amount, unit: 'mg', water, dose, dose_unit: unit, syringe_size: 300 };
          const draw = drawOf(p);
          if (!draw.valid) continue;
          const text = plainSp(concentrationText(p, 'en'));
          assert.doesNotMatch(text, /^0 /, `${amount} mg in ${water} ml`);
          const note = plainSp(volumeNote(p, draw, 300, tFor('en'), 'en'));
          const m = /= (?:[\d.]+ mcg \(([\d.]+) mg\)|([\d.]+) mg) ÷ ([\d.]+) mg\/ml = ([\d.]+) ml\./.exec(note);
          assert.ok(m, note);
          const d = num(m[1] || m[2]); const c = num(m[3]); const v = num(m[4]);
          assert.ok(c > 0, note);
          assert.ok(Math.abs(d / c - v) <= 0.005 + 0.006 * v, `${note} (${d} ÷ ${c} = ${d / c})`);
        }
      }
    }
  }
});

test('A-166 council (3): stored numbers are read with parseDecimal before they are formatted ("0,5" in English is 0.5)', () => {
  const p = { type: 'recon', amount: '2,5', unit: 'mg', water: '1,5', dose: '0,5', dose_unit: 'mg', syringe_size: 100 };
  assert.equal(plainSp(concentrationNote(p, tFor('en'), 'en')), '* Concentration = 2.5 mg ÷ 1.5 ml, from the values you entered.');
  assert.equal(plainSp(concentrationText(p, 'en')), '1.67 mg/ml');
  assert.equal(plainSp(volumeNote(p, drawOf(p), 100, tFor('en'), 'en')), '* Volume = 0.5 mg ÷ 1.67 mg/ml = 0.3 ml, or 30.0 units (100 units per ml).');
  assert.equal(plainSp(volumeNote(p, drawOf(p), 100, tFor('pt'), 'pt')), '* Volume = 0,5 mg ÷ 1,67 mg/ml = 0,3 ml, ou 30,0 unidades (100 unidades por ml).');
  // A typed ready-to-use concentration stored with a comma: the row and the note.
  const rtu = { type: 'rtu', concentration: '0,5', concentration_unit: 'mg', dose: '0,25', dose_unit: 'mg', syringe_size: 100 };
  assert.equal(plainSp(concentrationText(rtu, 'en')), '0.5 mg/ml');
  assert.equal(plainSp(volumeNote(rtu, drawOf(rtu), 100, tFor('en'), 'en')), '* Volume = 0.25 mg ÷ 0.5 mg/ml = 0.5 ml, or 50.0 units (100 units per ml).');
  // A mixed-unit dose stored with a comma.
  const mcg = { ...rtu, dose: '250,5', dose_unit: 'mcg' };
  assert.match(plainSp(volumeNote(mcg, drawOf(mcg), 100, tFor('en'), 'en')), /= 250\.5 mcg \(0\.2505 mg\) ÷ 0\.5 mg\/ml = /);
  // No English note carries a comma decimal.
  for (const q of SAMPLES) {
    for (const n of [concentrationNote(q, tFor('en'), 'en'), volumeNote(q, drawOf(q), q.syringe_size, tFor('en'), 'en')]) {
      if (n) assert.doesNotMatch(n, /\d,\d/, n);
    }
  }
  assert.match(CALC, /parseDecimal\(/);
});

test('A-166 council (5): no line of a note can start (or end) with "÷" or "="', () => {
  const notes = allNotes();
  assert.ok(notes.length >= 40, String(notes.length));
  for (const n of notes) {
    // A no-break space on both sides of every operator: the only places a line can break are
    // ordinary spaces, and none of them touches an operator.
    assert.doesNotMatch(n, /[ \t\n][÷=]|[÷=][ \t\n]/, n);
    for (const piece of n.split(/[ \t\n]+/)) assert.doesNotMatch(piece, /^[÷=]|[÷=]$/, `${n} -> "${piece}"`);
    assert.match(n, / = /, n);
    // The existing no-break space between a number and its unit stays.
    assert.doesNotMatch(n, /\d (mg|mcg|ml|IU|UI|IE)\b/, n);
  }
});
