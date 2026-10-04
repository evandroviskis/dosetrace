'use strict';
// Old accounts whose stored birth year makes them under 18 (founder 2026-10-03 "2 sim",
// docs/specs/premium-and-auth.md PA-100…PA-105): a one-time "I'm 18 or older" confirmation on
// the next open; confirmed → stored (merge-only) and never asked again; not confirmed → the
// account stays behind the sheet with export, delete and sign out; nothing is ever deleted
// automatically. No birth year → the build-49 gate asks for it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const G = require('../lib/adultGate');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const NOW = new Date(2026, 9, 3);

test('PA-100: the confirmation is asked only of an account whose stored birth year makes it under 18, and only until confirmed', () => {
  assert.equal(G.needsAdultConfirmation({ birth_year: 2010, birth_month: 5 }, NOW), true);
  assert.equal(G.needsAdultConfirmation({ birth_year: '2012' }, NOW), true, 'a stored string year counts');
  assert.equal(G.needsAdultConfirmation({ birth_year: 2009 }, NOW), true, 'turns 17 this year');
  assert.equal(G.needsAdultConfirmation({ birth_year: 2008 }, NOW), false, 'turns 18 this year — the same rule as onboarding (this year − 18)');
  assert.equal(G.needsAdultConfirmation({ birth_year: 1985 }, NOW), false);
  assert.equal(G.needsAdultConfirmation({ birth_year: 2010, adult_confirmed_at: '2026-10-03T10:00:00Z' }, NOW), false, 'confirmed → never again');
  assert.equal(G.needsAdultConfirmation({ birth_year: 2010 }, new Date(2028, 0, 1)), false, 'the year moves on: 2010 is 18 in 2028');
});

test('PA-101: no birth year (or a broken one) is not this gate — the build-49 profile gate asks for it', () => {
  for (const m of [{}, { birth_year: null }, { birth_year: '' }, { birth_year: 'abc' }, { birth_year: 12 }, null, undefined]) {
    assert.equal(G.needsAdultConfirmation(m, NOW), false, JSON.stringify(m));
  }
  const app = read('App.js');
  const gate = app.indexOf('!isProfileComplete(session.user)');
  const age = app.indexOf('needsAdultConfirmation(session.user?.user_metadata)');
  assert.ok(gate > 0 && age > gate, 'the profile gate (birth year asked there) comes first, then this one');
});

test('PA-102: confirming writes only its own keys (confirmation + the real year), merge-only', () => {
  assert.deepEqual(Object.keys(G.adultConfirmPatch('2026-10-03T12:00:00.000Z', 1990, NOW)).sort(), ['adult_confirmed_at', 'birth_year']);
});

test('PA-103: offline or a failed save keeps the account behind the sheet and says why — it can be tried again', () => {
  const scr = read('screens', 'AgeConfirmScreen.js');
  const confirm = scr.slice(scr.indexOf('async function confirmAdult()'), scr.indexOf('async function exportData()'));
  assert.match(confirm, /if \(error\) \{[\s\S]{0,200}friendlyError\(error, t, 'error_save_failed'\)/);
  assert.doesNotMatch(confirm, /signOut|delete/i, 'a failure never signs out or deletes');
  const t = (k) => `<${k}>`;
  assert.equal(require('../lib/friendlyError').friendlyError({ message: 'Network request failed' }, t, 'error_save_failed'), '<error_network>');
});

test('PA-104: not confirmed → only export, delete (the existing two-step flow) and sign out; nothing is deleted automatically', () => {
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /exportMyData\(/, 'the existing export');
  assert.match(scr, /requestAccountDeletion\(\)/, 'the existing delete (delete-user)');
  assert.match(scr, /settings_delete_permanent_msg[\s\S]{0,600}settings_delete_final_msg/, 'the two confirmations, in order');
  assert.match(scr, /signOutIntended\(\)/);
  assert.doesNotMatch(scr.slice(0, scr.indexOf('function askDelete')), /requestAccountDeletion\(\)/, 'deletion only behind the confirmations');
  assert.doesNotMatch(read('App.js'), /requestAccountDeletion|delete-user/, 'the app never deletes on its own');
  const acts = read('lib', 'accountActions.js');
  assert.match(acts, /functions\/v1\/delete-user/);
  assert.match(acts, /intent: \{ mark: markIntentionalSignOut, consume: consumeIntentionalSignOut \}/); // the deletion marks it intended (finishDeletionCore, behaviour in deletionTeardown.test.js)
  const settings = read('screens', 'SettingsScreen.js');
  assert.match(settings, /from '\.\.\/lib\/accountActions'/, 'Settings and the sheet share one export and one delete');
  assert.equal(settings.split('async function executeAccountDeletion()').length - 1, 1);
  assert.equal(settings.split('async function finishAccountDeletion()').length - 1, 1);
});

test('PA-105: the sheet is the DoseTrace look, theme tokens only, strings in 6 languages', () => {
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.doesNotMatch(scr.replace(/\/\/[^\n]*/g, ''), /#[0-9A-Fa-f]{3,8}\b|'(white|black)'|rgba?\(/);
  assert.doesNotMatch(scr, /Alert\.alert/);
  const i18n = read('i18n', 'translations.js');
  for (const k of ['age_gate_title', 'age_gate_body', 'age_gate_confirm', 'age_gate_note']) {
    assert.equal((i18n.match(new RegExp(`\\n\\s+${k}: `, 'g')) || []).length, 6, k);
  }
  for (const m of i18n.matchAll(/\n\s+age_gate_body: '(.*)',/g)) assert.match(m[1], /\{year\}/);
});

// Decided 2026-10-03 by logic: confirming 18+ means the stored year is wrong, and it feeds the
// calorie math — so the sheet also asks for the real birth year and saves both in one write.
test('PA-106: confirming writes adult_confirmed_at AND the real birth year, in one merge-only write', () => {
  assert.deepEqual(G.adultConfirmPatch('2026-10-03T12:00:00.000Z', 1990, NOW), { adult_confirmed_at: '2026-10-03T12:00:00.000Z', birth_year: 1990 });
  assert.equal(G.adultConfirmPatch('X', null, NOW), null, 'no year → nothing to write');
  assert.equal(G.adultConfirmPatch('X', 2010, NOW), null, 'an under-18 year can never be saved');
  assert.equal(G.adultConfirmPatch('X', 1899, NOW), null, 'below the minimum');
  assert.equal(G.adultConfirmPatch('X', 2008, NOW).birth_year, 2008, 'turns 18 this year → allowed');
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /supabase\.auth\.updateUser\(\{ data: patch \}\)/);
  assert.equal((scr.match(/updateUser\(/g) || []).length, 1, 'one write');
});

test('PA-107: the year wheel runs from this year − 18 back to the minimum, nothing under 18, nothing preselected; Confirm waits for a year', () => {
  const ys = G.adultYears(NOW);
  assert.equal(ys[0], 2008);
  assert.equal(ys[ys.length - 1], 1900);
  assert.ok(ys.every((y) => y <= 2008 && y >= 1900));
  assert.equal(ys.length, 2008 - 1900 + 1);
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /const \[year, setYear\] = useState\(null\);/, 'no year picked at first (the stored under-18 one is never offered)');
  assert.match(scr, /<DTWheel/);
  assert.match(scr, /disabled=\{!!busy \|\| year == null\}/, 'Confirm is off until a year is picked');
  assert.match(scr, /if \(!patch\) return;/);
});

test('PA-108: after the confirmation the calorie inputs use the new year (the profile is the only age source)', () => {
  const { profileBodyInputs } = require('../lib/bodyProfile');
  const meta = { birth_year: 2012, gender: 'male' };
  const before = profileBodyInputs({ meta, now: NOW });
  assert.equal(before.age, '14');
  const after = profileBodyInputs({ meta: { ...meta, ...G.adultConfirmPatch('X', 1990, NOW) }, now: NOW });
  assert.equal(after.age, '36');
  assert.equal(after.ageFromProfile, true);
});
