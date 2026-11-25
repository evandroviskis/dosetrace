'use strict';
// S25 2026-11-25 (package 962a574d): the observation scene of the intro video showed the raw keys
// "report_header" and "report_dose_line". The adherence report rebuild (founder 2026-11-24, rebuild =
// replace) removed those keys and the intro still read them. Guard for the whole class: every t('key')
// the opening (splash, intro video, onboarding flow, entry offer) reads must exist in all 6 languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations } = require('../i18n/translations');

const ROOT = path.join(__dirname, '..');
const FILES = ['components/OnboardingIntro.js']
  .concat(fs.readdirSync(path.join(ROOT, 'screens')).filter((f) => /^Onboarding|EntryOffer|Welcome|Splash/i.test(f)).map((f) => `screens/${f}`))
  .concat(fs.readdirSync(path.join(ROOT, 'components')).filter((f) => /^(Onboarding|Ob[A-Z]|EntryOffer)/.test(f)).map((f) => `components/${f}`));

test('every literal t(key) of the opening exists in the 6 languages', () => {
  const missing = [];
  for (const f of [...new Set(FILES)]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-z0-9_]+)'/g)) {
      for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) if (!translations[l][m[1]]) missing.push(`${f}: ${l}.${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('the observation scene reads the report words of the real report (settings_report_title, report_dose_setup)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components/OnboardingIntro.js'), 'utf8');
  assert.match(src, /t\('settings_report_title'\)\.toLocaleUpperCase\(\)/);
  assert.match(src, /t\('report_dose_setup'\)/);
  assert.doesNotMatch(src, /'report_header'|'report_dose_line'/);
});
