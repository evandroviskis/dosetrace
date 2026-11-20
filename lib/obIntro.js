'use strict';
// The onboarding intro video's timeline (docs/specs/onboarding-protocol.md OB-2..OB-7, OB-27;
// approved picture docs/design/onboarding-intro.html, founder 2026-11-20). One clock in ms runs
// 0 → INTRO_END on the UI thread (components/OnboardingIntro.js); every element is a function of
// it, so the order and the timings live here and are tested in node. The beat times are the
// picture's keyframes (its 40 s loop = this 32 s video + an 8 s hold).
//
// hold: the frame where everything of the scene is on screen and nothing has left yet — what
// Reduce Motion shows (a tap goes to the next hold) and what the story bars count as "seen".
// The worklet directives let the component call these on the UI thread.

const SCENES = [
  { key: 'open', start: 0, end: 3500, hold: 2900 },
  { key: 'syringe', start: 3500, end: 10000, hold: 9400 },
  { key: 'body', start: 10000, end: 18500, hold: 17900 },
  { key: 'reminders', start: 18500, end: 25000, hold: 24400 },
  { key: 'labs', start: 25000, end: 30500, hold: 29900 },
  { key: 'end', start: 30500, end: 32000, hold: 32000 },
];
const INTRO_END = 32000;
// The four story bars at the top: one per feature scene (the opening and the end have none).
const STORY_BARS = ['syringe', 'body', 'reminders', 'labs'];
const BAR_SCENES = [1, 2, 3, 4];
const STARTS = SCENES.map((s) => s.start);
const ENDS = SCENES.map((s) => s.end);
const HOLDS = SCENES.map((s) => s.hold);

// An entrance (fade + 10 pt rise) and an exit (fade + 6 pt lift), as in the picture.
const IN_DUR = 350;
const OUT_DUR = 300;

// Every beat in ms. A number is an entrance of IN_DUR; [at, dur] is a longer move (a draw, a fill,
// a slide); a list of 3+ numbers is entrances one after the other. `in` / `out`: the scene itself
// comes in and leaves.
const BEATS = {
  open: { in: 200, out: 3100, tick: [0, 600], scale: [600, 1100], title: 1200 },
  syringe: { in: 3600, out: 9500, title: 3600, card: 3900, rows: [4300, 4850, 5400, 5950], calc: 6700, fill: [7000, 1100], result: 8100 },
  body: { in: 10100, out: 18000, title: 10100, sub: 10500, cols: [11300, 12800, 14300], legend: 14300, line: [15500, 1400], foot: 16200 },
  reminders: { in: 18600, out: 24500, title: 18600, phone: 18600, n1: [19300, 500], taken: [20600, 200], chip: 21100, n2: [21700, 500], snooze: [23000, 200] },
  labs: { in: 25100, out: 30000, title: 25100, cards: [25600, 26300, 27000], lines: [[25800, 1000], [26500, 1000], [27200, 1000]], foot: 28000 },
  end: { in: 30700, scale: [30600, 800], title: 30700, button: 31400 },
};

// The beats of a scene as { name, at, dur } (for the tests: all complete by the hold frame).
function sceneBeats(key) {
  const b = BEATS[key] || {};
  const out = [];
  for (const [name, v] of Object.entries(b)) {
    if (name === 'out') continue;
    if (typeof v === 'number') out.push({ name, at: v, dur: IN_DUR });
    else if (Array.isArray(v) && Array.isArray(v[0])) v.forEach((x, i) => out.push({ name: `${name}${i}`, at: x[0], dur: x[1] }));
    else if (Array.isArray(v) && v.length === 2) out.push({ name, at: v[0], dur: v[1] }); // [at, dur]
    else if (Array.isArray(v)) v.forEach((x, i) => out.push({ name: `${name}${i}`, at: x, dur: IN_DUR })); // a list of entrances (3+)
  }
  return out;
}

function clamp01(v) { 'worklet'; return v < 0 ? 0 : v > 1 ? 1 : v; }

// The scene shown at time ms (0..5).
function sceneIndexAt(ms) {
  'worklet';
  let i = 0;
  for (let k = 0; k < STARTS.length; k++) if (ms >= STARTS[k]) i = k;
  return i;
}

// Story bar b (0..3) at time ms: fills during its own scene. Reduce Motion: full once its scene shows.
function barFill(ms, b, reduced) {
  'worklet';
  const sc = BAR_SCENES[b];
  if (reduced) return sceneIndexAt(ms) >= sc ? 1 : 0;
  return clamp01((ms - STARTS[sc]) / (ENDS[sc] - STARTS[sc]));
}

// "Pular" / "Skip": the end frame, complete (headline and the Start button).
function skipTime() { return INTRO_END; }

// Reduce Motion: the first scene complete; each tap shows the next scene complete; the end frame stays.
function reducedStart() { return HOLDS[0]; }
function reducedNext(ms) {
  const i = sceneIndexAt(ms);
  return i + 1 < HOLDS.length ? HOLDS[i + 1] : INTRO_END;
}

module.exports = {
  SCENES, INTRO_END, STORY_BARS, BAR_SCENES, BEATS, IN_DUR, OUT_DUR, STARTS, ENDS, HOLDS,
  sceneBeats, sceneIndexAt, barFill, skipTime, reducedStart, reducedNext, clamp01,
};
