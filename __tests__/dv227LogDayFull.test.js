// DV-227 (parked-error sweep 2026-10-31): in the Dose log, "Missed → Complete" on a day that already holds all
// its doses did nothing and said nothing (recordDoseTaken answered alreadyLogged, treated as success). It now
// says so, in the Dose log's own words (Today's text speaks of a notification / another device and of Today).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-227: a full day answers with a sheet, never silence', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/LogScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('function markRowTaken('), src.indexOf('function dayKeyOf('));
  assert.match(fn, /if \(res\.alreadyLogged\) \{\s*setLogSheet\(\{ title: t\('notif_taken_nothing_title'\), body: t\('log_take_day_full'\), buttons: \[\{ label: t\('ok'\), kind: 'primary' \}\] \}\);\s*return;\s*\}/);
});

test('DV-227: the text exists in all 6 languages', () => {
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(translations[l].log_take_day_full, l);
  assert.equal(translations.pt.log_take_day_full, 'Esse dia já tem todas as doses registradas; nada novo foi adicionado.');
});
