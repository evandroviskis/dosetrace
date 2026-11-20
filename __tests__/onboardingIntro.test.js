'use strict';
// The onboarding intro video (docs/specs/onboarding-protocol.md OB-1..OB-7 and OB-27; approved
// picture docs/design/onboarding-intro.html, founder 2026-11-20): one continuous ~32 s video that
// plays by itself and replaces the five separate feature screens. Scenes in the approved order and
// timings, the example numbers from the app's own math, the story bars, Skip to the end frame,
// "Start" as the only way on, Reduce Motion = each scene complete and a tap to go on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const exists = (f) => fs.existsSync(path.join(__dirname, '..', f));
const I = require('../lib/obIntro');
const F = require('../lib/obFeatures');
const O = require('../lib/onboardingSteps');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const SRC = 'components/OnboardingIntro.js';
const src = () => read(SRC);
const code = () => src().replace(/^\s*\/\/.*$/gm, '');

function palettes() {
  const s = read('lib/theme.js');
  const grab = (name) => {
    const i = s.indexOf(`export const ${name} = {`);
    const body = s.slice(i, s.indexOf('\n};', i));
    const o = {};
    for (const m of body.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) if (!(m[1] in o)) o[m[1]] = m[2];
    return o;
  };
  return { LIGHT: grab('LIGHT'), DARK: grab('DARK') };
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ── OB-1: the order ──
test('OB-1: splash, then the intro video, then How DoseTrace can help; the five feature steps are gone', () => {
  assert.deepEqual(O.STEPS.slice(0, 3), ['splash', 'intro', 'help']);
  assert.ok(!O.STEPS.some((s) => /^feat_/.test(s)), 'no separate feature screens');
  assert.equal(O.FEATURE_STEPS, undefined);
  assert.equal(O.featureKind, undefined);
  assert.equal(O.skipTarget('intro'), null, 'Skip in the video goes to its own end frame, not to another step');
  assert.equal(O.canContinue('intro', {}), true);
  assert.equal(O.nextStep(O.activeSteps({ signedIn: false, protocol: {} }), 'intro'), 'help', 'Start continues to How DoseTrace can help');
  assert.ok(!O.activeSteps({ signedIn: true, missing: ['goal'], consentAccepted: true }).includes('intro'), 'signed-in gate: no video');
  assert.ok(!O.activeSteps({ mode: 'builder', protocol: {} }).includes('intro'), 'builder: no video');
});

test('OB-1: the old feature screens and the "n of 5" kicker are removed (rebuild = replace)', () => {
  assert.equal(exists('components/OnboardingFeatures.js'), false);
  assert.equal(F.featureKicker, undefined);
  assert.equal(F.FEATURE_KINDS, undefined);
  assert.equal(F.PROTOCOL_EXAMPLE, undefined);
  for (const l of LANGS) {
    const left = Object.keys(tr[l]).filter((k) => k.startsWith('obf_'));
    assert.deepEqual(left, [], `${l}: old feature-screen keys left`);
  }
});

// ── OB-27: the timeline ──
test('OB-27: six scenes in the approved order and timings, about 32 s, one after the other', () => {
  assert.deepEqual(I.SCENES.map((s) => s.key), ['open', 'syringe', 'body', 'reminders', 'labs', 'end']);
  assert.deepEqual(I.SCENES.map((s) => s.start), [0, 3500, 10000, 18500, 25000, 30500]);
  for (let i = 1; i < I.SCENES.length; i++) assert.equal(I.SCENES[i].start, I.SCENES[i - 1].end, `${I.SCENES[i].key} starts where the one before ends`);
  assert.equal(I.INTRO_END, I.SCENES[I.SCENES.length - 1].end);
  assert.ok(I.INTRO_END >= 31800 && I.INTRO_END <= 33000, `${I.INTRO_END} ms`);
  assert.deepEqual(I.STORY_BARS, ['syringe', 'body', 'reminders', 'labs']);
});

test('OB-27: every element of a scene is complete at its hold frame, and the scene leaves only after it', () => {
  for (const s of I.SCENES) {
    const beats = I.sceneBeats(s.key);
    assert.ok(beats.length >= 3, `${s.key}: ${beats.length} beats`);
    for (const b of beats) {
      assert.ok(b.at >= s.start, `${s.key}.${b.name} starts in its scene`);
      assert.ok(b.at + b.dur <= s.hold, `${s.key}.${b.name} complete by the hold frame (${b.at + b.dur} > ${s.hold})`);
    }
    const out = I.BEATS[s.key].out;
    if (s.key === 'end') assert.equal(out, undefined, 'the end frame never leaves');
    else assert.ok(out >= s.hold && out + I.OUT_DUR <= s.end, `${s.key} leaves after its hold, before the next scene`);
    assert.ok(s.hold > s.start && s.hold <= s.end);
  }
  // the order of the beats inside the scenes follows the picture
  const B = I.BEATS;
  assert.ok(B.syringe.rows.every((r, i) => i === 0 || r > B.syringe.rows[i - 1]), 'rows appear one by one');
  assert.ok(B.syringe.rows[3] < B.syringe.calc && B.syringe.calc < B.syringe.fill[0] && B.syringe.fill[0] + B.syringe.fill[1] <= B.syringe.result);
  assert.ok(B.body.cols[0] < B.body.cols[1] && B.body.cols[1] < B.body.cols[2] && B.body.cols[2] < B.body.line[0] && B.body.line[0] < B.body.foot);
  assert.ok(B.reminders.n1[0] < B.reminders.taken[0] && B.reminders.taken[0] < B.reminders.chip && B.reminders.chip < B.reminders.n2[0] && B.reminders.n2[0] < B.reminders.snooze[0]);
  assert.ok(B.labs.cards.every((c, i) => i === 0 || c > B.labs.cards[i - 1]), 'lab cards one by one');
  assert.ok(B.end.title < B.end.button, 'the headline before the button');
});

test('OB-27: scene at a time, story-bar fill, Skip to the end frame', () => {
  assert.equal(I.sceneIndexAt(0), 0);
  assert.equal(I.sceneIndexAt(3499), 0);
  assert.equal(I.sceneIndexAt(3500), 1);
  assert.equal(I.sceneIndexAt(20000), 3);
  assert.equal(I.sceneIndexAt(30500), 5);
  assert.equal(I.sceneIndexAt(99999), 5);
  // each bar fills during its own scene (syringe = bar 0 … labs = bar 3)
  assert.deepEqual([0, 1, 2, 3].map((b) => I.barFill(2000, b, false)), [0, 0, 0, 0]);
  assert.equal(I.barFill(3500 + 3250, 0, false), 0.5);
  assert.deepEqual([0, 1, 2, 3].map((b) => I.barFill(19000, b, false)).map((v) => Math.round(v * 100) / 100), [1, 1, 0.08, 0]);
  assert.deepEqual([0, 1, 2, 3].map((b) => I.barFill(I.INTRO_END, b, false)), [1, 1, 1, 1]);
  // Reduce Motion: a bar is full as soon as its scene shows, never a partial fill
  assert.deepEqual([0, 1, 2, 3].map((b) => I.barFill(I.SCENES[2].hold, b, true)), [1, 1, 0, 0]);
  assert.equal(I.skipTime(), I.INTRO_END, 'Skip shows the end frame, complete');
  assert.equal(I.sceneIndexAt(I.skipTime()), 5);
  assert.ok(I.INTRO_END >= I.BEATS.end.button + I.IN_DUR, 'the Start button is complete at the end frame');
});

test('OB-27 / Reduce Motion: each scene is shown complete and a tap goes to the next; the end frame waits for Start', () => {
  assert.equal(I.reducedStart(), I.SCENES[0].hold);
  const seen = [I.reducedStart()];
  for (let i = 0; i < 10; i++) seen.push(I.reducedNext(seen[seen.length - 1]));
  assert.deepEqual(seen.slice(0, 6), I.SCENES.map((s) => s.hold));
  assert.ok(seen.slice(5).every((v) => v === I.INTRO_END), 'no advance past the end frame');
});

// ── OB-3: syringe ──
test('OB-3: the syringe example is 10 mg in 2 mL, a 1,5 mg dose: 30 units, 0,3 mL, from the app dose math', () => {
  const ex = F.SYRINGE_EXAMPLE;
  assert.deepEqual([ex.amount, ex.unit, ex.water, ex.dose, ex.doseUnit, ex.syringeSize], ['10', 'mg', '2', '1.5', 'mg', 100]);
  assert.equal(F.syringeUnits(), 30);
  assert.equal(F.syringeMl(), 0.3);
  assert.match(read('lib/obFeatures.js'), /computeDraw\(/, 'lib/doseMath computeDraw, never typed');
  const s = src();
  assert.match(s, /syringeUnits\(\)/);
  assert.match(s, /syringeMl\(\)/);
  assert.match(s, /syringeParts\(/, 'the app syringe drawing (lib/syringeGeometry, as SyringeScale)');
  assert.match(s, /<SyringeScale /, 'the final frame is the app SyringeScale itself');
  assert.match(s, /demoDec\(/, 'decimals in the app language (1,5 mg / 0,3 mL)');
});

// ── OB-4: dose in body ──
test('OB-4: the columns come from the half-life formula: 100, 50 + 100, 25 + 50 + 100', () => {
  const cols = F.bodyColumns();
  assert.deepEqual(cols.map((c) => c.day), [0, 7, 14]);
  assert.deepEqual(cols.map((c) => c.total), [100, 150, 175]);
  assert.deepEqual(cols.map((c) => c.segments.map((x) => x.mg)), [[100], [50, 100], [25, 50, 100]], 'oldest at the bottom');
  assert.deepEqual(cols.map((c) => c.segments.map((x) => x.age)), [[0], [7, 0], [14, 7, 0]]);
  for (const c of cols) for (const x of c.segments) assert.equal(x.mg, F.remaining(F.BODY_EXAMPLE.dose, F.BODY_EXAMPLE.halfLifeDays, x.age));
  assert.deepEqual(F.BODY_AGES, [0, 7, 14]);
  const s = src();
  assert.match(s, /bodyColumns\(\)/);
  for (const k of ['obi_body_title', 'obi_body_sub', 'obi_body_day', 'obi_body_you_take', 'obi_body_leg_today', 'obi_body_leg_ago', 'obi_body_foot']) assert.match(s, new RegExp(`'${k}'`), k);
  assert.match(s, /strokeDashoffset/, 'the line draws across the tops with stroke-dashoffset');
});

test('OB-4: each dose age has its own data tone, in both themes, with readable values inside', () => {
  const { LIGHT, DARK } = palettes();
  for (const [name, P] of [['light', LIGHT], ['dark', DARK]]) {
    assert.ok(P.data2 && P.data3, `${name}: data2 / data3 tokens`);
    assert.notEqual(P.data2, P.data);
    assert.notEqual(P.data3, P.data2);
    assert.ok(ratio(P.onData, P.data) >= 4.5, `${name}: value on today`);
    assert.ok(ratio(P.ink, P.data2) >= 4.5, `${name}: value on 7 days ago (${ratio(P.ink, P.data2).toFixed(2)})`);
    assert.ok(ratio(P.ink, P.data3) >= 4.5, `${name}: value on 14 days ago`);
  }
  assert.match(src(), /c\.data2/);
  assert.match(src(), /c\.data3/);
});

// ── OB-5: reminders ──
test('OB-5: the notification for Compound 1 at 08:00, Taken, logged at 08:02, then Supplement A and Snooze', () => {
  assert.deepEqual(F.REMINDER_EXAMPLE, { first: '08:00', logged: '08:02' });
  const s = src();
  for (const k of ['obi_rem_title', 'obi_rem_now', 'obi_rem_msg', 'obi_rem_taken', 'obi_rem_snooze', 'obi_rem_done', 'obi_ex_compound1', 'obi_ex_supplement']) assert.match(s, new RegExp(`'${k}'`), k);
  assert.match(s, /formatTime\(/, 'times in the person\'s format');
});

// ── OB-6: labs ──
test('OB-6: labs show Glucose, LDL and Vitamin D with every value and its month, one neutral colour, no ranges', () => {
  assert.deepEqual(F.LAB_EXAMPLE.map((m) => m.key), ['glucose', 'ldl', 'vitd']);
  assert.deepEqual(F.LAB_EXAMPLE.map((m) => m.values), [[94, 90, 96, 91, 92], [112, 121, 115, 120, 118], [31, 36, 33, 35, 34]]);
  assert.deepEqual(F.LAB_MONTHS, [2, 5, 7, 9, 10]);
  for (const m of F.LAB_EXAMPLE) assert.equal(F.isMonotone(m.values), false, `${m.key} must not read as a trend`);
  const s = src();
  const labs = s.slice(s.indexOf('function LabsScene('), s.indexOf('// ---- end labs'));
  assert.ok(labs.length > 200);
  assert.match(labs, /MONTHS_SHORT\[/);
  assert.match(labs, /String\(v\)/);
  const tones = new Set(labs.match(/c\.(data2|data3|data|ok|risk|attention|emph|depot|dataBand)\b/g) || []);
  assert.deepEqual([...tones], ['c.data'], 'one neutral data colour');
  assert.doesNotMatch(labs, /range|zone|target|reference|band|normal|optimal/i);
  assert.match(labs, /'obi_lab_foot'/);
});

// ── OB-7: end frame / OB-27 controls ──
test('OB-7 / OB-27: Skip always shown, Start only on the end frame, no auto-advance from the end', () => {
  const s = code();
  assert.match(s, /'ob_skip'/);
  assert.match(s, /'obi_start'/);
  assert.match(s, /'obi_end'/);
  assert.match(s, /skipTime\(\)/, 'Skip jumps to the end frame');
  const calls = s.match(/onDone\(/g) || [];
  assert.equal(calls.length, 1, 'onDone is called from one place only (the Start button)');
  assert.match(s, /onPress=\{start\}/);
  assert.match(s, /pointerEvents=\{startOn \? 'auto' : 'none'\}/, 'Start cannot be tapped before it shows');
});

test('OB-27: motion on the UI thread — one clock, transform / opacity / dashoffset, Reduce Motion and screen readers honoured', () => {
  const s = code();
  assert.match(s, /useReducedMotion\(\)/);
  assert.match(s, /isScreenReaderEnabled/);
  assert.match(s, /withTiming\(INTRO_END/);
  assert.equal((s.match(/withTiming\(/g) || []).length, 1, 'one clock');
  assert.doesNotMatch(s, /withRepeat|withSpring|setInterval|setTimeout|Animated\.timing|runOnJS/);
  assert.match(s, /scheduleOnRN\(/);
  assert.match(s, /cancelAnimation\(/);
  assert.match(s, /reducedNext\(/);
  assert.doesNotMatch(s, /animatedProps=\{[^}]*\bd\b/, 'no animated path d');
});

test('OB-27: the flow shows the video full screen on the intro step and Start goes on', () => {
  const onb = read('screens/OnboardingFlowScreen.js');
  assert.match(onb, /import OnboardingIntro from '\.\.\/components\/OnboardingIntro';/);
  assert.match(onb, /cur === 'intro' \? \(\s*<OnboardingIntro onDone=\{next\} \/>/);
  assert.doesNotMatch(onb, /OnboardingFeature\b|isFeature|featureKind|FEATURE_STEPS/);
  assert.match(onb, /\(step > 0 \|\| signedIn\) && cur !== 'intro' &&/, 'the flow top bar is hidden on the video');
  assert.match(onb, /\{cur !== 'intro' && \(\s*<View style=\{\[s\.footer/, 'the flow footer is hidden on the video');
});

// ── copy ──
const KEYS = [
  'obi_open', 'obi_example', 'obi_syr_title', 'obi_syr_l_compound', 'obi_syr_l_vial', 'obi_syr_l_diluent', 'obi_syr_l_dose',
  'obi_ex_compound1', 'obi_syr_calc', 'obi_syr_draw', 'obi_body_title', 'obi_body_sub', 'obi_body_day', 'obi_body_you_take',
  'obi_body_leg_today', 'obi_body_leg_ago', 'obi_body_foot', 'obi_rem_title', 'obi_rem_now', 'obi_rem_msg', 'obi_rem_taken',
  'obi_rem_snooze', 'obi_rem_done', 'obi_ex_supplement', 'obi_lab_title', 'obi_lab_glucose', 'obi_lab_ldl', 'obi_lab_vitd',
  'obi_lab_foot', 'obi_end', 'obi_start', 'obi_tap_next', 'obi_a11y_video',
];
test('every intro copy key exists in the 6 languages, with the same placeholders, and every obi_ key is used', () => {
  const used = new Set([...src().matchAll(/'(obi_[a-z0-9_]+)'/g), ...read('lib/obFeatures.js').matchAll(/'(obi_[a-z0-9_]+)'/g)].map((m) => m[1]));
  for (const k of KEYS) assert.ok(used.has(k), `${k} used`);
  for (const k of Object.keys(tr.en).filter((x) => x.startsWith('obi_'))) assert.ok(used.has(k), `unused key ${k}`);
  for (const k of KEYS) {
    const ph = (v) => (v.match(/\{[a-z]+\}/g) || []).sort().join(',');
    for (const l of LANGS) {
      assert.ok(typeof tr[l][k] === 'string' && tr[l][k].trim().length > 0, `${l}.${k}`);
      assert.equal(ph(tr[l][k]), ph(tr.en[k]), `${l}.${k} placeholders`);
      assert.doesNotMatch(tr[l][k], /\p{Extended_Pictographic}/u, `${l}.${k}`);
    }
  }
});

test('the Portuguese copy is the approved picture, word for word; English as approved', () => {
  const pt = tr.pt, en = tr.en;
  const f = (s, v) => Object.keys(v).reduce((o, k) => o.split(`{${k}}`).join(String(v[k])), s);
  assert.equal(pt.obi_open, 'Conheça o DoseTrace');
  assert.equal(pt.obi_syr_title, 'Quanto puxar na seringa, sem fazer conta');
  assert.deepEqual([pt.obi_example, pt.obi_syr_l_compound, pt.obi_syr_l_vial, pt.obi_syr_l_diluent, pt.obi_syr_l_dose], ['Exemplo', 'Composto', 'No frasco', 'Diluente', 'Sua dose']);
  assert.equal(pt.obi_ex_compound1, 'Composto 1');
  assert.equal(pt.obi_syr_calc, 'Calculamos para você');
  assert.equal(f(pt.obi_syr_draw, { n: 30 }), 'Puxe 30 unidades');
  assert.equal(pt.obi_body_title, 'Quanto ainda resta no corpo?');
  assert.equal(pt.obi_body_sub, 'Todo composto tem meia-vida: o tempo que o corpo leva para eliminar metade dele.');
  assert.equal(f(pt.obi_body_day, { n: 14 }), 'Dia 14');
  assert.equal(f(pt.obi_body_you_take, { n: 100 }), 'você aplica 100');
  assert.equal(pt.obi_body_leg_today, 'Dose de hoje');
  assert.equal(f(pt.obi_body_leg_ago, { n: 7 }), 'Dose de 7 dias atrás');
  assert.equal(f(pt.obi_body_foot, { name: 'Composto 1', days: 7 }), 'Cada dose nova soma com o que ainda resta das anteriores. Exemplo: Composto 1, meia-vida de 7 dias.');
  assert.equal(pt.obi_rem_title, 'Um aviso na hora de cada dose');
  assert.equal(`DoseTrace · ${pt.obi_rem_now}`, 'DoseTrace · agora');
  assert.equal(f(pt.obi_rem_msg, { name: pt.obi_ex_supplement }), 'Hora da dose: Suplemento A');
  assert.deepEqual([pt.obi_rem_taken, pt.obi_rem_snooze], ['Tomei', 'Adiar']);
  assert.equal(f(pt.obi_rem_done, { time: '08:02' }), 'Dose registrada às 08:02');
  assert.equal(pt.obi_lab_title, 'Seus exames, ao longo do tempo');
  assert.deepEqual([pt.obi_lab_glucose, pt.obi_lab_ldl, pt.obi_lab_vitd], ['Glicose', 'Colesterol LDL', 'Vitamina D']);
  assert.equal(pt.obi_lab_foot, 'Exemplo, valores fictícios. O DoseTrace registra seus exames; não interpreta resultados.');
  assert.equal(pt.obi_end, 'Tudo o que você toma, numa linha só.');
  assert.equal(pt.obi_start, 'Começar');
  assert.equal(pt.ob_skip, 'Pular');
  assert.equal(en.obi_open, 'Meet DoseTrace');
  assert.equal(en.obi_syr_title, 'How much to draw into the syringe, no math needed');
  assert.equal(en.obi_syr_calc, 'We do the math for you');
  assert.equal(f(en.obi_syr_draw, { n: 30 }), 'Draw 30 units');
  assert.equal(en.obi_body_title, 'How much is still in your body?');
  assert.equal(en.obi_body_sub, 'Every compound has a half-life: the time your body takes to clear half of it.');
  assert.equal(en.obi_body_leg_today, 'Dose today');
  assert.equal(f(en.obi_body_leg_ago, { n: 14 }), 'Dose from 14 days ago');
  assert.equal(en.obi_rem_title, 'A reminder at every dose time');
  assert.deepEqual([en.obi_rem_taken, en.obi_rem_snooze], ['Taken', 'Snooze']);
  assert.equal(f(en.obi_rem_done, { time: '08:02' }), 'Dose logged at 08:02');
  assert.equal(en.obi_lab_title, 'Your labs, over time');
  assert.equal(en.obi_end, 'Everything you take. One line.');
  assert.equal(en.obi_start, 'Start');
  assert.equal(en.ob_skip, 'Skip');
});

test('the intro is drawn with theme tokens only: no raw colour, no emoji; examples only, never her data', () => {
  const s = code();
  assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b|'white'|'black'|rgba?\(/);
  assert.doesNotMatch(src(), /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(s, /supabase|fetch\(|useProtocols|getDb|AsyncStorage/, 'no data of hers, no network');
});
