'use strict';
// Approved 2026-09-29 (docs/design/DESIGN.md, Settings part 2): "the FAQ gets 4–6 new answers"
// — AI food log, reality check, Dose accumulation, Vaccine journal — and the lab section is named
// after the "Lab test journal". Built in the pre-build pass (round 2), ×6, with the app's own
// feature names and today's facts (7 free food-log days, the planned schedule behind the curve,
// scans counting toward the monthly scans, never advice).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const qs = (l) => tr[l].faq_categories.flatMap((c) => c.questions);
const has = (l, name) => qs(l).find((q) => q.q.toLowerCase().includes(String(name).toLowerCase()));

test('four new answers in every language, named with the app\'s own feature names', () => {
  for (const l of LANGS) {
    const t = tr[l];
    for (const name of [t.nutri_ai_badge, t.cal_rc_title, t.body_card_dosing_title, t.body_card_vax_title]) {
      assert.ok(has(l, name), `${l}: a question about ${name}`);
    }
    assert.ok(has(l, t.body_card_labs_title), `${l}: the lab question names the ${t.body_card_labs_title}`);
    assert.ok(t.faq_categories.some((c) => c.category === t.tab_body), `${l}: a ${t.tab_body} section`);
    assert.ok(t.faq_categories.some((c) => c.category === t.tab_journey), `${l}: a ${t.tab_journey} section`);
    assert.equal(t.faq_categories.length, 6, `${l}: six sections`);
  }
});

test('the new answers say today\'s facts and never advise', () => {
  for (const l of LANGS) {
    const t = tr[l];
    assert.match(has(l, t.nutri_ai_badge).a, /7/, `${l}: 7 free days`);
    assert.match(has(l, t.cal_rc_title).a, /7/, `${l}: 7 days in a row`);
    const curve = has(l, t.body_card_dosing_title).a;
    assert.match(curve, /Premium/);
    for (const a of [has(l, t.nutri_ai_badge).a, has(l, t.cal_rc_title).a, curve, has(l, t.body_card_vax_title).a]) {
      assert.doesNotMatch(a, /unlimited|ilimitad|illimit|unbegrenzt/i, `${l}: no "unlimited"`);
      assert.doesNotMatch(a, /\b20\b/, `${l}: the scan number only under Premium`);
    }
  }
  assert.match(has('en', 'Dose accumulation').a, /planned schedule/);
  assert.match(has('en', 'AI food log').a, /never gives diet advice/);
});

test('every language keeps the same question count per section (parity)', () => {
  const shape = (l) => tr[l].faq_categories.map((c) => c.questions.length).join(',');
  for (const l of LANGS) assert.equal(shape(l), shape('en'), l);
});
