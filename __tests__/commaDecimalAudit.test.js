'use strict';
// A-26 (founder 2026-09-27, target 1.2.6 → 1.3.0): audit every number read for comma decimals.
// One parser family (lib/doseMath parseDecimal / parseMeasure) reads numbers; a raw
// parseFloat(x.replace(',', '.')) turned a grouped "1,234" into 1.234. Found: a lab value read
// from a scan, the food editor's numbers, and the Progress card / tile body numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(rel)); else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('no raw parseFloat(… .replace(\',\', \'.\')) outside lib/doseMath', () => {
  const bad = [];
  for (const f of [...jsFiles('lib'), ...jsFiles('screens'), ...jsFiles('components')]) {
    if (f === path.join('lib', 'doseMath.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (src.split('\n').some((l) => l.includes('parseFloat(') && /\.replace\(\s*['"],['"]\s*,\s*['"]\.['"]\s*\)/.test(l))) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('a scanned lab value "1,234" is 1234, "5,5" is 5.5', () => {
  const { validateExtraction } = require('../lib/bodyScan');
  const r = validateExtraction({ report_date: '2026-09-01', markers: [{ marker: 'Platelets', value: '1,234', unit: '' }, { marker: 'X', value: '5,5', unit: '' }, { marker: 'Y', value: 7.2, unit: '' }] });
  assert.deepEqual(r.markers.map((m) => m.value), [1234, 5.5, 7.2]);
});

test('the food editor reads "1,200" kcal as 1200', () => {
  const { editedItems } = require('../lib/nutrition');
  const [it] = editedItems([{ food: 'pizza', kcal: 800 }], [{ __orig: 0, food: 'pizza', kcal: '1,200', carb_g: '12', protein_g: '0,5' }]);
  assert.equal(it.kcal, 1200);
  assert.equal(it.protein_g, 0.5);
});
