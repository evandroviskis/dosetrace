'use strict';
// Q1 = C (founder 2026-10-02, "Barras: Q1=C"): in the site picker each area row's Right /
// Left pill buttons become the shared bar Right | Left | Both. One side per area, "Both"
// for both sides, several areas still allowed in one dose, nothing chosen = no segment on,
// tapping the chosen segment clears that area. The stored format does NOT change: a dose
// stores a list of site ids, and Both = the area's two existing side ids, so every older
// dose (one side, both sides, the older front-view arm id) reads back on the right segment.
// Also: the picker's own copy (PROPOSED_COPY) showed English in every language — a bug.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const b = require('../lib/bodySites');
const sites = require('../lib/injectionSites');
const { translations } = require('../i18n/translations.js');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it'];
const ABD_UP = ['abdomen_ur', 'abdomen_ul']; // front row: your right first
const ARM_BACK = ['arm_back_l_b', 'arm_back_r_b']; // back row: your left first

test('Q1: areaSide reads one area of a stored id list as right / left / both / none', () => {
  assert.equal(typeof b.areaSide, 'function', 'areaSide not built yet');
  assert.equal(b.areaSide([], ABD_UP), null);
  assert.equal(b.areaSide(['abdomen_ur'], ABD_UP), 'right');
  assert.equal(b.areaSide(['abdomen_ul'], ABD_UP), 'left');
  assert.equal(b.areaSide(['abdomen_ul', 'abdomen_ur'], ABD_UP), 'both');
  assert.equal(b.areaSide(['flank_r', 'thigh_f_l'], ABD_UP), null, 'other areas do not count');
  // The back of the upper arm: an older dose may hold the front-view id; same spot.
  assert.equal(b.areaSide(['arm_back_l_f'], ARM_BACK), 'left');
  assert.equal(b.areaSide(['arm_back_r_f', 'arm_back_l_b'], ARM_BACK), 'both');
});

test('Q1: setAreaSide writes only this area, as the existing side ids; null clears the area', () => {
  assert.equal(typeof b.setAreaSide, 'function', 'setAreaSide not built yet');
  const other = ['flank_r', 'deltoid_l'];
  assert.deepEqual(b.setAreaSide(other, ABD_UP, 'right'), [...other, 'abdomen_ur']);
  assert.deepEqual(b.setAreaSide(other, ABD_UP, 'left'), [...other, 'abdomen_ul']);
  assert.deepEqual(b.setAreaSide(other, ABD_UP, 'both'), [...other, 'abdomen_ur', 'abdomen_ul']);
  assert.deepEqual(b.setAreaSide(['abdomen_ur', ...other], ABD_UP, 'left'), [...other, 'abdomen_ul'], 'Right → Left swaps the side');
  assert.deepEqual(b.setAreaSide(['abdomen_ur', 'abdomen_ul', ...other], ABD_UP, 'right'), ['abdomen_ur', ...other], 'Both → Right keeps the right id where it was');
  assert.deepEqual(b.setAreaSide(['abdomen_ur', ...other], ABD_UP, null), other, 'clearing the area leaves the other areas');
  assert.deepEqual(b.setAreaSide(['abdomen_ur'], ABD_UP, 'right'), ['abdomen_ur'], 'no duplicates');
  // An older front-view arm id is kept as it is when its side stays chosen.
  assert.deepEqual(b.setAreaSide(['arm_back_l_f'], ARM_BACK, 'both'), ['arm_back_l_f', 'arm_back_r_b']);
  assert.deepEqual(b.setAreaSide(['arm_back_l_f', 'arm_back_r_b'], ARM_BACK, 'right'), ['arm_back_r_b']);
  assert.deepEqual(b.setAreaSide(['arm_back_l_f'], ARM_BACK, null), []);
});

test('Q1: Right | Left | Both round-trips through the stored format, incl. older doses with both sides', () => {
  for (const type of ['subq', 'im']) {
    const rows = type === 'im' ? b.listRows('im', 'right') : [...b.listRows('subq', 'front'), ...b.listRows('subq', 'back')];
    for (const row of rows) {
      const ids = row.sites.map((x) => x.id);
      for (const side of ['right', 'left', 'both', null]) {
        const picked = b.setAreaSide([], ids, side);
        const stored = sites.siteToStore({ type, selected: picked, initialStored: null });
        const back = sites.parseStored(stored).sites;
        assert.equal(b.areaSide(back, ids), side, `${row.area} ${side}`);
      }
    }
  }
  // A dose saved before this change with both abdomen sides and a flank opens as Both + the flank.
  const old = JSON.stringify({ type: 'subq', sites: ['abdomen_ul', 'abdomen_ur', 'flank_l'] });
  const sel = sites.parseStored(old).sites;
  assert.equal(b.areaSide(sel, ABD_UP), 'both');
  assert.equal(b.areaSide(sel, ['flank_l', 'flank_r']), 'left');
  // Opened and saved untouched, it stores exactly the same text.
  assert.equal(sites.siteToStore({ type: 'subq', selected: sel, initialStored: old }), old);
});

test('Q1: the dots and the bar stay in sync both ways (a dot tap is read back by the bar)', () => {
  let sel = [];
  sel = b.toggleSite(sel, 'abdomen_ul'); // tap the dot
  assert.equal(b.areaSide(sel, ABD_UP), 'left');
  sel = b.toggleSite(sel, 'abdomen_ur');
  assert.equal(b.areaSide(sel, ABD_UP), 'both');
  sel = b.setAreaSide(sel, ABD_UP, 'right'); // choose in the bar
  assert.ok(b.siteOn(sel, 'abdomen_ur') && !b.siteOn(sel, 'abdomen_ul'), 'the dots follow the bar');
});

test('Q1: the picker rows are the shared bar Right | Left | Both with clear-on-retap; Type it in stays', () => {
  const src = read('screens', 'components', 'BodyMapModal.js');
  const i = src.indexOf('rows.map(');
  assert.ok(i > 0);
  const rowsJsx = src.slice(i, src.indexOf('bodymap_somewhere_else', i));
  assert.match(rowsJsx, /<SegmentedBar\b/);
  assert.match(rowsJsx, /allowDeselect/);
  assert.match(rowsJsx, /areaSide\(selected, /);
  assert.match(rowsJsx, /setAreaSide\(/);
  assert.match(rowsJsx, /bodymap_side_both/);
  assert.doesNotMatch(rowsJsx, /sideBtn/, 'the old per-side pill buttons are gone');
  assert.match(src, /tx?\('bodymap_type_it_in'\)/, '"Somewhere else / Type it in" stays');
  assert.match(src, /onPress=\{tapOther\}/);
  // The longest-unused hint still marks a side: the bar draws a dashed segment for it.
  assert.match(rowsJsx, /hint:/);
  assert.match(read('components', 'SegmentedBar.js'), /borderStyle: 'dashed'/);
});

test('Q1: "Both" exists in all 6 languages', () => {
  const want = { en: 'Both', es: 'Ambos', pt: 'Ambos', fr: 'Les deux', de: 'Beide', it: 'Entrambi' };
  for (const l of LANGS) assert.equal(translations[l].bodymap_side_both, want[l], l);
});

test('bug: the site picker copy is translated (no hard-coded English PROPOSED_COPY fallback)', () => {
  const src = read('screens', 'components', 'BodyMapModal.js');
  assert.doesNotMatch(src, /PROPOSED_COPY/, 'English placeholders still in the component');
  const keys = [...new Set((src.match(/'bodymap_[a-z0-9_]+'/g) || []).map((k) => k.slice(1, -1)))];
  // Keys built at run time: bodymap_area_<area>.
  for (const row of [...b.ROWS.subq.front, ...b.ROWS.subq.back, ...b.ROWS.im]) {
    if (!['flank', 'deltoid', 'ventroglute', 'dorsoglute'].includes(row[0])) keys.push('bodymap_area_' + row[0]);
  }
  assert.ok(keys.length > 20);
  for (const k of keys) {
    if (k === 'bodymap_area_') continue;
    for (const l of LANGS) assert.ok(translations[l][k], `${l}: ${k} missing`);
  }
  // Not English in the other five (the bug), and the {days} slot survives.
  for (const l of ['es', 'pt', 'fr', 'de', 'it']) {
    assert.notEqual(translations[l].bodymap_somewhere_else, 'Somewhere else', l);
    assert.notEqual(translations[l].bodymap_your_right, 'Your right', l);
    assert.match(translations[l].bodymap_used_n_days, /\{days\}/, l);
  }
});
