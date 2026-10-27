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
const { isShortHalfLife, useHoursWindow, curveTimeWindow, hoursSplit, HOUR_PRESETS, DEFAULT_HOURS } = require('../lib/curveWindow');
const { restoreCurveView } = require('../lib/curveView');
const { translations } = require('../i18n/translations');

const H = 36e5;

test('short = half-life (and rise) under 6 h', () => {
  for (const n of ['GHK-Cu', 'BPC-157', 'TB-500', 'Ipamorelin', 'Sermorelin', 'Tesamorelin']) assert.equal(isShortHalfLife(getHalfLifeEntry(n)), true, n);
  for (const n of ['Testosterone Cypionate', 'Semaglutide']) assert.equal(isShortHalfLife(getHalfLifeEntry(n)), false, n);
  assert.equal(isShortHalfLife(null), false);
});

test('hours only when EVERY selected compound is short — never both (founder: "Não faz sentido deixar os dois")', () => {
  const e = (n) => getHalfLifeEntry(n);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu')] }), true);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu'), e('BPC-157')] }), true);
  assert.equal(useHoursWindow({ entries: [e('GHK-Cu'), e('Testosterone Cypionate')] }), false, 'a slow compound: only days');
  assert.equal(useHoursWindow({ entries: [] }), false);
});

test('hour choices 12/24/36/48/72 h, opens on 36 h; 2/3 back, 1/3 ahead; hourly grid on the hour', () => {
  assert.deepEqual(HOUR_PRESETS, [12, 24, 36, 48, 72]);
  assert.equal(DEFAULT_HOURS, 36);
  assert.deepEqual(hoursSplit(36), { past: 24, future: 12 });
  assert.deepEqual(hoursSplit(12), { past: 8, future: 4 });
  assert.deepEqual(hoursSplit(72), { past: 48, future: 24 });
  const now = new Date(2026, 9, 26, 22, 37).getTime();
  const w = curveTimeWindow({ hours: 36, now, pastDays: 3, futureDays: 7 });
  assert.equal(w.stepMs, H);
  assert.ok(now - w.start >= 24 * H && now - w.start < 25 * H);
  assert.equal(new Date(w.start).getMinutes(), 0);
  assert.equal(w.end, now + 12 * H);
  const w72 = curveTimeWindow({ hours: 72, now, pastDays: 3, futureDays: 7 });
  assert.equal(w72.end, now + 24 * H);
  const d = curveTimeWindow({ hours: 0, now, pastDays: 3, futureDays: 7 });
  assert.equal(d.stepMs, 6 * H);
  assert.equal(d.end, now + 7 * 24 * H);
});

test('the hour choice is remembered with the curve view (an unknown value opens on 36 h)', () => {
  const active = [{ id: 1 }];
  assert.equal(restoreCurveView({ saved: { hours: 72 }, active, unitOf: () => 'mg' }).hours, 72);
  assert.equal(restoreCurveView({ saved: { hours: 5 }, active, unitOf: () => 'mg' }).hours, 36);
  assert.equal(restoreCurveView({ saved: null, active, unitOf: () => 'mg' }).hours, 36);
});

test('wired: the curve screen uses the window, the hour labels ×6 read natively', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /useHoursWindow\(/);
  assert.match(src, /curveTimeWindow\(/);
  assert.match(src, /t\('curve_last_hours'\)/);
  assert.match(src, /'curve_hours_label' : 'curve_project_ahead'/, 'the bar is Horas or Projetar, never both');
  assert.match(src, /HOUR_PRESETS\.map/);
  assert.doesNotMatch(src, /dayPicked/, 'no mixing: hours or days');
  assert.match(src, /t\('unit_hour_short'\)/);
  const WANT = { en: 'Last', es: 'Últimas', pt: 'Últimas', fr: 'Dernières', de: 'Letzte', it: 'Ultime' };
  for (const [l, v] of Object.entries(WANT)) {
    assert.equal(translations[l].curve_last_hours, v, l);
    assert.equal(typeof translations[l].unit_hour_short, 'string', l);
    assert.equal(translations[l].curve_hours_label, { en: 'Hours', es: 'Horas', pt: 'Horas', fr: 'Heures', de: 'Stunden', it: 'Ore' }[l], l);
  }
});

// Founder 2026-10-27 (decisions (2) and (3) with option A): the short-compound note says it leaves the
// blood in hours and that the curve never measures effects (Apple 1.4.1); "Estimar em uma data" is hidden
// while the curve is in hours (a date-level readout means nothing on a 36 h window).
test('short-compound note ×6 (approved text) and no date readout in hours mode', () => {
  assert.equal(translations.pt.curve_fast_note, 'Neste modelo, {names} sai do sangue em poucas horas após cada dose. A curva mostra apenas o nível estimado no sangue; ela não mede efeitos.');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const v = translations[l].curve_fast_note;
    assert.match(v, /\{names\}/, l);
    assert.doesNotMatch(v, /\{nome\}|\{name\}/, l);
  }
  assert.match(translations.en.curve_fast_note, /does not measure effects/);
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /\{!hourMode && \(\s*<CollapsibleSection title=\{t\('curve_readout_title'\)\}/, 'the card only in days (collapsed, founder 2026-10-27)');
  assert.match(src, /useEffect\(\(\) => \{ if \(hourMode && readoutDate\) setReadoutDate\(null\); \}, \[hourMode, readoutDate\]\)/, 'a date picked in days never steers the hours curve');
});

// Council 2026-10-27 (picture deviation): one hour format everywhere — axis, window label and bar read
// "24 h" / "24 Std." with a no-break space, never "24h" next to "24 h".
test('one hour format on the axis, the label and the bar', () => {
  const src = fs.readFileSync(path.join(__dirname, '../screens/SerumCurveScreen.js'), 'utf8');
  assert.match(src, /`−\$\{hourWin\.past\}\\u00A0\$\{hu\}`/);
  assert.match(src, /`\+\$\{hourWin\.future\}\\u00A0\$\{hu\}`/);
  assert.doesNotMatch(src, /\$\{hourWin\.(past|future)\}\$\{hu\}/);
});
