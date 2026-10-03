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
  // Premium redesign (founder 2026-10-03, picture page part 3 = the prototype): the AI food log
  // sits in the Free vs Premium table (free for FREE_DAYS days, Premium every day) and the
  // six "What's included" lines never sell backup / sync.
  const { comparisonRows, includedLines } = require('../lib/paywallPlans');
  const id = (k) => k;
  const food = comparisonRows(id, { freeFoodDays: 7 }).find((r) => r.label === 'nutri_ai_badge');
  assert.ok(food && typeof food.free === 'string', 'the AI food log row shows its free days');
  const sync = comparisonRows(id, { freeFoodDays: 7 }).find((r) => r.label === 'pw_free_sync');
  assert.equal(sync.free, true, 'cloud backup & sync is free');
  assert.doesNotMatch(includedLines(id).join(' '), /sync|backup/i);
});

test('Skipped is neutral (ink2); only Missed is risk', () => {
  const log = read('screens/LogScreen.js');
  assert.match(log, /if \(outcome === 'Skipped'\) return colors\.ink2;/);
  assert.match(log, /return colors\.risk;\s*\n\s*\}/, 'Missed falls through to risk');
  const prot = read('screens/ProtocolsScreen.js');
  assert.match(prot, /\['Skipped', 'log_skipped', colors\.ink2\], \['Missed', 'log_missed', colors\.risk\]/);
});
