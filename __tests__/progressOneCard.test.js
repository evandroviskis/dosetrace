'use strict';
// Progress one card (docs/specs/progress-one-card.md, founder 2026-10-02 from the picture page
// https://claude.ai/artifact/KrC8SoiqWvJ3wTaXwaxx7F): weight + daily burn, Your target, Log
// today's weight, Weigh-ins and Your numbers live in ONE card on top; then the daily plan and
// the reality check. Pure logic in lib/progressCard.js; the screen is checked from its source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const P = () => require('../lib/progressCard');

// ── PO-1 / PO-9: the card order ──

test('PO-1: with numbers the card is hero, Your target, Log today\'s weight, Weigh-ins, Your numbers; then daily plan, reality check', () => {
  const { progressLayout } = P();
  const l = progressLayout({ filled: true, hasPlan: true, weighInCount: 5 });
  assert.deepEqual(l.card, ['hero', 'target', 'logWeight', 'weighIns', 'numbers']);
  assert.deepEqual(l.screen, ['card', 'plan', 'rc']);
  assert.equal(l.numbersFoldable, true);
});

test('PO-9: first use is hero, Your numbers (open, no fold), Your target, Weigh-ins; no daily plan; reality check below', () => {
  const { progressLayout } = P();
  const l = progressLayout({ filled: false, hasPlan: false, weighInCount: 0 });
  assert.deepEqual(l.card, ['hero', 'numbers', 'target', 'weighIns']);
  assert.deepEqual(l.screen, ['card', 'rc']);
  assert.equal(l.numbersFoldable, false);
});

test('PO-10: Log today\'s weight is hidden until a weigh-in or the numbers exist', () => {
  const { progressLayout } = P();
  assert.equal(progressLayout({ filled: false, hasPlan: false, weighInCount: 0 }).showLogWeight, false);
  assert.ok(!progressLayout({ filled: false, hasPlan: false, weighInCount: 0 }).card.includes('logWeight'));
  const oneWeighIn = progressLayout({ filled: false, hasPlan: false, weighInCount: 1 });
  assert.equal(oneWeighIn.showLogWeight, true);
  assert.deepEqual(oneWeighIn.card, ['hero', 'numbers', 'target', 'logWeight', 'weighIns']);
  assert.equal(progressLayout({ filled: true, hasPlan: true, weighInCount: 0 }).showLogWeight, true, 'numbers exist');
  // Filled but the plan is gone for a moment (a field being retyped): no daily plan card.
  assert.deepEqual(progressLayout({ filled: true, hasPlan: false, weighInCount: 2 }).screen, ['card', 'rc']);
});

// ── PO-12 / PO-13: the daily burn rule ──

test('PO-12: daily burn shows only when weight + height + age + sex all exist', () => {
  const { dailyBurnGate } = P();
  const all = { weightKg: 84.6, heightCm: 181, age: 38, sexKnown: true, bodyFatPct: null, legacyBurn: false };
  assert.deepEqual(dailyBurnGate(all), { show: true, complete: true });
  assert.deepEqual(dailyBurnGate({ ...all, bodyFatPct: 21 }), { show: true, complete: true }, 'body fat sharpens it (Katch-McArdle), still complete');
  for (const k of ['weightKg', 'heightCm', 'age']) assert.equal(dailyBurnGate({ ...all, [k]: null }).show, false, `missing ${k}`);
  assert.equal(dailyBurnGate({ ...all, sexKnown: false }).show, false, 'never the male default');
  assert.equal(dailyBurnGate({ ...all, heightCm: null, bodyFatPct: 21 }).show, false, 'a NEW user with weight + body fat only gets no daily burn (option A)');
});

test('PO-13: an existing user with weight + body fat but missing height/age/sex keeps the daily burn, with Complete your numbers', () => {
  const { dailyBurnGate, legacyBurnFromSaved } = P();
  // Saved before this update: no oneCard marker, weight + body fat, no height, profile without sex.
  const old = { unit: 'metric', weight: '84.6', bodyFat: '21', bfSource: 'gym', height: '', activity: 1.55 };
  assert.equal(legacyBurnFromSaved({ saved: old, sexKnown: false, age: '' }), true);
  const g = dailyBurnGate({ weightKg: 84.6, heightCm: null, age: null, sexKnown: false, bodyFatPct: 21, legacyBurn: true });
  assert.deepEqual(g, { show: true, complete: false }, 'the number stays; the card asks to complete the numbers');
  // Once kept, the flag is saved and survives the next load.
  assert.equal(legacyBurnFromSaved({ saved: { ...old, oneCard: 1, legacyBurn: true }, sexKnown: false, age: '' }), true);
  // Imperial saved values convert before the check.
  assert.equal(legacyBurnFromSaved({ saved: { ...old, unit: 'imperial', weight: '186.5' }, sexKnown: false, age: '' }), true);
});

test('PO-13: no kept burn for a new user, a body-fat-unknown source, or numbers that were already complete', () => {
  const { legacyBurnFromSaved } = P();
  const old = { unit: 'metric', weight: '84.6', bodyFat: '21', bfSource: 'gym', height: '' };
  assert.equal(legacyBurnFromSaved({ saved: null, sexKnown: false, age: '' }), false);
  assert.equal(legacyBurnFromSaved({ saved: { ...old, oneCard: 1 }, sexKnown: false, age: '' }), false, 'saved by this version: a new user');
  assert.equal(legacyBurnFromSaved({ saved: { ...old, bfSource: 'unknown' }, sexKnown: false, age: '' }), false, 'body fat was never used');
  assert.equal(legacyBurnFromSaved({ saved: { ...old, bodyFat: '' }, sexKnown: false, age: '' }), false);
  assert.equal(legacyBurnFromSaved({ saved: { ...old, height: '181' }, sexKnown: true, age: '38' }), false, 'complete: the normal rule applies');
});

test('PO-13: the Journey Progress tile follows the same rule (the same number as the card)', () => {
  const { progressTile } = require('../lib/progressTile');
  const meta = { gender: 'male', birth_year: 1988 };
  const now = new Date('2026-10-02T12:00:00');
  const full = { unit: 'metric', weight: '84.6', height: '181', bodyFat: '21', bfSource: 'gym', activity: 1.55, goal: 'lose', oneCard: 1 };
  assert.ok(progressTile({ saved: full, meta, snapshots: [], checks: [], now }), 'complete numbers: a tile');
  assert.equal(progressTile({ saved: { ...full, height: '' }, meta, snapshots: [], checks: [], now }), null, 'new user, height missing: no burn');
  const legacy = { unit: 'metric', weight: '84.6', bodyFat: '21', bfSource: 'gym', activity: 1.55, goal: 'lose' };
  const t = progressTile({ saved: legacy, meta: {}, snapshots: [], checks: [], now });
  assert.ok(t && t.tdee > 0, 'existing user keeps the number on the tile too');
});

// ── PO-7: the Your numbers summary line ──

test('PO-7: the Your numbers line repeats the numbers used in the math, only the parts that exist', () => {
  const { numbersLine } = P();
  const full = { weight: '84.6', wUnit: 'kg', height: '181', hUnit: 'cm', age: '38', yr: 'yr', sexLabel: 'Male', bodyFat: '21', bfShort: 'BF', activityLabel: 'Moderate' };
  assert.equal(numbersLine(full), '84.6 kg · 181 cm · 38 yr · Male · 21% BF · Moderate');
  assert.equal(numbersLine({ ...full, height: '', age: null, sexLabel: null }), '84.6 kg · 21% BF · Moderate');
  assert.equal(numbersLine({ ...full, bodyFat: null }), '84.6 kg · 181 cm · 38 yr · Male · Moderate');
  assert.equal(numbersLine({ ...full, weight: 'abc' }), '181 cm · 38 yr · Male · 21% BF · Moderate', 'a non-number is not a number');
});

// ── PO-6: the Weigh-ins summary ──

test('PO-6: Weigh-ins summary "N · last <date> · <kg> · <bf>% BF", or None yet', () => {
  const { weighInsLine } = P();
  const opts = { template: '{n} · last {date} · {w}', none: 'None yet', fmtDate: (d) => d.slice(5), fmtWeight: (kg) => `${kg.toFixed(1)} kg`, bfShort: 'BF' };
  assert.equal(weighInsLine({ ...opts, rows: [] }), 'None yet');
  const rows = [
    { date: '2026-09-21', weightKg: 85.3, bodyFatPct: 21.3 },
    { date: '2026-09-28', weightKg: 84.6, bodyFatPct: 21 },
    { date: '2026-08-31', weightKg: 88, bodyFatPct: null },
  ];
  assert.equal(weighInsLine({ ...opts, rows }), '3 · last 09-28 · 84.6 kg · 21% BF');
  assert.equal(weighInsLine({ ...opts, rows: [{ date: '2026-09-28', weightKg: 84.6, bodyFatPct: null }] }), '1 · last 09-28 · 84.6 kg', 'no body fat: the part is left out');
});

// ── PO-14 / PO-15: weight changed in Your numbers ──

const today = '2026-10-02';
const rows = [
  { entry_date: '2026-09-28', weight_kg: 84.6, body_fat_pct: 21, waist_cm: 92, lbm: null, bmr: null, tdee: null },
  { entry_date: '2026-09-21', weight_kg: 85.3, body_fat_pct: 21.3, waist_cm: 93, lbm: null, bmr: null, tdee: null },
];

test('PO-14: no weigh-ins yet: no question — the saved weight becomes the first weigh-in (PO-17)', () => {
  const { weightEditAsk } = P();
  assert.deepEqual(weightEditAsk({ rows: [], oldWeightKg: 84.6, newWeightKg: 84.0, todayISO: today }), { kind: 'first' });
  assert.deepEqual(weightEditAsk({ rows: [{ entry_date: '2026-09-28', weight_kg: null, waist_cm: 90 }], oldWeightKg: null, newWeightKg: 84, todayISO: today }), { kind: 'first' }, 'a waist-only day is not a weigh-in');
});

// ── PO-17 (founder "A" 2026-10-02): with no weigh-ins, a weight saved in Your numbers becomes the first weigh-in ──

test('PO-17: the first weigh-in is one row for today with the weight, and body fat / waist from the form when present', () => {
  const { weightEditWrite } = P();
  assert.deepEqual(
    weightEditWrite({ choice: 'first', rows: [], newWeightKg: 86, bodyFatPct: 23, waistCm: 92, todayISO: today }),
    { entry_date: today, weight_kg: 86, waist_cm: 92, body_fat_pct: 23, lbm: null, bmr: null, tdee: null },
  );
  assert.deepEqual(
    weightEditWrite({ choice: 'first', rows: [], newWeightKg: 86, todayISO: today }),
    { entry_date: today, weight_kg: 86, waist_cm: null, body_fat_pct: null, lbm: null, bmr: null, tdee: null },
    'body fat and waist are optional',
  );
  // A waist-only row today is merged into, never a second row for the day.
  const waistOnly = [{ entry_date: today, weight_kg: null, waist_cm: 91, body_fat_pct: null, lbm: null, bmr: null, tdee: null }];
  assert.deepEqual(
    weightEditWrite({ choice: 'first', rows: waistOnly, newWeightKg: 86, todayISO: today }),
    { entry_date: today, weight_kg: 86, waist_cm: 91, body_fat_pct: null, lbm: null, bmr: null, tdee: null },
  );
});

test('PO-17: once a weigh-in exists the first-weigh-in write never happens (the ask rule applies)', () => {
  const { weightEditWrite } = P();
  assert.equal(weightEditWrite({ choice: 'first', rows, newWeightKg: 86, todayISO: today }), null);
  assert.equal(weightEditWrite({ choice: 'first', rows: [], newWeightKg: null, todayISO: today }), null);
});

test('PO-17: only a weight the user changed and left creates it — never on open, load or migration', () => {
  const src = read('screens/components/CalculatorSection.js');
  const fn = src.match(/function commitWeightField\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn);
  assert.match(fn[0], /d\.kind === 'first'/);
  assert.match(fn[0], /weightFocusRef\.current/, 'compared with the value the field had when it was entered');
  assert.match(fn[0], /applyWeightEdit\('first', /);
  assert.match(src, /onFocus=\{\(\) => \{ weightFocusRef\.current = weightField; \}\}/);
  const load = src.match(/async function load\(\) \{[\s\S]*?\n  \}\n/)[0];
  assert.doesNotMatch(load, /applyWeightEdit|weightEditWrite/, 'load never writes a weigh-in');
});

test('PO-14: with weigh-ins a changed weight asks first (Update the <date> weigh-in / Save as today\'s / Cancel); unchanged never asks', () => {
  const { weightEditAsk } = P();
  assert.deepEqual(weightEditAsk({ rows, oldWeightKg: 84.6, newWeightKg: 84.0, todayISO: today }), { kind: 'ask', latestDate: '2026-09-28', options: ['update', 'today'] });
  assert.deepEqual(weightEditAsk({ rows, oldWeightKg: 84.6, newWeightKg: 84.6, todayISO: today }), { kind: 'none' });
  assert.deepEqual(weightEditAsk({ rows, oldWeightKg: 84.6, newWeightKg: 84.6000001, todayISO: today }), { kind: 'none' }, 'a unit round-trip is not a change');
  // The latest weigh-in IS today: one row, so only the update option (never two writes of one day).
  const withToday = [{ entry_date: today, weight_kg: 84.2, body_fat_pct: null, waist_cm: null }, ...rows];
  assert.deepEqual(weightEditAsk({ rows: withToday, oldWeightKg: 84.2, newWeightKg: 84.0, todayISO: today }), { kind: 'ask', latestDate: today, options: ['update'] });
});

test('PO-15: Update corrects the latest weigh-in in place (body fat and waist kept); Save as today creates today\'s row; Cancel writes nothing', () => {
  const { weightEditWrite } = P();
  const upd = weightEditWrite({ choice: 'update', rows, newWeightKg: 84.0, todayISO: today });
  assert.deepEqual(upd, { entry_date: '2026-09-28', weight_kg: 84.0, waist_cm: 92, body_fat_pct: 21, lbm: null, bmr: null, tdee: null });
  const tdy = weightEditWrite({ choice: 'today', rows, newWeightKg: 84.0, todayISO: today });
  assert.deepEqual(tdy, { entry_date: today, weight_kg: 84.0, waist_cm: null, body_fat_pct: null, lbm: null, bmr: null, tdee: null });
  assert.equal(weightEditWrite({ choice: 'cancel', rows, newWeightKg: 84.0, todayISO: today }), null);
  assert.equal(weightEditWrite({ choice: 'update', rows: [], newWeightKg: 84.0, todayISO: today }), null, 'nothing to update');
});

test('PO-15: one write per answer, keyed by its day — a today row that exists is merged, never duplicated', () => {
  const { weightEditWrite } = P();
  const withToday = [{ entry_date: today, weight_kg: 84.2, body_fat_pct: 20.5, waist_cm: 91, lbm: 1, bmr: 2, tdee: 3 }, ...rows];
  const w = weightEditWrite({ choice: 'today', rows: withToday, newWeightKg: 84.0, todayISO: today });
  assert.deepEqual(w, { entry_date: today, weight_kg: 84.0, waist_cm: 91, body_fat_pct: 20.5, lbm: 1, bmr: 2, tdee: 3 });
  const src = read('screens/components/CalculatorSection.js');
  const fn = src.match(/function applyWeightEdit\([\s\S]*?\n  \}\n/);
  assert.ok(fn, 'applyWeightEdit');
  assert.equal((fn[0].match(/upsertCalcSnapshot\(/g) || []).length, 1, 'exactly one weigh-in write');
  assert.match(fn[0], /getCalcSnapshots\(uid\)/, 'decided on a fresh read');
});

// ── The screen (source checks) ──

const calc = () => read('screens/components/CalculatorSection.js');

test('PO-1 / PO-8: one card on top; the separate Your target, Weigh-ins and Your numbers cards are gone', () => {
  const src = calc();
  assert.match(src, /progressLayout\(\{ filled, hasPlan: !!plan, weighInCount \}\)/);
  assert.match(src, /const cardEl = \(/);
  assert.doesNotMatch(src, /const targetEl = /, 'no separate Your target card');
  assert.doesNotMatch(src, /const weighEl = /, 'no separate Weigh-ins card');
  assert.doesNotMatch(src, /const numbersEl = /, 'no separate Your numbers card');
  assert.doesNotMatch(src, /const heroEl = /, 'the old hero card is inside the one card now');
});

test('PO-2 / PO-3: the hero keeps weight, daily burn with Estimated / Measured, the since line and the formula line; "—" in ink3 without numbers', () => {
  const src = calc();
  const hero = src.match(/const heroPart = \(([\s\S]*?)\n  \);\n/);
  assert.ok(hero, 'heroPart');
  for (const k of ["t('cal_weight')", "t('cal_tdee')", "t('hy_rc_measured_chip')", "t('hy_estimated')", "t('cal_since')", 'cal_eq_', "t('cal_fill_numbers')", "t('cal_complete_numbers')"]) assert.ok(hero[1].includes(k), k);
  assert.match(hero[1], /s\.displayEmpty/);
});

test('PO-4 / PO-5: Your target sits inside the card after a separator; Log today\'s weight opens its existing sheet', () => {
  const src = calc();
  const tgt = src.match(/const targetPart = \(([\s\S]*?)\n  \);\n/);
  assert.ok(tgt);
  assert.match(tgt[1], /<View style=\{s\.sep\} \/>/);
  assert.match(tgt[1], /t\('cal_tgt_edit'\)/);
  assert.match(tgt[1], /t\('hy_set_target'\)/);
  assert.match(tgt[1], /onPress=\{beginEditTarget\}/);
  assert.match(src, /logWeight: \(\s*<TouchableOpacity key="logWeight" style=\{s\.btnP\} onPress=\{openWeighIn\}/);
});

test('PO-6 / PO-7: Weigh-ins and Your numbers are fold rows inside the card', () => {
  const src = calc();
  assert.match(src, /foldRow\('weighIns', t\('cal_weighins_title'\), weighSummary, weighOpen/);
  assert.match(src, /foldRow\('numbers', t\('cal_your_numbers'\), youNowSummary, numbersOpenEff/);
  assert.match(src, /t\('cal_weighins_none'\)/);
});

test('PO-11: the Your numbers form asks everything: units, weight, height, age, sex, body fat, waist (+hint), source, activity', () => {
  const src = calc();
  const form = src.match(/const numbersForm = \(([\s\S]*?)\n  \);\n/);
  assert.ok(form, 'numbersForm');
  const f = form[1];
  const order = ["t('cal_metric')", "t('cal_numbers_prompt')", "t('cal_weight')", "t('cal_height')", "t('cal_age')", "t('cal_sex')", "t('cal_bodyfat')", "t('cal_waist')", "t('cal_waist_hint')", "t('cal_bf_source')", "t('cal_activity')"];
  let at = -1;
  for (const k of order) { const i = f.indexOf(k); assert.ok(i > at, `${k} in order`); at = i; }
  assert.doesNotMatch(f, /isUnknown \?/, 'no field is hidden by the body-fat source any more');
  assert.match(f, /editable=\{!ageFromProfile\}/, 'age from the profile stays locked');
  assert.match(f, /onEndEditing=\{commitWeightField\}/, 'a changed weight is decided when the field is left');
});

test('PO-14: the question is the DoseTrace sheet (as Start over? / Stop reality check?), Cancel reverts the field', () => {
  const src = calc();
  const fn = src.match(/function commitWeightField\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn);
  assert.match(fn[0], /setConfirm\(\{/);
  for (const k of ["t('cal_wedit_title')", "t('cal_wedit_body')", "t('cal_wedit_update')", "t('cal_wedit_today')", "t('cancel')"]) assert.ok(fn[0].includes(k), k);
  assert.match(fn[0], /onDismiss: revertWeightField/);
});

test('PO-18: cal_yr is the full word (founder 2026-10-02) and the tile prompt names weight, height, age and sex', () => {
  const src = read('i18n/translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  const { translations: tr } = mod.exports;
  assert.deepEqual(['en', 'es', 'pt', 'fr', 'de', 'it'].map(l => tr[l].cal_yr), ['yr', 'años', 'anos', 'ans', 'J.', 'anni']);
  const { numbersLine } = P();
  assert.equal(numbersLine({ weight: '86', wUnit: 'kg', height: '177', hUnit: 'cm', age: '41', yr: tr.pt.cal_yr, sexLabel: 'Homem', bodyFat: '23', bfShort: tr.pt.cal_bf_short, activityLabel: 'Leve' }), '86 kg · 177 cm · 41 anos · Homem · 23% GC · Leve');
  assert.equal(tr.en.cal_need_inputs, 'Enter your weight, height, age and sex to see your daily burn.');
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) assert.doesNotMatch(tr[l].cal_need_inputs, /\(/, `${l}: no "(or …)" body-fat path any more`);
});

test('PO-16: every new string exists in all 6 languages', () => {
  const src = read('i18n/translations.js').replace(/export\s+const/g, 'const') + '\nmodule.exports = { translations };';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  const { translations } = mod.exports;
  const keys = ['cal_fill_numbers', 'cal_numbers_prompt', 'cal_weighins_none', 'cal_complete_numbers', 'cal_wedit_title', 'cal_wedit_body', 'cal_wedit_update', 'cal_wedit_today'];
  for (const lang of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.ok(translations[lang][k], `${lang}.${k}`);
  assert.equal(translations.en.cal_fill_numbers, 'Fill in your numbers below to see your daily burn.');
  assert.equal(translations.en.cal_numbers_prompt, 'Weight, height, age and sex give your daily burn. Body fat and waist make it sharper.');
  assert.match(translations.en.cal_wedit_update, /\{date\}/);
});
