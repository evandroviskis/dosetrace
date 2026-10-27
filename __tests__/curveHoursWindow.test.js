'use strict';
// Founder 2026-10-26 (picture docs/design/curve-short-half-life.html, option A): when every compound on
// the curve has a short half-life (under 6 h), the curve is drawn by the hour — the last 24 h and the
// next 12 h; with any slower compound (testosterone, semaglutide) it stays in days. Only the window
// changes, never the math.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getHalfLifeEntry } = require('../lib/halfLives');
const { isShortHalfLife, useHoursWindow, curveTimeWindow, HOURS_PAST, HOURS_FUTURE } = require('../lib/curveWindow');
const { translations } = require('../i18n/translations');

const H = 36e5;

test('short = half-life (and rise) under 6 h', () => {
  for (const n of ['GHK-Cu', 'BPC-157', 'TB-500', 'Ipamorelin', 'Sermorelin', 'Tesamorelin']) assert.equal(isShortHalfLife(getHalfLifeEntry(n)), true, n);
  for (const n of ['Testosterone Cypionate', 'Semaglutide']) assert.equal(isShortHalfLife(getHalfLifeEntry(n)), false, n);
  assert.equal(isShortHalfLife(null), false);
});

test('hours only when EVERY selected compound is short, no other day chosen and no other date estimated', () => {
  const e = (n) => getHalfLifeEntry(n);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu')] }), true);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu'), e('BPC-157')] }), true);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu'), e('Testosterone Cypionate')] }), false, 'a slow compound keeps days');
  assert.equal(useHoursWindow({ entries: [] }), false);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu')], dayPicked: true }), false, 'the person picked a day window');
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu')], readoutDate: '2026-10-20' }), false, 'an estimate on another date needs the days');
});

test('the hours window: last 24 h to next 12 h, hourly grid aligned to the hour', () => {
  const now = new Date(2026, 9, 26, 22, 37).getTime();
  const w = curveTimeWindow({ hours: true, now, pastDays: 3, futureDays: 7 });
  assert.equal(w.stepMs, H);
  assert.ok(now - w.start >= HOURS_PAST * H && now - w.start < (HOURS_PAST + 1) * H);
  assert.equal(new Date(w.start).getMinutes(), 0);
  assert.equal(w.end, now + HOURS_FUTURE * H);
  assert.equal(HOURS_PAST, 24);
  assert.equal(HOURS_FUTURE, 12);
  const d = curveTimeWindow({ hours: false, now, pastDays: 3, futureDays: 7 });
  assert.equal(d.stepMs, 6 * H);
  assert.equal(d.end, now + 7 * 24 * H);
});

test('wired: the curve screen uses the window, the hour labels ×6 read natively', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /useHoursWindow\(/);
  assert.match(src, /curveTimeWindow\(/);
  assert.match(src, /t\('curve_last_hours'\)/);
  assert.match(src, /t\('unit_hour_short'\)/);
  const WANT = { en: 'Last', es: 'Últimas', pt: 'Últimas', fr: 'Dernières', de: 'Letzte', it: 'Ultime' };
  for (const [l, v] of Object.entries(WANT)) {
    assert.equal(translations[l].curve_last_hours, v, l);
    assert.equal(typeof translations[l].unit_hour_short, 'string', l);
  }
});
