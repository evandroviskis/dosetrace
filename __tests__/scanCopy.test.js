'use strict';
// S-24 (A-58 part 2 / FX-20, design item 24). The app promised Premium "unlimited"
// scans while the server has a monthly budget: 3 free, 20 Premium, ONE pool shared by
// lab reports, vaccine cards and vial labels (supabase/functions/extract-bloodwork/quota.ts).
// Founder 2026-10-01: the Premium budget exists for cost only and nobody is expected to
// reach it — so Premium strings never say "unlimited" AND do not show the number; the
// cap is written down once, in the FAQ "What does Premium include?" (and the limit-
// reached message shows the server's number). The FREE budget (3) is shown, because free
// users do reach it, always as one pool. Cloud backup / sync is free and never sold as Premium.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'i18n', 'translations.js'), 'utf8');
const valuesOf = (key) => [...src.matchAll(new RegExp(`\\n\\s+${key}: (['"])(.*)\\1,`, 'g'))].map((m) => m[2]);
const UNLIMITED = /unlimited|ilimitad|illimit|unbegrenzt/i;
const NOT_PROTOCOLS = (s) => s.replace(/(unlimited|unbegrenzte)\s+proto\w*|proto\w*\s+(ilimitad\w*|illimit\w*)/gi, '');
const COMBINED = /labs, vaccine cards and vials combined|análisis, cartillas de vacunas y viales juntos|exames, carteiras de vacinação e frascos|analyses, carnets de vaccination et flacons confondus|Laborberichte, Impfpässe und Fläschchen zusammen|analisi, tessere vaccinali e flaconi insieme/;
// Premium-side scan strings the app shows (grep of screens/components, 2026-10-01).
const PREMIUM_KEYS = ['settings_premium_feat_4', 'blood_premium_markers', 'pw_prev_scan_body', 'blood_upgrade_title', 'blood_upgrade_sub', 'blood_upgrade_feat_1', 'paywall_hero_sub', 'pw_prem_scan_full', 'pw_scans_row'];
const FREE_KEYS = ['blood_first_free', 'blood_empty_sub'];
const faqLines = () => src.split('\n').filter((l) => /^\s+a: /.test(l));
const PREMIUM_FAQ = /priority support|soporte prioritario|suporte prioritário|support prioritaire|bevorzugter Support|supporto prioritario/;

test('S-24: Premium scan strings never promise "unlimited" and do not show the 20 (6 languages)', () => {
  for (const key of PREMIUM_KEYS) {
    const v = valuesOf(key);
    assert.equal(v.length, 6, key);
    for (const s of v) {
      assert.doesNotMatch(NOT_PROTOCOLS(s), UNLIMITED, `${key}: ${s}`);
      assert.doesNotMatch(s, /\b20\b/, `${key}: ${s}`);
    }
  }
});

test('S-24: the free budget is shown as 3 scans a month, one pool for labs, vaccine cards and vials', () => {
  for (const key of FREE_KEYS) {
    const v = valuesOf(key);
    assert.equal(v.length, 6, key);
    for (const s of v) {
      assert.match(s, /\b3\b/, `${key}: ${s}`);
      assert.match(s, COMBINED, `${key}: ${s}`);
      assert.doesNotMatch(s, /first upload|pay per|primera|primeiro|premier envoi|erster|primo/i, `${key}: ${s}`);
    }
  }
});

test('S-24: the cap is written once — the FAQ "What does Premium include?" says up to 20 a month in total, in 6 languages', () => {
  const premium = faqLines().filter((l) => PREMIUM_FAQ.test(l));
  assert.equal(premium.length, 6);
  for (const l of premium) {
    assert.match(l, /\b20\b/, l.trim().slice(0, 60));
    assert.match(l, /in total|en total|no total|au total|insgesamt|in totale/, l.trim().slice(0, 60));
    assert.match(l, /free for everyone|gratis para todos|grátis para todos|gratuite?s pour tous|für alle kostenlos|gratuiti per tutti/, l.trim().slice(0, 60));
  }
});

test('S-24: no FAQ answer promises unlimited scans or uploads; "Is DoseTrace free?" states the 3 free scans', () => {
  for (const l of faqLines()) {
    assert.doesNotMatch(l, /unlimited (lab scans|bloodwork uploads)|(escaneos de análisis|cargas de análisis de sangre) ilimitad|(escaneamentos de exames|envios) ilimitados|scans d’analyses illimités|examen sanguin illimités|unbegrenzte (Laborbericht-Scans|Blutuntersuchungs-Uploads)|(scansioni analisi|caricamenti di analisi) illimitat/i, l.trim().slice(0, 80));
  }
  const free = faqLines().filter((l) => /\b3 (a month|al mes|por mês|par mois|pro Monat|al mese)\b/.test(l));
  assert.equal(free.length, 6, 'the "Is DoseTrace free?" answer x6');
});

test('S-24: cloud backup / sync is never sold as Premium (it is free for everyone)', () => {
  for (const s of valuesOf('blood_upgrade_feat_2')) assert.doesNotMatch(s, /cloud|nube|nuvem|sync/i, s);
});

// Found 2026-10-01 (simulator review): the paywall's free row said "1 free lab scan" while the
// server gives 3 a month, one pool. Premium redesign (founder 2026-10-03, PA-17): the table takes
// the prototype row "AI scans (labs, vaccines, vials)" with "3 / month" on the free side and a
// check on the Premium side (S-24: no Premium number).
test('S-24: the paywall scans row names the one pool and the free side says 3 / month (6 languages)', () => {
  const row = valuesOf('pw_scans_row');
  assert.equal(row.length, 6, 'pw_scans_row exists in 6 languages');
  for (const s of row) assert.match(s, /\(.+,.+,.+\)/, 'labs, vaccines, vials: ' + s);
  const per = valuesOf('pw_per_month');
  assert.equal(per.length, 6);
  for (const s of per) assert.match(s, /^\{n\} \/ /);
  const { comparisonRows, FREE_SCANS_PER_MONTH } = require('../lib/paywallPlans');
  assert.equal(FREE_SCANS_PER_MONTH, 3);
  const rows = comparisonRows((k) => ({ pw_per_month: '{n} / month', pw_free_days: '{n} days' }[k] || k), { freeFoodDays: 7 });
  assert.deepEqual(rows.find((r) => r.label === 'pw_scans_row'), { label: 'pw_scans_row', free: '3 / month' });
});
