'use strict';
// S-21 (A-56 / FX-17, design item 23): App Store 3.1.2 — the paywall shows working
// "Terms of Use (EULA)" and "Privacy policy" links under Restore, 6 languages.
// S-22 (A-57 / FX-18, design item 29): the plan is called "Premium" everywhere (never
// "Pro"), and Settings no longer lists a feature that does not exist ("searchable tags").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const i18n = read('i18n', 'translations.js');
const valuesOf = (key) => [...i18n.matchAll(new RegExp(`\\n\\s+${key}: (['"])(.*)\\1,`, 'g'))].map((m) => m[2]);

test('S-21: the legal links point at Apple\'s Standard EULA and the DoseTrace privacy policy', () => {
  const { EULA_URL, PRIVACY_URL } = require('../lib/legalLinks');
  assert.equal(EULA_URL, 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
  assert.equal(PRIVACY_URL, 'https://dosetrace.io/privacy-policy');
});

// Founder 2026-09-30: Apple's EULA is the iOS agreement; on Android the Terms link
// shows DoseTrace's own terms (the in-app Terms of service — dosetrace.io has no terms page).
test('S-21: iOS links Apple\'s Standard EULA; Android shows DoseTrace\'s own terms in the app', () => {
  const { termsTarget, EULA_URL } = require('../lib/legalLinks');
  assert.deepEqual(termsTarget('ios'), { kind: 'url', url: EULA_URL, labelKey: 'paywall_terms_eula' });
  assert.deepEqual(termsTarget('android'), { kind: 'inApp', labelKey: 'settings_terms', titleKey: 'settings_terms', bodyKey: 'settings_terms_body' });
  for (const key of ['settings_terms', 'settings_terms_body']) {
    assert.equal((i18n.match(new RegExp(`\\n\\s+${key}:`, 'g')) || []).length, 6, key);
  }
  const settings = read('screens', 'SettingsScreen.js');
  assert.doesNotMatch(settings, /\nfunction LegalModal\(/, 'one shared LegalModal, no private copy left in Settings');
  assert.match(settings, /from '\.\.\/components\/LegalModal'/);
});

test('S-21: the paywall renders both links right after Restore, opening those URLs', () => {
  const src = read('screens', 'PaywallScreen.js');
  const r = src.indexOf("t('paywall_restore')");
  const after = src.slice(r, r + 1400);
  assert.match(src, /termsTarget\(Platform\.OS\)/);
  assert.match(after, /t\(terms\.labelKey\)/);
  assert.match(after, /settings_privacy_policy/);
  assert.match(after, /openURL\(terms\.url\)/);
  assert.match(src, /<LegalModal/, 'Android: the terms open in the app');
  assert.match(after, /openURL\(PRIVACY_URL\)/);
  assert.match(src, /from '\.\.\/lib\/legalLinks'/);
});

test('S-21: "Terms of Use (EULA)" exists in all 6 languages and keeps the word EULA', () => {
  const v = valuesOf('paywall_terms_eula');
  assert.equal(v.length, 6);
  for (const s of v) assert.match(s, /\(EULA\)/);
  assert.equal(valuesOf('settings_privacy_policy').length, 6);
});

test('S-22: no user-facing string calls the plan "Pro" (6 languages)', () => {
  const hits = i18n.split('\n').filter((l) => /\bPro\b|\bPRO\b/.test(l))
    // German "Pro Upload zahlen" means "pay PER upload" — not the plan name.
    .filter((l) => !/paywall_bloodwork_free_price: 'Pro Upload zahlen'/.test(l));
  assert.deepEqual(hits.map((l) => l.trim().slice(0, 60)), []);
  for (const key of ['preview_unlock_cta', 'blood_premium_markers', 'pw_prev_scan_body', 'paywall_lifetime_sub']) {
    const v = valuesOf(key);
    assert.equal(v.length, 6, key);
    for (const s of v) assert.match(s, /Premium/, `${key}: ${s.slice(0, 40)}`);
  }
});

test('S-22: no hardcoded "PRO" badge in the screens — the badge uses the translated plan name', () => {
  for (const f of ['BodyScreen.js', 'JourneyScreen.js']) {
    const src = read('screens', f);
    assert.doesNotMatch(src, />PRO</, f);
    assert.match(src, /t\('paywall_premium'\)/, f);
  }
});

test('S-22: settings_premium_feat_3 names a real feature (the AI food log), never "tags"', () => {
  const v = valuesOf('settings_premium_feat_3');
  assert.equal(v.length, 6);
  assert.equal(v[0], 'AI food log, every day');
  for (const s of v) assert.doesNotMatch(s, /\btags\b|etiquetas|check-?in/i, s); // "jeden Tag" (every day) is fine
  const names = valuesOf('nutri_ai_badge');
  v.forEach((s, i) => assert.ok(s.startsWith(names[i]), `${s} uses the app's own name for the feature (${names[i]})`));
});
