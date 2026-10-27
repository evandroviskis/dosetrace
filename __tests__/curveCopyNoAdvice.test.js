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
  assert.match(translations.en.curve_disclaimer, /the doses you logged \(before Now; before you added a protocol, its schedule from your start date\), and your planned schedule \(after Now\)/);
  assert.match(translations.en.curve_doses_in_level_note, /^Doses in level: past doses that still add at least 1% of their amount/);
  assert.match(translations.pt.curve_doses_in_level_note, /^Doses no nível: doses anteriores que ainda somam/);
  for (const l of LANGS) assert.doesNotMatch(translations[l].curve_doses_in_level_note, /scheduled|programad|prévues|geplante|programmate/i, l);
});

// AD-96 B PK review 7: the disclaimer names the estimated part too (before a protocol was added, its
// schedule from the start date), and the current-dose note says what is still true — every past dose
// counts at the current dose (the past is no longer the schedule, so "and schedule" was wrong). ×6.
test('PK review 7: the disclaimer names the estimated part, 6 languages (the interim current-dose note left with AD-95, 2026-10-26)', () => {
  const DISCLAIMER = {
    en: 'the doses you logged (before Now; before you added a protocol, its schedule from your start date), and your planned schedule (after Now).',
    es: 'en las dosis que registraste (antes de «Ahora»; antes de añadir un protocolo, su esquema desde tu fecha de inicio) y en tu esquema planificado (después de «Ahora»).',
    pt: 'nas doses que você registrou (antes de “Agora”; antes de você adicionar um protocolo, o esquema do protocolo a partir da data de início) e no seu esquema planejado (depois de “Agora”).',
    fr: 'les doses que vous avez enregistrées (avant « Maintenant » ; avant l’ajout d’un protocole, son schéma depuis votre date de début) et votre schéma prévu (après « Maintenant »).',
    de: 'der von dir erfassten Dosen (vor „Jetzt“; vor dem Hinzufügen eines Protokolls: dessen Schema ab deinem Startdatum) und deines geplanten Schemas (nach „Jetzt“).',
    it: 'sulle dosi che hai registrato (prima di «Ora»; prima di aggiungere un protocollo, il suo schema dalla data di inizio) e sugli orari che hai pianificato (dopo «Ora»).',
  };
  for (const l of LANGS) {
    assert.ok(translations[l].curve_disclaimer.includes(DISCLAIMER[l]), `${l}: ${translations[l].curve_disclaimer.slice(0, 200)}`);
    assert.equal(translations[l].curve_current_dose_note, undefined, `${l}: AD-95 built — every dose counts at its own amount`);
    // The estimated part uses the app's own word for the start date (curve_estimated_before).
    const startWord = { en: 'start date', es: 'fecha de inicio', pt: 'data de início', fr: 'date de début', de: 'Startdatum', it: 'data di inizio' }[l];
    assert.ok(translations[l].curve_estimated_before.includes(startWord), l);
    assert.ok(translations[l].curve_disclaimer.includes(startWord), l);
  }
});
