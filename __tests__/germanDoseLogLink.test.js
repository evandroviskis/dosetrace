'use strict';
// Pre-build pass 2026-10-03, m8: in German Today's "Verlauf ansehen" opened the Dose log while the
// Journey tab is called "Verlauf" — the link now names the Dose log ("Dosisprotokoll"). And the
// collapsed "Deine Werte" line showed the activity's long sub-line ("Leicht – 1–3 Einheiten/Woche")
// where English and Portuguese show only the short name: German writes the dash as " – " and
// Spanish as ": ", which the label splitter did not know. Every language now gives the short name
// and the sub-line apart (summary line, Edit profile, onboarding "Your routine").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;
const { activityParts } = require('../lib/progressFormat');

test('German: the Today link names the Dose log, never the Journey tab', () => {
  assert.notEqual(tr.de.today_view_log.split(' ')[0], tr.de.tab_journey);
  assert.match(tr.de.today_view_log, new RegExp(tr.de.log_title));
});

test('every activity label in every language splits into a short name and its sub-line', () => {
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['cal_act_sedentary', 'cal_act_light', 'cal_act_moderate', 'cal_act_high', 'cal_act_very_high']) {
      const parts = activityParts(tr[l][k]);
      assert.equal(parts.length, 2, `${l} ${k}: ${tr[l][k]}`);
      assert.ok(parts[0].length <= 20, `${l} ${k}: short name "${parts[0]}"`);
    }
  }
  assert.deepEqual(activityParts('Leicht – 1–3 Einheiten/Woche'), ['Leicht', '1–3 Einheiten/Woche']);
  assert.deepEqual(activityParts('Ligero: 1-3 sesiones/semana'), ['Ligero', '1-3 sesiones/semana']);
});
