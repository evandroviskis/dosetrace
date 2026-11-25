'use strict';
// "Dose no corpo" extended to 8 weeks (founder 2026-11-24, picture docs/design/onboarding-intro-controles.html
// at 8a6cb8df): part 1 as approved (Dia 0 / 7 / 14: 100, 150, 175 mg) with the axis title "Estimativa
// no corpo, em mg"; then the columns narrow, the legend becomes "Dose aplicada, toda semana" / "O que
// ainda resta das doses anteriores", Dia 21 to 49 come in, a dashed guide at dose / (1 - 0.5^(7/7)) =
// 200 mg, and the caption. Every number from lib/obFeatures remaining(), rounded like the app — never
// typed. The scene is 11,8 s (hold 11,2 s) and the timeline after it shifts (with and without the
// observation scene).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f) => read(f).replace(/^\s*\/\/.*$/gm, '');
const F = require('../lib/obFeatures');
const I = require('../lib/obIntro');
const { translations: tr } = require('../i18n/translations.js');

test('the 8-week series comes from remaining(): 100, 150, 175, 188, 194, 197, 198, 199 mg, nearing 200', () => {
  const cols = F.bodySeries();
  assert.equal(cols.length, 8);
  assert.deepEqual(cols.map((c) => c.day), [0, 7, 14, 21, 28, 35, 42, 49]);
  assert.deepEqual(cols.map((c) => Math.round(c.total)), [100, 150, 175, 188, 194, 197, 198, 199]);
  for (const c of cols) {
    assert.equal(c.segments.length, c.day / 7 + 1);
    assert.equal(c.segments[c.segments.length - 1].age, 0, 'the dose of that day on top');
    for (const x of c.segments) assert.equal(x.mg, F.remaining(F.BODY_EXAMPLE.dose, F.BODY_EXAMPLE.halfLifeDays, x.age));
  }
  assert.equal(F.bodyLimit(), F.BODY_EXAMPLE.dose / (1 - Math.pow(0.5, F.BODY_EXAMPLE.interval / F.BODY_EXAMPLE.halfLifeDays)));
  assert.equal(Math.round(F.bodyLimit()), 200);
  assert.deepEqual(F.bodyColumns(), cols.slice(0, 3), 'part 1 is the first three, as approved');
  assert.equal(F.BODY_EXAMPLE.weeks, 8);
});

test('timeline: the body scene is 11,8 s (hold 11,2 s), everything after it shifts, with and without the observation scene', () => {
  const W = I.makeIntro(true), N = I.makeIntro(false);
  assert.deepEqual(W.SCENES.map((s) => [s.key, s.start, s.end, s.hold]), [
    ['open', 0, 3500, 2900], ['syringe', 3500, 10000, 9400], ['body', 10000, 21800, 21200], ['reminders', 21800, 28300, 27700],
    ['obs', 28300, 34800, 34200], ['labs', 34800, 40300, 39700], ['end', 40300, 41800, 41800]]);
  assert.deepEqual(N.SCENES.map((s) => [s.key, s.start, s.end, s.hold]), [
    ['open', 0, 3500, 2900], ['syringe', 3500, 10000, 9400], ['body', 10000, 21800, 21200], ['reminders', 21800, 28300, 27700],
    ['labs', 28300, 33800, 33200], ['end', 33800, 35300, 35300]]);
  const B = W.BEATS.body;
  assert.deepEqual([B.in, B.sub, B.axis, B.cols, B.legend, B.line, B.foot, B.squeeze, B.legend2, B.labels2, B.more, B.guide, B.caption, B.out],
    [10100, 10500, 11300, [11300, 12800, 14300], 14300, [15500, 1400], 16200, [17300, 900], 17700, 17900, [18300, 18700, 19100, 19500, 19900], [18300, 500], 20400, 21300]);
  for (const X of [W, N]) for (const b of X.sceneBeats('body')) assert.ok(b.at + b.dur <= X.SCENES[2].hold, `body.${b.name} complete by the hold`);
  assert.ok(B.line[0] + B.line[1] <= B.squeeze[0], 'part 1 is drawn before the columns narrow');
});

test('component: axis title, narrowing columns, the new legend, the dashed guide and the caption; numbers never typed', () => {
  const s = code('components/OnboardingIntro.js');
  const body = s.slice(s.indexOf('const MG_PX = '), s.indexOf('function Press('));
  assert.ok(body.length > 500);
  for (const k of ['obi_body_axis', 'obi_body_leg_applied', 'obi_body_leg_left', 'obi_body_trend', 'obi_body_example', 'obi_body_leg_today', 'obi_body_leg_ago', 'obi_body_foot', 'obi_body_day', 'obi_body_you_take']) assert.match(body, new RegExp(`'${k}'`), k);
  assert.match(body, /bodySeries\(\)/);
  assert.match(body, /bodyLimit\(\)/);
  assert.match(body, /interpolateColor\(p, \[0, 1\], \[c\.data2, c\.data3\]\)/, 'the 7-days-ago tone turns into the leftover tone, in both themes');
  assert.match(body, /strokeDasharray=\{\[4, 4\]\}/, 'the dashed guide');
  assert.doesNotMatch(body, /\b(188|194|197|198|199|200)\b/, 'no typed totals');
  assert.match(s, /const BASE = y\(548\)/);
  assert.match(s, /const W2 = 26/);
  assert.match(s, /const MG2 = 1\.05/);
  assert.doesNotMatch(s, /animatedProps=\{[^}]*\bd\b/, 'the line is segments with animated ends, never an animated path d');
});

test('copy: the five new body keys in 6 languages, as the picture', () => {
  const want = {
    pt: ['Estimativa no corpo, em mg', 'Dose aplicada, toda semana: {dose}', 'O que ainda resta das doses anteriores', 'Você aplica {dose} por semana. O que ainda resta de cada dose se soma à próxima: depois de algumas semanas, a estimativa no corpo chega perto de {total}.', 'Exemplo estimado: {name}, meia-vida de {days} dias.'],
    en: ['Estimated amount in the body, mg', 'Dose taken, every week: {dose}', 'What is still left of the earlier doses', 'You take {dose} every week. What is left of each dose adds to the next one: after a few weeks, the estimate in the body gets close to {total}.', 'Estimated example: {name}, half-life of {days} days.'],
    es: ['Estimación en el cuerpo, en mg', 'Dosis aplicada, cada semana: {dose}', 'Lo que todavía queda de las dosis anteriores', 'Te aplicas {dose} cada semana. Lo que queda de cada dosis se suma a la siguiente: después de algunas semanas, la estimación en el cuerpo se acerca a {total}.', 'Ejemplo estimado: {name}, vida media de {days} días.'],
    fr: ['Estimation dans le corps, en mg', 'Dose prise, chaque semaine : {dose}', 'Ce qui reste des doses précédentes', 'Vous prenez {dose} chaque semaine. Ce qui reste de chaque dose s’ajoute à la suivante : après quelques semaines, l’estimation dans le corps approche {total}.', 'Exemple estimé : {name}, demi-vie de {days} jours.'],
    de: ['Geschätzte Menge im Körper, in mg', 'Genommene Dosis, jede Woche: {dose}', 'Was von den früheren Dosen noch übrig ist', 'Du nimmst jede Woche {dose}. Was von jeder Dosis übrig ist, kommt zur nächsten dazu: Nach einigen Wochen liegt die Schätzung im Körper nahe bei {total}.', 'Geschätztes Beispiel: {name}, Halbwertszeit {days} Tage.'],
    it: ['Stima nel corpo, in mg', 'Dose assunta, ogni settimana: {dose}', 'Ciò che resta ancora delle dosi precedenti', 'Assumi {dose} ogni settimana. Ciò che resta di ogni dose si somma alla successiva: dopo alcune settimane, la stima nel corpo si avvicina a {total}.', 'Esempio stimato: {name}, emivita di {days} giorni.'],
  };
  for (const [l, v] of Object.entries(want)) {
    assert.deepEqual(['obi_body_axis', 'obi_body_leg_applied', 'obi_body_leg_left', 'obi_body_trend', 'obi_body_example'].map((k) => tr[l][k]), v, l);
  }
});
