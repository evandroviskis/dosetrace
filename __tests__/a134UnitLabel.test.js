'use strict';
// A-134 (5) — both-theme render pass 2026-10-16: the dose-unit chip read "IU" in Portuguese
// (and German, Spanish, French, Italian). The app stores and computes with 'IU' (doseMath,
// halfLives, the server schema), and showed that stored value as is. Every translated string
// already writes the unit the native way: UI in es / pt / fr / it, IE in German (Internationale
// Einheit), IU in English.
// Fix: lib/localeFormat unitText(text, language) localizes the DISPLAY only — a unit value
// ("IU", "IU/ml") or a rendered line ("10 IU every day"). The stored unit, the chip keys and
// all math stay 'IU'. Applied to the unit chips, every dose / vial / concentration / strength
// unit on Today, My Protocols and the wizard review, the curve, the Journey level tile, the
// provider report, the dose reminder text, the protocol assistant's lines and the fit explainer.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { unitText } = require('../lib/localeFormat');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const WANT = { en: 'IU', es: 'UI', pt: 'UI', fr: 'UI', de: 'IE', it: 'UI' };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('A-134 (5): IU reads UI (es, pt, fr, it), IE (de), IU (en); other units untouched', () => {
  for (const l of LANGS) {
    assert.equal(unitText('IU', l), WANT[l], l);
    assert.equal(unitText('IU/ml', l), `${WANT[l]}/ml`, l);
    assert.equal(unitText('10 IU every day', l), `10 ${WANT[l]} every day`, l);
    for (const u of ['mg', 'mcg', 'g', 'ml', 'mIU/mL', 'kg']) assert.equal(unitText(u, l), u, `${l} ${u}`);
  }
  assert.equal(unitText(null, 'pt'), null);
});

test('A-134 (5): the translations already use the same word (one term per concept)', () => {
  for (const l of LANGS) {
    const words = new Set();
    for (const v of Object.values(tr[l])) {
      if (typeof v !== 'string') continue;
      for (const m of v.matchAll(/\b(IU|UI|IE)\b/g)) words.add(m[1]);
    }
    assert.deepEqual([...words], [WANT[l]], `${l}: ${[...words].join(', ')}`);
  }
});

test('A-134 (5): the chips show the localized word but keep the stored key', () => {
  const src = read('screens/ProtocolsScreen.js');
  assert.match(src, /items=\{units\.map\(u => \(\{ key: u, label: `\$\{unitText\(u, language\)\}\$\{suffix\}` \}\)\)\}/);
  assert.match(src, /unitSeg\(\['mg', 'mcg', 'IU', 'g'\], doseUnit, setDoseUnit\)/, 'the stored value stays IU');
});

// No stored unit is printed raw on a screen: each goes through unitText (the curve's unitLbl is
// built with it once, asserted below).
const RAW = /(?<!['"])(?:\$\{|\{)(?:p\.dose_unit|p\.unit|p\.concentration_unit|p\.serving_strength_unit|doseUnit|unit|level\.unit|model\.keyUnit|protocol\.dose_unit)\b/g;
test('A-134 (5): no screen prints a stored unit without unitText', () => {
  const offenders = [];
  for (const f of ['screens/ProtocolsScreen.js', 'screens/TodayScreen.js', 'screens/SerumCurveScreen.js', 'screens/SettingsScreen.js', 'screens/JourneyScreen.js', 'screens/components/FitExplainer.js']) {
    read(f).split('\n').forEach((l, i) => {
      if (/^\s*\/\//.test(l)) return;
      for (const m of l.matchAll(RAW)) offenders.push(`${f}:${i + 1}: ${m[0]}`);
    });
  }
  assert.deepEqual(offenders, []);
  assert.match(read('screens/SerumCurveScreen.js'), /const unitLbl = unitText\(model \? model\.unit : 'mg', language\);/);
  assert.match(read('screens/SerumCurveScreen.js'), /curveUnit\(entry\) === 'IU' \? ` · \$\{unitText\('IU', language\)\}` : ''/);
  assert.match(read('screens/ProtocolsScreen.js'), /\.replace\('\{sunit\}', unitText\(p\.dose_unit, language\)\)/);
});

test('A-134 (5): the reminder text, the assistant and the fit explainer localize the unit', () => {
  assert.match(read('lib/notifications.js'), /unit: protocol\.dose_unit \? unitText\(protocol\.dose_unit, t\.language\) : ''/);
  const pa = read('screens/components/ProtocolAssistant.js');
  assert.match(pa, /const tr = \(key, params\) => unitText\(renderText\(t, key, params\), language\);/);
  assert.match(pa, /unitText\(typeof r\.value === 'string' \? r\.value : renderParam\(t, r\.value\), language\)/);
  const fx = read('screens/components/FitExplainer.js');
  assert.match(fx, /const tr = \(key, extra\) => unitText\(renderText\(t, key, \{ \.\.\.p, \.\.\.\(extra \|\| \{\}\) \}\), language\);/);
});
