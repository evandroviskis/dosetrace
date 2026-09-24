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
this.getHalfLifeEntry = getHalfLifeEntry; this.resolveHalfLifeKey = resolveHalfLifeKey;`, ctx);
const { HALF_LIVES, CURVE_EXCLUDED, getHalfLifeEntry, resolveHalfLifeKey } = ctx;

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
