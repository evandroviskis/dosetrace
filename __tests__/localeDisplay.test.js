'use strict';
// Founder 2026-10-02: Today in Portuguese showed "Pese-se em Out 19" (English order) and
// "86.0 kg" (a point). Every user-visible date and decimal follows the app language through
// lib/localeFormat; prefilled editable numbers show the language's separator and still save
// the same value. Display only: stored values never change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { weighInFormValues, readWeighInForm } = require('../lib/weighInEdit');
const { numbersLine, weighInsLine } = require('../lib/progressCard');
const { levelLabel, axisLabel } = require('../lib/serumModel');
const { exampleValues } = require('../lib/progressFormat');
const { itemLabel } = require('../lib/nutrition');

const { formFromProtocol, protocolPayload, editPatch } = require('../lib/protocolForm');
const { inputNumber } = require('../lib/localeFormat');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

test('protocol form prefill: "0,25" in Portuguese, and an untouched Edit saves the very same numbers', () => {
  const NOW = new Date(2026, 9, 2, 15, 7);
  const freq = (n) => (n === 1 ? 'Daily' : `Every ${n} days`);
  const RECON = { id: 1, name: 'BPC-157', type: 'recon', amount: 5, unit: 'mg', water: 2.5, dose: 0.25, dose_unit: 'mg', interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-09-01', goal: '' };
  const RTU = { id: 2, name: 'Test C', type: 'rtu', amount: 2500, unit: 'mg', dose: 1.125, dose_unit: 'ml', concentration: 250, concentration_unit: 'mg', interval_days: 7, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-09-01', goal: '' };
  const VIAL = { water_ml: 10.5 };
  const ORAL = { id: 3, name: 'Zinc', type: 'oral', dose: 12.5, dose_unit: 'mg', serving_strength: 12.5, serving_strength_unit: 'mg', serving_units: 1, container_units: 60, interval_days: 1, doses_per_day: 1, reminder_time: '08:00', start_date: '2026-09-01', goal: '', notes: 'Tablet' };
  const pt = formFromProtocol(RECON, null, NOW, 'pt');
  assert.equal(pt.dose, '0,25');
  assert.equal(pt.water, '2,5');
  assert.equal(formFromProtocol(RECON, null, NOW).dose, '0.25', 'English by default');
  for (const [p, v] of [[RECON, null], [RTU, VIAL], [ORAL, null]]) {
    const en = protocolPayload(formFromProtocol(p, v, NOW, 'en'), freq, 'en');
    for (const l of LANGS) {
      const f = formFromProtocol(p, v, NOW, l);
      assert.deepEqual(protocolPayload(f, freq, l), en, `${l} ${p.type}: the same numbers as English`);
      assert.deepEqual(editPatch(f, formFromProtocol(p, v, NOW, l), freq, l), {}, `${l} ${p.type}: nothing written`);
      assert.equal(protocolPayload(f, freq, l).dose, p.dose, `${l} ${p.type}: dose round-trips`);
    }
  }
});

test('lab value edit and Your numbers: a prefilled number saves back the same value through their parsers', () => {
  const { parseDecimal } = require('../lib/doseMath');
  const labParse = (v, l) => parseDecimal(v, l);   // BodyScreen saveMarkerEdit (review 2026-10-02: language-aware)
  const calcNum = (v, l) => parseDecimal(v, l);    // CalculatorSection num
  for (const l of LANGS) {
    for (const v of [5.2, 0.85, 12.345, 1250.5, 986, 1.125, 84.6, 181, 21.5]) {
      assert.equal(labParse(inputNumber(v, l), l), v, `${l} lab ${v}`);
      assert.equal(calcNum(inputNumber(v, l), l), v, `${l} numbers ${v}`);
    }
  }
  assert.equal(inputNumber(5.2, 'pt'), '5,2');
  const body = read('screens', 'BodyScreen.js');
  assert.match(body, /setMValue\(obj\.value != null \? inputNumber\(obj\.value, language\) : ''\)/);
  assert.match(read('screens', 'ProtocolsScreen.js'), /formFromProtocol\(p, vialsByProtocol\[p\.id\], new Date\(\), language\)/);
  const calc = read('screens', 'components', 'CalculatorSection.js');
  assert.match(calc, /setWeight\(inputNumber\(w, language\)\)/);
  assert.match(calc, /setTgtWeight\(target\.target_weight_kg != null \? inputNumber\(/);
});

test('weigh-in sheet prefill: "86,0" in Portuguese, "86.0" in English', () => {
  const row = { entry_date: '2026-10-01', weight_kg: 86, body_fat_pct: 21.5, waist_cm: 92.4 };
  assert.deepEqual(weighInFormValues(row, 'metric', 'pt'), { weight: '86,0', bodyFat: '21,5', waist: '92,4' });
  assert.deepEqual(weighInFormValues(row, 'metric', 'de'), { weight: '86,0', bodyFat: '21,5', waist: '92,4' });
  assert.deepEqual(weighInFormValues(row, 'metric', 'en'), { weight: '86.0', bodyFat: '21.5', waist: '92.4' });
  assert.deepEqual(weighInFormValues(row, 'metric'), { weight: '86.0', bodyFat: '21.5', waist: '92.4' }, 'English by default');
});

test('weigh-in sheet round trip in every language: untouched keeps the stored value exactly, an edit saves the typed value', () => {
  const row = { entry_date: '2026-10-01', weight_kg: 86.04, body_fat_pct: 21.5, waist_cm: 92.37 };
  for (const language of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const unit of ['metric', 'imperial']) {
      const shown = weighInFormValues(row, unit, language);
      const back = readWeighInForm({ ...shown, unit, original: row, language });
      assert.equal(back.ok, true, `${language} ${unit}`);
      assert.equal(back.weightKg, 86.04, `${language} ${unit}: an untouched weight keeps the stored kg`);
      assert.equal(back.waistCm, 92.37, `${language} ${unit}: an untouched waist keeps the stored cm`);
      assert.equal(back.bodyFatPct, 21.5, `${language} ${unit}`);
    }
    const typed = language === 'en' ? '86.5' : '86,5';
    assert.equal(readWeighInForm({ ...weighInFormValues(row, 'metric', language), weight: typed, unit: 'metric', original: row, language }).weightKg, 86.5, language);
  }
});

test('Your numbers line and Weigh-ins line show the language decimal', () => {
  const full = { weight: '84.6', wUnit: 'kg', height: '181', hUnit: 'cm', age: '38', yr: 'anos', sexLabel: 'Homem', bodyFat: '21.5', bfShort: 'GC', activityLabel: 'Moderado' };
  assert.equal(numbersLine({ ...full, language: 'pt' }), '84,6 kg · 181 cm · 38 anos · Homem · 21,5% GC · Moderado');
  assert.equal(numbersLine({ ...full, weight: '84,6', language: 'pt' }), '84,6 kg · 181 cm · 38 anos · Homem · 21,5% GC · Moderado', 'a comma typed stays');
  assert.equal(numbersLine(full), '84.6 kg · 181 cm · 38 anos · Homem · 21.5% GC · Moderado', 'English by default');
  const rows = [{ date: '2026-09-28', weightKg: 84.6, bodyFatPct: 21.5 }];
  const line = weighInsLine({ rows, template: '{n} · último {date} · {w}', none: '—', fmtDate: (d) => d.slice(5), fmtWeight: (kg) => `${kg} kg`, bfShort: 'GC', language: 'pt' });
  assert.equal(line, '1 · último 09-28 · 84.6 kg · 21,5% GC');
});

test('Dose accumulation numbers: level and axis labels use the language decimal', () => {
  assert.equal(levelLabel(3.456, 'pt'), '3,5');
  assert.equal(levelLabel(3.456, 'en'), '3.5');
  assert.equal(levelLabel(3.456), '3.5');
  assert.equal(levelLabel(1234.4, 'de'), '1234', 'whole numbers stay ungrouped, as before');
  assert.equal(axisLabel(0.25, 'fr'), '0,3');
  assert.equal(axisLabel(0, 'it'), '0,0');
  assert.equal(axisLabel(0, 'en'), '0.0');
});

test('Dose accumulation half-life in hours uses the language decimal (simulator 2026-10-02: "Meia-vida 0.5 h")', () => {
  const src = read('screens', 'SerumCurveScreen.js');
  assert.doesNotMatch(src, /return `\$\{hours\}h`;/, 'halfLifeLabel hours');
  assert.doesNotMatch(src, /return \{ num: String\(hours\), unit: 'h' \};/, 'halfLifeParts hours');
  assert.match(src, /return `\$\{decimalText\(hours, language\)\}h`;/);
  assert.match(src, /return \{ num: decimalText\(hours, language\), unit: 'h' \};/);
});

test('example values in empty fields use the language decimal', () => {
  assert.deepEqual(exampleValues('metric', 'pt'), { weight: '80,0', bodyFat: '20', waist: '90', height: '178' });
  assert.deepEqual(exampleValues('imperial', 'es'), { weight: '176,4', bodyFat: '20', waist: '35,4', height: '70,1' });
  assert.deepEqual(exampleValues('metric'), { weight: '80.0', bodyFat: '20', waist: '90', height: '178' });
});

test('food quantities use the language decimal', () => {
  assert.equal(itemLabel({ food: 'aveia', qty: 0.5, unit: 'xícara' }, 'pt'), '0,5 xícara aveia');
  assert.equal(itemLabel({ food: 'oats', qty: 0.5, unit: 'cup' }), '0.5 cup oats');
});

// ── Screens: no hand-built English-order date, no device-locale or Intl formatting ──
const SCREENS = [
  ['screens', 'TodayScreen.js'], ['screens', 'ProtocolsScreen.js'], ['screens', 'JourneyScreen.js'],
  ['screens', 'SerumCurveScreen.js'], ['screens', 'SettingsScreen.js'], ['screens', 'LogScreen.js'],
  ['screens', 'BodyScreen.js'], ['screens', 'FoodChatScreen.js'],
  ['screens', 'components', 'CalculatorSection.js'], ['screens', 'components', 'FoodEntryEditor.js'],
  ['screens', 'components', 'FoodGraceNote.js'], ['screens', 'components', 'VaccinePage.js'],
  ['screens', 'components', 'VaccinesSection.js'], ['screens', 'components', 'MarkerChart.js'],
  ['screens', 'components', 'ProgressChart.js'], ['components', 'FeatureExplainers.js'],
  ['components', 'previewFx.js'], ['lib', 'protocolsHero.js'],
];

test('no screen formats a date with toLocaleDateString (device or Intl output); all go through formatDate', () => {
  for (const f of SCREENS) assert.doesNotMatch(read(...f), /toLocaleDateString\(/, f.join('/'));
});

test('no screen groups a number with toLocaleString; formatInt keys it to the app language', () => {
  for (const f of SCREENS) assert.doesNotMatch(read(...f), /\.toLocaleString\(/, f.join('/'));
});

test('no screen builds a display date from the month keys in English order ("Out 19")', () => {
  for (const f of SCREENS) {
    assert.doesNotMatch(read(...f), /t\(MONTH_KEYS\[[^\]]+\]\)\}?\s*\$\{[^}]*getDate\(\)/, f.join('/'));
    assert.doesNotMatch(read(...f), /t\(MONTH_KEYS\[[^\]]+\]\)\}\s*\$\{[^}]*getFullYear\(\)/, f.join('/'));
  }
});

test('Today: the weigh-in reminder date and the vial dates come from formatDate', () => {
  const src = read('screens', 'TodayScreen.js');
  assert.match(src, /today_alert_rc_when'\)\.replace\('\{date\}', formatDate\(/);
  assert.match(src, /formatDate\(new Date\(\), language, 'weekdayLong'\)/);
});

test('Journey and Progress: the weight and the level use the language decimal', () => {
  const j = read('screens', 'JourneyScreen.js');
  assert.match(j, /formatNumber\(tile\.weight, language\)/);
  assert.match(j, /levelLabel\(level\.value, language\)/);
  const c = read('screens', 'components', 'CalculatorSection.js');
  assert.match(c, /weighInFormValues\(row, unit, language\)/);
  assert.match(c, /readWeighInForm\(\{[^}]*language[^}]*\}\)/);
});
