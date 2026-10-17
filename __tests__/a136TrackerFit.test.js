'use strict';
// A-136 (3) — guided device session 2026-10-17 (Galaxy Z Fold7 unfolded, pt): on Today's left
// page the tracker's small rings read "30 / dias" and "12 de / 98": the label and the count
// wrapped. The page is ~338 dp wide (the slab ~298 inside its padding), and the row left only
// ~38 dp for the text: 132 big gauge + 18 gap + 44 small gauge + 2 x 12 gaps + the % column.
// Fix (fit/shrink rules, no redesign): lib/trackerFit gives the text column at least TEXT_MIN by
// first tightening the gap beside the big gauge (18 to at least 12), then letting the big gauge
// shrink (132 to at least 116), then the % column (to 0.72 of its width) — only as much as
// needed, so a wide page or phone keeps the approved 132 / 18; the label, the count and the %
// each stay on one line and may shrink to 0.75 (adjustsFontSizeToFit) before they would wrap.
// The big gauge's own number and captions shrink with it (one line, padding scaled).
// Width estimate: calibrated on the Fold capture ("7 dias" 15 pt = 38 dp, 0.42 em per char);
// 0.46 em here, so it is generous to the text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { translations: tr } = require('../i18n/translations.js');
const { trackerFit, textColumn, pctWidth, TRACKER } = require('../lib/trackerFit');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const MIN_SCALE = 0.75;
const est = (s, size) => String(s).length * 0.46 * size;

test('A-136 (3): wide slab keeps the approved 132 gauge and 18 gap', () => {
  for (const inner of [318, 360, 480]) {
    assert.deepEqual(trackerFit(inner, [0, 12]), { big: 132, gap: 18, pctMax: null }, `inner ${inner}`);
  }
  assert.deepEqual(trackerFit(0, [0, 12]), { big: 132, gap: 18, pctMax: null }, 'not measured yet');
});

test('A-136 (3): the Fold page (slab inner ~298) leaves the text column room, in every % case', () => {
  for (const inner of [288, 298, 303]) { // a 360 dp Android phone, the Fold page, a 375 pt iPhone
    for (const pcts of [[0, 12], [null, null], [100, 100], [7, 100]]) {
      const fit = trackerFit(inner, pcts);
      assert.ok(fit.big >= TRACKER.BIG_MIN && fit.big <= 132, `big ${fit.big}`);
      assert.ok(fit.gap >= TRACKER.GAP_MIN && fit.gap <= 18, `gap ${fit.gap}`);
      if (fit.pctMax != null) assert.ok(fit.pctMax >= Math.max(...pcts.map(pctWidth)) * TRACKER.PCT_MIN_SCALE, `pct ${fit.pctMax}`);
      assert.ok(textColumn(inner, fit, pcts) >= TRACKER.TEXT_MIN, `inner ${inner} ${pcts}: ${textColumn(inner, fit, pcts)}`);
    }
  }
  const fold = trackerFit(298, [0, 12]);
  assert.ok(fold.big >= 120, `only as much as needed: ${fold.big}`);
});

test('A-136 (3): every language fits the text column on one line at the shrink floor', () => {
  for (const l of LANGS) {
    for (const k of ['today_ring_7d', 'today_ring_30d']) {
      assert.ok(est(tr[l][k], 15) * MIN_SCALE <= TRACKER.TEXT_MIN, `${l} ${k} "${tr[l][k]}"`);
    }
    const worst = tr[l].vials_count_of.replace('{x}', '120').replace('{y}', '150');
    assert.ok(est(worst, 13) * MIN_SCALE <= TRACKER.TEXT_MIN, `${l} "${worst}"`);
  }
});

test('A-136 (3): the tracker uses the fit and keeps each line on one line', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens/components/TodayTracker.js'), 'utf8');
  assert.match(src, /import \{ trackerFit(, sideTextSize)? \} from '\.\.\/\.\.\/lib\/trackerFit'/);
  assert.match(src, /<View style=\{s\.slab\} onLayout=\{/);
  assert.match(src, /<Gauge size=\{fit\.big\}/);
  assert.match(src, /<View style=\{\[s\.bigIn, \{ paddingHorizontal: Math\.round\(22 \* fit\.big \/ 132\) \}\]\}/, 'the opening padding scales with the gauge');
  assert.match(src, /<Text style=\{s\.bigNum\} numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.8\}>/);
  assert.match(src, /style=\{\[s\.sidePct, fit\.pctMax != null && \{ maxWidth: fit\.pctMax \}\]\}/);
  assert.match(src, /<View style=\{\[s\.gauges, \{ gap: fit\.gap \}\]\}>/);
  // A-135 council (5): both rows share one label size and one count size (sideTextSize, floor 0.75).
  for (const st of ['sideLabel', 'sideSub']) {
    assert.match(src, new RegExp(`style=\\{\\[s\\.${st}, \\{ fontSize: (label|sub)Size \\}\\]\\} numberOfLines=\\{1\\}>`), st);
  }
});
