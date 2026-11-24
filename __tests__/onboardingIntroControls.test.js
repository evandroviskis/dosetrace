'use strict';
// The intro video with controls (founder 2026-11-24, "Concordo... com o botão avançar e com o botão
// voltar"; picture docs/design/onboarding-intro-controles.html). The opening plays and goes on to
// the syringe by itself; from the syringe on each scene plays once and stops complete (its hold
// frame) until "Avançar"; "Voltar" shows the previous scene complete; "Pular" goes to the end frame;
// Android back = Voltar. And the dose-observation scene ("Anote como você se sentiu", approved the
// same day) between reminders and labs, behind ONE constant (lib/obIntro OBSERVATION_SCENE): it may
// reach users only together with the dose observation feature (feat/dose-observation).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const I = require('../lib/obIntro');
const { translations: tr } = require('../i18n/translations.js');

const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const code = (f) => read(f).replace(/^\s*\/\/.*$/gm, '');
const WITHOUT = I.makeIntro(false);
const WITH = I.makeIntro(true);

// ── the gate ──
test('OBSERVATION_SCENE is one exported constant, true on this branch (test APK); the default timeline follows it', () => {
  assert.equal(typeof I.OBSERVATION_SCENE, 'boolean');
  assert.equal(I.OBSERVATION_SCENE, true, 'feat/onboarding-protocol test APK shows the scene; publication sets it false unless feat/dose-observation ships in the same release');
  assert.deepEqual(I.SCENES, I.makeIntro(I.OBSERVATION_SCENE).SCENES);
  assert.match(read('lib/obIntro.js'), /OBSERVATION_SCENE = true;/);
  assert.match(read('lib/obIntro.js'), /feat\/dose-observation/, 'the comment says what publication must do');
  assert.match(code('components/OnboardingIntro.js'), /\bobs: ObservationScene\b/, 'the scene view is chosen by key, so false drops it');
});

test('OBSERVATION_SCENE false: exactly the six scenes, four story bars (body 11,8 s since 2026-11-24: 35,3 s)', () => {
  const T = WITHOUT;
  assert.deepEqual(T.SCENES.map((s) => s.key), ['open', 'syringe', 'body', 'reminders', 'labs', 'end']);
  assert.deepEqual(T.SCENES.map((s) => [s.start, s.end, s.hold]), [[0, 3500, 2900], [3500, 10000, 9400], [10000, 21800, 21200], [21800, 28300, 27700], [28300, 33800, 33200], [33800, 35300, 35300]]);
  assert.equal(T.INTRO_END, 35300);
  assert.deepEqual(T.STORY_BARS, ['syringe', 'body', 'reminders', 'labs']);
  assert.equal(T.BAR_W, 81);
  assert.deepEqual([0, 1, 2, 3].map(T.barLeft), [24, 111, 198, 285]);
  assert.equal(T.BEATS.labs.foot, 28300 + 3000, 'labs beats as before, after the longer body scene');
  assert.equal(T.BEATS.obs, undefined);
});

test('OBSERVATION_SCENE true: seven scenes, the observation between reminders and labs, five bars, as the picture', () => {
  const T = WITH;
  assert.deepEqual(T.SCENES.map((s) => s.key), ['open', 'syringe', 'body', 'reminders', 'obs', 'labs', 'end']);
  assert.deepEqual(T.SCENES.map((s) => [s.start, s.end, s.hold]), [[0, 3500, 2900], [3500, 10000, 9400], [10000, 21800, 21200], [21800, 28300, 27700], [28300, 34800, 34200], [34800, 40300, 39700], [40300, 41800, 41800]]);
  assert.equal(T.INTRO_END, 41800);
  assert.deepEqual(T.STORY_BARS, ['syringe', 'body', 'reminders', 'obs', 'labs']);
  assert.ok(Math.abs(T.BAR_W - 63.6) < 1e-9);
  assert.deepEqual([0, 1, 2, 3, 4].map((b) => Math.round(T.barLeft(b) * 10) / 10), [24, 93.6, 163.2, 232.8, 302.4]);
  // the picture's beats of the new scene (its start: 28,3 s since the 8-week body scene)
  const O = T.BEATS.obs;
  assert.deepEqual([O.in, O.out, O.sub, O.card, O.grow, O.marks, O.note, O.acts, O.type, O.press, O.actsOut, O.report, O.reportNote],
    [28400, 34300, 28800, 29200, [29800, 400], 30000, 30200, 30750, [30750, 1700], [32600, 200], [33000, 250], 33200, 33600]);
  // labs and the end frame play 6.5 s later than without the scene
  assert.equal(T.BEATS.labs.foot, WITHOUT.BEATS.labs.foot + 6500);
  assert.equal(T.BEATS.end.title, WITHOUT.BEATS.end.title + 6500);
  for (const s of T.SCENES) for (const b of T.sceneBeats(s.key)) assert.ok(b.at >= s.start && b.at + b.dur <= s.hold, `${s.key}.${b.name} complete by the hold frame`);
});

test('observation scene: Melatonin via oral_melatonin, 3 mg at 22:00, no mark chosen, the note typed letter by letter', () => {
  const F = require('../lib/obFeatures');
  assert.deepEqual(F.OBS_EXAMPLE, { nameKey: 'oral_melatonin', dose: '3', unit: 'mg', time: '22:00' });
  const T = WITH;
  const note = tr.pt.obi_obs_note;
  assert.equal(T.typedCount(T.BEATS.obs.type[0] - 1, note.length), 0);
  assert.equal(T.typedCount(T.BEATS.obs.type[0] + T.BEATS.obs.type[1] / 2, note.length), Math.round(note.length / 2));
  assert.equal(T.typedCount(T.SCENES[4].hold, note.length), note.length, 'the whole note at the hold frame');
  assert.deepEqual(I.noteLines(note, note.length), ['Antes de dormir.', 'Senti sono uma hora depois.']);
  assert.deepEqual(I.noteLines(note, 10), ['Antes de d', '']);
  assert.deepEqual(I.noteLines(note, 17), ['Antes de dormir.', '']);
  assert.deepEqual(I.noteLines(note, 20), ['Antes de dormir.', 'Sen']);
  const s = code('components/OnboardingIntro.js');
  const scene = s.slice(s.indexOf('function ObservationScene('), s.indexOf('function LabsScene('));
  assert.ok(scene.length > 300);
  for (const k of ['obi_obs_title', 'obi_obs_sub', 'obi_obs_note', 'obi_obs_report', 'obi_obs_ph', 'dose_mark_label', 'dose_mark_fasted', 'dose_mark_meal', 'dose_note_label', 'optional', 'today_taken', 'team_msg_today_at', 'cancel', 'save', 'report_header', 'report_dose_line', 'protocols_every_day', 'report_notes_label']) assert.match(scene, new RegExp(`'${k}'`), k);
  assert.match(scene, /OBS_EXAMPLE\.nameKey/);
  assert.doesNotMatch(scene, /pillOn|markOn|c\.data\b[^;]*fasted/, 'no mark is shown as chosen');
});

test('observation copy: the picture\'s words in 6 languages, and the feature\'s own keys', () => {
  const want = {
    pt: ['Anote como você se sentiu', 'Depois de cada dose, registre o que notou. Leve ao seu médico quando quiser.', 'Antes de dormir. Senti sono uma hora depois.', 'Relatório para o seu médico'],
    en: ['Note how you felt', 'After each dose, write down what you noticed. Take it to your doctor whenever you like.', 'Before bed. Felt sleepy an hour later.', 'Report for your doctor'],
    es: ['Anota cómo te sentiste', 'Después de cada dosis, escribe lo que notaste. Llévalo a tu médico cuando quieras.', 'Antes de dormir. Me dio sueño una hora después.', 'Informe para tu médico'],
    fr: ['Notez ce que vous avez ressenti', 'Après chaque dose, écrivez ce que vous avez remarqué. Montrez-le à votre médecin quand vous le souhaitez.', 'Avant le coucher. J\'ai eu sommeil une heure après.', 'Rapport pour votre médecin'],
    de: ['Notiere, wie du dich gefühlt hast', 'Schreib nach jeder Dosis auf, was dir aufgefallen ist. Zeig es deinem Arzt, wann immer du willst.', 'Vor dem Schlafengehen. Eine Stunde später wurde ich müde.', 'Bericht für deinen Arzt'],
    it: ['Annota cosa hai provato', 'Dopo ogni dose, scrivi cosa hai notato. Mostralo al tuo medico quando vuoi.', 'Prima di dormire. Ho avuto sonno un\'ora dopo.', 'Resoconto per il tuo medico'],
  };
  for (const [l, v] of Object.entries(want)) assert.deepEqual([tr[l].obi_obs_title, tr[l].obi_obs_sub, tr[l].obi_obs_note, tr[l].obi_obs_report], v, l);
  assert.deepEqual([tr.pt.dose_mark_label, tr.pt.dose_mark_fasted, tr.pt.dose_mark_meal, tr.pt.dose_note_label, tr.pt.optional, tr.pt.report_notes_label], ['Jejum ou refeição', 'Em jejum', 'Com refeição', 'Observação', 'Opcional', 'Observações:']);
  assert.equal(tr.pt.obi_obs_ph, 'Escreva o que quiser sobre esta dose…');
  for (const k of ['obi_obs_title', 'obi_obs_sub', 'obi_obs_note', 'obi_obs_report', 'obi_obs_ph', 'obi_next', 'dose_mark_label', 'dose_mark_fasted', 'dose_mark_meal', 'dose_note_label', 'optional', 'report_notes_label']) {
    for (const l of LANGS) {
      assert.ok(typeof tr[l][k] === 'string' && tr[l][k].trim(), `${l}.${k}`);
      assert.doesNotMatch(tr[l][k], /\p{Extended_Pictographic}/u);
    }
  }
  for (const l of LANGS) assert.ok(/\.\s/.test(tr[l].obi_obs_note), `${l}: two sentences, typed on two lines`);
});

// ── the controls (both timelines) ──
for (const [name, T] of [['without the observation scene', WITHOUT], ['with the observation scene', WITH]]) {
  const END = T.SCENES.length - 1;
  test(`controls (${name}): the opening plays and goes on to the syringe by itself, then stops there; the row shows from the syringe`, () => {
    const p = T.introStart({ reduced: false });
    assert.deepEqual(p, { cur: 1, from: 0, to: T.HOLDS[1], nav: false, cut: false });
    assert.equal(T.navShown(false, 2000), false, 'no buttons while the opening plays');
    assert.equal(T.navShown(false, T.STARTS[1]), true, 'the row once the syringe starts');
    assert.equal(T.navShown(true, 0), true, 'and it stays');
  });

  test(`controls (${name}): Avançar plays the next scene from the hold and stops on its hold; mid-scene it cuts straight to the next`, () => {
    for (let i = 1; i < END; i++) {
      assert.deepEqual(T.introNext(i, T.HOLDS[i], false), { cur: i + 1, from: T.HOLDS[i], to: T.HOLDS[i + 1], cut: false }, `scene ${i} held`);
      const mid = Math.round((T.STARTS[i] + T.HOLDS[i]) / 2);
      assert.deepEqual(T.introNext(i, mid, false), { cur: i + 1, from: T.STARTS[i + 1], to: T.HOLDS[i + 1], cut: true }, `scene ${i} playing`);
    }
    assert.deepEqual(T.introNext(0, T.HOLDS[0], false), { cur: 1, from: T.HOLDS[0], to: T.HOLDS[1], cut: false }, 'from the opening shown complete');
    assert.deepEqual(T.introNext(END, T.INTRO_END, false), { finish: true }, 'on the end frame the button is Começar');
    // nothing advances by itself: every play stops on a hold frame
    for (let i = 1; i < END; i++) assert.equal(T.introNext(i, T.HOLDS[i], false).to, T.HOLDS[i + 1]);
  });

  test(`controls (${name}): Voltar shows the previous scene complete, never replays; on the syringe it is the opening; none on the opening`, () => {
    for (let i = 2; i <= END; i++) assert.deepEqual(T.introBack(i, true), { cur: i - 1, from: T.HOLDS[i - 1], to: T.HOLDS[i - 1], cut: true });
    assert.deepEqual(T.introBack(1, true), { cur: 0, from: T.HOLDS[0], to: T.HOLDS[0], cut: true }, 'syringe → the opening, complete');
    assert.equal(T.introBack(0, true), null, 'the opening has no scene before it: the flow handles back');
    assert.equal(T.introBack(1, false), null, 'while the opening still plays by itself: the flow handles back');
  });

  test(`controls (${name}): Pular goes to the end frame and is hidden there; the buttons per scene`, () => {
    assert.deepEqual(T.introSkip(1), { cur: END, from: T.INTRO_END, to: T.INTRO_END, cut: true });
    assert.equal(T.introSkip(END), null);
    assert.deepEqual(T.controls(0, true), { row: true, back: false, skip: true, primary: 'obi_next' });
    assert.deepEqual(T.controls(1, false), { row: false, back: false, skip: true, primary: 'obi_next' });
    assert.deepEqual(T.controls(2, true), { row: true, back: true, skip: true, primary: 'obi_next' });
    assert.deepEqual(T.controls(END, true), { row: true, back: true, skip: false, primary: 'obi_start' });
  });

  test(`controls (${name}): Reduce Motion / screen reader — same buttons, each scene complete, no playback, no fade`, () => {
    assert.deepEqual(T.introStart({ reduced: true }), { cur: 0, from: T.HOLDS[0], to: T.HOLDS[0], nav: true, cut: false });
    for (let i = 0; i < END; i++) assert.deepEqual(T.introNext(i, T.HOLDS[i], true), { cur: i + 1, from: T.HOLDS[i + 1], to: T.HOLDS[i + 1], cut: false });
    assert.deepEqual(T.introNext(END, T.INTRO_END, true), { finish: true });
    // turned on mid-video: the scene on screen, complete
    assert.deepEqual(T.introReduce(T.STARTS[2] + 500), { cur: 2, from: T.HOLDS[2], to: T.HOLDS[2], nav: true, cut: false });
  });

  test(`controls (${name}): back into the video from the next step opens it on the end frame, never from the start`, () => {
    assert.deepEqual(T.introStart({ reduced: false, atEnd: true }), { cur: END, from: T.INTRO_END, to: T.INTRO_END, nav: true, cut: false });
    assert.deepEqual(T.introStart({ reduced: true, atEnd: true }), { cur: END, from: T.INTRO_END, to: T.INTRO_END, nav: true, cut: false });
  });

  test(`story bars (${name}): the current bar fills while its scene plays and is full at its hold; earlier full, later empty`, () => {
    const n = T.STORY_BARS.length;
    for (let b = 0; b < n; b++) {
      const sc = T.BAR_SCENES[b];
      assert.equal(T.barFill(T.STARTS[sc], b, false), 0);
      assert.equal(T.barFill(T.HOLDS[sc], b, false), 1, 'full when the scene stops');
      assert.equal(T.barFill((T.STARTS[sc] + T.HOLDS[sc]) / 2, b, false), 0.5);
      const at = T.HOLDS[sc];
      for (let o = 0; o < n; o++) if (o < b) assert.equal(T.barFill(at, o, false), 1); else if (o > b) assert.equal(T.barFill(at, o, false), 0);
    }
    assert.deepEqual(T.STORY_BARS.map((_, b) => T.barFill(T.HOLDS[0], b, false)), T.STORY_BARS.map(() => 0), 'the opening: all empty');
  });
}

// ── the component ──
test('component: Voltar / Avançar row where Começar was, Pular top right, no tap layer, accessibility kept', () => {
  const s = code('components/OnboardingIntro.js');
  assert.match(read('lib/obIntro.js'), /primary: cur >= END \? 'obi_start' : 'obi_next'/, 'Avançar, Começar on the end frame');
  assert.match(s, /t\('back'\)/);
  assert.match(s, /t\(ctl\.primary\)/, 'Avançar / Começar on the same pill');
  assert.match(s, /introNext\(/);
  assert.match(s, /introBack\(/);
  assert.match(s, /introSkip\(/);
  assert.match(s, /\{ctl\.back \?/, 'Voltar hidden on the opening');
  assert.match(s, /\{ctl\.skip \?/, 'Pular hidden on the end frame');
  assert.match(s, /\{ctl\.row \?/, 'the row shows once the syringe starts');
  assert.doesNotMatch(s, /obi_tap_next|tapNext|reducedNext/, 'the "Toque para continuar" layer is gone');
  assert.match(s, /accessibilityLabel=\{sceneLabel\(scene, ctx\)\}/, 'each scene read out');
  assert.match(s, /accessibilityLabel=\{t\('back'\)\}/);
  assert.match(s, /accessibilityLabel=\{t\(ctl\.primary\)\}/);
  assert.match(s, /backRef\.current = /, 'the flow reaches Voltar for the Android back');
  assert.match(s, /left: 24, top: y\(760\)/, 'the row sits where Começar was');
  for (const l of LANGS) assert.equal(tr[l].obi_tap_next, undefined, `${l}: obi_tap_next retired`);
  assert.deepEqual(['pt', 'en', 'es', 'fr', 'de', 'it'].map((l) => tr[l].obi_next), ['Avançar', 'Next', 'Siguiente', 'Suivant', 'Weiter', 'Avanti']);
});

test('component: Dose no corpo clear of the button row; the 100 mg label clear of the line across the column tops', () => {
  const s = code('components/OnboardingIntro.js');
  // the 2026-11-24 picture (8 weeks): base 548, day 552, sums 574, legend 600, footnote 662, caption 650
  assert.match(s, /const BASE = y\(548\)/);
  assert.match(s, /top: y\(552\)/);
  assert.match(s, /top: y\(574\)/);
  assert.match(s, /s\.legend, \{ top: y\(600\) \}/);
  assert.match(s, /s\.textBlock, \{ top: y\(662\) \}/);
  assert.match(s, /s\.textBlock, \{ top: y\(650\) \}/);
  // the line from the first column top rises 0.62 pt per pt; at the right edge of "100 mg" (17 pt
  // mono, ~61 pt wide) it must stay under the label's box bottom
  assert.match(s, /top: BASE - g\.total \* MG_PX - SUM_LIFT/);
  const lift = Number((s.match(/const SUM_LIFT = (\d+)/) || [])[1]);
  const F = require('../lib/obFeatures');
  const cols = F.bodyColumns();
  const slope = ((cols[1].total - cols[0].total) * 1.28) / 105;
  const rise = slope * 31; // 30,6 pt from the column centre to the label's right edge
  assert.ok(lift - 22 > rise + 3, `label box bottom ${lift - 22} pt above the top, line ${rise.toFixed(1)} pt`);
});

test('Android back on the video = Voltar; on the opening the flow steps back as before; back into the video opens the end frame', () => {
  const onb = code('screens/OnboardingFlowScreen.js');
  const bh = onb.slice(onb.indexOf("BackHandler.addEventListener('hardwareBackPress'"), onb.indexOf('return () => sub.remove();'));
  assert.match(bh, /if \(cur === 'intro' && introBack\.current && introBack\.current\(\)\) return true;/);
  assert.ok(bh.indexOf("cur === 'intro'") < bh.indexOf('if (step > 0) { back(); return true; }'), 'the video handles it first');
  assert.match(onb, /<OnboardingIntro onDone=\{next\} atEnd=\{introAtEnd\.current\} backRef=\{introBack\} onLanguage=\{\(\) => setShowLang\(true\)\} \/>/);
  assert.match(onb, /introAtEnd\.current = p === 'intro';/, 'Back from the step after the video opens it complete, never restarts it');
  const intro = code('components/OnboardingIntro.js');
  assert.match(intro, /introStart\(\{ reduced, atEnd \}\)/);
});

test('funnel: skipped / finished kept and truthful with the controls', () => {
  const s = code('components/OnboardingIntro.js');
  assert.match(s, /function skip\(\) \{[^}]*onboardingFunnel\.intro\('skipped'\)/);
  assert.match(s, /onboardingFunnel\.intro\('finished'\); onDone\(\);/);
  assert.equal((s.match(/onDone\(/g) || []).length, 1, 'onDone from Começar only');
});
