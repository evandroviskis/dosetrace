'use strict';
// A-101a (found 2026-10-06): the curve's x-axis — "−3d" on the left, "Now", "+30d" on the right.
// With a long future "Now" sits a few pixels from the left end and the two labels overlapped.
// An end label that would touch "Now" (4 px gap) is left out; "Now" always shows. Widths are
// measured on screen; 0 = not measured yet (show everything). Pure.
const GAP = 4;
function axisLabels({ plotW, nowLeft, nowW, leftW, rightW }) {
  if (!(nowW > 0)) return { showLeft: true, showRight: true };
  const nowRight = nowLeft + nowW;
  const showLeft = !(leftW > 0) || leftW + GAP <= nowLeft;
  const showRight = !(rightW > 0) || nowRight + GAP <= plotW - rightW;
  return { showLeft, showRight };
}
module.exports = { axisLabels };
