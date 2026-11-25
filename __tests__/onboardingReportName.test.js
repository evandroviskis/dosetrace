'use strict';
// Founder 2026-11-24 13:32 / 13:34 (02-decisoes, VIGENTE): every place that asks for a name separates
// "Nome completo" and "Como você quer ser chamado ou chamada", the onboarding name screen included; the
// nickname fills itself with the FIRST name while typing the full name, and she can erase it and write another;
// the report goes out with the full name. Built for Edit profile (AR-17 / AR-17b) but the onboarding step
// still asked "Seu nome / Como devemos te chamar?" (S25, package 962a574d, 2026-11-25). Same pattern as Edit
// profile (approved picture 19a9d92f): the optional full name first, then the required nickname.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formFrom, stashPatch, accountPatch } = require('../lib/onboardingSteps');
const { FIELDS, pendingProfilePatch, signupMetadata } = require('../lib/pendingProfile');
const { translations } = require('../i18n/translations');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const NOW = '2026-11-25T16:00:00.000Z';

test('the form reads the full name back from the account / stash (report_name)', () => {
  assert.equal(formFrom({ report_name: 'Marina Costa Silva', display_name: 'Marina' }).reportName, 'Marina Costa Silva');
  assert.equal(formFrom({}).reportName, '');
});

test('the stash keeps the full name only when typed', () => {
  assert.equal(stashPatch({ name: 'Marina', reportName: ' Marina Costa Silva ' }, NOW).report_name, 'Marina Costa Silva');
  assert.ok(!('report_name' in stashPatch({ name: 'Marina', reportName: '  ' }, NOW)));
});

test('the signed-in Finish setup writes the full name only when typed (never clears a stored one)', () => {
  const d = { name: 'Marina', reportName: 'Marina Costa Silva', goals: ['wellness'], tracking: ['peptides'], gender: 'female', country: 'BR', birthYear: 1990, birthMonth: 2, activity: 'moderate', provider: 'yes' };
  assert.equal(accountPatch(d, {}, NOW, ['about']).report_name, 'Marina Costa Silva');
  assert.ok(!('report_name' in accountPatch({ ...d, reportName: '' }, { report_name: 'Stored Name' }, NOW, ['about'])));
});

test('the new account gets the typed full name (email sign-up and Apple / Google fill of missing fields)', () => {
  assert.ok(FIELDS.includes('report_name'));
  assert.equal(signupMetadata({ display_name: 'Marina', report_name: 'Marina Costa Silva' }, { fresh: true, nowISO: NOW }).report_name, 'Marina Costa Silva');
  assert.equal(signupMetadata({ display_name: 'Marina' }, { fresh: true, nowISO: NOW }).report_name, null);
  assert.equal(signupMetadata({ report_name: 'X Y' }, { fresh: false, nowISO: NOW }).report_name, null);
  assert.equal(pendingProfilePatch({ report_name: 'Marina Costa Silva' }, {}, { fresh: true, nowISO: NOW }).report_name, 'Marina Costa Silva');
  assert.equal(pendingProfilePatch({ report_name: 'New' }, { report_name: 'Stored' }, { fresh: true, nowISO: NOW }), null);
});

test('the About you step: full name (optional) first, then the nickname that follows it with the first name', () => {
  const s = read('screens/OnboardingFlowScreen.js');
  const about = s.slice(s.indexOf("{cur === 'about' && ("), s.indexOf("t('profile_birth_month')"));
  assert.ok(about.indexOf("t('profile_report_name')") > 0, 'the full name field');
  assert.ok(about.indexOf("t('profile_report_name')") < about.indexOf("t('profile_nickname')"), 'full name first');
  assert.match(about, /t\('profile_report_name_hint'\)/);
  assert.match(about, /t\('profile_nickname_autofill'\)/);
  assert.match(about, /t\('profile_nickname_hint'\)/);
  assert.doesNotMatch(about, /t\('profile_name'\)|t\('profile_name_placeholder'\)/);
  assert.match(s, /nicknameAfterFullName\(/);
  assert.match(s, /nicknameFollows\(/);
});

test('the legend no longer says every field is required (the full name is optional)', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(translations[l].profile_required_legend, /todos|all fields|todos los|tous les|alle felder|tutti i campi/i, l);
  assert.equal(translations.pt.profile_required_legend, '* Campos obrigatórios');
});
