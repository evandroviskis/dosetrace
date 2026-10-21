'use strict';
// DV-005 / AD-95 interim (OPEN-10 option A, "Q16 = B, A as the interim"): the curve applies the protocol's
// CURRENT dose and schedule to every past date. Dated dose versions (B) are 1.3.2; 1.3.1 ships the
// interim — the curve says so in its notes card. Shown always: the app keeps no edit history (updated_at
// moves on every write and a migration resets it), so "was it edited?" cannot be answered, and the
// sentence is true for every protocol. Plus the DV-072 C legend key for the hollow tick. Both ×6.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations } = require('../i18n/translations');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const KEYS = ['curve_current_dose_note', 'curve_lg_not_taken'];

test('the interim note and the hollow-tick legend exist in all 6 languages, natively written', () => {
  for (const k of KEYS) {
    for (const l of LANGS) {
      const v = translations[l][k];
      assert.equal(typeof v, 'string', `${l}.${k}`);
      assert.ok(v.trim().length > 3, `${l}.${k} empty`);
      if (l !== 'en') assert.notEqual(v, translations.en[k], `${l}.${k} is the English text`);
    }
  }
  assert.match(translations.en.curve_current_dose_note, /current dose/);
  assert.match(translations.pt.curve_current_dose_note, /dose/);
  // Review: shown to everyone, so it must not claim the user changed anything ("if you changed").
  assert.match(translations.en.curve_current_dose_note, /even if you changed/);
  assert.doesNotMatch(translations.en.curve_current_dose_note, /before you changed/);
  assert.match(translations.pt.curve_current_dose_note, /mesmo que você/);
  // Re-review: the legend says the spec's sense, "Planned, not logged as taken" — never that the dose
  // was not done (fr "non effectuées" said that).
  assert.equal(translations.en.curve_lg_not_taken, 'planned, not logged as taken');
  assert.match(translations.pt.curve_lg_not_taken, /não marcadas como tomadas/);
  assert.doesNotMatch(translations.fr.curve_lg_not_taken, /effectu/);
  for (const l of LANGS) assert.ok(translations[l].curve_lg_not_taken.includes(','), `${l}: planned, + not logged`);
});

test('descriptive only: no advice words in the new curve strings', () => {
  const ADVICE = /\b(should|must|recommend|take more|increase|decrease|you missed|low)\b/i;
  for (const k of KEYS) assert.doesNotMatch(translations.en[k], ADVICE, k);
});

test('the curve screen shows the note in its notes card and a hollow tick in the legend (theme tokens only)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /t\('curve_current_dose_note'\)/);
  assert.match(src, /<View style=\{s\.lgTickHollow\} \/><Text style=\{s\.legendKeyText\}>\{t\('curve_lg_not_taken'\)\}<\/Text>/);
  assert.match(src, /lgTickHollow: \{[^}]*borderColor: c\.data/);
  // Re-review: the legend marks are the chart marks scaled by one factor (TICK_LEGEND_SCALE), so the
  // hollow tick in the legend reads as the same mark as under the axis.
  assert.match(src, /const TICK = \{ w: 1\.4, h: 5, hollowW: 3, hollowStroke: 1 \};/);
  assert.match(src, /lgTick: \{ width: TICK\.w \* TICK_LEGEND_SCALE, height: TICK\.h \* TICK_LEGEND_SCALE, backgroundColor: c\.data \}/);
  assert.match(src, /lgTickHollow: \{ width: TICK\.hollowW \* TICK_LEGEND_SCALE, height: TICK\.h \* TICK_LEGEND_SCALE, borderWidth: TICK\.hollowStroke \* TICK_LEGEND_SCALE, borderColor: c\.data \}/);
  assert.match(src, /width=\{TICK\.hollowW\} height=\{TICK\.h\}/);
  // the note sits after the per-compound notes, before the disclaimer
  const note = src.indexOf("t('curve_current_dose_note')");
  assert.ok(note > src.indexOf("t('blend_curve_caveat')") && note < src.indexOf("t('curve_disclaimer')"));
});
