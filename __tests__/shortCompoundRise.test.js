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
  for (const n of ['TB-500', 'GHK-Cu', 'Ipamorelin']) assert.equal(getHalfLifeEntry(n).tmaxHours, undefined, `${n}: no source, instant`);
});

// Founder 2026-11-01 (curve warning, option A): BPC-157 and Pentadeca Arginate rise to a peak 3 min after the
// injection (He 2022, PMID 36588717, rats IM) — the only published peak time. At t½ 0.25 h an instant peak
// overstated the top by ~13 % (2^(−0.05/0.25) = 0.871; the "~7 %" of the earlier entry was computed at 0.5 h).
test('BPC-157 and PDA: a 3-minute rise (rat IM), solvable, peak 0.871 of the dose, still drawn by the hour', () => {
  const { amountFraction } = require('../lib/halfLives');
  for (const n of ['BPC-157', 'Pentadeca Arginate']) {
    const e = getHalfLifeEntry(n);
    assert.equal(e.tmaxHours, 0.05, n);
    assert.equal(e.tmaxRange, null, n);
    const kr = riseRate(e.hours, e.tmaxHours);
    assert.ok(kr > 0, `${n}: a rise exists`);
    const kd = Math.LN2 / e.hours;
    assert.ok(Math.abs(Math.log(kr / kd) / (kr - kd) - 0.05) < 1e-9, `${n}: the rise peaks at 3 min`);
    assert.ok(Math.abs(amountFraction(e, 0.05) - Math.pow(2, -0.2)) < 1e-9, `${n}: peak 2^(-0.2)`);
    for (const dt of [0.03, 0.07]) assert.ok(amountFraction(e, dt) < amountFraction(e, 0.05), `${n}: the peak is the top`);
    assert.equal(isShortHalfLife(e), true, `${n}: still hours`);
    assert.match(e.source, /peak at 3 min/, n);
    assert.match(e.source, /~13%/, n);
    assert.doesNotMatch(e.source, /~7%|drawn as instant/, n);
  }
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
