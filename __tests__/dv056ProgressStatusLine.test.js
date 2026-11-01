// DV-056 (parked-error sweep 2026-10-31; A-118 class): Progress's status line knew only "due"; once the
// weigh-in was logged ("needs food") or the result was ready it still said "Em andamento · pesagem em {date}"
// with a date already past. It now follows the check's real state (lib/realityCheckRules checkAlert), as
// Today's alert does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('DV-056: the status line follows checkAlert', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/CalculatorSection.js'), 'utf8');
  const block = src.slice(src.indexOf('// DV-056: the line follows'), src.indexOf('// DV-056: the line follows') + 1600);
  assert.match(block, /const st = checkAlert\(outcome, foodRun\);/);
  assert.match(block, /st && st\.body === 'needs_food' \? t\(pluralKey\('today_alert_rc_needs_food', st\.left, language\)\)\.replace\('\{n\}', String\(st\.left\)\)/);
  assert.match(block, /st && st\.body === 'ready' \? t\('cal_rc_sb_ready'\)/);
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(translations[l].cal_rc_sb_ready, l);
});
