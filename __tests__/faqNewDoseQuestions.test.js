'use strict';
// Founder 2026-11-26 (decision 66 = A, "siga com a sua recomendação"): five new FAQ questions, the base of the
// first how-to videos, in all six languages, with the app's real labels (checked against the code). The
// reminder one is Android-only (the reminder check exists only there).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const { faqForPlatform } = require('../lib/faqLinks');
const IDS = ['doses_started_before', 'doses_yesterday', 'doses_missed_but_taken', 'dose_change', 'reminders_android_missing'];
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

for (const l of LANGS) {
  test(`FAQ (${l}): the "doses" group holds the five new questions with the app's own labels`, () => {
    const g = tr[l].faq_categories.find((c) => c.id === 'doses');
    assert.ok(g, 'doses group');
    assert.deepEqual(g.questions.map((q) => q.id), IDS);
    const a = Object.fromEntries(g.questions.map((q) => [q.id, q.a]));
    assert.ok(a.doses_started_before.includes(tr[l].protocols_start_date), 'start date field label');
    assert.ok(a.doses_started_before.includes(tr[l].protocols_past_yes), 'past doses yes');
    assert.ok(a.doses_yesterday.includes(tr[l].today_pending_title), 'pending from yesterday');
    assert.ok(a.doses_yesterday.includes(tr[l].today_pending_skip), 'skip label');
    assert.ok(a.doses_missed_but_taken.includes(tr[l].log_mark_taken), 'mark taken label');
    assert.ok(a.dose_change.includes(tr[l].dosefix_now) && a.dose_change.includes(tr[l].dosefix_start) && a.dose_change.includes(tr[l].dosefix_from), 'dose change options');
    assert.ok(a.reminders_android_missing.includes(tr[l].settings_rc_title), 'reminder check label');
    assert.equal(g.questions.find((q) => q.id === 'reminders_android_missing').platform, 'android');
  });
}

test('faqForPlatform: an Android-only question is hidden on iOS and kept on Android; ids never change', () => {
  const cats = tr.pt.faq_categories;
  const ios = faqForPlatform(cats, 'ios');
  const android = faqForPlatform(cats, 'android');
  const ids = (cs) => cs.flatMap((c) => c.questions.map((q) => q.id));
  assert.ok(!ids(ios).includes('reminders_android_missing'));
  assert.ok(ids(android).includes('reminders_android_missing'));
  assert.equal(ids(android).length, ids(cats).length);
});

test('the FAQ screen and the app search read the FAQ through faqForPlatform', () => {
  const fs = require('fs'); const path = require('path');
  const screen = fs.readFileSync(path.join(__dirname, '..', 'screens/FAQScreen.js'), 'utf8');
  const search = fs.readFileSync(path.join(__dirname, '..', 'lib/appSearchText.js'), 'utf8');
  assert.match(screen, /faqForPlatform\(t\('faq_categories'\) \|\| \[\], Platform\.OS\)/);
  assert.match(search, /faqForPlatform\(/);
});
