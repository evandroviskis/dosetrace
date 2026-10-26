'use strict';
// AD-96 B (docs/specs/curve-logged-doses.md PK-18): the curve copy stays descriptive only — never "you
// missed", "low", "take", a recommendation or a judgement — in all 6 languages (AI / product hard line:
// surface the person's own numbers, never advise). Also the six languages keep every curve string.
// (The legend, "time you marked them" note, one-time notice and What's New line wait for their picture;
// the disclaimer and the "Doses in level" note were reworded for the logged-doses past.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations } = require('../i18n/translations');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const ADVICE = {
  en: /\byou missed\b|\bmissed (your|a) dose\b|\blow\b|\btoo (high|low)\b|\btake\b|\bshould\b|\brecommend|\badvis(e|able)\b|\bincrease\b|\bdecrease\b/i,
  es: /\bolvidaste\b|\bnivel bajo\b|\bdemasiado\b|\btoma\b|\btomar\b|\bdeberías\b|\brecomend|\baumenta\b|\breduce\b/i,
  pt: /\bvocê perdeu\b|\besqueceu\b|\bnível baixo\b|\bdemais\b|\btome\b|\btomar\b|\bdeveria\b|\brecomend|\baumente\b|\breduza\b/i,
  fr: /\bvous avez oublié\b|\bmanqué\b|\bniveau bas\b|\btrop\b|\bprenez\b|\bdevriez\b|\brecommand|\baugmentez\b|\bréduisez\b/i,
  de: /\bvergessen\b|\bverpasst\b|\bniedrige[rn]? Spiegel\b|\bzu (hoch|niedrig)\b|\bnimm\b|\bsolltest\b|\bempfehl|\berhöhe\b|\bsenke\b/i,
  it: /\bhai dimenticato\b|\bsaltato\b|\blivello basso\b|\btroppo\b|\bprendi\b|\bdovresti\b|\braccomand|\bti consiglio\b|\bconsigliamo\b|\baumenta\b|\briduci\b/i,
};

test('PK-18: no advice or judgement words in any curve string, 6 languages', () => {
  const keys = Object.keys(translations.en).filter((k) => k.startsWith('curve_'));
  assert.ok(keys.length > 30, `${keys.length} curve strings`);
  for (const l of LANGS) {
    for (const k of keys) {
      const v = translations[l][k];
      assert.ok(typeof v === 'string' && v.length, `${l}.${k} present`);
      assert.doesNotMatch(v, ADVICE[l], `${l}.${k}: ${v}`);
    }
  }
});

test('PK-18: the reworded strings say what the curve counts (logged before Now, planned after Now)', () => {
  assert.match(translations.en.curve_disclaimer, /the doses you logged \(before Now\), and your planned schedule \(after Now\)/);
  assert.match(translations.en.curve_doses_in_level_note, /^Doses in level: past doses that still add at least 1% of their amount/);
  assert.match(translations.pt.curve_doses_in_level_note, /^Doses no nível: doses anteriores que ainda somam/);
  for (const l of LANGS) assert.doesNotMatch(translations[l].curve_doses_in_level_note, /scheduled|programad|prévues|geplante|programmate/i, l);
});
