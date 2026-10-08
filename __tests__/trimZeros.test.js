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
  // (founder 2026-10-02: every shown number also takes the app language's decimal —
  // decimalText(trimZeros(x), language) — "0,5 ml" in Portuguese; the trim is unchanged.)
  // protocol page syringe calculator: the Volume read
  assert.match(PROTOCOLS, /<Text style=\{s\.readVal\}>\{`\$\{decimalText\(trimZeros\(draw\.drawML\), language\)\}\\u00A0ml`\}<\/Text>/); // no-break before the unit (m2)
  // zoomed syringe sheet readout: units untouched, ml trimmed
  assert.match(PROTOCOLS, /\{decimalText\(draw\.drawUnits, language\)\}u<\/Text> · \{decimalText\(trimZeros\(draw\.drawML\), language\)\} ml/);
  // dose details (recon): diluent amount and concentration
  assert.match(PROTOCOLS, /value: `\$\{decimalText\(trimZeros\(p\.water\), language\)\} ml`/);
  assert.match(PROTOCOLS, /trimZeros\(\(parseDecimal\(p\.amount\) \/ parseDecimal\(p\.water\)\)\.toFixed\(2\)\)/);
  // dose details (rtu): concentration and vial size
  assert.match(PROTOCOLS, /value: `\$\{decimalText\(trimZeros\(p\.concentration\), language\)\} \$\{p\.concentration_unit \|\| 'mg'\}\/ml`/);
  assert.match(PROTOCOLS, /value: `\$\{decimalText\(trimZeros\(vial\.water_ml\), language\)\} ml`/);
  // collapsed card size fallback (rtu concentration)
  assert.match(PROTOCOLS, /return `\$\{decimalText\(trimZeros\(p\.concentration\), language\)\} \$\{p\.concentration_unit \|\| 'mg'\}\/ml`;/);
  // wizard dose step live result and summary
  assert.match(PROTOCOLS, /<Text style=\{s\.liveMl\}>\{decimalText\(trimZeros\(drawML\), language\)\} ml<\/Text>/);
  assert.match(PROTOCOLS, /value: water \? `\$\{decimalText\(trimZeros\(water\), language\)\} ml` : '—'/);
  assert.match(PROTOCOLS, /value: `\$\{decimalText\(trimZeros\(drawML\), language\)\} ml \(\$\{decimalText\(drawUnits, language\)\} \$\{t\('protocols_units'\)\}\)`/);
  // no untrimmed volume or concentration left behind
  assert.doesNotMatch(PROTOCOLS, /\{draw\.drawML\} ml|\{drawML\} ml|\$\{drawML\} ml/);
  assert.doesNotMatch(PROTOCOLS, /\.toFixed\(2\) : '—'\} \$\{p\.unit\}\/ml/);
  assert.doesNotMatch(PROTOCOLS, /\$\{p\.water\} ml|\$\{vial\.water_ml\} ml|\$\{water\} ml/);
});

test('the draw units are never trimmed anywhere', () => {
  for (const [name, src] of [['ProtocolsScreen', PROTOCOLS], ['TodayScreen', TODAY]]) {
    assert.doesNotMatch(src, /trimZeros\((draw\.)?drawUnits\)/, `${name} must keep the units decimal`);
  }
  // AP-21 (2026-10-03): through drawReading — units as computed, ml (trimmed) only on an ml syringe
  assert.match(PROTOCOLS, /<Text style=\{\[s\.drawBig, over && s\.drawBigRisk\]\}>\{decimalText\(reading\.ml \? trimZeros\(reading\.value\) : reading\.value, language\)\}<\/Text>/);
  assert.match(PROTOCOLS, /<Text style=\{\[s\.drawBig, drawOver && s\.drawBigRisk\]\}>\{decimalText\(drawLive\.ml \? trimZeros\(drawLive\.value\) : drawLive\.value, language\)\}<\/Text>/);
  const { drawReading } = require('../lib/syringes');
  assert.equal(drawReading({ drawUnits: '50.0', drawML: '0.50' }, 100).value, '50.0');
});

test('Today and the dose page trim only the ml part of "50.0 u · 0.5 ml"', () => {
  // AP-21 (2026-10-03): both read the line from lib/syringes drawLine (ml alone on an ml syringe)
  for (const [name, src] of [['TodayScreen', TODAY]]) {
    assert.match(src, /\{drawLine\(draw, (syr|syringeSize), language\)\.big\}<Text style=\{s\.drawUnit\}>\{drawLine\(draw, (syr|syringeSize), language\)\.small\}<\/Text>/, name);
    assert.doesNotMatch(src, /\{draw\.drawML\} ml/, name);
  }
  const { drawLine } = require('../lib/syringes');
  assert.deepEqual(drawLine({ drawUnits: '50.0', drawML: '0.50' }, 100, 'en'), { big: '50.0', small: ' u · 0.5 ml' });
  assert.deepEqual(drawLine({ drawUnits: '50.0', drawML: '0.50' }, 100, 'pt'), { big: '50,0', small: ' u · 0,5 ml' });
  assert.deepEqual(drawLine({ drawUnits: '168.0', drawML: '1.68' }, 300, 'en'), { big: '1.68', small: ' ml' });
});
