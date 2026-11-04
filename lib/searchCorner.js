// App search entry, B2 (founder 2026-11-04): ONE fixed corner for the magnifier on the five tab
// roots — 8 pt below the status bar (the top safe area), 20 pt from the page's right edge, 44 pt,
// in light and dark, on a phone and on the Fold's left page. Where a tab already has a control in
// that corner (My Protocols "+ Adicionar") the magnifier keeps the corner and the control sits
// immediately to its left, vertically centred with it, 10 pt apart. Pure CommonJS (node --test).
'use strict';

const CORNER = { top: 8, right: 20, size: 44, gap: 10 };

// The header row a tab root draws its title in: the title column takes the room the corner leaves
// (it wraps, never cut), the corner sits at the row's top right.
const HEADER_ROW = { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 };

// The slot's offset inside a header whose top edge sits `headerTop` pt below the top safe area:
// the slot always lands at CORNER.top.
function slotMarginTop(headerTop) {
  return CORNER.top - (Number(headerTop) || 0);
}

// The button's frame on a page `pageWidth` wide (phone width, or the Fold's left page width):
// contentTop / contentRight = where the header row's content box begins below the top safe area and
// ends before the page's right edge (the paddings of the page, the scroll content and the header);
// offsetTop = what the screen tells the slot (SearchCorner offsetTop).
function cornerFrame({ pageWidth, contentTop, contentRight, offsetTop }) {
  return { x: pageWidth - contentRight - CORNER.size, y: contentTop + slotMarginTop(offsetTop), width: CORNER.size, height: CORNER.size };
}

// Whether the title's longest word fits beside the corner slot (sim 2026-11-04: German "Protokolle"
// beside "+ Hinzufügen" did not on a 390 pt phone). When it does not, the title goes under the corner,
// full width, in its own font: it may wrap at a word, never be cut or shrunk. Unknown widths → as drawn.
function titleFits({ pageWidth, wordWidth, slotWidth, sidePadding = CORNER.right, gap = HEADER_ROW.gap }) {
  if (!(wordWidth > 0) || !(slotWidth > 0) || !(pageWidth > 0)) return true;
  return wordWidth <= pageWidth - 2 * sidePadding - gap - slotWidth;
}

module.exports = { CORNER, HEADER_ROW, slotMarginTop, cornerFrame, titleFits };
