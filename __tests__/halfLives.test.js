// Half-life table guards (deep-search review 2026-09-24). lib/halfLives.js is an
// ES module; load it through a tiny vm transform so node --test can read it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'halfLives.js'), 'utf8')
  .replace(/export const /g, 'const ')
  .replace(/export function /g, 'function ');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${src}
this.HALF_LIVES = HALF_LIVES; this.CURVE_EXCLUDED = CURVE_EXCLUDED;
this.getHalfLifeEntry = getHalfLifeEntry; this.resolveHalfLifeKey = resolveHalfLifeKey;
this.curveUnit = curveUnit; this.doseInCurveUnit = doseInCurveUnit; this.amountFraction = amountFraction;`, ctx);
const { HALF_LIVES, CURVE_EXCLUDED, getHalfLifeEntry, resolveHalfLifeKey, curveUnit, doseInCurveUnit, amountFraction } = ctx;

const TIERS = new Set(['clinical', 'studied', 'estimated']);

test('every entry has a positive half-life, a known tier, and a source', () => {
  for (const [name, e] of Object.entries(HALF_LIVES)) {
    assert.ok(e.hours > 0, `${name}: hours must be > 0`);
    assert.ok(TIERS.has(e.tier), `${name}: unknown tier ${e.tier}`);
    assert.ok(typeof e.source === 'string' && e.source.trim().length > 3, `${name}: needs a source line`);
  }
});

test('reviewed upgrades are in place', () => {
  assert.equal(getHalfLifeEntry('Ipamorelin').tier, 'studied');
  assert.equal(getHalfLifeEntry('Glutathione').tier, 'studied');
  const cet = getHalfLifeEntry('Cetrorelix Acetate');
  assert.equal(cet.hours, 20.6);
  assert.equal(cet.tier, 'clinical');
  assert.equal(getHalfLifeEntry('Sustanon 250').hours, 168);
});

test('Thymosin Beta-4 is its own molecule, not the TB-500 fragment', () => {
  const tb4 = getHalfLifeEntry('Thymosin Beta-4');
  const tb500 = getHalfLifeEntry('TB-500');
  assert.equal(resolveHalfLifeKey('Thymosin Beta-4'), 'Thymosin Beta-4');
  assert.equal(tb4.tier, 'studied');
  assert.equal(tb500.tier, 'estimated');
  assert.notEqual(tb4, tb500);
});

test('excluded compounds never chart — including via fuzzy or variant spellings', () => {
  for (const name of ['IGF-1 LR3', 'Dihexa', 'PEG-MGF', 'Adipotide', 'Thymalin', 'RGD Peptide', 'FOXO4-DRI']) {
    assert.equal(getHalfLifeEntry(name), null, `${name} must not chart`);
  }
  assert.equal(getHalfLifeEntry('IGF-1 LR3 1mg'), null, 'a variant spelling must not slip past the exclusion');
  assert.equal(getHalfLifeEntry('PEG-MGF 2mg'), null, 'PEG-MGF must not fall through to MGF');
  // Normalization must not reroute or newly chart ordinary custom names.
  assert.equal(resolveHalfLifeKey('Nad+'), 'NAD+');
  for (const unmatched of ['Vitamina D', 'Vitamina D3', 'Anadrol', 'Melena de León', 'CJC 1295', 'CJC1295', 'BPC 157 / TB 500']) {
    assert.equal(getHalfLifeEntry(unmatched), null, unmatched + ' must stay off the curve');
  }
  for (const typed of ['PEG MGF', 'pegmgf', 'Peg Mgf 2mg']) {
    assert.equal(getHalfLifeEntry(typed), null, typed + ' must resolve to excluded PEG-MGF, not MGF');
  }
  assert.equal(getHalfLifeEntry('Insulin Glargine'), null);
});

test('excluded keys stay in the table so fuzzy matching cannot reroute them', () => {
  for (const key of CURVE_EXCLUDED) assert.ok(HALF_LIVES[key], `${key} must remain a table key`);
});

test('neighbours of excluded compounds still resolve correctly', () => {
  assert.equal(resolveHalfLifeKey('MGF'), 'MGF');
  assert.ok(getHalfLifeEntry('MGF'));
  assert.ok(getHalfLifeEntry('IGF-1 DES'));
});

test('acetyl/amidated variants have their own honest entries', () => {
  for (const name of ['Ac-Epithalon', 'N-Acetyl-Epitalon-Amidate', 'N-Acetyl Selank Amidate', 'N-Acetyl Semax Amidate']) {
    const e = getHalfLifeEntry(name);
    assert.ok(e, `${name} resolves`);
    assert.equal(resolveHalfLifeKey(name), name, `${name} has its own key`);
    assert.match(e.source, /Modified form/);
  }
});

test('partial custom names only match when unambiguous', () => {
  for (const n of ['Test', 'Testo', 'Tren', 'Deca', 'Sema', 'TB']) {
    assert.equal(resolveHalfLifeKey(n), null, n + ' is ambiguous and must not borrow a curve');
  }
  assert.equal(resolveHalfLifeKey('BPC'), 'BPC-157');
  assert.equal(resolveHalfLifeKey('Tirz'), 'Tirzepatide');
  // a key named inside the name wins over a longer key that merely contains it
  assert.equal(resolveHalfLifeKey('epithalon'), 'Epithalon');
  assert.equal(resolveHalfLifeKey('selank'), 'Selank');
  assert.equal(resolveHalfLifeKey('melanotan i'), 'Melanotan I');
  assert.equal(resolveHalfLifeKey('Semaglutide 5mg'), 'Semaglutide');
  assert.equal(resolveHalfLifeKey('Tirz '), 'Tirzepatide', 'trailing space');
  assert.equal(resolveHalfLifeKey('HGH Frag'), 'Fragment 176-191');
  assert.equal(resolveHalfLifeKey('hgh frag 176-191'), 'Fragment 176-191');
  assert.equal(resolveHalfLifeKey('HGH 4iu'), 'HGH');
});

test('curve units: mg for all, IU only for IU-native compounds', () => {
  const hgh = HALF_LIVES['HGH'], hcg = HALF_LIVES['HCG'], bpc = HALF_LIVES['BPC-157'];
  assert.equal(curveUnit(bpc), 'mg');
  assert.equal(curveUnit(hgh), 'IU');
  assert.equal(curveUnit(hcg), 'IU');
  assert.equal(doseInCurveUnit(250, 'mcg', bpc), 0.25);
  assert.equal(doseInCurveUnit(2, 'mg', bpc), 2);
  assert.equal(doseInCurveUnit(0.5, 'g', bpc), 500);
  assert.equal(doseInCurveUnit(5, 'IU', bpc), null, 'IU is not convertible for a mass-dosed compound');
  assert.equal(doseInCurveUnit(4, 'IU', hgh), 4);
  assert.equal(doseInCurveUnit(2, 'mg', hgh), 6, 'somatropin 1 mg = 3 IU');
  assert.equal(doseInCurveUnit(500, 'IU', hcg), 500);
  assert.equal(doseInCurveUnit(1, 'mg', hcg), null, 'HCG has no mass-to-IU standard');
  assert.equal(doseInCurveUnit(0, 'mg', bpc), null);
});

test('absorption: Bateman rise where a published Tmax exists, same area as instant', () => {
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= Math.abs(b) * tol, a + ' vs ' + b);
  const cyp = HALF_LIVES['Testosterone Cypionate'], und = HALF_LIVES['Testosterone Undecanoate'];
  near(200 * amountFraction(cyp, 71.7), 154.39, 0.003);
  near(1000 * amountFraction(und, 168), 947.5, 0.003);
  assert.equal(amountFraction(cyp, 0), 0, 'an oil ester starts at zero, not at the full dose');
  // peak at Tmax: F(Tmax) = e^(-kd*Tmax), and it is the maximum
  const kd = Math.LN2 / cyp.hours;
  near(amountFraction(cyp, 71.7), Math.exp(-kd * 71.7), 0.001);
  assert.ok(amountFraction(cyp, 71.7) > amountFraction(cyp, 60) && amountFraction(cyp, 71.7) > amountFraction(cyp, 84));
  // area preserved: integral equals t½/ln2
  let area = 0; for (let t = 0; t < 192 * 30; t += 0.5) area += amountFraction(cyp, t + 0.25) * 0.5;
  near(area, cyp.hours / Math.LN2, 0.005);
  // compounds without a Tmax stay instant
  const bpc = HALF_LIVES['BPC-157'];
  assert.equal(amountFraction(bpc, 0), 1);
  assert.equal(amountFraction(bpc, -1), 0);
  // only ester/depot entries with a real published Tmax get the rise
  for (const [k, e] of Object.entries(HALF_LIVES)) if (e.tmaxHours) {
    assert.ok(Array.isArray(e.tmaxRange) && e.tmaxRange[0] <= e.tmaxHours && e.tmaxHours <= e.tmaxRange[1], k + ' needs its published range');
    assert.ok(e.tmaxHours < e.hours / Math.LN2, k + ' Tmax must be reachable');
  }
});
