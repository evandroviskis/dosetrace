'use strict';
// "Dose no corpo" — the amount of each dose in the body (docs/specs/dose-in-body.md DB-1…DB-11; the
// model, every formula and parameter: docs/review/dose-in-body-params.md, pharmacometrician 2026-11-13).
// Pure math and wording, no React Native: runs under node --test.
//
// Per dose D (t = hours since the dose), with the app's apparent rates kd = ln2/t½_app and kr (from Tmax):
//   F1 (oil depot or flip-flop, with Tmax)   A = D·S·F·kd·kr/(kr−kd)·[g(kd,ke) − g(kr,ke)]
//   F1 without Tmax                          A = D·S·F·kd·g(kd,ke)
//   not released yet (the depot layer)       U = D·S·(kr·e^(−kd·t) − kd·e^(−kr·t))/(kr−kd)   (no Tmax: D·S·e^(−kd·t))
//   SC, not flip-flop                        A = today × S·F
// g(a,b) = (e^(−a·t) − e^(−b·t))/(b − a), whose limit when a = b is t·e^(−a·t) (DB-8). ke = ln2/t½_true. Every
// shape stays a sum of (t^p·)exponentials (lib/halfLives termsFraction), so lib/curveSampling carries it.
// Precision principle (founder 2026-10-26): a range stays a range (a band at t½_true lo and hi, or F lo and
// hi), an unknown F is a ceiling ("no máximo"), and nothing is invented.

const H = require('./halfLives');
const { formatNumber, unitText } = require('./localeFormat');

const EQUAL_RATES = 1e-9; // relative: below it two rates are the same and the limit form is used

// c·g(a, b) as terms.
function gTerms(a, b, c) {
  if (Math.abs(b - a) <= EQUAL_RATES * Math.max(a, b)) return [{ c, k: a, p: 1 }];
  return [{ c: c / (b - a), k: a, p: 0 }, { c: -c / (b - a), k: b, p: 0 }];
}
function mergeTerms(terms) {
  const by = new Map();
  for (const x of terms) {
    const key = x.k + ':' + (x.p || 0);
    const g = by.get(key);
    if (g) g.c += x.c; else by.set(key, { c: x.c, k: x.k, p: x.p || 0 });
  }
  return [...by.values()].filter((x) => x.c !== 0);
}
const scale = (terms, f) => terms.map((x) => ({ ...x, c: x.c * f }));
function rates(entry) {
  const kd = Math.LN2 / entry.hours;
  const kr = entry.tmaxHours ? H.riseRate(entry.hours, entry.tmaxHours) : null;
  return { kd, kr };
}
// The app's own amount curve (lib/halfLives amountFraction) as terms.
function apparentTerms(entry) {
  const { kd, kr } = rates(entry);
  if (!kr) return [{ c: 1, k: kd, p: 0 }];
  const c = kr / (kr - kd);
  return [{ c, k: kd, p: 0 }, { c: -c, k: kr, p: 0 }];
}
// The release rate from the depot (area 1 per unit dose): kd × the app's amount curve.
function releaseTerms(entry) {
  return scale(apparentTerms(entry), Math.LN2 / entry.hours);
}
// F1: the release convolved with the elimination e^(−ke·t) — each c·e^(−a·t) becomes c·g(a, ke).
function bodyTerms(entry, ke) {
  const out = [];
  for (const x of releaseTerms(entry)) out.push(...gTerms(x.k, ke, x.c));
  return mergeTerms(out);
}
// U: what is still at the injection site (1 at the injection, area 1/kd + 1/kr).
function unreleasedTerms(entry) {
  const { kd, kr } = rates(entry);
  if (!kr) return [{ c: 1, k: kd, p: 0 }];
  return [{ c: kr / (kr - kd), k: kd, p: 0 }, { c: -kd / (kr - kd), k: kr, p: 0 }];
}

// A line the curve can draw: the compound's entry with its own shape (terms) — the apparent half-life and
// Tmax stay for the look-back and the sampling; fastHours = the fastest change the shape has (DB-8: ln2/ke
// counts, so a fast rise is sampled, never drawn as chords; lib/serumModel curveDecaySamples).
function lineEntry(entry, terms, tag, fastHours) {
  const t = mergeTerms(terms);
  return Object.freeze({ ...entry, terms: Object.freeze(t), termsKey: tag + '|' + t.map((x) => `${x.c}:${x.k}:${x.p}`).join(','), fastHours: fastHours || null });
}

let KEY_OF = null;
function keyOfEntry(entry) {
  if (!KEY_OF) { KEY_OF = new Map(); for (const [k, e] of Object.entries(H.HALF_LIVES)) KEY_OF.set(e, k); }
  return KEY_OF.get(entry) || null;
}

// The body lines of a compound (memoized per entry):
//   kind  'band' (lo < hi) · 'value' (one number, F known) · 'ceiling' (F unknown or an upper bound: hi
//         only, "no máximo") · 'depotOnly' (no t½_true: only the depot, "Parte já no corpo: sem estudo") ·
//         'perDose' (dulaglutide: F per dose, resolved by bodyDoseLists)
//   hi / lo  the line at the upper / lower edge (null when not drawn); depot  U × S (oil esters) or null.
const LINES = new WeakMap();
function bodyLines(entry) {
  if (!entry) return null;
  const hit = LINES.get(entry);
  if (hit) return hit;
  const key = keyOfEntry(entry);
  const prm = key ? H.BODY_PARAMS[key] : null;
  if (!prm) return null;
  const S = prm.S.value;
  const F = prm.F;
  const ceiling = !!F.ceiling;
  const fHi = ceiling ? (F.bound || 1) : F.range ? F.range[1] : F.value != null ? F.value : 1;
  const fLo = ceiling ? null : F.range ? F.range[0] : F.value != null ? F.value : 1;
  const depot = prm.depotLayer ? lineEntry(entry, scale(unreleasedTerms(entry), S), key + ':depot') : null;
  let out;
  if (prm.model === 'depotOnly') {
    out = { kind: 'depotOnly', hi: null, lo: null, depot };
  } else if (prm.model === 'release') {
    const [tLo, tHi] = prm.tTrue.range;
    const ke = (h) => Math.LN2 / h;
    const hi = lineEntry(entry, scale(bodyTerms(entry, ke(tHi)), S * fHi), key + ':hi', tHi);
    const same = tLo === tHi && fLo === fHi;
    const lo = ceiling ? null : same ? hi : lineEntry(entry, scale(bodyTerms(entry, ke(tLo)), S * fLo), key + ':lo', tLo);
    out = { kind: ceiling ? 'ceiling' : same ? 'value' : 'band', hi, lo, depot };
  } else {
    // 'scaled': today × S·F. A ceiling with a longer labeled t½ (tesamorelin) is drawn at that t½.
    const hiEntry = prm.hoursHi ? { ...entry, hours: Math.max(entry.hours, prm.hoursHi.value) } : entry;
    const perDose = !!F.perDose;
    const hi = lineEntry(hiEntry, scale(apparentTerms(hiEntry), S * (perDose ? 1 : fHi)), key + ':hi');
    const same = fLo === fHi;
    const lo = ceiling ? null : (same || perDose) ? hi : lineEntry(entry, scale(apparentTerms(entry), S * fLo), key + ':lo');
    out = { kind: perDose ? 'perDose' : ceiling ? 'ceiling' : same ? 'value' : 'band', hi, lo, depot };
  }
  out = Object.freeze({ ...out, key, params: prm, parent: prm.parent || null, dashed: !!prm.dashed, depotLayer: !!prm.depotLayer });
  LINES.set(entry, out);
  return out;
}

// DB-5: dulaglutide's F for one dose (mg), from the label — never interpolated, never per protocol (AD-95).
// 0.75 mg → 0.65; 1.5 mg → 0.47; 3 and 4.5 mg → 0.47 "estimated" (the label's own word); between 0.75 and
// 1.5 → the band [0.47, 0.65]; between 1.5 and 4.5 both labeled neighbours are 0.47 → 0.47 estimated;
// below 0.75 or above 4.5 → no label value, a ceiling (F = 1).
const near = (a, b) => Math.abs(a - b) < 1e-6;
function dulaglutideF(doseMg) {
  const d = Number(doseMg);
  if (!(d > 0)) return { lo: null, hi: 1, ceiling: true, estimated: false };
  if (near(d, 0.75)) return { lo: 0.65, hi: 0.65, ceiling: false, estimated: false };
  if (near(d, 1.5)) return { lo: 0.47, hi: 0.47, ceiling: false, estimated: false };
  if (d > 0.75 && d < 1.5) return { lo: 0.47, hi: 0.65, ceiling: false, estimated: false };
  if (d > 1.5 && d < 4.5 + 1e-6) return { lo: 0.47, hi: 0.47, ceiling: false, estimated: true };
  return { lo: null, hi: 1, ceiling: true, estimated: false };
}
const PER_DOSE_F = { dulaglutide: dulaglutideF };

// The dose lists the lo and hi lines are computed on: the same list, except for a per-dose F, where each
// dose carries its own F in its weight (doses.w, AD-95). The doses that count at T (still ≥ 1 % of their
// release shape, as "Doses no nível") decide the kind at T: a ceiling dose → ceiling, a band dose → band.
const PER_DOSE_CACHE = new WeakMap();
function weighted(times, w) {
  const out = times.slice();
  Object.defineProperty(out, 'w', { value: Object.freeze(w), enumerable: false });
  return Object.freeze(out);
}
function bodyDoseLists(lines, doses, doseMg) {
  if (!lines || lines.kind !== 'perDose') return { lo: doses, hi: doses, fs: null };
  const list = doses || [];
  const memo = Object.isFrozen(list) ? PER_DOSE_CACHE.get(list) : null;
  if (memo && memo.doseMg === doseMg) return memo.value;
  const fOf = PER_DOSE_F[lines.params.F.perDose];
  const w = list.w || null;
  const fs = list.map((_, i) => fOf(doseMg * (w ? w[i] : 1)));
  const wHi = fs.map((f, i) => (w ? w[i] : 1) * f.hi);
  const wLo = fs.map((f, i) => (w ? w[i] : 1) * (f.lo == null ? 0 : f.lo));
  const value = { hi: weighted(list, wHi), lo: weighted(list, wLo), fs };
  if (Object.isFrozen(list)) PER_DOSE_CACHE.set(list, { doseMg, value });
  return value;
}
// The kind of a per-dose line at T, from the doses that still count then (af: the apparent amount curve).
function perDoseKind(lists, doses, entry, T, af = H.amountFraction) {
  let kind = 'value';
  let estimated = false;
  const list = doses || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] > T || af(entry, (T - list[i]) / 3600000) < 0.01) continue;
    const f = lists.fs[i];
    if (f.estimated) estimated = true;
    if (f.ceiling) kind = 'ceiling';
    else if (kind !== 'ceiling' && f.lo !== f.hi) kind = 'band';
  }
  return { kind, estimated };
}
// For drawing: any dose in the list with no label F → the line is a ceiling (no lower edge drawn).
function perDoseDrawKind(lists) {
  if (!lists.fs) return null;
  if (lists.fs.some((f) => f.ceiling)) return 'ceiling';
  return lists.fs.some((f) => f.lo !== f.hi) ? 'band' : 'value';
}

// The body level of one line at T: { kind, lo, hi, depot, estimated } in the curve's unit (×S already in).
// levelAt: (doses, doseMg, entry, T) → amount (lib/serumModel levelAt).
function bodyLevel(lines, doses, doseMg, entry, T, levelAt) {
  if (!lines) return null;
  const depot = lines.depot ? levelAt(doses, doseMg, lines.depot, T) : null;
  if (lines.kind === 'depotOnly') return { kind: 'depotOnly', lo: null, hi: null, depot, estimated: false };
  const lists = bodyDoseLists(lines, doses, doseMg);
  const hi = levelAt(lists.hi, doseMg, lines.hi, T);
  if (lines.kind === 'perDose') {
    const k = perDoseKind(lists, doses, entry, T);
    const lo = k.kind === 'ceiling' ? null : levelAt(lists.lo, doseMg, lines.lo, T);
    return { kind: k.kind, lo, hi, depot, estimated: k.estimated };
  }
  const lo = lines.kind === 'ceiling' ? null : lines.lo === lines.hi ? hi : levelAt(lists.lo, doseMg, lines.lo, T);
  return { kind: lines.kind, lo, hi, depot, estimated: false };
}

// Two body levels of one substance added (a combined total): the edges add edge to edge (one parent, one
// elimination: the lo edges go together); a ceiling member makes the total a ceiling.
function addBodyLevels(list) {
  const xs = (list || []).filter(Boolean);
  if (!xs.length) return null;
  const sum = (f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
  const kinds = new Set(xs.map((x) => x.kind));
  const kind = kinds.has('depotOnly') ? 'depotOnly' : kinds.has('ceiling') ? 'ceiling' : kinds.has('band') ? 'band' : 'value';
  const anyDepot = xs.some((x) => x.depot != null);
  return {
    kind,
    hi: kind === 'depotOnly' ? null : sum((x) => x.hi),
    lo: kind === 'depotOnly' || kind === 'ceiling' ? null : sum((x) => x.lo),
    depot: anyDepot ? sum((x) => x.depot) : null,
    estimated: xs.some((x) => x.estimated),
  };
}

// ── Wording (DB-9) ──────────────────────────────────────────────────────────────────────────────────
// Body numbers: 2 significant figures below 10 (0.081 reads "0,081", never "0,1"), whole numbers above.
function sig2(v, language = 'en') {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v < 0.001) return '< ' + formatNumber(0.001, language, { digits: 3 });
  const r = Number(v.toPrecision(2));
  if (r >= 10) return String(Math.round(v));
  const digits = Math.max(0, 1 - Math.floor(Math.log10(r) + 1e-12));
  return formatNumber(r, language, { digits });
}
// The unit of a body number: mg / mcg / IU, and for an ester the parent ("mg de testosterona").
function bodyUnit(unit, parent, t, language = 'en') {
  const u = unitText(unit, language);
  return parent ? t('body_unit_of').replace('{unit}', u).replace('{substance}', t(`body_parent_${parent}`)) : u;
}
// The display unit for a level: mcg when the curve reads in mcg (dose under 1 mg) or when the upper edge is
// under 0.05 mg (lib/serumModel seriesLevelText); both edges always in the same unit.
function displayOf(unit, doses, top) {
  const list = (doses || []).filter((d) => d > 0);
  if (unit === 'mg' && list.length && list.every((d) => d < 1)) return { unit: 'mcg', factor: 1000 };
  if (unit === 'mg' && top > 0 && top < 0.05) return { unit: 'mcg', factor: 1000 };
  return { unit: unit || 'mg', factor: 1 };
}
// The main text of a body level: "entre X e Y mg de testosterona" · "X mg" · "no máximo X mg" ·
// "Parte já no corpo: sem estudo". opts: { t, language, unit ('mg' | 'IU'), parent, doses (the doses in the
// curve's unit, for mcg) }.
function bodyLevelText(level, { t, language = 'en', unit = 'mg', parent = null, doses = [] } = {}) {
  if (!level) return '';
  if (level.kind === 'depotOnly') return t('body_no_study');
  const d = displayOf(unit, doses, level.hi);
  const u = bodyUnit(d.unit, parent, t, language);
  const n = (v) => sig2(v * d.factor, language);
  if (level.kind === 'ceiling') return t('body_at_most').replace('{v}', n(level.hi)).replace('{unit}', u);
  if (level.kind === 'band' && level.lo !== level.hi) {
    return t('body_between').replace('{lo}', n(level.lo)).replace('{hi}', n(level.hi)).replace('{unit}', u);
  }
  return `${n(level.hi)} ${u}`;
}
// The depot layer's line: "Ainda no local da aplicação, não liberado: 93 mg de testosterona" (or null).
function depotText(level, { t, language = 'en', unit = 'mg', parent = null } = {}) {
  if (!level || level.depot == null) return null;
  const d = displayOf(unit, [], level.depot);
  return t('body_depot_line').replace('{v}', sig2(level.depot * d.factor, language)).replace('{unit}', bodyUnit(d.unit, parent, t, language));
}

module.exports = {
  gTerms, apparentTerms, releaseTerms, bodyTerms, unreleasedTerms, lineEntry, bodyLines, dulaglutideF,
  bodyDoseLists, perDoseKind, perDoseDrawKind, bodyLevel, addBodyLevels, sig2, bodyUnit, displayOf, bodyLevelText, depotText,
  EQUAL_RATES,
};
