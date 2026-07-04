'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesQuery, ALIASES, BLEND_IDS } = require('../lib/compounds');

test('matchesQuery: finds a blend by its nickname (the "Klow" case)', () => {
  // User types "klow" — the blend id is lyo_klow, label "KLOW".
  assert.equal(matchesQuery('klow', 'lyo_klow', 'KLOW'), true);
  // A different compound must NOT match "klow".
  assert.equal(matchesQuery('klow', 'lyo_bpc_157', 'BPC-157'), false);
});

test('matchesQuery: alias shorthand routes to the canonical compound', () => {
  assert.equal(matchesQuery('deca', 'rtu_nandrolone_decanoate', 'Nandrolone Decanoate'), true);
  assert.equal(matchesQuery('test e', 'rtu_testosterone_enanthate', 'Testosterone Enanthate'), true);
  assert.equal(matchesQuery('reta', 'lyo_retatrutide', 'Retatrutide'), true);
  assert.equal(matchesQuery('mounjaro', 'lyo_tirzepatide', 'Tirzepatide'), true);
});

test('matchesQuery: normalization makes punctuation/spacing irrelevant', () => {
  // "tb-500", "tb 500", "TB500" all find the same entry.
  for (const q of ['tb-500', 'tb 500', 'TB500', 'tb500']) {
    assert.equal(matchesQuery(q, 'lyo_tb_500', 'TB-500'), true, `query "${q}" should match`);
  }
});

test('matchesQuery: matches the display label directly', () => {
  assert.equal(matchesQuery('semag', 'lyo_semaglutide', 'Semaglutide'), true);
  // Language-specific label is what the caller passes, so a PT label still works.
  assert.equal(matchesQuery('testosterona', 'rtu_testosterone_enanthate', 'Testosterona Enantato'), true);
});

test('matchesQuery: empty query matches everything (browse mode)', () => {
  assert.equal(matchesQuery('', 'lyo_bpc_157', 'BPC-157'), true);
  assert.equal(matchesQuery('   ', 'lyo_bpc_157', 'BPC-157'), true);
});

test('every alias entry maps to a plausible id namespace, and blends have aliases', () => {
  for (const id of Object.keys(ALIASES)) {
    assert.match(id, /^(lyo|rtu|oral)_/, `alias id "${id}" should be namespaced`);
  }
  for (const id of BLEND_IDS) {
    assert.ok(ALIASES[id] && ALIASES[id].length > 0, `blend ${id} should have search aliases`);
  }
});
