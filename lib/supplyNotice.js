'use strict';
// A-115 FR-3 (docs/specs/fold-right-page.md, picture docs/design/a115-fold-dose-right-page.html,
// docs/decisions.md 2026-10-07 night item 5): on Today's right page of an unfolded Fold, a protocol
// whose supply the app cannot count says why, under its name and tags.
//  - 'vial': a lyophilized protocol with no mixed vial. Without the vial the app does not know the
//    concentration, so the page draws NO syringe and NO vial block ("no syringe, no supply") and
//    offers + Add vial (Today's own vial prompt).
//  - 'bottle': tablets / capsules (oral) with no bottle size. The serving block stays (it reads the
//    protocol's own strength); only what's left cannot be shown, so the text speaks of the bottle.
// My Protocols' own page never passes withoutVial, so it keeps its behaviour. Pure CommonJS, tested
// in __tests__/foldDoseRightPage.test.js.
const { parseDecimal } = require('./doseMath');

function supplyNotice(p, vial) {
  if (!p) return null;
  if (p.type === 'recon' && !vial) return 'vial';
  if (p.type === 'oral' && !(parseDecimal(p.container_units) > 0)) return 'bottle';
  return null;
}

// Which supply blocks ProtocolDetail draws. withoutVial: the right page's 'vial' notice is up.
function detailBlocks(p, withoutVial = false) {
  const injectable = !!p && (p.type === 'recon' || p.type === 'rtu');
  const show = injectable && !withoutVial;
  return { draw: show, vialBlock: show };
}

module.exports = { supplyNotice, detailBlocks };
