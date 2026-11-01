'use strict';
// DV-113 (DL-58: Edit profile edits everything sign-up asks; picture docs/design/rodada2-conta-exames.html
// #dv113, option A, founder go 2026-11-01): Edit profile gets "O que você usa" between "Sobre você" and
// "Seus objetivos", with the SAME four options as onboarding (peptides, hormones, GLP-1, oral; same
// labels, icons and pill look — one shared component). Save writes tracking_types in the same merge
// write as the other fields (never clobbering other keys); empty is refused like any required field
// (tracking_types is part of the profile gate). The unused settings_tracking_* strings are gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { translations } = require('../i18n/translations.js');

test('DV-113: one component holds the four options (onboarding keys, labels, icons) and the pill look', () => {
  const src = read('components/CompoundPills.js');
  assert.match(src, /\{ key: 'peptides', labelKey: 'onboarding_compound_peptides', icon: 'type_vial' \}/);
  assert.match(src, /\{ key: 'hormones', labelKey: 'onboarding_compound_hormones', icon: 'reconstitution' \}/);
  assert.match(src, /\{ key: 'glp1', labelKey: 'onboarding_compound_glp1', icon: 'type_glp1' \}/);
  assert.match(src, /\{ key: 'oral', labelKey: 'onboarding_compound_oral', icon: 'type_capsule' \}/);
  assert.match(src, /export function compoundPillStyles\(c\)/);
  assert.match(src, /pillOn: \{ borderWidth: 1\.5, borderColor: c\.ink, backgroundColor: c\.raised \}/);
  assert.match(src, /accessibilityRole="checkbox" accessibilityState=\{\{ checked: on \}\}/);
  // Onboarding draws the same component and takes its pill look from it (no copy).
  const ob = read('screens/OnboardingFlowScreen.js');
  assert.match(ob, /<CompoundPills value=\{d\.tracking\} onToggle=\{\(key\) => set\('tracking', \(p\) => toggleKey\(p, key\)\)\} t=\{t\} \/>/);
  assert.match(ob, /\.\.\.compoundPillStyles\(c\),/);
  assert.doesNotMatch(ob, /const COMPOUNDS = \[/);
});

test('DV-113: toggling keeps every other key (an unknown older value is never dropped)', () => {
  const { toggleKey } = require('../lib/trackingTypes');
  assert.deepEqual(toggleKey(['peptides'], 'oral'), ['peptides', 'oral']);
  assert.deepEqual(toggleKey(['peptides', 'oral'], 'peptides'), ['oral']);
  assert.deepEqual(toggleKey(['legacy_x'], 'glp1'), ['legacy_x', 'glp1']);
  assert.deepEqual(toggleKey(null, 'glp1'), ['glp1']);
});

test('DV-113: Edit profile — "O que você usa" between "Sobre você" and "Seus objetivos", the hint, the pills', () => {
  const src = read('screens/SettingsScreen.js');
  const about = src.indexOf("{t('profile_sec_about')}");
  const track = src.indexOf("{t('profile_sec_tracking')}");
  const goals = src.indexOf("{t('profile_sec_goals')}");
  assert.ok(about > 0 && track > about && goals > track, 'about → tracking → goals');
  const block = src.slice(track, goals);
  assert.match(block, /\{t\('profile_tracking_hint'\)\}/);
  assert.match(block, /<CompoundPills value=\{trackingTypes\} onToggle=\{\(key\) => setTrackingTypes\(\(p\) => toggleKey\(p, key\)\)\} t=\{t\} \/>/);
});

test('DV-113: the profile read fills it; Save writes tracking_types in the same merge write; empty is refused', () => {
  const src = read('screens/SettingsScreen.js');
  const load = src.slice(src.indexOf('async function loadUser('), src.indexOf('function setEditProfileOpen('));
  assert.match(load, /setTrackingTypes\(Array\.isArray\(user\.user_metadata\?\.tracking_types\) \? user\.user_metadata\.tracking_types : \[\]\);/);
  const save = src.slice(src.indexOf('async function saveProfile('), src.indexOf('async function handleExportData('));
  assert.match(save, /if \(trackingTypes\.length === 0\) missing\.push\(t\('profile_sec_tracking'\)\);/);
  // updateUser({ data }) merges keys into user_metadata: only the profile's own keys are sent.
  assert.match(save, /supabase\.auth\.updateUser\(\{\s*data: \{[\s\S]*tracking_types: trackingTypes\.slice\(\),[\s\S]*\},\s*\}\)/);
  assert.doesNotMatch(save, /user_metadata: /);
});

test('DV-113: the words (pt as in the picture), and settings_tracking_* removed in all 6 languages', () => {
  assert.equal(translations.pt.profile_sec_tracking, 'O que você usa');
  assert.equal(translations.pt.profile_tracking_hint, 'Marque todos os que você usa.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(translations[l].profile_tracking_hint, l);
    for (const k of ['peptides', 'hormones', 'glp1', 'oral']) assert.equal(translations[l]['settings_tracking_' + k], undefined, `${l} settings_tracking_${k}`);
  }
  // One term per concept: the section says "use", like onboarding's question.
  assert.equal(translations.en.profile_sec_tracking, 'What you use');
});
