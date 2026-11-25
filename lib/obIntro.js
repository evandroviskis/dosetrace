'use strict';
// The onboarding intro video's timeline (docs/specs/onboarding-protocol.md OB-2..OB-7, OB-27, OB-29, OB-30;
// approved pictures docs/design/onboarding-intro.html, founder 2026-11-20, and
// docs/design/onboarding-intro-controles.html, founder 2026-11-24). One clock in ms runs on the UI
// thread (components/OnboardingIntro.js); every element is a function of it, so the order, the
// timings and the controls live here and are tested in node.
//
// hold: the frame where everything of the scene is on screen and nothing has left yet. Since
// 2026-11-24 the video stops there: the opening plays and goes on to the syringe by itself; from
// the syringe on each scene plays once and waits on its hold frame for "Avançar"; "Voltar" shows
// the previous scene's hold frame; Reduce Motion shows only hold frames.
// The worklet directives let the component call these on the UI thread.

// The dose-observation scene ("Anote como você se sentiu", between reminders and labs; founder
// 2026-11-24). GATE: it may only reach users TOGETHER with the dose observation feature
// (branch feat/dose-observation: the Em jejum / Com refeição marks and the per-dose Observação).
// It was true on feat/onboarding-protocol so the test APK showed it. Any publication (store build or
// EAS Update) MUST set it to false unless feat/dose-observation is in the same release; false gives
// exactly the six scenes / four story bars approved on 2026-11-20.
// Release of integration/pacote-2026-11 (scope closed by the founder 2026-11-24): feat/dose-observation
// ships in it, so it stays true for that release (__tests__/onboardingIntroControls.test.js checks the
// feature is in the tree).
const OBSERVATION_SCENE = true;

// Each scene: its length and its hold frame, in ms from its own start; and its beats, also from its
// own start. A number is an entrance of IN_DUR; [at, dur] is a longer move (a draw, a fill, a slide);
// a list of 3+ numbers is entrances one after the other; a list of [at, dur] is several moves.
// `in` / `out`: the scene itself comes in and leaves.
const SCENE_DEFS = [
  { key: 'open', len: 3500, hold: 2900, beats: { in: 200, out: 3100, tick: [0, 600], scale: [600, 1100], title: 1200 } },
  { key: 'syringe', len: 6500, hold: 5900, beats: { in: 100, out: 6000, title: 100, card: 400, rows: [800, 1350, 1900, 2450], calc: 3200, fill: [3500, 1100], result: 4600 } },
  // part 1 (Dia 0 / 7 / 14) as approved 2026-11-20; part 2 (founder 2026-11-24): the columns narrow
  // (squeeze), the new legend, Dia 21 to 49 (more), the dashed 200 mg guide, the caption
  { key: 'body', len: 11800, hold: 11200, beats: { in: 100, out: 11300, title: 100, sub: 500, axis: 1300, cols: [1300, 2800, 4300], legend: 4300, line: [5500, 1400], foot: 6200,
    squeeze: [7300, 900], legend2: 7700, labels2: 7900, more: [8300, 8700, 9100, 9500, 9900], guide: [8300, 500], caption: 10400 } },
  { key: 'reminders', len: 6500, hold: 5900, beats: { in: 100, out: 6000, title: 100, phone: 100, n1: [800, 500], taken: [2100, 200], chip: 2600, n2: [3200, 500], snooze: [4500, 200] } },
  // the picture's renderObs(): the dose row, the sheet growing from it, the marks (none chosen), the
  // Observação field, the note typed letter by letter, Salvar pressed, the report snippet
  { key: 'obs', len: 6500, hold: 5900, beats: { in: 100, out: 6000, title: 100, sub: 500, card: 900, grow: [1500, 400], marks: 1700, note: 1900, acts: 2450, type: [2450, 1700], press: [4300, 200], actsOut: [4700, 250], report: 4900, reportNote: 5300 } },
  { key: 'labs', len: 5500, hold: 4900, beats: { in: 100, out: 5000, title: 100, cards: [600, 1300, 2000], lines: [[800, 1000], [1500, 1000], [2200, 1000]], foot: 3000 } },
  { key: 'end', len: 1500, hold: 1500, beats: { in: 200, scale: [100, 800], title: 200 } },
];

// An entrance (fade + 10 pt rise) and an exit (fade + 6 pt lift), as in the picture.
const IN_DUR = 350;
const OUT_DUR = 300;
// The story bars: 342 pt across, 6 pt between them (4 bars of 81 pt, 5 of 63,6 pt).
const BARS_SPAN = 342;
const BAR_GAP = 6;

function clamp01(v) { 'worklet'; return v < 0 ? 0 : v > 1 ? 1 : v; }

function shiftBeat(v, by) {
  if (typeof v === 'number') return v + by;
  if (Array.isArray(v) && Array.isArray(v[0])) return v.map((x) => [x[0] + by, x[1]]);
  if (Array.isArray(v) && v.length === 2) return [v[0] + by, v[1]];
  return v.map((x) => x + by);
}

// The timeline with or without the observation scene (the tests build both; the app uses
// OBSERVATION_SCENE).
function makeIntro(withObservation) {
  const defs = SCENE_DEFS.filter((d) => withObservation || d.key !== 'obs');
  const SCENES = [];
  const BEATS = {};
  let at = 0;
  for (const d of defs) {
    SCENES.push({ key: d.key, start: at, end: at + d.len, hold: at + d.hold });
    BEATS[d.key] = Object.fromEntries(Object.entries(d.beats).map(([k, v]) => [k, shiftBeat(v, at)]));
    at += d.len;
  }
  const INTRO_END = at;
  const END = SCENES.length - 1;
  // One story bar per feature scene (the opening and the end have none).
  const STORY_BARS = SCENES.slice(1, END).map((s) => s.key);
  const BAR_SCENES = STORY_BARS.map((_, b) => b + 1);
  const BAR_W = (BARS_SPAN - BAR_GAP * (STORY_BARS.length - 1)) / STORY_BARS.length;
  const STARTS = SCENES.map((s) => s.start);
  const ENDS = SCENES.map((s) => s.end);
  const HOLDS = SCENES.map((s) => s.hold);
  const NB = BAR_SCENES.length;

  const barLeft = (b) => 24 + (BAR_W + BAR_GAP) * b;

  // The beats of a scene as { name, at, dur } (for the tests: all complete by the hold frame).
  function sceneBeats(key) {
    const b = BEATS[key] || {};
    const out = [];
    for (const [name, v] of Object.entries(b)) {
      if (name === 'out') continue;
      if (typeof v === 'number') out.push({ name, at: v, dur: IN_DUR });
      else if (Array.isArray(v) && Array.isArray(v[0])) v.forEach((x, i) => out.push({ name: `${name}${i}`, at: x[0], dur: x[1] }));
      else if (Array.isArray(v) && v.length === 2) out.push({ name, at: v[0], dur: v[1] });
      else if (Array.isArray(v)) v.forEach((x, i) => out.push({ name: `${name}${i}`, at: x, dur: IN_DUR }));
    }
    return out;
  }

  // The scene shown at time ms.
  function sceneIndexAt(ms) {
    'worklet';
    let i = 0;
    for (let k = 0; k < STARTS.length; k++) if (ms >= STARTS[k]) i = k;
    return i;
  }

  // Story bar b at time ms: fills while its own scene plays (start → hold) and stays full; Reduce
  // Motion: full once its scene shows.
  function barFill(ms, b, reduced) {
    'worklet';
    if (b < 0 || b >= NB) return 0;
    const sc = BAR_SCENES[b];
    if (reduced) return sceneIndexAt(ms) >= sc ? 1 : 0;
    return clamp01((ms - STARTS[sc]) / (HOLDS[sc] - STARTS[sc]));
  }

  // ── the controls ──
  // A plan: `cur` is the scene she is on (or being played to), the clock jumps to `from` and plays
  // to `to` (a hold frame; from === to = shown complete, no playback); `cut`: a short fade so a
  // jump is not a flash; `nav`: the Voltar / Avançar row is on screen.
  //
  // Start: the opening plays and goes on to the syringe by itself, the row shows once the syringe
  // starts. Reduce Motion / a screen reader: the opening complete, the row at once. Back into the
  // video from the step after it (atEnd): the end frame, complete — never from the start again.
  function introStart({ reduced, atEnd } = {}) {
    if (atEnd) return { cur: END, from: INTRO_END, to: INTRO_END, nav: true, cut: false };
    if (reduced) return { cur: 0, from: HOLDS[0], to: HOLDS[0], nav: true, cut: false };
    return { cur: 1, from: 0, to: HOLDS[1], nav: false, cut: false };
  }
  // The row latches on once the syringe scene has started.
  function navShown(nav, ms) { 'worklet'; return !!nav || ms >= STARTS[1]; }
  // Avançar: on the end frame it is Começar (finish). Held: the next scene plays from this hold
  // (this scene leaves, the next comes in). Still playing: straight to the next scene's start.
  function introNext(cur, ms, reduced) {
    if (cur >= END) return { finish: true };
    const n = cur + 1;
    if (reduced) return { cur: n, from: HOLDS[n], to: HOLDS[n], cut: false };
    if (ms < HOLDS[cur]) return { cur: n, from: STARTS[n], to: HOLDS[n], cut: true };
    return { cur: n, from: ms, to: HOLDS[n], cut: false };
  }
  // Voltar (and the Android back): the scene before, complete. None on the opening, nor while the
  // opening still plays by itself (the row is not there yet): null = the flow handles it.
  function introBack(cur, nav) {
    if (!nav || cur <= 0) return null;
    const p = cur - 1;
    return { cur: p, from: HOLDS[p], to: HOLDS[p], cut: true };
  }
  // "Pular": the end frame, complete. Hidden there.
  function introSkip(cur) {
    if (cur >= END) return null;
    return { cur: END, from: INTRO_END, to: INTRO_END, cut: true };
  }
  // Reduce Motion / a screen reader turned on mid-video: the scene on screen, complete.
  function introReduce(ms) {
    const i = sceneIndexAt(ms);
    return { cur: i, from: HOLDS[i], to: HOLDS[i], nav: true, cut: false };
  }
  // What the buttons show for the scene she is on.
  function controls(cur, nav) {
    return { row: !!nav, back: !!nav && cur > 0, skip: cur < END, primary: cur >= END ? 'obi_start' : 'obi_next' };
  }
  // "Pular" / "Skip": the end frame, complete.
  function skipTime() { return INTRO_END; }

  // ── the observation scene's note, typed letter by letter ──
  const TYPE = BEATS.obs ? BEATS.obs.type : [0, 1];
  function typedCount(ms, len) {
    'worklet';
    return Math.round(len * clamp01((ms - TYPE[0]) / TYPE[1]));
  }

  return {
    SCENES, BEATS, INTRO_END, END, STORY_BARS, BAR_SCENES, BAR_W, STARTS, ENDS, HOLDS,
    barLeft, sceneBeats, sceneIndexAt, barFill, skipTime, typedCount,
    introStart, introNext, introBack, introSkip, introReduce, navShown, controls,
  };
}

// The note on two lines, as the picture: the first sentence, then the rest (typed = how many
// characters are on screen so far).
function noteLines(note, typed) {
  const s = String(note || '');
  const cut = s.search(/[.!?]\s/);
  const a = cut < 0 ? s : s.slice(0, cut + 1);
  const rest = cut < 0 ? '' : s.slice(cut + 2);
  const n = Math.max(0, Math.min(typed, s.length));
  if (n <= a.length) return [s.slice(0, n), ''];
  return [a, rest.slice(0, Math.max(0, n - a.length - 1))];
}

module.exports = {
  ...makeIntro(OBSERVATION_SCENE),
  OBSERVATION_SCENE, makeIntro, noteLines, IN_DUR, OUT_DUR, clamp01,
};
