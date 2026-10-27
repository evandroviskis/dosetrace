'use strict';
// Council 2026-10-27 (pharmacometrician, precision principle): on the hours curve a short compound peaked at
// full amount the instant it was injected. Six entries have a label Tmax (SC) and now rise to it; every other
// short entry stays instant (no source = never estimated). The approved short-compound note stays visible.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getHalfLifeEntry, riseRate } = require('../lib/halfLives');
const { isShortHalfLife } = require('../lib/curveWindow');
const { translations } = require('../i18n/translations');

const WANT = { Exenatide: [2.1, null], Lixisenatide: [2.0, [1, 3.5]], Octreotide: [0.4, null], 'PT-141': [1.0, [0.5, 1.0]], Tesamorelin: [0.15, null], HGH: [4.0, [3, 8]] };

test('six label Tmax values, each solvable, each still drawn by the hour; sourced', () => {
  for (const [n, [tm, range]] of Object.entries(WANT)) {
    const e = getHalfLifeEntry(n);
    assert.equal(e.tmaxHours, tm, n);
    assert.deepEqual(e.tmaxRange, range, n);
    assert.ok(riseRate(e.hours, e.tmaxHours) > 0, `${n}: a rise exists`);
    assert.equal(isShortHalfLife(e), true, `${n}: still hours`);
    assert.match(e.source, /Tmax/, `${n}: the source names its Tmax`);
  }
  for (const n of ['BPC-157', 'TB-500', 'GHK-Cu', 'Ipamorelin']) assert.equal(getHalfLifeEntry(n).tmaxHours, undefined, `${n}: no source, instant`);
});

test('the note: minutes under an hour, no range when the label gives none (×6); the short note stays visible', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const v = translations[l].curve_absorption_note_norange;
    assert.ok(v && v.includes('{name}') && v.includes('{peak}') && !v.includes('{range}'), l);
  }
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /if \(h < 1\) return `\$\{Math\.round\(h \* 60\)\}min`;/, 'one unit style: 24min like 2,1h (council UX)');
  assert.match(src, /entry\.tmaxRange \? /);
  assert.match(src, /const isFastNote = \(ser\) => !\(ser\.entry\.substance && ser\.entry\.hours >= 24\) && ser\.entry\.hours < STEP_HOURS;/);
});

// Council 2026-10-27 (pharmacometrician, regulatory): Octreotide's 0.4 h / 0.7 h are two groups (healthy
// volunteers / acromegaly), not a spread between people, so no range; and no "median" the labels do not give.
test('the no-range note names a published peak time, never a median (×6)', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.doesNotMatch(translations[l].curve_absorption_note_norange, /median|mediana|médiane/i, l);
  }
  assert.match(translations.pt.curve_absorption_note_norange, /tempo de pico publicado/);
});
