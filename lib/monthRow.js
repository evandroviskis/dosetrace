'use strict';
// Where a month row scrolls so the chosen month shows (A-190, founder picked A in
// docs/design/a190-month-row.html): the chosen month second, the month before it half visible.
// layouts: { [index]: { x, width } } from each pill's onLayout (content coordinates);
// offset / viewport: the row's scroll x and visible width; force: on open, place it even if visible.
// → the x to scroll to, or null (leave the row: nothing chosen, not measured, or already in view).
function chosenScrollX({ layouts, chosen, offset = 0, viewport = 0, force = false } = {}) {
  if (!Number.isInteger(chosen) || !layouts) return null;
  const item = layouts[chosen];
  if (!item) return null;
  if (!force && viewport > 0 && item.x >= offset && item.x + item.width <= offset + viewport) return null;
  if (chosen === 0) return 0;
  const prev = layouts[chosen - 1];
  if (!prev) return null;
  return prev.x + prev.width / 2;
}

module.exports = { chosenScrollX };
