// Parked-error sweep 2026-10-31 (wording, es/fr/de/it to approve with the pending list):
// DV-192: the assistant's limit is a rolling 7 days (protocol-assistant), but the message said "this week".
// DV-186 (AD-64): the paywall listed "reality check & progress tracking" as Premium, yet weigh-ins, their chart and
// Progress are free (decisions.md:229) — only the reality-check RESULT is Premium.
const test = require('node:test');
const assert = require('node:assert/strict');
const { translations } = require('../i18n/translations');

test('DV-192: the AI limit says the last 7 days, never this week', () => {
  const banned = /this week|esta semana|nesta semana|cette semaine|diese Woche|questa settimana/i;
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.doesNotMatch(translations[l].ap_err_quota, banned, l);
    assert.match(translations[l].ap_err_quota, /\{limit\}/);
    assert.match(translations[l].ap_err_quota, /\{date\}/);
  }
  assert.match(translations.pt.ap_err_quota, /nos últimos 7 dias/);
});

test('DV-186: the paywall names the reality-check result, not progress', () => {
  const banned = /progress|progreso|progresso|progression|Fortschritt|progressi/i;
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(translations[l].pw_prem_reality, banned, l);
  assert.equal(translations.pt.pw_prem_reality, 'Resultado dos seus números reais');
});
