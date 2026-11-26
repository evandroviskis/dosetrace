'use strict';
// The food chat closes when its title bar is pulled down (FL-32), never from the thread: a downward drag
// on the messages scrolls back through them (founder 2026-11-26). Pure, run under node --test
// (__tests__/foodChatSwipeHeader.test.js). Units are the gesture's dp.
const START_DY = 8;      // a drag this far down, mostly vertical, belongs to the header swipe
const CLOSE_DY = 70;     // released this far down → close
const CLOSE_VY = 0.8;    // or a quick downward flick

function startsHeaderSwipe(g) {
  return !!g && g.dy > START_DY && Math.abs(g.dx) < g.dy;
}

function closesOnRelease(g) {
  return !!g && (g.dy > CLOSE_DY || (g.dy > 20 && g.vy > CLOSE_VY));
}

module.exports = { startsHeaderSwipe, closesOnRelease };
