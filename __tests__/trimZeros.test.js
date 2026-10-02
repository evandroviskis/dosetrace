'use strict';
// Founder 2026-10-02 ("Tire os decimais"): volumes and concentrations in the Protocols
// area drop trailing zeros ("1.00 mg/ml" -> "1 mg/ml", "0.50 ml" -> "0.5 ml",
// "1.25 ml" stays). No rounding change: only trailing zeros and a dangling point go.
// The syringe DRAW number in units keeps its decimal ("50.0", "100.0 u") - founder
// decision from earlier. Today's "50.0 u · 0.50 ml" line trims the ml part only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { trimZeros, computeDraw } = require('../lib/doseMath');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const PROTOCOLS = read('screens', 'ProtocolsScreen.js');
const TODAY = read('screens', 'TodayScreen.js');
const DOSE_PAGE = read('screens', 'components', 'DosePage.js');

test('trimZeros strips trailing zeros and a dangling point, nothing else', () => {
  assert.equal(trimZeros('1.00'), '1');
  assert.equal(trimZeros('0.50'), '0.5');
  assert.equal(trimZeros('2.00'), '2');
  assert.equal(trimZeros('1.25'), '1.25');
  assert.equal(trimZeros('2.'), '2');
  assert.equal(trimZeros('10'), '10');
  assert.equal(trimZeros('100'), '100');
  assert.equal(trimZeros('0.050'), '0.05');   // formatML small-dose precision kept, zero trimmed
  assert.equal(trimZeros('0.0125'), '0.0125'); // no rounding
  assert.equal(trimZeros('0.0100'), '0.01');
  assert.equal(trimZeros(2), '2');
  assert.equal(trimZeros(0.5), '0.5');
});

test('trimZeros keeps a comma decimal and never collapses grouped thousands', () => {
  assert.equal(trimZeros('2,50'), '2,5');
  assert.equal(trimZeros('0,750'), '0,75');
  assert.equal(trimZeros('5,000'), '5,000');   // "5,000 IU" is five thousand, not 5
  assert.equal(trimZeros('10,000'), '10,000');
});

test('trimZeros passes through empty and non-numeric values unchanged', () => {
  assert.equal(trimZeros(null), null);
  assert.equal(trimZeros(undefined), undefined);
  assert.equal(trimZeros(''), '');
  assert.equal(trimZeros('—'), '—');
  assert.equal(trimZeros('abc'), 'abc');
});

test('the draw units keep their decimal (computeDraw is unchanged)', () => {
  const r = computeDraw({ type: 'recon', amount: '5', water: '2.5', dose: '1', doseUnit: 'mg', unit: 'mg' });
  assert.equal(r.drawUnits, '50.0');
  assert.equal(r.drawML, '0.50');
  assert.equal(trimZeros(r.drawML), '0.5');
});

test('Protocols volume and concentration render sites go through trimZeros', () => {
  // protocol page syringe calculator: the Volume read
  assert.match(PROTOCOLS, /<Text style=\{s\.readVal\}>\{trimZeros\(draw\.drawML\)\} ml<\/Text>/);
  // zoomed syringe sheet readout: units untouched, ml trimmed
  assert.match(PROTOCOLS, /\{draw\.drawUnits\}u<\/Text> · \{trimZeros\(draw\.drawML\)\} ml/);
  // dose details (recon): diluent amount and concentration
  assert.match(PROTOCOLS, /value: `\$\{trimZeros\(p\.water\)\} ml`/);
  assert.match(PROTOCOLS, /trimZeros\(\(parseDecimal\(p\.amount\) \/ parseDecimal\(p\.water\)\)\.toFixed\(2\)\)/);
  // dose details (rtu): concentration and vial size
  assert.match(PROTOCOLS, /value: `\$\{trimZeros\(p\.concentration\)\} \$\{p\.concentration_unit \|\| 'mg'\}\/ml`/);
  assert.match(PROTOCOLS, /value: `\$\{trimZeros\(vial\.water_ml\)\} ml`/);
  // collapsed card size fallback (rtu concentration)
  assert.match(PROTOCOLS, /return `\$\{trimZeros\(p\.concentration\)\} \$\{p\.concentration_unit \|\| 'mg'\}\/ml`;/);
  // wizard dose step live result and summary
  assert.match(PROTOCOLS, /<Text style=\{s\.liveMl\}>\{trimZeros\(drawML\)\} ml<\/Text>/);
  assert.match(PROTOCOLS, /value: water \? `\$\{trimZeros\(water\)\} ml` : '—'/);
  assert.match(PROTOCOLS, /value: `\$\{trimZeros\(drawML\)\} ml \(\$\{drawUnits\} \$\{t\('protocols_units'\)\}\)`/);
  // no untrimmed volume or concentration left behind
  assert.doesNotMatch(PROTOCOLS, /\{draw\.drawML\} ml|\{drawML\} ml|\$\{drawML\} ml/);
  assert.doesNotMatch(PROTOCOLS, /\.toFixed\(2\) : '—'\} \$\{p\.unit\}\/ml/);
  assert.doesNotMatch(PROTOCOLS, /\$\{p\.water\} ml|\$\{vial\.water_ml\} ml|\$\{water\} ml/);
});

test('the draw units are never trimmed anywhere', () => {
  for (const [name, src] of [['ProtocolsScreen', PROTOCOLS], ['TodayScreen', TODAY], ['DosePage', DOSE_PAGE]]) {
    assert.doesNotMatch(src, /trimZeros\((draw\.)?drawUnits\)/, `${name} must keep the units decimal`);
  }
  assert.match(PROTOCOLS, /<Text style=\{\[s\.drawBig, over && s\.drawBigRisk\]\}>\{draw\.drawUnits\}<\/Text>/);
  assert.match(PROTOCOLS, /<Text style=\{\[s\.drawBig, drawExceedsSyringe && s\.drawBigRisk\]\}>\{drawUnits\}<\/Text>/);
});

test('Today and the dose page trim only the ml part of "50.0 u · 0.5 ml"', () => {
  for (const [name, src] of [['TodayScreen', TODAY], ['DosePage', DOSE_PAGE]]) {
    assert.match(src, /\{draw\.drawUnits\}<Text style=\{s\.drawUnit\}> u · \{trimZeros\(draw\.drawML\)\} ml<\/Text>/, name);
    assert.doesNotMatch(src, /\{draw\.drawML\} ml/, name);
  }
});
