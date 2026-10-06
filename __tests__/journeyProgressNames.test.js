'use strict';
// One term per concept (CLAUDE.md, translate naturally): the Journey tab and the Progress
// screen inside it are two places, so no language may give them the same name. Spanish named
// both "Progreso" — the store prints showed "< Progreso" above a "Progreso" title (2026-10-06).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../i18n/translations.js').translations || require('../i18n/translations.js');

test('the Journey tab and the Progress screen have different names in every language', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(T[l].tab_journey && T[l].cal_snap_title, l);
    assert.notEqual(T[l].tab_journey.toLowerCase(), T[l].cal_snap_title.toLowerCase(), `${l}: tab_journey = cal_snap_title`);
  }
});

test('Spanish: the Journey tab is "Evolución", and its Help category matches', () => {
  assert.equal(T.es.tab_journey, 'Evolución');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'i18n/translations.js'), 'utf8');
  assert.doesNotMatch(src, /category: "Progreso"/);
});
