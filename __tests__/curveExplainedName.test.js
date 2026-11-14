'use strict';
// The curve explained (docs/specs/curve-explained.md; picture docs/design/curve-explained.html, signed by
// the founder 2026-11-13). CE-1: the feature is called "Dose no corpo" everywhere it is named, with the
// line "estimativa por modelo farmacocinético (curva de Bateman)" under the screen title; CE-2: the fixed
// sentence under the title; CE-3: the chart card ends with the estimate footer; CE-9: the onboarding line
// names the feature and says what it shows, never that the amount "aumenta". Six languages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { translations: tr } = require('../i18n/translations.js');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];

// The approved picture's texts (its `T` object), so the Portuguese can never drift from it.
function pictureT() {
  const html = read('docs/design/curve-explained.html');
  const m = html.match(/const T = (\{[\s\S]*?\n\});/);
  return new Function(`return ${m[1]};`)(); // eslint-disable-line no-new-func
}
const T = pictureT();

const NAME = { en: 'Dose in the body', es: 'Dosis en el cuerpo', pt: 'Dose no corpo', fr: 'Dose dans le corps', de: 'Dosis im Körper', it: 'Dose nel corpo' };
// The old names of the feature, per language (any string still using one names it the old way).
const OLD = {
  en: /dose[- ]accumulation|accumulation curve|serum curve/i,
  pt: /acúmulo de doses?|curva de acúmulo|curva sérica/i,
  es: /acumulación de dosis|curva de acumulación|curva sérica/i,
  fr: /accumulation des? doses?|courbe d['’]accumulation|courbe sérique/i,
  de: /Dosis-Akkumulation|Akkumulationskurve|Serumkurve/i,
  it: /accumulo (delle|della) dos[ei]|curva di accumulo|curva sierica/i,
};
function strings(v, at, out) {
  if (typeof v === 'string') out.push([at, v]);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) strings(v[k], `${at}.${k}`, out);
  return out;
}

test('CE-1: the feature name is "Dose no corpo" in the title key, the onboarding title and the FAQ, ×6', () => {
  assert.equal(T.name, 'Dose no corpo');
  for (const l of LANGS) {
    assert.equal(tr[l].body_card_dosing_title, NAME[l], `${l}: tile, screen title, Premium tile, paywall row, app search`);
    assert.equal(tr[l].ob_feat2_t, NAME[l], `${l}: onboarding`);
    const qs = tr[l].faq_categories.flatMap((c) => c.questions);
    assert.ok(qs.some((q) => q.q.includes(NAME[l])), `${l}: the FAQ asks about ${NAME[l]}`);
    assert.ok(tr[l].faq_categories.some((c) => c.category === NAME[l]), `${l}: the FAQ group is named ${NAME[l]}`);
  }
});

test('CE-1: no string in any language still names the curve the old way', () => {
  const hits = [];
  for (const l of LANGS) {
    for (const [at, v] of strings(tr[l], l, [])) if (OLD[l].test(v)) hits.push(`${at}: ${v.slice(0, 80)}`);
  }
  assert.deepEqual(hits, []);
  // dead strings with the old name are gone (no screen read them)
  for (const l of LANGS) for (const k of ['curve_title', 'paywall_free_feat_11', 'paywall_coming_2']) assert.equal(tr[l][k], undefined, `${l}.${k}`);
});

test('CE-1: the line under the title names the Bateman curve, ×6 (pt as the picture)', () => {
  assert.equal(tr.pt.curve_sub, T.sub);
  for (const l of LANGS) {
    assert.ok(typeof tr[l].curve_sub === 'string' && tr[l].curve_sub.length > 10, l);
    assert.match(tr[l].curve_sub, /Bateman/, l);
  }
});

test('CE-2 / CE-3: the fixed sentence and the chart footer, ×6 (pt as the picture)', () => {
  assert.equal(tr.pt.curve_fixed, T.fixed);
  assert.equal(tr.pt.curve_foot, T.foot);
  for (const l of LANGS) {
    assert.ok(tr[l].curve_fixed && tr[l].curve_fixed.length > 60, `${l}.curve_fixed`);
    assert.ok(tr[l].curve_foot && tr[l].curve_foot.length > 40, `${l}.curve_foot`);
  }
  assert.match(tr.en.curve_fixed, /circulation/);
  assert.match(tr.en.curve_foot, /Not a measurement/);
});

test('CE-1 / CE-2 / CE-3: the curve screen draws the name, the Bateman line, the fixed sentence and the footer', () => {
  const src = read('screens', 'SerumCurveScreen.js');
  const head = src.slice(src.indexOf('const titleBlock'), src.indexOf('return (', src.indexOf('const titleBlock')));
  assert.match(head, /t\('body_card_dosing_title'\)/);
  const iName = head.indexOf("t('body_card_dosing_title')");
  const iSub = head.indexOf("t('curve_sub')");
  const iFixed = head.indexOf("t('curve_fixed')");
  assert.ok(iName > 0 && iSub > iName && iFixed > iSub, 'name, then the Bateman line, then the fixed sentence');
  assert.match(head, /<HelpMark\b/, 'the help mark at the end of the title row');
  // both screen states (empty and with protocols) use the same block
  assert.equal((src.match(/\{titleBlock\}/g) || []).length, 2);
  // the footer is the last line of the chart card, after the projection horizon bar
  const bar = src.indexOf('onChange={hourMode ? changeHours : changeHorizon}');
  const foot = src.indexOf("t('curve_foot')");
  const after = src.indexOf('{single ? (', bar);
  assert.ok(bar > 0 && foot > bar && foot < after, 'curve_foot closes the chart card');
});

test('CE-1: app search finds the curve by its new name and by "Bateman", ×6', () => {
  const { CATALOG } = require('../lib/appSearchCatalog.js');
  const d27 = CATALOG.find((d) => d.id === 'D27');
  assert.equal(d27.title, 'body_card_dosing_title');
  assert.doesNotMatch(d27.also || '', /Acúmulo/);
  for (const l of LANGS) assert.ok(d27.syn[l].includes('bateman'), `${l}: bateman`);
});

test('CE-9: the onboarding line says what the curve shows, never that the amount rises, ×6', () => {
  const RISE = /aument|increase|build up|builds up|sube|s’accumule|s'accumule|ansteigt|steigt|sale nel/i;
  assert.equal(tr.pt.ob_feat2_d, 'Estimativa, dia a dia, de quanto de cada dose que você registrou ainda não foi eliminado: picos, vales e acúmulo.');
  for (const l of LANGS) {
    const d = tr[l].ob_feat2_d;
    assert.doesNotMatch(d, RISE, `${l}: ${d}`);
    assert.ok(d.length > 50, l);
  }
  const ob = read('screens', 'OnboardingFlowScreen.js');
  assert.match(ob, /\{ icon: 'curve', t: t\('ob_feat2_t'\), d: t\('ob_feat2_d'\) \}/);
});
