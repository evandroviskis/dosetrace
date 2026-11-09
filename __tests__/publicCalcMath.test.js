'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../web/calc-math.js');

function joined(res) {
  return (res.steps || []).join('\n');
}

test('160 mg split into 2 at 250 mg/mL is 0.32 mL and 32 units only on U-100', () => {
  const res = calc.syringeVolume({
    amount: '160',
    amountUnit: 'mg',
    parts: '2',
    concentration: '250',
    concentrationUnit: 'mg',
    calibration: 'U-100',
  });
  assert.equal(res.ok, true);
  assert.equal(res.perDisplay, '80');
  assert.equal(res.volume.display, '0.32');
  assert.equal(res.volume.rounded, false);
  assert.equal(res.primary.calibration, 'U-100');
  assert.equal(res.primary.display, '32');
  assert.equal(res.primary.rounded, false);
  assert.equal(res.byCalibration['U-40'].display, '12.8');
  assert.notEqual(res.byCalibration['U-40'].display, '32');
  const text = joined(res);
  assert.match(text, /80 mg/);
  assert.match(text, /0\.32 mL/);
  assert.match(text, /32 units on a U-100 insulin syringe only/);
  assert.match(text, /12\.8 units on a U-40 insulin syringe only/);
  assert.doesNotMatch(text, /32 units on a U-40/);
  assert.doesNotMatch(text, /inject/i);
  assert.match(res.notice, /does not recommend a dose/);
});

test('the same 0.32 mL is 12.8 units when the selected calibration is U-40', () => {
  const res = calc.syringeVolume({
    amount: '80',
    amountUnit: 'mg',
    parts: '1',
    concentration: '250',
    concentrationUnit: 'mg',
    calibration: 'U-40',
  });
  assert.equal(res.ok, true);
  assert.equal(res.primary.display, '12.8');
  assert.equal(res.primary.calibration, 'U-40');
  assert.equal(res.byCalibration['U-100'].display, '32');
  assert.match(joined(res), /Calibration you selected: 0\.32 mL × 40 = 12\.8 units/);
  assert.match(joined(res), /Do not use the U-100 count on a U-40 syringe/);
});

test('mL only does not pick a unit count', () => {
  const res = calc.syringeVolume({
    amount: '80', amountUnit: 'mg', concentration: '250', concentrationUnit: 'mg', calibration: 'ml-only',
  });
  assert.equal(res.ok, true);
  assert.equal(res.primary, null);
  assert.equal(res.volume.display, '0.32');
  assert.match(joined(res), /No syringe calibration selected/);
  assert.match(joined(res), /32 units on a U-100 insulin syringe only/);
  assert.match(joined(res), /12\.8 units on a U-40 insulin syringe only/);
});

test('80000 mcg at 250 mg/mL is the same 0.32 mL, using the factor 1000', () => {
  const res = calc.syringeVolume({
    amount: '80000', amountUnit: 'mcg', concentration: '250', concentrationUnit: 'mg', calibration: 'U-100',
  });
  assert.equal(res.ok, true);
  assert.equal(res.volume.display, '0.32');
  assert.equal(res.primary.display, '32');
  assert.match(joined(res), /factor between mg and mcg is 1000/);
});

test('a non-terminating quotient is labeled rounded and keeps the exact fraction', () => {
  const res = calc.syringeVolume({
    amount: '1', amountUnit: 'mg', concentration: '3', concentrationUnit: 'mg', calibration: 'U-100',
  });
  assert.equal(res.ok, true);
  assert.equal(res.volume.rounded, true);
  assert.equal(res.volume.fraction, '1/3');
  assert.equal(res.volume.display, '0.333333');
  assert.equal(res.primary.fraction, '100/3');
  assert.equal(res.primary.display, '33.333333');
  assert.equal(res.primary.rounded, true);
  const text = joined(res);
  assert.match(text, /1\/3 mL exactly/);
  assert.match(text, /rounded to 6 decimal places/);
  assert.doesNotMatch(text, /31\.999|33\.333300|0\.333333 \* 100|0\.333333 × 100/);
});

test('splitting into 3 does not present a rounded part as exact', () => {
  const res = calc.syringeVolume({
    amount: '1', amountUnit: 'mg', parts: '3', concentration: '1', concentrationUnit: 'mg', calibration: 'ml-only',
  });
  assert.equal(res.ok, true);
  assert.match(joined(res), /1\/3 mg exactly/);
  assert.match(joined(res), /rounded to 6 decimal places/);
});

test('blank parts means one part', () => {
  const res = calc.syringeVolume({
    amount: '80', amountUnit: 'mg', parts: '   ', concentration: '250', concentrationUnit: 'mg', calibration: 'U-100',
  });
  assert.equal(res.ok, true);
  assert.equal(res.volume.display, '0.32');
  assert.doesNotMatch(joined(res), /split into/);
});

test('syringe rejects blank, NaN, zero, negative, and unsafe division', () => {
  const base = { amountUnit: 'mg', concentration: '250', concentrationUnit: 'mg', calibration: 'U-100' };
  for (const amount of ['', '   ', 'abc', 'NaN', 'Infinity', '1e2', null, undefined]) {
    const res = calc.syringeVolume({ ...base, amount });
    assert.equal(res.ok, false, String(amount));
    assert.equal(res.volume, undefined);
  }
  const zero = calc.syringeVolume({ ...base, amount: '0' });
  assert.equal(zero.ok, false);
  assert.equal(zero.code, 'zero');
  const neg = calc.syringeVolume({ ...base, amount: '-1' });
  assert.equal(neg.ok, false);
  assert.equal(neg.code, 'negative');
  const div0 = calc.syringeVolume({ ...base, amount: '80', concentration: '0' });
  assert.equal(div0.ok, false);
  assert.equal(div0.field, 'concentration');
  assert.match(div0.message, /Division by zero is not performed/);
  const parts = calc.syringeVolume({ ...base, amount: '80', parts: '1.5' });
  assert.equal(parts.ok, false);
  assert.equal(parts.code, 'not-whole');
  const noCal = calc.syringeVolume({ ...base, amount: '80', calibration: '' });
  assert.equal(noCal.ok, false);
  assert.equal(noCal.field, 'calibration');
});

test('comma decimals and thousands are read explicitly', () => {
  const comma = calc.parsePositive('0,5');
  assert.equal(comma.ok, true);
  assert.equal(comma.display, '0.5');
  const thousands = calc.parsePositive('5,000');
  assert.equal(thousands.display, '5000');
  const dotted = calc.parsePositive('5.000');
  assert.equal(dotted.display, '5');
  const res = calc.syringeVolume({
    amount: '0,32', amountUnit: 'mg', concentration: '1', concentrationUnit: 'mg', calibration: 'U-100',
  });
  assert.equal(res.ok, true);
  assert.equal(res.volume.display, '0.32');
  assert.match(joined(res), /0,32 is read as 0\.32/);
});

test('10 mg in 2 mL is 5 mg/mL and 5000 mcg/mL', () => {
  const res = calc.reconstitution({ mass: '10', massUnit: 'mg', volume: '2' });
  assert.equal(res.ok, true);
  assert.equal(res.mgPerMl.display, '5');
  assert.equal(res.mgPerMl.rounded, false);
  assert.equal(res.mcgPerMl.display, '5000');
  assert.match(joined(res), /10 mg ÷ 2 mL = 5 mg\/mL/);
  assert.match(joined(res), /5000 mcg\/mL/);
  assert.match(joined(res), /not an instruction to prepare a vial/);
  assert.doesNotMatch(joined(res), /inject/i);
});

test('reconstitution rejects zero, negative, and blank volume', () => {
  for (const volume of ['0', '-2', '', 'abc']) {
    const res = calc.reconstitution({ mass: '10', massUnit: 'mg', volume });
    assert.equal(res.ok, false, volume);
    assert.equal(res.mgPerMl, undefined);
  }
  const zero = calc.reconstitution({ mass: '10', massUnit: 'mg', volume: '0' });
  assert.match(zero.message, /Division by zero is not performed/);
});

test('mg and mcg convert by 1000', () => {
  const mg = calc.convertMass({ value: '1', unit: 'mg' });
  assert.equal(mg.ok, true);
  assert.equal(mg.mcg.display, '1000');
  assert.equal(mg.mg.display, '1');
  assert.equal(mg.mcg.rounded, false);
  assert.match(joined(mg), /1 mg × 1000 = 1000 mcg/);
  const back = calc.convertMass({ value: '1000', unit: 'mcg' });
  assert.equal(back.mg.display, '1');
  assert.match(joined(back), /1000 mcg ÷ 1000 = 1 mg/);
  const half = calc.convertMass({ value: '0.5', unit: 'mg' });
  assert.equal(half.mcg.display, '500');
  assert.equal(calc.convertMass({ value: '0', unit: 'mg' }).ok, false);
  assert.equal(calc.convertMass({ value: '-5', unit: 'mcg' }).code, 'negative');
  assert.equal(calc.convertMass({ value: 'nope', unit: 'mg' }).code, 'invalid');
});

test('tablet fraction is arithmetic and carries the splitting warning', () => {
  const half = calc.tabletFraction({
    mode: 'fraction', labeled: '10', unit: 'mg', numerator: '1', denominator: '2',
  });
  assert.equal(half.ok, true);
  assert.equal(half.fraction, '1/2');
  assert.equal(half.amount.display, '5');
  assert.equal(half.amount.rounded, false);
  assert.match(joined(half), /1\/2 × 10 mg = 5 mg/);
  assert.equal(half.tabletNotice, calc.TABLET_NOTICE);
  assert.match(half.tabletNotice, /extended-release/);
  assert.match(half.tabletNotice, /enteric-coated/);
  assert.match(half.tabletNotice, /prescriber or pharmacist/);
  assert.match(half.tabletNotice, /does not mean this tablet, or any particular tablet, is suitable for splitting/);
  assert.doesNotMatch(joined(half), /suitable for splitting/);

  const fromAmount = calc.tabletFraction({
    mode: 'amount', labeled: '10', unit: 'mg', desired: '5', desiredUnit: 'mg',
  });
  assert.equal(fromAmount.fraction, '1/2');
  assert.equal(fromAmount.amount.display, '5');

  const quarter = calc.tabletFraction({
    mode: 'fraction', labeled: '20', unit: 'mg', numerator: '1', denominator: '4',
  });
  assert.equal(quarter.amount.display, '5');
  assert.equal(quarter.fraction, '1/4');

  const third = calc.tabletFraction({
    mode: 'fraction', labeled: '10', unit: 'mg', numerator: '1', denominator: '3',
  });
  assert.equal(third.amount.rounded, true);
  assert.equal(third.amount.fraction, '10/3');
  assert.match(joined(third), /rounded to 6 decimal places/);
});

test('tablet fraction rejects a zero denominator and other invalid inputs', () => {
  const zeroDen = calc.tabletFraction({
    mode: 'fraction', labeled: '10', unit: 'mg', numerator: '1', denominator: '0',
  });
  assert.equal(zeroDen.ok, false);
  assert.equal(zeroDen.field, 'denominator');
  assert.match(zeroDen.message, /Division by zero is not performed/);
  const neg = calc.tabletFraction({
    mode: 'amount', labeled: '-10', unit: 'mg', desired: '5', desiredUnit: 'mg',
  });
  assert.equal(neg.ok, false);
  assert.equal(neg.code, 'negative');
  const blank = calc.tabletFraction({ mode: 'fraction', labeled: '', unit: 'mg', numerator: '1', denominator: '2' });
  assert.equal(blank.ok, false);
  assert.equal(blank.amount, undefined);
});
