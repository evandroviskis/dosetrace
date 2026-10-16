'use strict';
// A-134 (2) — both-theme render pass 2026-10-16: Journey › Progress tile read
// "Desde 14 de jul.: −10,9" and then "kg" alone on the next line (pt, fr, de). The value and
// its unit were joined with an ordinary space, so the line could break between them.
// Fix: every value + unit join on screen uses a no-break space (U+00A0), so "−10,9 kg",
// "400 mg", "84,1 kg", "2 cápsulas", "12 ng/ml" always stay on one line together. The guard
// below fails if a plain space comes back between a value and a unit anywhere on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// What a unit looks like in the code: the weight unit, the curve unit, the serving word, a
// dose / vial / concentration / lab unit field, or the kg / lb strings.
const UNIT = String.raw`(?:wUnit|unitLbl|unitLabel|doseUnit|unit|[A-Za-z_.]*\.(?:unit|dose_unit|concentration_unit|serving_strength_unit)|t\('cal_unit_[a-z]+'\)|t\(tile\.unit)`;
// "...} ${unit" in a template, "...} {unit" in JSX: a value expression, ONE plain space, the unit.
const PLAIN_JOIN = new RegExp(String.raw`[})] (?:\$\{|\{)` + UNIT + String.raw`(?=[}\s|(])`, 'g');

// lib/protocolAssistant.js is left out on purpose: its chat lines are built mostly from the
// translated templates ("{dose} {unit}" in ×6 strings), so a no-break space there is a copy
// change across 6 languages, not a code join — reported, not part of this fix.
const EXEMPT = new Set([path.join('lib', 'protocolAssistant.js')]);

function filesUnder(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(rel));
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('A-134 (2): the Journey Progress tile keeps "−10,9 kg" together', () => {
  const src = read('screens/JourneyScreen.js');
  const line = src.split('\n').find((l) => l.includes("t('cal_since_date')"));
  assert.ok(line, 'the since line');
  assert.match(line, /\{signedDelta\(tile\.since\.delta\)\}\{'\\u00A0'\}\{t\(tile\.unit === 'lb'/, 'no-break space between the delta and kg / lb');
});

test('A-134 (2): the Your numbers line keeps each value with its unit (kg, cm, years, % body fat)', () => {
  const { numbersLine } = require('../lib/progressCard');
  assert.equal(numbersLine({ weight: '84,1', wUnit: 'kg', height: '177', hUnit: 'cm', age: '39', yr: 'anos', sexLabel: 'Homem', bodyFat: '28', bfShort: 'GC', activityLabel: 'Moderado', language: 'pt' }),
    '84,1\u00A0kg · 177\u00A0cm · 39\u00A0anos · Homem · 28%\u00A0GC · Moderado');
});

test('A-134 (2): no value + unit join on screen uses a plain space (guard over screens, components, lib)', () => {
  const offenders = [];
  for (const f of [...filesUnder('screens'), ...filesUnder('components'), ...filesUnder('lib')].filter((x) => !EXEMPT.has(x))) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      if (/^\s*\/\//.test(l)) return; // comments
      for (const m of l.matchAll(PLAIN_JOIN)) offenders.push(`${f}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(offenders, [], 'join value and unit with \\u00A0');
});
