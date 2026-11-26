'use strict';
// Ads session 2026-11-26 (writing the how-to scripts with the real labels): two FAQ answers sent the
// person to the wrong place. "Change dose" lives in the Dose log and changes ONE dose; the "Since when
// have you used…?" question opens from Protocols › Edit › Dose amount › Save. On Android the reminder
// check row is "Make sure your reminders arrive"; "Check reminders" is the iPhone row.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const answer = (l, id) => {
  for (const c of tr[l].faq_categories) { const q = (c.questions || []).find((x) => x.id === id); if (q) return q.a; }
  return null;
};

for (const l of LANGS) {
  test(`dose_change (${l}): the path is Protocols › Edit › Dose amount › Save, never the one-dose "Change dose"`, () => {
    const a = answer(l, 'dose_change');
    assert.ok(a, 'answer exists');
    for (const k of ['tabbar_protocols', 'protocols_edit', 'protocols_dose_amount', 'save']) assert.ok(a.includes(tr[l][k]), `${k} "${tr[l][k]}" named`);
    assert.ok(!a.includes(tr[l].log_change_dose), `never "${tr[l].log_change_dose}"`);
    for (const k of ['dosefix_now', 'dosefix_start', 'dosefix_from']) assert.ok(a.includes(tr[l][k]), `${k} named`);
  });
  test(`reminders_android_missing (${l}): names the Android row`, () => {
    const a = answer(l, 'reminders_android_missing');
    assert.ok(a.includes(tr[l].settings_setup_title), `"${tr[l].settings_setup_title}" named`);
    assert.ok(!a.includes(tr[l].settings_rc_title), `never the iPhone row "${tr[l].settings_rc_title}"`);
  });
}
