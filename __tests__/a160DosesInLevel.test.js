'use strict';
// A-160 (pharmacometrics review 2026-10-20; founder 2026-10-26 "Vamos com B nas duas. Pode executar.",
// picture docs/design/a181-a160-proposals.html option B): "Doses counted" on the Dose accumulation
// curve counted only the doses inside the visible window while the Est. level sums the whole history,
// so Testosterone Cypionate weekly read 0 next to 156 mg. B: "Doses in level" = the scheduled doses
// that still add at least 1% of their amount to the estimated level now, with a short note under the
// numbers; the window's own count moves to the top line ("Last 3d · 0 doses · +7d projection · …").
// The level and the curve do not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../lib/serumModel');
const { getHalfLifeEntry, doseInCurveUnit, amountFraction } = require('../lib/halfLives');

const NOW = new Date(2026, 9, 25, 9, 41).getTime();

function cypionate() {
  const p = { id: 1, type: 'recon', name: 'Testosterone Cypionate', compound_id: null, dose: '100', dose_unit: 'mg', frequency: 'weekly', interval_days: 7, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-06-02', created_at: '2026-06-02T12:00:00Z', active: 1 };
  const entry = getHalfLifeEntry(M.matchName(p));
  const start = M.curveGridStart(NOW, 3);
  const doses = M.scheduledDoses(p, entry, start, NOW, NOW);
  return { p, entry, doses };
}

test('the picture example: Testosterone Cypionate 100 mg weekly since 2 Jun → 8 doses in level, 0 in the 3-day window', () => {
  const { entry, doses } = cypionate();
  assert.equal(M.dosesInLevel(doses, entry, NOW), 8);
  const windowStart = M.curveGridStart(NOW, 3);
  assert.equal(doses.filter((d) => d >= windowStart && d <= NOW).length, 0, 'the old count, kept for the top line');
});

test('the rule: a dose counts while its share of its own amount now is at least 1%; future doses never', () => {
  const { entry, doses } = cypionate();
  const counted = doses.filter((d) => d <= NOW && amountFraction(entry, (NOW - d) / 3600000) >= 0.01);
  assert.equal(M.dosesInLevel(doses, entry, NOW), counted.length);
  // A dose after now is not in the level.
  assert.equal(M.dosesInLevel([...doses, NOW + 3600000], entry, NOW), counted.length);
  // A custom amount curve and threshold (the function is the rule, nothing else).
  const half = () => 0.5;
  assert.equal(M.dosesInLevel([NOW - 1, NOW - 2], entry, NOW, half, 0.6), 0);
  assert.equal(M.dosesInLevel([NOW - 1, NOW - 2], entry, NOW, half, 0.5), 2);
});

test('the level itself is untouched (the number beside it changes, not the estimate)', () => {
  const { p, entry, doses } = cypionate();
  const lv = M.levelAt(doses, doseInCurveUnit(100, 'mg', entry), entry, NOW);
  // AD-96 B (1.3.2): the level reads the Dose log — every planned dose logged as Taken here.
  const logs = require('./helpers/curveLogs').takenAtEverySlot([p], NOW);
  assert.equal(Math.round(lv), Math.round(M.estimatedLevelNow(p, NOW, { logs }).value));
});

test('AD-96 B: with logged doses the count is the logged doses still in the level (Skipped / Missed never count)', () => {
  const { p, entry, doses } = cypionate();
  const logs = doses.filter((d) => d <= NOW).map((d, i) => ({ id: i + 1, protocol_id: 1, outcome: i % 3 === 2 ? 'Skipped' : 'Taken', logged_at: new Date(d + 15 * 60000).toISOString(), sync_status: 'synced' }));
  const drawn = M.curvePlan(p, entry, M.curveGridStart(NOW, 3), NOW + 7 * 864e5, NOW, { logs }).doses;
  const taken = logs.filter((l) => l.outcome === 'Taken').map((l) => Date.parse(l.logged_at));
  const inLevel = taken.filter((t) => amountFraction(entry, (NOW - t) / 3600000) >= 0.01);
  assert.equal(M.dosesInLevel(drawn, entry, NOW), inLevel.length);
  assert.ok(inLevel.length > 0 && inLevel.length < M.dosesInLevel(doses, entry, NOW), 'fewer than the planned 8');
  // the planned doses after now never count
  assert.ok(drawn.some((d) => d > NOW));
});

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the screen: "Doses in level" with its note, and the window count on the top line', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.ok(src.includes("t('curve_doses_in_level')"));
  assert.ok(src.includes("t('curve_doses_in_level_note')"));
  assert.ok(!src.includes("t('curve_doses_counted')"), 'the old label is gone (rebuild = replace)');
  assert.match(src, /dosesInLevel\(/);
  // Top line: Last {n}d · {count} doses · +{n}d projection.
  const top = src.slice(src.indexOf("{t('curve_last_days')}"), src.indexOf("{t('curve_last_days')}") + 300);
  assert.match(top, /log_dose/);
});

test('six languages', () => {
  const { translations } = require('../i18n/translations.js');
  for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it']) {
    assert.ok(translations[lang].curve_doses_in_level, lang);
    assert.ok(translations[lang].curve_doses_in_level_note, lang);
  }
  assert.equal(translations.pt.curve_doses_in_level, 'Doses no nível');
});
