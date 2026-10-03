'use strict';
// Journey redesign parts 4-16 (founder per-part choices 2026-10-02): the Progress screen.
// 4 prototype order · 5 prototype hero + Log today's weight · 6 its sheet · 7 Your numbers ·
// 8 reality check in progress · 9 start sheet · 10 result · 11 free: explainer first ·
// 12 Start over? / Stop as DoseTrace sheets · 13 Weigh-ins card · 14 Your target as its own
// block · 15 daily plan · 16 end of screen. Reality-check data is never lost.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const calc = () => read('screens/components/CalculatorSection.js');

// ── Part 4: block order ──

// Part 4's order was replaced by the one card (founder 2026-10-02, docs/specs/progress-one-card.md
// PO-1 / PO-9): hero, Your target, Log today's weight, Weigh-ins and Your numbers in ONE card,
// then the daily plan and the reality check. The order itself is tested in progressOneCard.test.js.
test('Part 4 → PO-1: the screen renders the one card, then the daily plan and the reality check, from progressLayout', () => {
  const src = calc();
  assert.match(src, /const screenParts = \{ card: cardEl, plan: planEl, rc: rcEl \};/);
  assert.match(src, /\{loaded \? layout\.screen\.map\(k => screenParts\[k\]\) : null\}/, 'drawn once the saved numbers are read (no first-use flash)');
  assert.match(src, /\{layout\.card\.map\(k => cardParts\[k\]\)\}/);
});

test('Part 4: no "What this is" card at the top and no separate prompt card', () => {
  const src = calc();
  assert.doesNotMatch(src, /const introEl = /, 'the "What this is" card leaves the top (it lives in the daily plan and Understand the numbers)');
  assert.doesNotMatch(src, /const statusEl = /, 'the separate prompt card is gone (the sentence sits inside Your numbers)');
});

test('Part 4: the Progress screen title is "Progress"', () => {
  const src = read('screens/ProgressScreen.js');
  assert.match(src, /<Text style=\{s\.title\}>\{t\('cal_snap_title'\)\}<\/Text>/);
  assert.doesNotMatch(src, /today_section_progress/);
});

// ── Part 5 / 6: hero + Log today's weight ──

test('Part 5 → PO-5: the ink "Log today\'s weight" button sits in the one card after Your target', () => {
  const src = calc();
  const log = src.match(/logWeight: \(([\s\S]*?)\n    \),/);
  assert.ok(log, 'logWeight part');
  assert.match(log[1], /t\('cal_log_today_weight'\)/);
  assert.match(log[1], /style=\{s\.btnP\} onPress=\{openWeighIn\}/);
  const hero = src.match(/const heroPart = \(([\s\S]*?)\n  \);\n/);
  assert.ok(hero, 'heroPart');
  assert.doesNotMatch(hero[1], /cal_tgt_title/, 'Your target is its own part of the card (after a line)');
});

test('Part 6: the Log today\'s weight sheet: weight, body fat, waist, the note, Save — merged into today\'s weigh-in', () => {
  const src = calc();
  const sheet = src.match(/\{\/\* Log today's weight[\s\S]*?<\/SheetModal>/);
  assert.ok(sheet, 'the sheet');
  for (const k of ['cal_log_today_weight', 'cal_snap_weight', 'cal_snap_bodyfat', 'cal_waist', 'cal_log_today_note', "t('save')"]) assert.ok(sheet[0].includes(k), k);
  const fn = src.match(/function saveTodayWeighIn\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn, 'saveTodayWeighIn');
  assert.match(fn[0], /getCalcSnapshots\(uid\)\.find/, 'merges against a fresh read');
  assert.match(fn[0], /mergeWeighIn\(existing, \{ date, weightKg, bodyFatPct: [^}]*, waistCm: [^}]*\}\)/);
  assert.match(fn[0], /calcChanged\(\);/);
});

test('Part 6: mergeWeighIn keeps the day\'s waist unless a new one is given, never nulls a field', () => {
  const { mergeWeighIn } = require('../lib/weighInAccess');
  const old = { entry_date: '2026-10-02', weight_kg: 85, waist_cm: 93, body_fat_pct: 21, lbm: 67, bmr: 1800, tdee: 2800 };
  assert.deepEqual(mergeWeighIn(old, { date: '2026-10-02', weightKg: 84.6 }), { ...old, weight_kg: 84.6 });
  assert.deepEqual(mergeWeighIn(old, { date: '2026-10-02', weightKg: 84.6, waistCm: 92 }), { ...old, weight_kg: 84.6, waist_cm: 92 });
  assert.deepEqual(mergeWeighIn(null, { date: '2026-10-02', weightKg: 84, waistCm: 90, bodyFatPct: 20 }), { entry_date: '2026-10-02', weight_kg: 84, waist_cm: 90, body_fat_pct: 20, lbm: null, bmr: null, tdee: null });
});

// ── Part 7: Your numbers ──

test('Part 7: before numbers Your numbers is open with no fold arrow and the prompt sits under Metric / Imperial', () => {
  const src = calc();
  const part = src.match(/const numbersPart = \(([\s\S]*?)\n  \);\n/);
  assert.ok(part);
  assert.match(part[1], /numbersFoldable\n\s*\? foldRow\(/, 'the fold arrow only once the card is filled (PO-7 / PO-9)');
  const card = src.match(/const numbersForm = \(([\s\S]*?)\n  \);\n/);
  assert.ok(card);
  const seg = card[1].indexOf('<SegmentedBar');
  const prompt = card[1].indexOf("t('cal_numbers_prompt')");
  assert.ok(seg > 0 && prompt > seg, 'the prompt sentence comes right after the Metric / Imperial bar');
  assert.match(card[1], /placeholder=\{eg\(ex\.weight\)\}/, 'example placeholders, not "—"');
  assert.match(card[1], /placeholder=\{eg\(ex\.bodyFat\)\}/);
  assert.match(card[1], /placeholder=\{eg\(ex\.waist\)\}/);
  assert.match(card[1], /placeholder=\{eg\(ex\.height\)\}/);
});

test('Part 7: example values follow the unit; activity labels split in two lines; one-line summary', () => {
  const { exampleValues, activityParts, numbersSummary } = require('../lib/progressFormat');
  assert.deepEqual(exampleValues('metric'), { weight: '80.0', bodyFat: '20', waist: '90', height: '178' });
  assert.deepEqual(exampleValues('imperial'), { weight: '176.4', bodyFat: '20', waist: '35.4', height: '70.1' });
  assert.deepEqual(activityParts('Desk job, little or no exercise'), ['Desk job', 'little or no exercise']);
  assert.deepEqual(activityParts('Moderate — 4–5 sessions/week'), ['Moderate', '4–5 sessions/week']);
  assert.deepEqual(activityParts('Trabajo de oficina, poco o nada de ejercicio'), ['Trabajo de oficina', 'poco o nada de ejercicio']);
  assert.equal(numbersSummary(['84.6 kg', '21% BF', '181 cm', 'Moderate']), '84.6 kg · 21% BF · 181 cm · Moderate');
  assert.equal(numbersSummary(['84.6 kg', null, '', 'Moderate']), '84.6 kg · Moderate');
});

// ── Part 8-12: reality check ──

test('Part 8: checkOutcome — running, due, waiting for the food run, ready (from the first weigh-in on/after day 21)', () => {
  const { checkOutcome } = require('../lib/realityCheckRules');
  const start = { date: '2026-09-01', weightKg: 88 };
  assert.equal(checkOutcome({ start: null, snapshots: [], run: null, todayISO: '2026-09-10' }).state, 'none');
  const r1 = checkOutcome({ start, snapshots: [{ date: '2026-09-15', weightKg: 87 }], run: null, todayISO: '2026-09-15' });
  assert.equal(r1.state, 'running');
  assert.equal(r1.dueISO, '2026-09-22');
  assert.equal(checkOutcome({ start, snapshots: [], run: null, todayISO: '2026-09-23' }).state, 'due');
  const noFood = checkOutcome({ start, snapshots: [{ date: '2026-09-22', weightKg: 86.6 }], run: { ok: false, current: 3 }, todayISO: '2026-09-23' });
  assert.equal(noFood.state, 'needs_food');
  const ready = checkOutcome({
    start,
    snapshots: [{ date: '2026-09-25', weightKg: 86 }, { date: '2026-09-22', weightKg: 86.6 }, { date: '2026-09-10', weightKg: 87.5 }],
    run: { ok: true, avgKcal: 2400, days: 9 }, todayISO: '2026-09-26',
  });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.weighIn.date, '2026-09-22', 'the first weigh-in on or after day 21, never a later one');
  assert.equal(ready.days, 21);
  assert.ok(Math.abs(ready.weightChangeKg - 1.4) < 1e-9);
  assert.equal(ready.avgDailyCalories, 2400);
});

test('Part 8: checkSoFar — one row per day of the check (newest first), kcal and items, and the current run', () => {
  const { checkSoFar } = require('../lib/nutrition');
  const rows = [
    { id: 1, entry_date: '2026-09-28', kcal: 1420, parse_status: 'done', parsed_items: JSON.stringify([{ n: 'a' }, { n: 'b' }, { n: 'c' }]) },
    { id: 2, entry_date: '2026-09-27', kcal: 2000, parse_status: 'done', parsed_items: [{ n: 'a' }] },
    { id: 3, entry_date: '2026-09-27', kcal: 610, parse_status: 'done', parsed_items: [{ n: 'b' }] },
    { id: 4, entry_date: '2026-09-26', kcal: 2380, parse_status: 'done', parsed_items: [{ n: 'a' }] },
    { id: 5, entry_date: '2026-09-25', source: 'not_recorded' },
  ];
  const r = checkSoFar(rows, '2026-09-25', '2026-09-28');
  assert.deepEqual(r.rows.map(x => [x.date, x.kcal, x.items, x.state]), [
    ['2026-09-28', 1420, 3, 'food'], ['2026-09-27', 2610, 2, 'food'], ['2026-09-26', 2380, 1, 'food'], ['2026-09-25', 0, 0, 'not_recorded'],
  ]);
  assert.equal(r.run.days, 2, 'the run counts completed days (yesterday back), as the 7-day rule does');
  assert.equal(r.run.avgKcal, 2495);
  const empty = checkSoFar([], '2026-09-28', '2026-09-28');
  assert.deepEqual(empty.rows.map(x => x.state), ['none']);
  assert.equal(empty.run.days, 0);
});

test('Part 8: the running card: status, start weight, the 7-day rule, "Your reality check so far", reminder, then Start over / Stop always visible', () => {
  const src = calc();
  const a = src.indexOf('const rcHead = (');
  const b = src.indexOf('const weighPart = (');
  assert.ok(a > 0 && b > a, 'the reality check card');
  const body = src.slice(a, b);
  for (const k of ["t('cal_rc_sb_progress')", "t('nutri_run_progress')", "t('nutri_check_label')", "t('cal_rc_reset')", "t('cal_rc_stop')"]) assert.ok(body.includes(k), k);
  assert.match(body, /<FoodReminderRow \/>/);
  assert.ok(body.indexOf('<FoodReminderRow />') < body.indexOf("t('cal_rc_reset')"), 'Start over / Stop come after the reminder');
  // The old phase-2 form is gone (Weight now, Kcal/day you ate, See my actual maintenance).
  assert.doesNotMatch(src, /cal_rc_compute|cal_rc_intake'\)|cal_rc_current_weight/);
  assert.doesNotMatch(src, /<NutritionLogger \/>/, 'the Daily intake fold is replaced by "Your reality check so far"');
  assert.match(body, /<FeatureIcon name="calc_bars"/, 'Q15: the app\'s current icon stays');
});

test('Part 9: "Not run yet — tap to start" opens the start sheet (stepper, weight, Log today & set my reminder)', () => {
  const src = calc();
  assert.match(src, /onPress=\{openRcStart\}/);
  const sheet = src.match(/\{\/\* Reality check start[\s\S]*?<\/SheetModal>/);
  assert.ok(sheet);
  for (const k of ["t('cal_rc_start_on')", "t('cal_rc_start_on_hint')", "t('cal_rc_start_btn')", "t('cal_rc_start_hint')", 'shiftRcStartDate(-1)', 'shiftRcStartDate(1)']) assert.ok(sheet[0].includes(k), k);
});

test('Part 9: starting a check keeps its start weight as that day\'s weigh-in (merged, never lost)', () => {
  const src = calc();
  const fn = src.match(/async function startRealityCheck\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn);
  assert.match(fn[0], /mergeWeighIn\(/);
  assert.match(fn[0], /validStartDate\(rcStartDate, todayISO\(\)\)/, 'still never further back than 7 days (FL-44)');
});

test('Part 10: a ready check is saved once as a result row, then closed; the result reads as a sentence', () => {
  const src = calc();
  const fn = src.match(/async function completeRealityCheck\(res\) \{[\s\S]*?\n  \}\n/);
  assert.ok(fn, 'completeRealityCheck');
  assert.match(fn[0], /upsertRealityCheck\(uid, \{ entry_date: res\.weighIn\.date/);
  assert.match(fn[0], /await clearRealityStart\(\);/);
  assert.ok(fn[0].indexOf('upsertRealityCheck') < fn[0].indexOf('clearRealityStart'), 'the result is written before the check closes');
  assert.match(src, /t\('cal_rc_result_prefix'\)/);
  assert.match(src, /t\('cal_rc_log_title'\)/);
  assert.match(src, /t\('cal_rc_next'\)\.replace\('\{n\}', String\(REALITY_CHECK_DAYS\)\)/);
});

test('Part 10 data safety: a check that already has a saved result (old typed flow) is never overwritten by the automatic finish', () => {
  const src = calc();
  assert.match(src, /const checkSaved = !!rcStart && realityLog\.some\(c => c\.date >= rcStartISO\);/);
  assert.match(src, /if \(!outcomeResult \|\| outcomeResult\.status !== 'ok' \|\| !rcAccess\.canSeeResult \|\| checkSaved \|\| completing\.current\) return;/);
  const fn = src.match(/async function completeRealityCheck\(res\) \{[\s\S]*?\n  \}\n/)[0];
  assert.match(fn, /if \(getRealityChecks\(uid\)\.some\(r => r\.entry_date >= startDay\)\) return;/, 'a fresh read: never a second result for the same check');
  assert.ok(fn.indexOf('getRealityChecks(uid).some') < fn.indexOf('upsertRealityCheck'), 'checked before any write');
  // Such a check shows its saved result and "Weigh in again" (which replaces the start; the old row is stopped, never deleted).
  assert.match(src, /\) : rcStart && !checkSaved \? \(/);
});

test('Part 11: free plan: Premium tag and "See how it works" opens the explainer first, then Unlock with Premium', () => {
  const src = calc();
  assert.match(src, /<FeaturePreviewSheet featureKey=\{rcExplain \? 'reality' : null\}/);
  assert.match(src, /onUnlock=\{\(\) => \{ setRcExplain\(false\); navigation\.navigate\('Paywall'/);
  assert.match(src, /onPress=\{\(\) => setRcExplain\(true\)\}/);
  assert.match(src, /t\('nutri_how'\)/);
});

test('Part 12: Start over and Stop ask first in a DoseTrace sheet; nothing is cleared before the confirm', () => {
  const src = calc();
  assert.match(src, /import \{ DTSheet, DTPickerSheet, DTWheel \} from '\.\/ProtocolParts';/);
  assert.doesNotMatch(src, /Alert\.alert\(t\('cal_rc_stop_title'\)/, 'no grey system alert');
  const reset = src.match(/function confirmResetRealityCheck\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(reset);
  assert.match(reset[0], /title: t\('cal_rc_reset_title'\)/);
  assert.match(reset[0], /body: t\('cal_rc_reset_body'\)/);
  assert.match(reset[0], /kind: 'danger', onPress: resetRealityCheck/);
  const stop = src.match(/function stopRealityCheck\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(stop);
  assert.match(stop[0], /setConfirm\(\{/);
  assert.match(stop[0], /title: t\('cal_rc_stop_title'\)/);
  assert.match(stop[0], /kind: 'danger', onPress: async \(\) =>/);
  // The links call the confirm, never the clearing function directly.
  assert.match(src, /onPress=\{confirmResetRealityCheck\}/);
  assert.doesNotMatch(src, /onPress=\{resetRealityCheck\}/);
});

// ── Part 13: Weigh-ins ──

test('Part 13: Weigh-ins is a fold with a summary; no "Save a snapshot"; Show all / Show less; + Add a past weigh-in', () => {
  const src = calc();
  const card = src.match(/const weighPart = \(([\s\S]*?)\n  \);\n/);
  assert.ok(card);
  assert.match(card[1], /t\('cal_weighins_title'\)/);
  assert.match(card[1], /weighSummary/);
  assert.match(src, /template: t\('cal_weighins_summary'\)/);
  assert.match(card[1], /weighOpen \?/);
  assert.match(card[1], /t\(showAllW \? 'cal_show_less' : 'cal_show_all'\)/);
  assert.match(card[1], /t\('cal_tgt_backfill_add'\)/);
  assert.doesNotMatch(src, /cal_snap_save'|function saveSnapshot/, 'Q10: Save a snapshot is gone');
  assert.match(src, /t\('cal_weighins_need_more'\)/);
});

test('Part 13: the past weigh-in date opens the prototype wheel, never a future day', () => {
  const src = calc();
  assert.match(src, /<DTPickerSheet visible=\{showBfDatePicker\}/);
  assert.match(src, /setBfDate\(clampPast\(dateAfter\(bfDate, new Date\(\), col, i\)\)\)/);
  assert.doesNotMatch(src, /@react-native-community\/datetimepicker/, 'no system picker left in Progress');
});

test('Part 13: the trend chart has three dashed grid lines, axis labels and square waist marks', () => {
  const src = read('screens/components/ProgressChart.js');
  assert.match(src, /\[14, 64, 114\]\.map/);
  assert.match(src, /strokeDasharray="2 3"/);
  assert.match(src, /<Rect[^>]*fill=\{colors\.raised\}[^>]*stroke=\{colors\.ink2\}/);
  assert.match(src, /<Circle[^>]*r=\{4\}[^>]*fill=\{colors\.data\}/);
});

// ── Part 14: Your target as its own block ──

test('Part 14 → PO-4: Your target is a block inside the one card, Edit underlined; the editor gains Remove target in red as a DoseTrace confirm', () => {
  const src = calc();
  assert.match(src, /const targetPart = \(\s*<View key="target" style=\{s\.tgtBlock\}>\s*<View style=\{s\.sep\} \/>/);
  assert.match(src, /t\('cal_tgt_date_line'\)/);
  const clear = src.match(/function clearTargetConfirm\(\) \{[\s\S]*?\n  \}\n/);
  assert.ok(clear);
  assert.match(clear[0], /setConfirm\(\{/);
  assert.doesNotMatch(clear[0], /Alert\.alert/);
});

test('Part 14: the target scale ticks every 0.5 from start to goal, majors on whole units', () => {
  const { targetTicks } = require('../lib/progressFormat');
  const t = targetTicks(88, 80);
  assert.equal(t.length, 17);
  assert.deepEqual(t[0], { v: 88, major: true });
  assert.deepEqual(t[1], { v: 87.5, major: false });
  assert.deepEqual(t[16], { v: 80, major: true });
  assert.ok(targetTicks(60, 120).length <= 81, 'a long range thins the ticks');
});

// ── Part 15 / 16 ──

test('Part 15: the daily plan drops the inputs echo line; numbers with thousands separators', () => {
  const src = calc();
  const plan = src.match(/const planEl = plan \? \(([\s\S]*?)\n  \) : null;/);
  assert.ok(plan);
  assert.doesNotMatch(plan[1], /echoParts\.join/);
  assert.match(plan[1], /fmtInt\(round10\(gc\.mid\)\)/);
  assert.match(plan[1], /t\('cal_intro_title'\)/, 'What this is stays inside the plan');
});

test('Part 16: the disclaimer then the shared Understand the numbers / Sources block close the screen', () => {
  const src = calc();
  assert.ok(src.indexOf("t('cal_disclaimer')") < src.indexOf('<LearnBlock />'));
});

// ── Hygiene ──

test('Progress files parse and use theme tokens only', () => {
  const { parse } = require('@babel/parser');
  for (const f of ['screens/components/CalculatorSection.js', 'screens/components/ProgressChart.js', 'screens/ProgressScreen.js', 'screens/components/NutritionLogger.js']) {
    const src = read(f);
    assert.doesNotThrow(() => parse(src, { sourceType: 'module', plugins: ['jsx'] }), f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `${f}: no raw hex`);
    assert.doesNotMatch(src, /'(white|black)'/, `${f}: no named colors`);
    assert.doesNotMatch(src, /rgba?\(/, `${f}: no rgba`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${f}: no emoji`);
  }
});
