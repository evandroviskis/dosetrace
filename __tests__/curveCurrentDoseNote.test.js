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
// AD-95 B built 2026-10-26 (founder: "a curva tem que mudar só a partir da dose que ela mudou"): the
// interim note is gone — it is no longer true; the hollow-tick legend stays.
const KEYS = ['curve_lg_not_taken'];

test('the interim note and the hollow-tick legend exist in all 6 languages, natively written', () => {
  for (const k of KEYS) {
    for (const l of LANGS) {
      const v = translations[l][k];
      assert.equal(typeof v, 'string', `${l}.${k}`);
      assert.ok(v.trim().length > 3, `${l}.${k} empty`);
      if (l !== 'en') assert.notEqual(v, translations.en[k], `${l}.${k} is the English text`);
    }
  }
  for (const l of LANGS) assert.equal(translations[l].curve_current_dose_note, undefined, `${l}: the interim note left with AD-95`);
  // Re-review: the legend says the spec's sense, "Planned, not logged as taken" — never that the dose
  // was not done (fr "non effectuées" said that).
  // Re-review 2 (one term per concept, CLAUDE.md): in the app's own words — the neighbour key's word
  // for "scheduled" (curve_lg_doses) and the app's word for a Taken dose ("Complete", log_taken).
  const WANT = {
    en: 'scheduled, not marked complete',
    es: 'programadas, sin marcar como completadas',
    pt: 'programadas, não marcadas como concluídas',
    fr: 'prévues, non marquées comme effectuées',
    de: 'geplant, nicht als erledigt markiert',
    it: 'programmate, non contrassegnate come completate',
  };
  for (const l of LANGS) assert.equal(translations[l].curve_lg_not_taken, WANT[l], l);
  const stem = (w) => w.toLowerCase().slice(0, 6);
  for (const l of LANGS) {
    const sched = translations[l].curve_lg_doses.split(' ').map(stem);
    assert.ok(sched.includes(stem(WANT[l].split(',')[0])), `${l}: "scheduled" as in curve_lg_doses`);
    assert.ok(WANT[l].toLowerCase().includes(stem(translations[l].log_taken)), `${l}: "complete" as in log_taken`);
  }
});

test('descriptive only: no advice words in the new curve strings', () => {
  const ADVICE = /\b(should|must|recommend|take more|increase|decrease|you missed|low)\b/i;
  for (const k of KEYS) assert.doesNotMatch(translations.en[k], ADVICE, k);
});

test('the curve screen shows the note in its notes card and a hollow tick in the legend (theme tokens only)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.doesNotMatch(src, /curve_current_dose_note/, 'AD-95: the interim note is gone');
  assert.match(src, /<View style=\{s\.lgTickHollow\} \/><Text style=\{s\.legendKeyText\}>\{t\('curve_lg_not_taken'\)\}<\/Text>/);
  assert.match(src, /lgTickHollow: \{[^}]*borderColor: c\.data/);
  // Re-review: the legend marks are the chart marks scaled by one factor (TICK_LEGEND_SCALE), so the
  // hollow tick in the legend reads as the same mark as under the axis.
  assert.match(src, /const TICK = \{ w: 1\.4, h: 5, hollowW: 3, hollowStroke: 1 \};/);
  assert.match(src, /lgTick: \{ width: TICK\.w \* TICK_LEGEND_SCALE, height: TICK\.h \* TICK_LEGEND_SCALE, backgroundColor: c\.data \}/);
  assert.match(src, /lgTickHollow: \{ width: TICK\.hollowW \* TICK_LEGEND_SCALE, height: TICK\.h \* TICK_LEGEND_SCALE, borderWidth: TICK\.hollowStroke \* TICK_LEGEND_SCALE, borderColor: c\.data \}/);
  assert.match(src, /width=\{TICK\.hollowW\} height=\{TICK\.h\}/);
});
