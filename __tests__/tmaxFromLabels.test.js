// Council 2026-11-09 (pharmacometrician): the curve drew the peak AT the injection for compounds whose label
// or phase-1 study gives a time to peak (Mounjaro/Zepbound: median 24 h, 8–72 h). Precision principle
// (founder 2026-10-26): the rise to that peak is drawn. Only single values the source states (median or
// mean) are used — a range alone is never turned into a number.
const test = require('node:test');
const assert = require('node:assert/strict');
const { HALF_LIVES, amountFraction } = require('../lib/halfLives');

const EXPECTED = {
  Tirzepatide: 24, Liraglutide: 11, Dulaglutide: 48, HCG: 24, HMG: 17.9, FSH: 12.9, 'Cetrorelix Acetate': 1,
  Progesterone: 8, Mazdutide: 72, Cagrilintide: 72, 'Nandrolone Decanoate': 72, 'Testosterone Enanthate': 33.3,
  'Estradiol Valerate': 48, 'Estradiol Cypionate': 96,
};

test('the time to peak from the label or the phase-1 study is on each entry, with its source', () => {
  for (const [name, tmax] of Object.entries(EXPECTED)) {
    const e = HALF_LIVES[name];
    assert.ok(e, name);
    assert.equal(e.tmaxHours, tmax, name);
    assert.match(e.source, /Tmax/, `${name}: the source names where the peak comes from`);
  }
});

test('tirzepatide no longer peaks at the injection: 0 at the shot, highest near 24 h', () => {
  const e = HALF_LIVES.Tirzepatide;
  assert.equal(amountFraction(e, 0), 0);
  let best = 0, at = 0;
  for (let h = 0; h <= 120; h += 0.5) { const v = amountFraction(e, h); if (v > best) { best = v; at = h; } }
  assert.ok(Math.abs(at - 24) <= 1, `peak at ${at} h`);
});

test('a range alone never becomes a number (retatrutide, eloralintide, EPO, albiglutide, SS-31)', () => {
  for (const name of ['Retatrutide', 'Eloralintide', 'EPO', 'Albiglutide', 'SS-31']) {
    if (HALF_LIVES[name]) assert.equal(HALF_LIVES[name].tmaxHours, undefined, name);
  }
});
