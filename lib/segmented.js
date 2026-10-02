'use strict';
// The tap rule of the shared segmented bar (components/SegmentedBar.js), pure so it is
// tested without a renderer. Tapping a segment picks it; tapping the chosen one again
// clears it (null) only where clearing is allowed (allowDeselect), else it stays chosen.
function segmentNext(value, key, allowDeselect = false) {
  return allowDeselect && value === key ? null : key;
}

module.exports = { segmentNext };
