'use strict';
// "Dose no corpo" — where the level is shown (docs/specs/dose-in-body.md DB-2, DB-3, DB-6, DB-9; picture
// docs/design/curve-dose-in-body.html): the curve header, the Journey tile, "Estimar em uma data", the multi
// rows and the hours mode all read the same body level — the band "entre X e Y mg de testosterona", the
// ceiling "no máximo X", or "Parte já no corpo: sem estudo"; the depot is its own labeled layer.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/serumModel');
const H = require('../lib/halfLives');
const B = require('../lib/doseInBody');
const { translations: tr } = require('../i18n/translations.js');
const { takenAtEverySlot } = require('./helpers/curveLogs');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const NOW = new Date(2026, 10, 13, 10, 0).getTime();
const tPt = (k) => tr.pt[k] || k;
const proto = (name, dose, unit = 'mg', extra = {}) => ({ id: 7, type: 'recon', name, compound_id: null, dose: String(dose), dose_unit: unit, frequency: 'weekly', interval_days: 7, doses_per_day: 1, reminder_time: '09:00', start_date: '2026-05-04', created_at: '2026-05-04T12:00:00Z', active: 1, ...extra });

test('DB-9: the level now carries the body level (the tile and the curve read the same lines)', () => {
  const p = proto('Testosterone Cypionate', 100);
  const logs = takenAtEverySlot([p], NOW);
  const lv = M.estimatedLevelNow(p, NOW, { logs });
  assert.equal(lv.body.kind, 'band');
  assert.equal(lv.parent, 'testosterone');
  assert.ok(lv.body.lo > 0.05 && lv.body.lo < 0.2, `lo ${lv.body.lo}`);
  assert.ok(lv.body.hi > 0.5 && lv.body.hi < 2, `hi ${lv.body.hi}`);
  assert.ok(lv.body.depot > 80 && lv.body.depot < 200, `depot ${lv.body.depot}`);
  const text = B.bodyLevelText(lv.body, { t: tPt, language: 'pt', unit: 'mg', parent: lv.parent, doses: [100] });
  assert.match(text, /^entre 0,\d+ e (0|1),\d+ mg de testosterona$/);
  const tile = M.defaultCurveLevel([p], NOW, undefined, null, { logs, history: [p] });
  assert.deepEqual(tile.body, lv.body, 'tile == curve');
  assert.equal(tile.parent, 'testosterone');
});

test('DB-3 / DB-9: a depot-only ester reads "Parte já no corpo: sem estudo" and its depot in mg of the parent', () => {
  const p = proto('Nandrolone Decanoate', 200);
  const lv = M.estimatedLevelNow(p, NOW, { logs: takenAtEverySlot([p], NOW) });
  assert.equal(lv.body.kind, 'depotOnly');
  assert.equal(B.bodyLevelText(lv.body, { t: tPt, language: 'pt' }), 'Parte já no corpo: sem estudo');
  assert.match(B.depotText(lv.body, { t: tPt, language: 'pt', unit: 'mg', parent: lv.parent }), /^Ainda no local da aplicação, não liberado: \d+ mg de nandrolona$/);
  // its own scale: never on the axis of a body line
  assert.notEqual(M.curveAxisKind(H.HALF_LIVES['Nandrolone Decanoate']), M.curveAxisKind(H.HALF_LIVES['Testosterone Cypionate']));
  assert.equal(M.curveAxisKind(H.HALF_LIVES['Testosterone Cypionate']), 'mg');
  assert.equal(M.curveAxisKind(H.HALF_LIVES['HGH']), 'IU');
});

test('DB-6 / DB-9: a ceiling reads "no máximo X" in every language; tesamorelin is drawn dashed', () => {
  const p = proto('BPC-157', 250, 'mcg', { frequency: 'daily', interval_days: 1 });
  const lv = M.estimatedLevelNow(p, NOW, { logs: takenAtEverySlot([p], NOW) });
  assert.equal(lv.body.kind, 'ceiling');
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) {
    const parts = B.bodyLevelParts(lv.body, { t: (k) => tr[l][k], language: l, unit: 'mg', doses: [0.25] });
    assert.equal(parts.unit, 'mcg', l);
    assert.ok(parts.pre.length > 1, `${l}: the ceiling word`);
  }
  assert.equal(B.bodyLevelParts(lv.body, { t: tPt, language: 'pt', unit: 'mg', doses: [0.25] }).pre, 'no máximo');
  assert.equal(B.bodyLines(H.HALF_LIVES['Tesamorelin']).dashed, true);
});

test('DB-9: the date estimate reads the body level at that date (bodyOnDate), the same lines as the drawing', () => {
  const p = proto('Testosterone Enanthate', 150);
  const entry = H.getHalfLifeEntry(M.matchName(p));
  const logs = takenAtEverySlot([p], NOW);
  const start = M.curveGridStart(NOW, 3);
  const end = NOW + 7 * 864e5;
  const doses = M.curvePlan(p, entry, start, end, NOW, { logs }).doses;
  const T = NOW + 2 * 864e5;
  const b = M.bodyOnDate(p, entry, 150, doses, T, NOW, end, { logs });
  const direct = B.bodyLevel(B.bodyLines(entry), doses, 150, entry, T, M.levelAt);
  assert.deepEqual(b, direct);
  assert.equal(b.kind, 'band');
});

test('DB-9: the curve screen shows the body level everywhere the level is (hero, rows, readout, legend list, stats)', () => {
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /bodyLevelParts\(single\.body/, 'the hero');
  assert.match(src, /bodyText\(ser, ser\.body\)/, 'the multi rows and the legend list');
  assert.match(src, /bodyText\(ser, readoutBody\(ser, readoutT\)\)/, 'Estimar em uma data');
  assert.match(src, /depotText\(/, 'the depot layer line');
  assert.match(src, /t\('body_not_blood_test'\)/, 'a draw date carries "(não é o exame de sangue)"');
  assert.doesNotMatch(src, /mgLabel\(single\.nowLevel\)/, 'the old one-number hero is gone');
  assert.doesNotMatch(src, /levelText\(serLevel\(ser, ser\.nowLevel\)\)/, 'the old one-number rows are gone');
  // the band: the lower edge and the fill between the edges, from the theme tokens
  assert.match(src, /fill=\{single \? colors\.dataBand : lineColor\(ser\)\}/);
  assert.match(src, /colors\.depot/);
  // the depot-only line has its own axis (never shares one with a body line)
  assert.match(src, /curveAxisKind\(/);
  // the hours mode is the same screen: no separate level path
  assert.doesNotMatch(src, /hourMode \? levelLabel/);
});

test('DB-2 / DB-3 / DB-6: the notes under the chart say where each number comes from', () => {
  const keys = (k) => B.bodyNoteKeys(B.bodyLines(H.HALF_LIVES[k]), null, 1).map((n) => n.key);
  assert.deepEqual(keys('Testosterone Cypionate'), ['body_band_note_testosterone', 'body_depot_note']);
  assert.deepEqual(keys('Nandrolone Decanoate'), ['body_depot_only_note', 'body_depot_note']);
  assert.deepEqual(keys('Tesamorelin'), ['body_tesamorelin_note']);
  assert.deepEqual(keys('HCG'), ['body_hcg_note']);
  assert.deepEqual(keys('BPC-157'), ['body_ceiling_note']);
  assert.deepEqual(keys('EPO'), ['body_ceiling_note']);
  const sema = B.bodyNoteKeys(B.bodyLines(H.HALF_LIVES['Semaglutide']), null, 1, 'pt');
  assert.equal(sema[0].key, 'body_f_note');
  assert.equal(sema[0].pct, '89%');
  assert.equal(B.bodyNoteKeys(B.bodyLines(H.HALF_LIVES['FSH']), null, 75, 'fr')[0].pct, '70–78 %');
  const dula = (mg, level) => B.bodyNoteKeys(B.bodyLines(H.HALF_LIVES['Dulaglutide']), level, mg).map((n) => n.key);
  assert.deepEqual(dula(3, { kind: 'value', estimated: true }), ['body_f_note', 'body_f_estimated_note']);
  assert.deepEqual(dula(1, { kind: 'band', estimated: false }), ['body_f_dose_band_note']);
  assert.deepEqual(dula(0.5, { kind: 'ceiling', estimated: false }), ['body_ceiling_note']);
  const src = read('screens/SerumCurveScreen.js');
  assert.match(src, /bodyNoteKeys\(/);
});

test('DB-9: the Journey tile shows the band, the ceiling or "sem estudo", and the depot line', () => {
  const src = read('screens/JourneyScreen.js');
  assert.match(src, /bodyLevelParts\(level\.body/);
  assert.match(src, /depotText\(level\.body/);
  assert.doesNotMatch(src, /levelLabel\(level\.value \* level\.display\.factor/);
});

test('DB-9: the theme carries the band fill and the depot colour in both themes, readable on the card', () => {
  const src = read('lib/theme.js');
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const depots = [...src.matchAll(/ depot: '(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]);
  const bands = [...src.matchAll(/ dataBand: '(rgba\([^']+\))'/g)].map((m) => m[1]);
  assert.equal(depots.length, 2, 'depot in LIGHT and DARK');
  assert.equal(bands.length, 2, 'dataBand in LIGHT and DARK');
  assert.ok(ratio(depots[0], '#FFFFFF') >= 4.5, `light depot on raised: ${ratio(depots[0], '#FFFFFF')}`);
  assert.ok(ratio(depots[1], '#282B30') >= 4.5, `dark depot on raised: ${ratio(depots[1], '#282B30')}`);
});

test('DB-12 (strings): six languages for every new string, the approved pt wording, no advice', () => {
  const keys = Object.keys(tr.en).filter((k) => k.startsWith('body_') && !k.startsWith('body_card') && tr.pt[k] && /^body_(between|at_most|no_study|depot|not_blood|band_note|f_|ceiling|tesamorelin|hcg|lg_|unit_of|parent_)/.test(k));
  assert.ok(keys.length >= 28, `keys ${keys.length}`);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) assert.equal(typeof tr[l][k], 'string', `${l}.${k}`);
  assert.equal(tr.pt.body_no_study, 'Parte já no corpo: sem estudo');
  assert.equal(tr.pt.body_depot_label, 'Ainda no local da aplicação, não liberado');
  assert.equal(tr.pt.body_not_blood_test, '(não é o exame de sangue)');
  assert.match(tr.pt.body_at_most, /^no máximo \{v\}/);
  assert.match(tr.pt.body_depot_note, /^F = 1 é uma suposição para óleo IM/);
  assert.equal(tr.pt.body_between, 'entre {lo} e {hi} {unit}');
  const BANNED = {
    all: /recomend|recommend|raccomand|empfehl|ideal|otimiz|optimi|ottimizz|crash/i,
    en: /\bshould\b|\bbest time\b|\bavoid\b|\bmust\b/i,
    pt: /\bdev(e|em|eria|eriam)\b|melhor hora|melhor momento|\bevite\b|a gente|dá para|não deu/i,
    es: /\bdeb(e|es|en|ería|erías)\b|mejor (hora|momento)|\bevita\b/i,
    fr: /\bdev(ez|riez|rait)\b|\bil faut\b|meilleur moment|\bévitez\b|\btu\b/i,
    de: /\bsoll(te|test|st|en)?\b|\bmusst\b|\bvermeide\b|\bSie\b/,
    it: /\bdev(i|e|ono|resti)\b|momento migliore|\bconsigli|\bevita\b|\bLei\b/,
  };
  const hits = [];
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) for (const k of keys) if (BANNED.all.test(tr[l][k]) || BANNED[l].test(tr[l][k])) hits.push(`${l}.${k}`);
  assert.deepEqual(hits, []);
  // fr vous, es/de/it tu/du (the band note speaks to the person)
  assert.match(tr.fr.body_band_note_testosterone, /vous/);
  assert.match(tr.de.body_band_note_testosterone, /\bdu\b/);
  assert.match(tr.es.body_band_note_testosterone, /\bte\b|\btu\b/);
  assert.match(tr.it.body_band_note_testosterone, /\bhai\b|\btuo\b/);
});

// Simulator check 2026-11-13 (DB-12): the hero read "between / 0.055 and 0.55" with the unit "mg of testosterone"
// squeezed unreadable inside the number line (adjustsFontSizeToFit shrank it). As in the approved picture the
// large figure is the range "0,055–0,55" and the unit sits on its own readable line.
test('DB-9 (simulator): a band reads as the range "lo–hi" in large type; the sentence form keeps "entre … e …"', () => {
  const lv = { kind: 'band', lo: 0.0553, hi: 0.553 };
  const parts = B.bodyLevelParts(lv, { t: tPt, language: 'pt', unit: 'mg', parent: 'testosterone', doses: [100] });
  assert.equal(parts.pre, '');
  assert.equal(parts.num, '0,055–0,55');
  assert.equal(parts.unit, 'mg de testosterona');
  assert.match(B.bodyLevelText(lv, { t: tPt, language: 'pt', unit: 'mg', parent: 'testosterone', doses: [100] }), /^entre 0,055 e 0,55/);
});

test('DB-9 (simulator): the unit is never nested inside the shrinking number line (hero and Journey tile)', () => {
  const curve = read('screens/SerumCurveScreen.js');
  const journey = read('screens/JourneyScreen.js');
  assert.doesNotMatch(curve, /\{heroParts\.num\}<Text/);
  assert.doesNotMatch(journey, /\{bp\.num\}<Text/);
  assert.match(curve, /heroParts\.unit/);
  assert.match(journey, /bp\.unit/);
});

// Simulator check 2026-11-13: with the unit on its own line, the range alone in the 56 pt hero was shrunk by
// iOS adjustsFontSizeToFit to a few points. The size now follows the text's length (never below half) and the
// automatic shrink can never go under that floor.
test('DB-9 (simulator): the large range keeps a readable size (length-based, floor at half)', () => {
  assert.equal(B.heroFontSize('1,2', 56), 56);
  assert.ok(B.heroFontSize('0,055–0,55', 56) >= 28 && B.heroFontSize('0,055–0,55', 56) < 56);
  assert.equal(B.heroFontSize('0,0000123–0,000123', 56), 28);
  const curve = read('screens/SerumCurveScreen.js');
  const journey = read('screens/JourneyScreen.js');
  assert.match(curve, /heroFontSize\(heroParts\.num/);
  // iOS shrank the hero to a few points even with minimumFontScale (lineHeight set): the hero is sized by
  // length only, no automatic shrink.
  assert.doesNotMatch(curve.slice(curve.indexOf("heroFontSize(heroParts.num") - 200, curve.indexOf("heroFontSize(heroParts.num") + 300), /adjustsFontSizeToFit/);
  assert.match(journey, /heroFontSize\(bp\.num/);
});

// Simulator check 2026-11-13: the range line read "pico ≈ entre 0,082 e 0,82 mg" — "≈" before a range of
// studies says the same thing twice; a band's peak is the range itself.
test('DB-9 (simulator): a band\'s peak on the range line has no "≈"', () => {
  const curve = read('screens/SerumCurveScreen.js');
  assert.doesNotMatch(curve, /drawKind === 'band'\) return '≈ '/);
});

// Label re-read 2026-11-13: the estradiol elimination t½ has a primary source (White CM et al., Pharmacotherapy
// 1998;18(6):1343–6, PMID 9855336: IV terminal t½ 27.45 ± 5.65 min, 8 postmenopausal women), so the estradiol
// esters get the body band (mean ± SD) instead of "Parte já no corpo: sem estudo"; testosterone's 10–100 min is
// confirmed on the Aveed USPI §12.3.
test('DB-1 / DB-10 (label re-read): estradiol esters draw the body band with their source; testosterone cites Aveed', () => {
  for (const k of ['Estradiol Valerate', 'Estradiol Cypionate']) {
    const p = H.BODY_PARAMS[k];
    assert.equal(p.model, 'release', k);
    assert.equal(p.parent, 'estradiol');
    assert.match(p.tTrue.source, /PMID 9855336/);
  }
  assert.match(H.BODY_PARAMS['Testosterone Cypionate'].tTrue.source, /Aveed/);
  assert.equal(H.BODY_PARAMS['Testosterone Cypionate'].tTrue.status, 'confirmed');
  const keys = B.bodyNoteKeys(B.bodyLines(H.HALF_LIVES['Estradiol Valerate']), null, 5).map((x) => x.key);
  assert.deepEqual(keys, ['body_band_note_estradiol', 'body_depot_note']);
  for (const l of ['en', 'es', 'pt', 'fr', 'de', 'it']) assert.ok(tr[l].body_band_note_estradiol, `${l}`);
  assert.match(tr.pt.body_band_note_estradiol, /^Faixa: o estradiol/);
});
