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

// Labels are kept per date (user_metadata report_tags, DV-006). The test's labels join the new
// date's own (no duplicate, case-insensitive; the ones already there first); the old date keeps
// them only while another test is still on it (`keepFrom`). Never mutates `tags`.
function moveReportTags(tags, from, to, keepFrom) {
  const src = tags && typeof tags === 'object' ? tags : {};
  const moving = Array.isArray(src[from]) ? src[from] : [];
  if (!moving.length || from === to) return src;
  const out = { ...src };
  const merged = Array.isArray(out[to]) ? out[to].slice() : [];
  for (const tag of moving) {
    if (!merged.some((x) => String(x).toLowerCase() === String(tag).toLowerCase())) merged.push(tag);
  }
  if (!keepFrom) delete out[from];
  out[to] = merged;
  return out;
}

module.exports = { movedCardKey, moveReportTags };
