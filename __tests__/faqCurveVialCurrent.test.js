'use strict';
// Found 2026-11-26 (Ads session's question agent, checked here): two FAQ answers described old behaviour in all
// six languages. "What is Dose in the body?" said the curve comes from the planned schedule — since AD-96 B it
// sums the doses marked as done up to now and follows the plan only after now. "What happens when a vial
// expires?" said a fixed 30 days — the validity is the person's own (protocols_vial_valid), 30 only by default.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js');
const tr = T.translations || T.default || T;
const ans = (l, id) => tr[l].faq_categories.flatMap((c) => c.questions).find((q) => q.id === id).a;

const LOGGED = { en: /doses you marked as done/, pt: /doses que você marcou como concluídas/, es: /dosis que marcaste como hechas/, fr: /doses que vous avez marquées comme prises/, de: /als erledigt markierten Dosen/, it: /dosi che hai segnato come fatte/ };
const OWN = { en: /validity you set/, pt: /validade que você definiu/, es: /validez que definiste/, fr: /validité que vous avez indiquée/, de: /von dir festgelegte Haltbarkeit/, it: /validità che hai impostato/ };
for (const l of Object.keys(LOGGED)) {
  test(`body_dose_in_body (${l}): logged doses up to now, the plan after`, () => {
    assert.match(ans(l, 'body_dose_in_body'), LOGGED[l]);
  });
  test(`vials_expiry (${l}): the person's own validity, 30 days only by default`, () => {
    const a = ans(l, 'vials_expiry');
    assert.match(a, OWN[l]);
    assert.match(a, /30/);
  });
}
