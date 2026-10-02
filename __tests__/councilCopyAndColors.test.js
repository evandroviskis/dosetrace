'use strict';
// Founder 2026-10-01 ("aprovo tudo"), from the dt-council:
// - pw_prev_labs_body no longer interprets results ("drifting out of range" removed; AI hard line).
// - Cloud backup is free everywhere: the Settings Premium card sells the dose accumulation
//   curve instead, and the paywall's Premium list names the AI food log like Settings does.
// - Skipped is a neutral fact (ink2), red (risk) is only for Missed (DESIGN.md §2.1).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const tr = read('i18n/translations.js');
const vals = (key) => [...tr.matchAll(new RegExp(key + ": (['\"])((?:\\\\.|(?!\\1).)*)\\1", 'g'))].map((m) => m[2]);

test('pw_prev_labs_body never judges a range, in all 6 languages', () => {
  const v = vals('pw_prev_labs_body');
  assert.equal(v.length, 6);
  for (const s of v) assert.doesNotMatch(s, /range|rango|faixa|plage|Bereich|intervallo|climbing|sube|sobe|monte|steigt|sale\b/i, s);
});

test('cloud backup is never sold as Premium; the Settings card sells the curve', () => {
  for (const s of vals('settings_premium_feat_1')) assert.doesNotMatch(s, /cloud|nube|nuvem|Cloud|backup|sauvegarde|Sicherung/i, s);
  const pw = read('screens/PaywallScreen.js');
  const prem = pw.slice(pw.indexOf('const PREMIUM_FEATURES = ['), pw.indexOf('];', pw.indexOf('const PREMIUM_FEATURES = [')));
  assert.match(prem, /settings_premium_feat_3/, 'the AI food log is in the paywall Premium list');
  assert.doesNotMatch(prem, /sync|backup/i);
});

test('Skipped is neutral (ink2); only Missed is risk', () => {
  const log = read('screens/LogScreen.js');
  assert.match(log, /if \(outcome === 'Skipped'\) return colors\.ink2;/);
  assert.match(log, /return colors\.risk;\s*\n\s*\}/, 'Missed falls through to risk');
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /\['Skipped', 'log_skipped', colors\.ink2\], \['Missed', 'log_missed', colors\.risk\]/);
});
