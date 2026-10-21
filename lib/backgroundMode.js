'use strict';
// Background mode (stored session only, nothing sent immediately) as a COUNTER, not a flag
// (Gate B 1.3.1, item 7): the Android reminder refresh and a notification action can run at the
// same time; with a flag the first to finish switched the mode off under the other. Each run
// enters and leaves; the mode is on while any run is inside. Reset to 0 when the app is active.
let depth = 0;
function enter() { depth += 1; }
function leave() { depth = Math.max(0, depth - 1); }
function reset() { depth = 0; }
function active() { return depth > 0; }
module.exports = { enter, leave, reset, active };
