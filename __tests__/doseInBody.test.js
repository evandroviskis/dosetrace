'use strict';
// "Dose no corpo" — the model change (docs/specs/dose-in-body.md DB-1…DB-8, DB-10, DB-11; formulas and every
// parameter: docs/review/dose-in-body-params.md). Pure math: the amount in the body, never advice.
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/halfLives');
const B = require('../lib/doseInBody');
const M = require('../lib/serumModel');
const { sampleLevelsAt } = require('../lib/curveSampling');

const HOUR = 3600e3;
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: ${a} vs ${b}`);
const lines = (key) => B.bodyLines(H.HALF_LIVES[key]);
// ∫0..∞ of a shape given as terms (Σ c·t^p·e^(−k·t)): Σ c·p!/k^(p+1).
const area = (terms) => terms.reduce((s, x) => s + x.c * (x.p ? 1 / (x.k * x.k) : 1 / x.k), 0);
const weekly = (n, tau = 168) => Object.freeze(Array.from({ length: n }, (_, i) => i * tau * HOUR));
const levelAt = (doses, doseMg, entry, T) => M.levelAt(doses, doseMg, entry, T);
const curveKeys = Object.entries(H.HALF_LIVES)
  .filter(([k, e]) => !H.CURVE_EXCLUDED.has(k) && !/^EXCLUDED/.test(e.source))
  .map(([k]) => k);
const STATUSES = new Set(Object.values(H.BODY_STATUS));

test('DB-10: every curve compound has S, F and t½_true, each with its source and a status', () => {
  for (const k of curveKeys) {
    const p = H.BODY_PARAMS[k];
    assert.ok(p, `${k}: no dose-in-the-body parameters`);
    for (const f of ['S', 'F', 'tTrue']) {
      assert.ok(p[f], `${k}: ${f} missing`);
      assert.ok(typeof p[f].source === 'string' && p[f].source.trim().length > 10, `${k}: ${f} has no source`);
      assert.ok(STATUSES.has(p[f].status), `${k}: ${f} status "${p[f].status}"`);
    }
    if (p.hoursHi) assert.ok(p.hoursHi.source && STATUSES.has(p.hoursHi.status), `${k}: hoursHi needs a source`);
    assert.ok(['release', 'depotOnly', 'scaled'].includes(p.model), `${k}: model`);
  }
  for (const k of Object.keys(H.BODY_PARAMS)) assert.ok(curveKeys.includes(k), `${k}: a parameter for a compound the curve does not draw`);
});

test('DB-10: a number the curve uses without a source fails', () => {
  // the guard itself: the same check on a made-up entry with a number and no source
  const check = (p) => ['S', 'F', 'tTrue'].every((f) => p[f] && typeof p[f].source === 'string' && p[f].source.trim().length > 10);
  assert.equal(check({ S: { value: 0.7 }, F: H.BODY_PARAMS['Semaglutide'].F, tTrue: H.BODY_PARAMS['Semaglutide'].tTrue }), false);
  // every number in the table sits inside a sourced object
  for (const k of curveKeys) {
    const p = H.BODY_PARAMS[k];
    const nums = [p.S.value, p.F.value, ...(p.F.range || []), p.F.bound, ...(p.tTrue.range || []), p.hoursHi && p.hoursHi.value].filter((v) => v != null);
    for (const v of nums) assert.ok(Number.isFinite(v) && v > 0, `${k}: ${v}`);
  }
  // S from formula masses (params doc)
  near(H.BODY_PARAMS['Testosterone Cypionate'].S.value, 0.6990, 1e-3, 'S cypionate');
  near(H.BODY_PARAMS['Testosterone Enanthate'].S.value, 0.7200, 1e-3, 'S enanthate');
  near(H.BODY_PARAMS['Testosterone Propionate'].S.value, 0.8373, 1e-3, 'S propionate');
  near(H.BODY_PARAMS['Testosterone Undecanoate'].S.value, 0.6315, 1e-3, 'S undecanoate');
  near(H.BODY_PARAMS['Sustanon 250'].S.value, 0.7048, 1e-3, 'S Sustanon');
  near(H.BODY_PARAMS['Nandrolone Decanoate'].S.value, 0.6402, 1e-3, 'S nandrolone decanoate');
  near(H.BODY_PARAMS['Estradiol Valerate'].S.value, 0.7640, 1e-3, 'S estradiol valerate');
});

test('DB-1: the testosterone esters show testosterone in the body, a band at t½_true 10 and 100 min', () => {
  for (const k of ['Testosterone Cypionate', 'Testosterone Enanthate', 'Testosterone Propionate', 'Testosterone Undecanoate', 'Testosterone Suspension', 'Sustanon 250']) {
    const L = lines(k);
    assert.equal(L.kind, 'band', k);
    assert.equal(L.parent, 'testosterone', k);
    assert.ok(L.lo && L.hi && L.lo !== L.hi, k);
    const S = H.BODY_PARAMS[k].S.value;
    // ∫A = D·S·F/ke: the area of each edge is S·t½_true/ln2
    near(area(L.lo.terms), S * (10 / 60) / Math.LN2, 1e-6, `${k} lo area`);
    near(area(L.hi.terms), S * (100 / 60) / Math.LN2, 1e-6, `${k} hi area`);
    assert.equal(L.lo.fastHours, 10 / 60);
    assert.equal(L.hi.fastHours, 100 / 60);
  }
  const t = (key) => ({ body_between: 'entre {lo} e {hi} {unit}', body_unit_of: '{unit} de {substance}', body_parent_testosterone: 'testosterona' }[key] || key);
  assert.equal(B.bodyLevelText({ kind: 'band', lo: 0.0809, hi: 0.8152 }, { t, language: 'pt', unit: 'mg', parent: 'testosterone', doses: [100] }), 'entre 0,081 e 0,82 mg de testosterona');
});

test('DB-2: the oil esters carry the depot layer U = D·S at the injection, mass balance with the release', () => {
  for (const k of ['Testosterone Cypionate', 'Testosterone Propionate', 'Nandrolone Decanoate', 'Estradiol Valerate']) {
    const L = lines(k);
    const S = H.BODY_PARAMS[k].S.value;
    assert.ok(L.depot, k);
    near(H.termsFraction(L.depot.terms, 0), S, 1e-9, `${k} U(0)`);
    assert.ok(H.termsFraction(L.depot.terms, 24 * 365 * 3) < 1e-3 * S, `${k} U at 3 years`);
    // U(t) + ∫0..t release = 1 (F = 1 assumed): checked at 5 moments by numeric integration
    const R = B.releaseTerms(H.HALF_LIVES[k]);
    for (const th of [1, 24, 72, 168, 500]) {
      let integ = 0; const n = 4000;
      for (let i = 0; i < n; i++) integ += H.termsFraction(R, (i + 0.5) * th / n) * th / n;
      near(H.termsFraction(L.depot.terms, th) / S + integ, 1, 1e-4, `${k} U + released at ${th} h`);
    }
    assert.equal(H.BODY_PARAMS[k].F.assumed, true, `${k}: F = 1 is an assumption`);
  }
  assert.equal(lines('Semaglutide').depot, null);
  assert.equal(lines('HGH').depot, null);
});

test('DB-3: esters with no sourced t½_true draw only the depot, "sem estudo" for the body', () => {
  const list = ['Nandrolone Decanoate', 'Nandrolone Phenylpropionate', 'Trenbolone Acetate', 'Trenbolone Enanthate', 'Trenbolone Hexahydrobenzylcarbonate',
    'Drostanolone Propionate', 'Drostanolone Enanthate', 'Boldenone Undecylenate', 'Methenolone Enanthate', 'Stanozolol injectable',
    'Estradiol Valerate', 'Estradiol Cypionate', 'Progesterone'];
  for (const k of list) {
    const L = lines(k);
    assert.equal(L.kind, 'depotOnly', k);
    assert.equal(L.hi, null, k);
    assert.ok(L.depot, k);
    assert.ok(H.BODY_PARAMS[k].tTrue.none, k);
    const lv = B.bodyLevel(L, weekly(4), 100, H.HALF_LIVES[k], 3.5 * 168 * HOUR, levelAt);
    assert.equal(lv.kind, 'depotOnly');
    assert.ok(lv.depot > 0);
    assert.equal(B.bodyLevelText(lv, { t: (x) => x }), 'body_no_study');
  }
  // where the apparent t½ itself has no source, the entry stays "estimated" (the "sem estudo" style)
  for (const k of ['Trenbolone Acetate', 'Drostanolone Propionate', 'Boldenone Undecylenate', 'Stanozolol injectable']) assert.equal(H.HALF_LIVES[k].tier, 'estimated');
});

test('DB-4: SC compounds with a human F are today × F (a band where F is a range)', () => {
  const doses = weekly(10);
  const T = 9.3 * 168 * HOUR;
  for (const [k, f] of [['Semaglutide', 0.89], ['Tirzepatide', 0.80], ['Liraglutide', 0.55], ['Cetrorelix Acetate', 0.85], ['PT-141', 1], ['Octreotide', 1]]) {
    const e = H.HALF_LIVES[k];
    const L = lines(k);
    assert.equal(L.kind, 'value', k);
    const lv = B.bodyLevel(L, doses, 2, e, T, levelAt);
    near(lv.hi, f * M.levelAt(doses, 2, e, T), 1e-9, k);
    assert.equal(lv.lo, lv.hi, k);
  }
  const fsh = lines('FSH');
  assert.equal(fsh.kind, 'band');
  const lv = B.bodyLevel(fsh, doses, 75, H.HALF_LIVES['FSH'], T + 20 * HOUR, levelAt);
  const today = M.levelAt(doses, 75, H.HALF_LIVES['FSH'], T + 20 * HOUR);
  near(lv.lo, 0.70 * today, 1e-9, 'FSH lo');
  near(lv.hi, 0.778 * today, 1e-9, 'FSH hi');
});

test('DB-5: dulaglutide F per dose (AD-95), never per protocol, never interpolated', () => {
  const f = B.dulaglutideF;
  assert.deepEqual(f(0.75), { lo: 0.65, hi: 0.65, ceiling: false, estimated: false });
  assert.deepEqual(f(1.5), { lo: 0.47, hi: 0.47, ceiling: false, estimated: false });
  assert.deepEqual(f(3), { lo: 0.47, hi: 0.47, ceiling: false, estimated: true });
  assert.deepEqual(f(4.5), { lo: 0.47, hi: 0.47, ceiling: false, estimated: true });
  assert.deepEqual(f(1), { lo: 0.47, hi: 0.65, ceiling: false, estimated: false });
  assert.equal(f(0.5).ceiling, true);
  assert.equal(f(6).ceiling, true);
  const e = H.HALF_LIVES['Dulaglutide'];
  const L = lines('Dulaglutide');
  assert.equal(L.kind, 'perDose');
  const T = 10.5 * 168 * HOUR;
  const today = (doses, mg) => M.levelAt(doses, mg, e, T);
  // all at 0.75 mg
  let lv = B.bodyLevel(L, weekly(11), 0.75, e, T, levelAt);
  assert.equal(lv.kind, 'value'); near(lv.hi, 0.65 * today(weekly(11), 0.75), 1e-9, '0.75');
  // 1 mg: the band [0.47, 0.65]
  lv = B.bodyLevel(L, weekly(11), 1, e, T, levelAt);
  assert.equal(lv.kind, 'band'); near(lv.lo, 0.47 * today(weekly(11), 1), 1e-9, '1 lo'); near(lv.hi, 0.65 * today(weekly(11), 1), 1e-9, '1 hi');
  // 0.5 mg: a ceiling
  lv = B.bodyLevel(L, weekly(11), 0.5, e, T, levelAt);
  assert.equal(lv.kind, 'ceiling'); assert.equal(lv.lo, null); near(lv.hi, today(weekly(11), 0.5), 1e-9, '0.5');
  // 3 mg: the label's estimate
  lv = B.bodyLevel(L, weekly(11), 3, e, T, levelAt);
  assert.equal(lv.kind, 'value'); assert.equal(lv.estimated, true);
  // per dose: the history was 0.75 mg (weight 0.5 of today's 1.5 mg) then 1.5 mg — each dose at its own F
  const d = weekly(11).slice();
  Object.defineProperty(d, 'w', { value: d.map((_, i) => (i < 5 ? 0.5 : 1)) });
  Object.freeze(d);
  lv = B.bodyLevel(L, d, 1.5, e, T, levelAt);
  const expected = d.reduce((s, ts, i) => s + 1.5 * d.w[i] * (i < 5 ? 0.65 : 0.47) * H.amountFraction(e, (T - ts) / HOUR), 0);
  near(lv.hi, expected, 1e-9, 'per dose'); assert.equal(lv.kind, 'value');
});

test('DB-6: no human F → F = 1 and "no máximo"; tesamorelin a dashed ceiling at F = 0.04; HCG and HMG ceilings', () => {
  const doses = Object.freeze([0, 24 * HOUR, 48 * HOUR]);
  const T = 48.2 * HOUR;
  for (const k of ['BPC-157', 'Retatrutide', 'Ipamorelin', 'HCG', 'HMG', 'MK-677', 'NAD+', 'TB-500']) {
    const L = lines(k);
    assert.equal(L.kind, 'ceiling', k);
    assert.equal(L.lo, null, k);
    const lv = B.bodyLevel(L, doses, 1, H.HALF_LIVES[k], T, levelAt);
    near(lv.hi, M.levelAt(doses, 1, H.HALF_LIVES[k], T), 1e-9, k);
    assert.equal(B.bodyLevelText(lv, { t: (x) => (x === 'body_at_most' ? 'no máximo {v} {unit}' : x), language: 'pt', unit: 'mg', doses: [1] }).startsWith('no máximo '), true, k);
  }
  assert.match(H.BODY_PARAMS['HCG'].F.source, /40%/);
  assert.equal(H.BODY_PARAMS['HCG'].F.measured, 0.40);
  const tes = lines('Tesamorelin');
  assert.equal(tes.kind, 'ceiling');
  assert.equal(tes.dashed, true);
  assert.equal(tes.lo, null);
  // F = 0.04 at the longest labeled t½ (38 min): never below today's shape × 0.04
  const e = H.HALF_LIVES['Tesamorelin'];
  const lv = B.bodyLevel(tes, Object.freeze([0]), 1, e, 0.5 * HOUR, levelAt);
  assert.ok(lv.hi >= 0.04 * M.levelAt([0], 1, e, 0.5 * HOUR));
  near(area(tes.hi.terms), 0.04 * (38 / 60) / Math.LN2, 1e-6, 'tesamorelin area');
});

test('DB-7: HGH is flip-flop (F1, t½_true 0.4 h, F 0.80); EPO F1 with t½_true [4, 13] h as a ceiling', () => {
  const hgh = lines('HGH');
  assert.equal(hgh.kind, 'value');
  near(area(hgh.hi.terms), 0.80 * 0.4 / Math.LN2, 1e-6, 'HGH area');
  // ~0.09 × today on average (params doc)
  near(area(hgh.hi.terms) / area(B.apparentTerms(H.HALF_LIVES['HGH'])), 0.80 * 0.4 / 3.5, 1e-6, 'HGH ratio');
  assert.ok(hgh.hi.terms.some((x) => Math.abs(x.k - Math.LN2 / 0.4) < 1e-9), 'ke 1.73/h');
  const epo = lines('EPO');
  assert.equal(epo.kind, 'ceiling');
  assert.equal(epo.lo, null);
  near(area(epo.hi.terms), 13 / Math.LN2, 1e-6, 'EPO at the upper t½_true');
});

test('DB-8: the limit forms for ke = kd and ke = kr match the general form as the rates meet', () => {
  const e = { hours: 100, tmaxHours: 30 };
  const kd = Math.LN2 / 100;
  const kr = H.riseRate(100, 30);
  for (const ke of [kd, kr]) {
    const limit = B.bodyTerms(e, ke);
    assert.ok(limit.some((x) => x.p === 1), 'a t·e^(−k·t) term');
    const general = B.bodyTerms(e, ke * (1 + 1e-6));
    for (const t of [0, 1, 10, 50, 200, 800]) {
      const a = H.termsFraction(limit, t), b = H.termsFraction(general, t);
      assert.ok(Math.abs(a - b) <= 1e-5 * Math.abs(b) + 1e-9, `t ${t}: ${a} vs ${b}`);
    }
    near(area(limit), 1 / ke, 1e-9, 'area of the limit form');
  }
  // without a Tmax
  const e2 = { hours: 20 };
  const lim2 = B.bodyTerms(e2, Math.LN2 / 20);
  assert.deepEqual(lim2.map((x) => x.p), [1]);
  near(area(lim2), 20 / Math.LN2, 1e-9, 'no-Tmax limit area');
});

test('DB-8: mass balance — the release sums to D·S·F, the body to D·S·F/ke', () => {
  for (const k of ['Testosterone Cypionate', 'Testosterone Propionate', 'HGH', 'EPO', 'Testosterone Undecanoate']) {
    const e = H.HALF_LIVES[k];
    near(area(B.releaseTerms(e)), 1, 1e-9, `${k} ∫release`);
    const p = H.BODY_PARAMS[k];
    const L = lines(k);
    const F = p.F.ceiling ? 1 : p.F.value;
    near(area(L.hi.terms) * Math.LN2 / p.tTrue.range[1], p.S.value * F, 1e-9, `${k} ke·∫A = S·F`);
  }
});

test('DB-8: the steady-state average equals S·F·D·t½_true/(ln2·τ), from the carried sums', () => {
  const k = 'Testosterone Enanthate';
  const e = H.HALF_LIVES[k];
  const L = lines(k);
  const doses = weekly(80, 84); // every 3.5 days
  const tau = 84;
  const t0 = 79 * tau;
  const times = []; for (let h = 0; h < tau; h += 0.05) times.push((t0 + h) * HOUR);
  for (const [edge, th] of [[L.lo, 10 / 60], [L.hi, 100 / 60]]) {
    const { points } = sampleLevelsAt(doses, 200, edge, times, H.amountFraction);
    const avg = points.reduce((s, v) => s + v, 0) / points.length;
    near(avg, 0.7200 * 1 * 200 * th / (Math.LN2 * tau), 0.005, `average at t½_true ${th}`);
  }
});

test('DB-8: the carried sums of a body line equal the direct sum (limit forms and weights included)', () => {
  const e = { hours: 100, tmaxHours: 30 };
  const entry = B.lineEntry(e, B.bodyTerms(e, Math.LN2 / 100), 'test-limit');
  const doses = []; for (let i = 0; i < 40; i++) doses.push(i * 37 * HOUR);
  Object.defineProperty(doses, 'w', { value: doses.map((_, i) => 1 + (i % 3) * 0.25) });
  const times = []; for (let h = 0; h < 40 * 37 + 200; h += 5) times.push(h * HOUR);
  const carried = sampleLevelsAt(doses, 2, entry, times, H.amountFraction);
  const plain = (en, dt) => H.amountFraction(en, dt); // no exactCarry marker → the moving window
  const direct = sampleLevelsAt(doses, 2, entry, times, plain);
  for (let i = 0; i < times.length; i++) {
    assert.ok(Math.abs(carried.points[i] - direct.points[i]) <= 1e-9 * Math.max(1, direct.points[i]), `point ${i}`);
    assert.ok(Math.abs(carried.pre[i] - direct.pre[i]) <= 1e-9 * Math.max(1, direct.pre[i]), `pre ${i}`);
  }
});

test('DB-8: the curve samples a body line at its own ln2/ke (HGH body in the hours window)', () => {
  const e = H.HALF_LIVES['HGH'];
  const L = lines('HGH');
  const start = 0, end = 48 * HOUR, stepMs = HOUR;
  const doses = [2 * HOUR, 26 * HOUR];
  assert.equal(M.curveDecaySamples(doses, doses, e, start, end, 300, stepMs).length, 0, 'the apparent shape needs none at 1 h steps');
  assert.ok(M.curveDecaySamples(doses, doses, L.hi, start, end, 300, stepMs).length > 0, 'the body line (t½_true 0.4 h) is sampled');
});

test('DB-8: "Doses no nível" counts on the release shape, never on the scaled amount', () => {
  const e = H.HALF_LIVES['Testosterone Cypionate'];
  const doses = weekly(20);
  const T = 19.5 * 168 * HOUR;
  const apparent = M.dosesInLevel(doses, e, T);
  assert.ok(apparent >= 5, `the doses that make the level: ${apparent}`);
  // on the scaled body amount (×S·t½_true/t½_app ≈ 0.0006) every dose reads under 1 % — the count would be 0
  assert.equal(M.dosesInLevel(doses, lines('Testosterone Cypionate').lo, T), 0);
  // the curve screen counts on the compound's own entry (the release shape)
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'screens', 'SerumCurveScreen.js'), 'utf8');
  assert.match(src, /dosesInLevel\(\[ts\], entry, now\)/);
});

test('DB-11: worked example — testosterone cypionate 100 mg weekly at steady state matches the params doc within 2 %', () => {
  const k = 'Testosterone Cypionate';
  const e = H.HALF_LIVES[k];
  const L = lines(k);
  const N = 60, tau = 168;
  const doses = weekly(N);
  const t0 = (N - 1) * tau;
  const at = (h) => B.bodyLevel(L, doses, 100, e, (t0 + h) * HOUR, levelAt);
  // trough: just before the next dose
  const trough = at(tau - 1e-6);
  near(trough.lo, 0.081, 0.02, 'trough lo'); near(trough.hi, 0.81, 0.02, 'trough hi');
  // peak, average over the interval
  let pLo = 0, pHi = 0, sLo = 0, sHi = 0, n = 0;
  for (let h = 0; h < tau; h += 0.25) { const v = at(h); pLo = Math.max(pLo, v.lo); pHi = Math.max(pHi, v.hi); sLo += v.lo; sHi += v.hi; n++; }
  near(pLo, 0.11, 0.025, 'peak lo'); near(pHi, 1.13, 0.02, 'peak hi');
  near(sLo / n, 0.10, 0.02, 'average lo'); near(sHi / n, 1.00, 0.02, 'average hi');
  near(at(84).lo, 0.11, 0.04, '84 h lo'); near(at(84).hi, 1.06, 0.02, '84 h hi');
  // the depot (mg of testosterone): just after the injection, at 47 h, at 84 h, just before the next
  near(at(0).depot, 163, 0.02, 'depot after'); near(at(47).depot, 143, 0.02, 'depot 47 h');
  near(at(84).depot, 126, 0.02, 'depot 84 h'); near(at(tau - 1e-6).depot, 93, 0.02, 'depot before');
  // the formula for the average (independent of t½_app)
  near(sHi / n, 0.6990 * 100 * (100 / 60) / (Math.LN2 * tau), 0.01, 'S·F·D·t½_true/(ln2·τ)');
});

test('DB-9: body numbers carry 2 significant figures (0.081 never reads "0,1")', () => {
  assert.equal(B.sig2(0.0809, 'pt'), '0,081');
  assert.equal(B.sig2(0.8152, 'pt'), '0,82');
  assert.equal(B.sig2(1.126, 'en'), '1.1');
  assert.equal(B.sig2(9.96, 'en'), '10');
  assert.equal(B.sig2(163.19, 'en'), '163');
  assert.equal(B.sig2(0.0004, 'en'), '< 0.001');
  assert.equal(B.sig2(0, 'en'), '0');
});
