'use strict';
// A-60 (Gate B review 2026-09-30, founder: fix). When the monthly scan limit is
// reached the app said "your 3 free scans" to everyone — also to a Premium user
// stopped at 20. The message now uses the limit the SERVER reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { quotaLimitFrom, fillQuotaMessage } = require('../lib/scanQuotaMessage');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('A-60: the limit comes from the server\'s answer; 3 when it is missing or not a number', () => {
  assert.equal(quotaLimitFrom({ code: 'quota_exceeded', limit: 20 }), 20);
  assert.equal(quotaLimitFrom({ code: 'quota_exceeded', limit: 3 }), 3);
  assert.equal(quotaLimitFrom({ code: 'quota_exceeded' }), 3);
  assert.equal(quotaLimitFrom(null), 3);
  assert.equal(quotaLimitFrom({ limit: 'many' }), 3);
  assert.equal(quotaLimitFrom({ limit: 0 }), 3);
});

test('A-60: the message shows that number', () => {
  assert.equal(fillQuotaMessage('You\'ve used your {n} scans for this month.', 20), 'You\'ve used your 20 scans for this month.');
  assert.equal(fillQuotaMessage('no placeholder', 20), 'no placeholder');
});

test('A-60: the message in all 6 languages has the {n} placeholder and no fixed "3 free"', () => {
  const v = [...read('i18n', 'translations.js').matchAll(/\n\s+vial_scan_quota_sub: (['"])(.*)\1,/g)].map((m) => m[2]);
  assert.equal(v.length, 6);
  for (const s of v) {
    assert.match(s, /\{n\}/, s.slice(0, 50));
    assert.doesNotMatch(s, /\b3\b/, s.slice(0, 50));
    assert.doesNotMatch(s, /free|gratis|gratuit|kostenlos/i, s.slice(0, 50));
  }
});

test('A-60: the three scan screens read the server limit and fill the message', () => {
  for (const f of [['screens', 'BodyScreen.js'], ['screens', 'ProtocolsScreen.js'], ['screens', 'components', 'VaccinesSection.js']]) {
    const src = read(...f);
    assert.match(src, /fillQuotaMessage\(t\('vial_scan_quota_sub'\), quotaLimitFrom\(/, f.join('/'));
    assert.doesNotMatch(src, /Alert\.alert\(t\('vial_scan_quota_title'\), t\('vial_scan_quota_sub'\)\)/, f.join('/'));
  }
});
