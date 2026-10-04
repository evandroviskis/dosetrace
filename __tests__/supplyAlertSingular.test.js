'use strict';
// A-65 / founder 2026-10-03 (singular for counts of 1, ×6): Today's low-supply alert read
// "TB-500 — 1 doses left". The one-protocol line picks the singular for 1 (French for 0 and 1,
// lib/plural) and keeps the plural otherwise.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../i18n/translations.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };')(mod, mod.exports);
const tr = mod.exports.translations;

test('the singular line exists in six languages with the same placeholders', () => {
  const want = { en: '{name} — {n} dose left', es: '{name}: queda {n} dosis', pt: '{name} — resta {n} dose', fr: '{name} — {n} dose restante', de: '{name} – {n} Dosis übrig', it: '{name} — {n} dose rimasta' };
  for (const [l, v] of Object.entries(want)) assert.equal(tr[l].today_alert_supply_one_one, v, l);
});

test('Today picks it through pluralKey', () => {
  const today = fs.readFileSync(path.join(__dirname, '../screens/TodayScreen.js'), 'utf8');
  assert.match(today, /t\(pluralKey\('today_alert_supply_one', low\[0\]\.rem, language\)\)/);
});
