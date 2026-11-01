// DV-240 (AD-105, founder 2026-10-15: keep the caps as abuse ceilings, each with a true message, ×6;
// parked-error sweep 2026-10-31): the protocol assistant's three server caps (40 answers per conversation,
// a 24-hour conversation life, 200 answers in a rolling 24 h) all read "The AI isn't available right now".
// Each now has its own code and message; the form stays one tap away with every answer kept.
// Also found: ap_err_quota_nodate still said "this week" (DV-192 fixed only ap_err_quota) — rolling 7 days.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assistantErrorKind, assistantErrorNotice } = require('../lib/assistantErrors');

test('DV-240: each cap is its own notice', () => {
  assert.equal(assistantErrorKind({ status: 429, code: 'turn_limit' }), 'turn_limit');
  assert.equal(assistantErrorKind({ status: 429, code: 'daily_turn_limit' }), 'daily_turn_limit');
  assert.equal(assistantErrorKind({ status: 403, code: 'conversation_expired' }), 'conversation_expired');
  assert.equal(assistantErrorKind({ status: 429, code: 'quota_exceeded' }), 'quota');
  assert.equal(assistantErrorKind({ status: 404, code: null }), 'service');
  assert.deepEqual(assistantErrorNotice({ status: 429, code: 'turn_limit' }), { key: 'ap_err_turn_limit', params: {} });
  assert.deepEqual(assistantErrorNotice({ status: 429, code: 'daily_turn_limit' }), { key: 'ap_err_daily', params: {} });
  assert.deepEqual(assistantErrorNotice({ status: 403, code: 'conversation_expired' }), { key: 'ap_err_expired', params: {} });
});

test('DV-240: the server splits the per-conversation and the 24-hour caps', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/protocol-assistant/budget.ts'), 'utf8');
  assert.match(src, /known\.turnsDay >= TURNS_PER_DAY\) return \{ ok: false, code: 'daily_turn_limit' \}/);
  const idx = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/protocol-assistant/index.ts'), 'utf8');
  assert.match(idx, /verdict\.code === 'turn_limit' \|\| verdict\.code === 'daily_turn_limit' \? 429 : 403/);
});

test('DV-240: the three messages exist in six languages; nodate says 7 days', () => {
  const { translations } = require('../i18n/translations');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    for (const k of ['ap_err_turn_limit', 'ap_err_daily', 'ap_err_expired']) assert.ok(translations[l][k], `${l}.${k}`);
    assert.match(translations[l].ap_err_quota_nodate, /7/, l);
  }
});
