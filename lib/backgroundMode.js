'use strict';
// Background mode (stored session only, nothing sent immediately) as a COUNTER, not a flag
// (Gate B 1.3.1, item 7): the Android reminder refresh and a notification action can run at the
// same time; with a flag the first to finish switched the mode off under the other. Each run
// enters and leaves; the mode is on while any run is inside. Reset to 0 when the app is active.
// Re-verification B: reset() starts a new generation; enter() returns it and leave(gen) ignores a
// run from an older generation, so a run that finishes after a reset never ends a newer run's mode
// (that run would then read the session through the auth client, headless: INV-06).
let depth = 0;
let gen = 0;
function enter() { depth += 1; return gen; }
function leave(g) {
  if (g !== undefined && g !== gen) return;
  depth = Math.max(0, depth - 1);
}
function reset() { depth = 0; gen += 1; }
function active() { return depth > 0; }
module.exports = { enter, leave, reset, active };
