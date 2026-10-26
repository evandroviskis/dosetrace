'use strict';
// AD-100 (founder 2026-10-20, picture docs/design/ad99-ad100-labs.html section 3 option B, spec
// docs/specs/ad99-ad100-labs.md LB-8..LB-14): "Mudar a data deste exame" moves every value of one
// test (one card, lib/labReports) and its labels to a new date. Pure CommonJS (node --test).
// The values are moved in place by lib/database moveBiomarkerReport (same rows, synced as edits).
const { reportCards } = require('./labReports');

// The moved test's card key at its new date: the card there that holds the test's first upload
// stamp (a test already on that date stays its own card). null when none.
function movedCardKey(rows, toDate, firstBatch) {
  const card = reportCards(rows).find((c) => c.date === toDate && c.batches.includes(firstBatch));
  return card ? card.key : null;
}

// Labels are kept per date (lib/labPrefs, DV-006). The test's labels join the new date's own (no
// duplicate, case-insensitive; the ones already there first); the old date keeps them only while
// another test is still on it (`keepFrom`). `only` (optional): just these labels move (a move
// sent again later never carries a label added to the old date's other test since). Never
// mutates `tags`.
function moveReportTags(tags, from, to, keepFrom, only) {
  const src = tags && typeof tags === 'object' ? tags : {};
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const onFrom = Array.isArray(src[from]) ? src[from] : [];
  const moving = Array.isArray(only) ? onFrom.filter((x) => only.some((o) => same(o, x))) : onFrom;
  if (!moving.length || from === to) return src;
  const out = { ...src };
  const merged = Array.isArray(out[to]) ? out[to].slice() : [];
  for (const tag of moving) {
    if (!merged.some((x) => same(x, tag))) merged.push(tag);
  }
  if (!keepFrom) {
    const left = onFrom.filter((x) => !moving.includes(x));
    if (left.length) out[from] = left; else delete out[from];
  }
  out[to] = merged;
  return out;
}

// AD-100 review (2026-10-26): label moves whose save failed twice ({ from, to, keepFrom, labels }),
// applied in order to the labels loaded or about to be saved — so they stay with the moved test on
// screen and go with the next label save. Sending one again is harmless (the labels are already
// off the old date, or already on the new one). Never mutates `tags`.
function applyLabelMoves(tags, moves) {
  let out = tags && typeof tags === 'object' ? tags : {};
  for (const m of Array.isArray(moves) ? moves : []) {
    if (m && m.from && m.to) out = moveReportTags(out, m.from, m.to, !!m.keepFrom, m.labels);
  }
  return out;
}

module.exports = { movedCardKey, moveReportTags, applyLabelMoves };
