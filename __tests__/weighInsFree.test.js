'use strict';
// S-16 / FX-15 (founder 2026-09-27; A-53 decision 2026-09-28): weigh-ins are the user's
// own data and are NEVER paywalled. Free users — during and after their free days — can
// always save a weigh-in: Progress snapshots, "+ Add a past weigh-in", and the reality-
// check weigh-in of a check that is already running. The paywall only blocks RESULTS
// (measured maintenance / the reality-check number, the target ETA).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const access = () => require('../lib/weighInAccess');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('FX-15: the reality check — a locked user with a check running can still log the weigh-in; only the result stays Premium', () => {
  const { realityCheckAccess } = access();
  assert.deepEqual(realityCheckAccess({ premium: false, rcFree: false, hasOpenCheck: true }), { canStart: false, canSeeResult: false, canLogWeighIn: true });
  assert.deepEqual(realityCheckAccess({ premium: false, rcFree: false, hasOpenCheck: false }), { canStart: false, canSeeResult: false, canLogWeighIn: false });
  for (const a of [{ premium: true, rcFree: false }, { premium: false, rcFree: true }]) {
    assert.deepEqual(realityCheckAccess({ ...a, hasOpenCheck: false }), { canStart: true, canSeeResult: true, canLogWeighIn: true });
  }
});

test('FX-15: a weigh-in merges into that day\'s snapshot — it never wipes waist, body fat or the computed fields', () => {
  const { mergeWeighIn } = access();
  const existing = { entry_date: '2026-10-01', weight_kg: 80, waist_cm: 90, body_fat_pct: 18, lbm: 65.6, bmr: 1700, tdee: 2400 };
  assert.deepEqual(mergeWeighIn(existing, { date: '2026-10-01', weightKg: 79.4 }), { entry_date: '2026-10-01', weight_kg: 79.4, waist_cm: 90, body_fat_pct: 18, lbm: 65.6, bmr: 1700, tdee: 2400 });
  assert.equal(mergeWeighIn(existing, { date: '2026-10-01', weightKg: 79.4, bodyFatPct: 17.5 }).body_fat_pct, 17.5);
  assert.deepEqual(mergeWeighIn(null, { date: '2026-10-02', weightKg: 79 }), { entry_date: '2026-10-02', weight_kg: 79, waist_cm: null, body_fat_pct: null, lbm: null, bmr: null, tdee: null });
});

test('FX-15: the Progress card (save, past weigh-in, chart) is not behind Premium', () => {
  const src = read('screens', 'components', 'CalculatorSection.js');
  const a = src.indexOf('{/* Progress snapshots');
  const b = src.indexOf('{/* Understand the numbers');
  assert.ok(a > 0 && b > a, 'Progress card found');
  const card = src.slice(a, b);
  assert.doesNotMatch(card, /\bpremium \?/, 'no premium gate inside the Progress card');
  assert.doesNotMatch(card, /cal_premium_locked/, 'no locked teaser inside the Progress card');
  assert.match(card, /onPress=\{saveSnapshot\}/);
  assert.match(card, /onPress=\{saveBackfillWeighIn\}/);
});

test('FX-15: the locked reality-check panel offers the weigh-in of a running check (Weight now + Save weigh-in)', () => {
  const src = read('screens', 'components', 'CalculatorSection.js');
  const i = src.indexOf('<View style={s.rcLocked}>');
  const lockedPanel = src.slice(i, src.indexOf('</View>\n          )}', i) + 30);
  assert.match(lockedPanel, /rcAccess\.canLogWeighIn/);
  assert.match(lockedPanel, /cal_rc_current_weight/);
  assert.match(lockedPanel, /onPress=\{saveRcWeighIn\}/);
  assert.match(lockedPanel, /cal_tgt_backfill_save/);
  assert.match(src, /function saveRcWeighIn\(/);
  assert.match(src, /mergeWeighIn\(/);
});

test('FX-15: the Progress text no longer says "Premium." (6 languages)', () => {
  const v = [...read('i18n', 'translations.js').matchAll(/\n\s+cal_snap_sub: (['"])(.*)\1,/g)].map((m) => m[2]);
  assert.equal(v.length, 6);
  for (const s of v) assert.doesNotMatch(s, /^Premium\b/, s.slice(0, 40));
});

// Founder 2026-10-01: the FAQ must not sell progress tracking as Premium any more —
// weigh-ins and their chart are free (S-16); the reality-check RESULT stays Premium.
test('FX-15: the FAQ "What does Premium include?" lists reality-check results (not progress tracking) and says weigh-ins are free (6 languages)', () => {
  const src = read('i18n', 'translations.js');
  const lines = src.split('\n').filter((l) => /^\s+a: /.test(l) && /priority support|soporte prioritario|suporte prioritário|support prioritaire|bevorzugter Support|supporto prioritario/.test(l));
  assert.equal(lines.length, 6);
  for (const l of lines) {
    assert.doesNotMatch(l, /progress tracking|comprobación real y seguimiento|verificação real e progresso|vérification réelle et suivi|Realitätscheck und Fortschritt|verifica reale e progressi/, l.trim().slice(0, 60));
    assert.match(l, /weigh-ins|pesajes|pesagens|pesées|Wiegungen|pesate/, l.trim().slice(0, 60));
  }
});
