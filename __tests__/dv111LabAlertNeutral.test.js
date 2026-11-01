// DV-111 / AD-98 (parked-error sweep 2026-10-31): the 6-month lab alert was titled "Bloodwork due" / "Exame de
// sangue pendente" — the app deciding a test is owed (the no-advice line). The trigger stays; the title is the
// person's own records, and the body states only the months since the last test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations } = require('../i18n/translations');

test('DV-111: no due / pending wording in the lab alert, in any language', () => {
  const banned = /due|pendente|pendiente|à faire|fällig|da fare/i;
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.doesNotMatch(translations[l].today_alert_blood_title, banned, l);
    assert.match(translations[l].today_alert_blood_body, /\{months\}/, l);
  }
  assert.equal(translations.pt.today_alert_blood_title, 'Seus exames');
});
