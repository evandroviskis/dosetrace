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

test('PA-102: confirming writes ONE key, merge-only, and never anything else', () => {
  assert.deepEqual(G.adultConfirmPatch('2026-10-03T12:00:00.000Z'), { adult_confirmed_at: '2026-10-03T12:00:00.000Z' });
  const scr = read('screens', 'AgeConfirmScreen.js');
  assert.match(scr, /supabase\.auth\.updateUser\(\{ data: adultConfirmPatch\(new Date\(\)\.toISOString\(\)\) \}\)/);
  assert.equal((scr.match(/updateUser\(/g) || []).length, 1);
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
  assert.match(acts, /markIntentionalSignOut\(\)/);
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
