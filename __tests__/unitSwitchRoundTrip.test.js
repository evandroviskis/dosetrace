'use strict';
// S25 2026-11-06/07 (pt): Progresso › Seus números, Métrico → Imperial → Métrico turned the height
// 180 into 180,1 cm and saved it. changeUnit converted the TEXT each way, rounded to one decimal
// (180 cm → 70,9 in → 180,09 → "180,1"), and the debounced save stored the drifted number.
// Fix (lib/unitFields): a switch only changes what the field SHOWS. Each field remembers the exact
// text it was typed in and that unit (memo); the math and the save use that source at full
// precision, switching back shows the typed text exactly, and the payload keeps the source
// (typedAs) so a restart in the other unit comes back exact too. A field the user edits starts
// over from the new text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { switchUnitField, fieldMetric, fieldSave, fieldLoad } = require('../lib/unitFields');
const { inToCm, lbToKg } = require('../lib/energyCalc');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const trip = (text, kind, language, start = 'metric') => {
  const other = start === 'metric' ? 'imperial' : 'metric';
  const a = switchUnitField(text, kind, start, other, null, language);
  const b = switchUnitField(a.text, kind, other, start, a.memo, language);
  return { mid: a, back: b };
};

test('unit switch: metric → imperial → metric gives back exactly what was typed (height, weight, waist)', () => {
  const h = trip('180', 'length', 'pt');
  assert.equal(h.mid.text, '70,9');
  assert.equal(h.back.text, '180');
  assert.equal(trip('82,4', 'weight', 'pt').back.text, '82,4');
  assert.equal(trip('80,5', 'weight', 'pt').back.text, '80,5');
  assert.equal(trip('85', 'length', 'pt').back.text, '85');
  assert.equal(trip('181.5', 'length', 'en').back.text, '181.5');
  for (let cm = 140; cm <= 210; cm += 0.5) {
    const s = String(cm).replace('.', ',');
    assert.equal(trip(s, 'length', 'pt').back.text, s, `height ${s}`);
  }
  for (let kg = 40; kg <= 160; kg += 0.1) {
    const s = (Math.round(kg * 10) / 10).toString().replace('.', ',');
    assert.equal(trip(s, 'weight', 'pt').back.text, s, `weight ${s}`);
  }
});

test('unit switch: typed in imperial, the round trip the other way is exact too', () => {
  assert.equal(trip('71', 'length', 'en', 'imperial').mid.text, '180.3');
  assert.equal(trip('71', 'length', 'en', 'imperial').back.text, '71');
  assert.equal(trip('176,4', 'weight', 'pt', 'imperial').back.text, '176,4');
});

test('unit switch: many switches never drift', () => {
  let f = { text: '180', memo: null };
  let unit = 'metric';
  for (let i = 0; i < 25; i++) {
    const next = unit === 'metric' ? 'imperial' : 'metric';
    f = switchUnitField(f.text, 'length', unit, next, f.memo, 'pt');
    unit = next;
  }
  assert.equal(unit, 'imperial');
  assert.equal(f.text, '70,9');
  assert.equal(fieldMetric(f.text, 'length', unit, f.memo, 'pt'), 180);
});

test('unit switch: the math reads the typed value, never the rounded display', () => {
  const mid = switchUnitField('180', 'length', 'metric', 'imperial', null, 'pt');
  assert.equal(fieldMetric(mid.text, 'length', 'imperial', mid.memo, 'pt'), 180);
  const w = switchUnitField('82,4', 'weight', 'metric', 'imperial', null, 'pt');
  assert.equal(fieldMetric(w.text, 'weight', 'imperial', w.memo, 'pt'), 82.4);
  // Edited after the switch: the new text, in the shown unit.
  assert.ok(Math.abs(fieldMetric('72', 'length', 'imperial', mid.memo, 'pt') - inToCm(72)) < 1e-9);
  assert.ok(Math.abs(fieldMetric('180', 'weight', 'imperial', w.memo, 'pt') - lbToKg(180)) < 1e-9);
  assert.equal(fieldMetric('', 'length', 'imperial', null, 'pt'), null);
});

test('unit switch: an empty or non-numeric field is left alone', () => {
  assert.deepEqual(switchUnitField('', 'length', 'metric', 'imperial', null, 'pt'), { text: '', memo: null });
  assert.equal(switchUnitField('abc', 'weight', 'metric', 'imperial', null, 'pt').text, 'abc');
});

test('unit switch: the save keeps the typed value exactly; a restart in imperial switches back exactly', () => {
  // Metric, untouched: saved as before ("180", "82.4").
  assert.deepEqual(fieldSave('180', 'length', 'metric', null, 'pt'), { value: '180', typedAs: null });
  assert.deepEqual(fieldSave('82,4', 'weight', 'metric', null, 'pt'), { value: '82.4', typedAs: null });
  // Shown in imperial: the stored inches are the exact conversion, plus the typed source.
  const mid = switchUnitField('180', 'length', 'metric', 'imperial', null, 'pt');
  const saved = fieldSave(mid.text, 'length', 'imperial', mid.memo, 'pt');
  assert.deepEqual(saved.typedAs, { unit: 'metric', text: '180' });
  assert.ok(Math.abs(inToCm(Number(saved.value)) - 180) < 1e-9, 'stored inches read back as 180 cm');
  // Back in metric after the round trip: the very payload it had before.
  const back = switchUnitField(mid.text, 'length', 'imperial', 'metric', mid.memo, 'pt');
  assert.deepEqual(fieldSave(back.text, 'length', 'metric', back.memo, 'pt'), { value: '180', typedAs: null });
  // Restart while in imperial: shows 70,9 and switching back gives 180.
  const loaded = fieldLoad(saved.value, saved.typedAs, 'length', 'imperial', 'pt');
  assert.equal(loaded.text, '70,9');
  assert.equal(fieldMetric(loaded.text, 'length', 'imperial', loaded.memo, 'pt'), 180);
  assert.equal(switchUnitField(loaded.text, 'length', 'imperial', 'metric', loaded.memo, 'pt').text, '180');
});

test('unit switch: a saved value with no (or a stale) typed source loads as before', () => {
  assert.deepEqual(fieldLoad('180', null, 'length', 'metric', 'pt'), { text: '180', memo: null });
  assert.deepEqual(fieldLoad('82.4', undefined, 'weight', 'metric', 'pt'), { text: '82,4', memo: null });
  assert.deepEqual(fieldLoad(null, null, 'length', 'metric', 'pt'), { text: '', memo: null });
  // The stored inches no longer match the source (changed elsewhere): the stored value wins.
  assert.deepEqual(fieldLoad('72', { unit: 'metric', text: '180' }, 'length', 'imperial', 'pt'), { text: '72', memo: null });
});

test('unit switch: Your numbers uses lib/unitFields for every unit-switchable field', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/components/CalculatorSection.js'), 'utf8');
  const body = src.slice(src.indexOf('function changeUnit('), src.indexOf('function changeUnit(') + 1400);
  assert.match(body, /switchUnitField/);
  assert.doesNotMatch(body, /kgToLb\(n\)|cmToIn\(n\)/, 'no text-to-text conversion left');
  for (const f of ['weight', 'weightField', 'height', 'waist', 'rcThen', 'wiWeight', 'wiWaist']) {
    assert.match(body, new RegExp(`['"]${f}['"]`), `changeUnit switches ${f}`);
  }
  assert.match(src, /typedAs/, 'the save keeps the typed source');
  // A weigh-in's kg shown in lb: one decimal on screen, the exact kg for the math (was the long raw conversion).
  assert.doesNotMatch(src, /inputNumber\(unit === 'imperial' \? kgToLb/);
  const r = switchUnitField('80,25', 'weight', 'metric', 'imperial', null, 'pt');
  assert.equal(r.text, '176,9');
  assert.equal(fieldMetric(r.text, 'weight', 'imperial', r.memo, 'pt'), 80.25);
});

// Review 2026-11-07 (independent pass over the S25 batch): two side doors back to the drift.
test('unit switch: a weigh-in prefilled in imperial keeps its exact kg (the reality-check start IS that weigh-in, A-212)', () => {
  const U = require('../lib/unitFields');
  const r = U.fieldFromMetric(80, 'weight', 'imperial', 'pt');
  assert.equal(r.text, '176,4');
  assert.equal(U.fieldMetric(r.text, 'weight', 'imperial', r.memo, 'pt'), 80, 'exactly the weigh-in, not lbToKg(176,4)');
  const m = U.fieldFromMetric(80, 'weight', 'metric', 'pt');
  assert.deepEqual(m, { text: '80', memo: null });
  const src = read('screens/components/CalculatorSection.js');
  const open = src.slice(src.indexOf('function openRcStart()'), src.indexOf('// The start can be a past weigh-in'));
  assert.equal((open.match(/fieldFromMetric\(w, 'weight', unit, language\)/g) || []).length, 2, 'openRcStart and shiftRcStartDate');
  assert.equal((open.match(/unitMemo\.current\.rcThen = /g) || []).length, 2);
});

test('unit switch: a weigh-in refused as out of range leaves Your numbers\' typed sources untouched', () => {
  const src = read('screens/components/CalculatorSection.js');
  const fn = src.slice(src.indexOf('function saveTodayWeighIn()'), src.indexOf('function saveTodayWeighIn()') + 2500);
  const guard = fn.indexOf('if (!weighInValuesOk(');
  const carry = fn.indexOf('m.weight = m.weightField = carry(');
  assert.ok(guard > 0 && carry > 0);
  assert.ok(carry > guard, 'the memos are replaced only after the weigh-in is accepted');
});
