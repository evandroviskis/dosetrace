'use strict';
// The side gutters of the weigh-ins chart (screens/components/ProgressChart), in its viewBox units
// (S25 2026-11-07: "82,4" was drawn as "32,4", cut at the left by a fixed 26-unit gutter). Each side
// is as wide as its widest axis label + the gap to the plot + a margin to the drawing's edge, never
// narrower than the prototype's 26. The width is the one measured on screen (components/
// useColumnWidth, the labels laid out at the SVG's font size); before the first layout, the
// monospaced advance of the axis font (Geist Mono: every glyph is 0.6 em). Pure — node --test.

const MIN_GUTTER = 26;
const LABEL_GAP = 4; // label end → plot (the SvgText sits at L − 4 / R + 4)
const EDGE = 2;      // label start → the drawing's edge
const MONO_ADVANCE_EM = 0.6;

function labelWidthEstimate(text, fontSize) {
  return String(text == null ? '' : text).length * MONO_ADVANCE_EM * fontSize;
}

// labels: the axis labels on that side; measured: their widest on-screen width (viewBox units), or
// null / 0 before the first layout.
function axisGutter(labels, { fontSize = 11, measured = null } = {}) {
  const list = (labels || []).filter((l) => l != null && String(l) !== '');
  if (!list.length) return MIN_GUTTER;
  const widest = measured > 0 ? measured : Math.max(...list.map((l) => labelWidthEstimate(l, fontSize)));
  return Math.max(MIN_GUTTER, Math.ceil(widest + LABEL_GAP + EDGE));
}

module.exports = { axisGutter, labelWidthEstimate, MIN_GUTTER, LABEL_GAP, EDGE };
