// DV-126 (AD-49 + DL-82; parked-error sweep 2026-10-31): the free-limit sheet always said "Start free trial" /
// "try it free for 7 days", without asking the store — a person who already used the trial was promised one the
// store refuses. It now claims the trial only when the store offers it (the paywall's own rule, trialOf);
// otherwise it says Premium without a trial (×6, es/fr/de/it wording to approve).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { anyTrial } = require('../lib/paywallPlans');

const annual = { packageType: 'ANNUAL', product: { identifier: 'y', introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 } } };

test('DV-126: anyTrial follows the store answer', () => {
  assert.equal(anyTrial([annual], { y: true }, 'ios'), true);
  assert.equal(anyTrial([annual], { y: false }, 'ios'), false);
  assert.equal(anyTrial([annual], null, 'ios'), false, 'unknown: never claim it');
  assert.equal(anyTrial([], null, 'android'), false);
});

test('DV-126: the limit sheet words depend on it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/ProtocolsScreen.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function promptUpgrade() {'), src.indexOf('async function promptUpgrade() {') + 1600);
  assert.match(fn, /body: t\(trial \? 'protocols_limit_msg' : 'protocols_limit_msg_notrial'\)/);
  assert.match(fn, /label: t\(trial \? 'protocols_limit_upgrade' : 'protocols_limit_upgrade_notrial'\)/);
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    assert.ok(translations[l].protocols_limit_msg_notrial && translations[l].protocols_limit_upgrade_notrial, l);
    assert.doesNotMatch(translations[l].protocols_limit_msg_notrial, /7/, l);
  }
});
