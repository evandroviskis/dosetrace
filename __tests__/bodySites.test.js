'use strict';
// Item 27 (founder approved 2026-09-30): the injection-site picker on the founder's body
// images. The points per sex and view come from the prototype (docs/design/prototype.html
// PTS, 768 x 960 image units); a log stores the site id, never a position — so the stored
// ids must never change. Also covers app-map L-43 (body map → "Longest unused" recall).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const b = require('../lib/bodySites');
const sites = require('../lib/injectionSites');

const STORED_IDS = [
  'abdomen_ul', 'abdomen_ur', 'abdomen_ll', 'abdomen_lr', 'thigh_f_l', 'thigh_f_r', 'arm_back_l_f', 'arm_back_r_f',
  'arm_back_l_b', 'arm_back_r_b', 'flank_l', 'flank_r', 'glute_dimple_l', 'glute_dimple_r', 'thigh_b_l', 'thigh_b_r',
  'deltoid_l', 'deltoid_r', 'vastus_l', 'vastus_r', 'ventroglute_l', 'ventroglute_r', 'dorsoglute_l', 'dorsoglute_r',
];
const ids = (pts) => pts.map((p) => p.id).sort();
const DAY = 86400000;
const NOW = new Date(2026, 9, 1, 12, 0).getTime();
const log = (site, daysAgo, extra = {}) => ({ injection_site: JSON.stringify({ type: sites.getSiteById(site).type, sites: [site] }), logged_at: new Date(NOW - daysAgo * DAY).toISOString(), ...extra });

test('item 27: the stored site ids are unchanged (a log written before the redesign still resolves)', () => {
  assert.deepEqual(sites.SITES.map((s) => s.id).sort(), [...STORED_IDS].sort());
  for (const sex of ['male', 'female']) {
    for (const view of Object.keys(b.PTS[sex])) {
      for (const id of Object.keys(b.PTS[sex][view])) assert.ok(sites.getSiteById(id), `${sex}/${view}: ${id} is a stored id`);
    }
  }
  for (const [, a, c] of [...b.ROWS.im, ...b.ROWS.subq.front, ...b.ROWS.subq.back]) {
    assert.ok(sites.getSiteById(a) && sites.getSiteById(c), `list buttons ${a} / ${c} are stored ids`);
  }
});

test('item 27: subcutaneous shows Front / Back, intramuscular Right side / Left side; each view draws its own route only', () => {
  assert.deepEqual(b.viewsFor('subq'), ['front', 'back']);
  assert.deepEqual(b.viewsFor('im'), ['right', 'left']);
  for (const sex of ['male', 'female']) {
    assert.deepEqual(ids(b.figurePoints(sex, 'front', 'subq')), ['abdomen_ll', 'abdomen_lr', 'abdomen_ul', 'abdomen_ur', 'thigh_f_l', 'thigh_f_r']);
    assert.deepEqual(ids(b.figurePoints(sex, 'back', 'subq')), ['arm_back_l_b', 'arm_back_r_b', 'flank_l', 'flank_r', 'glute_dimple_l', 'glute_dimple_r', 'thigh_b_l', 'thigh_b_r']);
    assert.deepEqual(ids(b.figurePoints(sex, 'right', 'im')), ['deltoid_r', 'dorsoglute_r', 'vastus_r', 'ventroglute_r']);
    assert.deepEqual(ids(b.figurePoints(sex, 'left', 'im')), ['deltoid_l', 'dorsoglute_l', 'vastus_l', 'ventroglute_l']);
  }
});

test('item 27: the front view uses the chart convention — your right on the viewer\'s left; the back shows your left on the left', () => {
  for (const sex of ['male', 'female']) {
    const f = Object.fromEntries(b.figurePoints(sex, 'front', 'subq').map((p) => [p.id, p]));
    assert.ok(f.abdomen_ur.x < b.IMG_W / 2 && f.abdomen_ul.x > b.IMG_W / 2, sex + ' front');
    assert.ok(f.thigh_f_r.x < f.thigh_f_l.x);
    const k = Object.fromEntries(b.figurePoints(sex, 'back', 'subq').map((p) => [p.id, p]));
    assert.ok(k.flank_l.x < b.IMG_W / 2 && k.flank_r.x > b.IMG_W / 2, sex + ' back');
  }
  // The named list follows the image: front Right | Left, back Left | Right, intramuscular Right | Left.
  assert.deepEqual(b.listRows('subq', 'front').map((r) => r.sites.map((s) => s.side)), [['right', 'left'], ['right', 'left'], ['right', 'left']]);
  assert.deepEqual(b.listRows('subq', 'back').map((r) => r.sites.map((s) => s.side)), [['left', 'right'], ['left', 'right'], ['left', 'right'], ['left', 'right']]);
  assert.deepEqual(b.listRows('im', 'left').map((r) => r.sites.map((s) => s.side)), [['right', 'left'], ['right', 'left'], ['right', 'left'], ['right', 'left']]);
  assert.deepEqual(b.listRows('subq', 'front').map((r) => r.area), ['abdomen_upper', 'abdomen_lower', 'thigh_front']);
});

test('item 27: the female left side is the female right side mirrored (image and points)', () => {
  const r = b.PTS.female.right;
  const l = b.PTS.female.left;
  for (const id of Object.keys(r)) {
    const twin = id.replace(/_r$/, '_l');
    assert.deepEqual(l[twin], [b.IMG_W - r[id][0], r[id][1]], twin);
  }
  assert.equal(Object.keys(l).length, Object.keys(r).length);
});

test('item 27: points scale to the rendered size (300 pt wide → 300/768)', () => {
  const p = b.figurePoints('male', 'front', 'subq', 300).find((x) => x.id === 'abdomen_lr');
  assert.equal(p.x, 329 * 300 / 768);
  assert.equal(p.y, 460 * 300 / 768);
  assert.equal(p.rx, 40 * 300 / 768);
  assert.equal(p.ry, 34 * 300 / 768);
});

test('item 27: the figure follows the profile "Sex at birth"; male when unknown', () => {
  assert.equal(b.figureSex({ gender: 'female' }), 'female');
  assert.equal(b.figureSex({ gender: 'male' }), 'male');
  assert.equal(b.figureSex({}), 'male');
  assert.equal(b.figureSex(null), 'male');
  assert.equal(b.imageKey('female', 'left'), 'f_left');
  assert.equal(b.imageKey('male', 'front'), 'm_front');
});

test('item 27: every body image ships at @2x and @3x, each under 250 KB', () => {
  const dir = path.join(__dirname, '..', 'assets', 'body');
  for (const sex of ['m', 'f']) {
    for (const view of ['front', 'back', 'right', 'left']) {
      for (const sc of ['@2x', '@3x']) {
        const f = path.join(dir, `${sex}_${view}${sc}.png`);
        assert.ok(fs.existsSync(f), f);
        assert.ok(fs.statSync(f).size < 250 * 1024, f + ' size');
      }
    }
  }
});

test('item 27: the arm\'s front and back ids are one spot (picked, toggled, and in the recall)', () => {
  assert.equal(b.siteOn(['arm_back_l_f'], 'arm_back_l_b'), true);
  assert.deepEqual(b.toggleSite(['arm_back_l_f', 'flank_r'], 'arm_back_l_b'), ['flank_r'], 'tapping the back-view arm un-picks an older front-view arm id');
  assert.deepEqual(b.toggleSite(['flank_r'], 'arm_back_l_b'), ['flank_r', 'arm_back_l_b']);
  const ages = b.siteAges([log('arm_back_l_f', 3)], NOW);
  assert.equal(ages.arm_back_l, 3);
});

test('item 27: "Longest unused in your log" is hidden until a site of that view is logged; never-used first; then the oldest', () => {
  assert.equal(b.siteLongest({ view: 'front', type: 'subq', logs: [], nowMs: NOW }), null, 'nothing logged → hidden');
  assert.equal(b.siteLongest({ view: 'front', type: 'subq', logs: [log('flank_l', 2)], nowMs: NOW }), null, 'only the back logged → hidden on the front');
  const one = b.siteLongest({ view: 'front', type: 'subq', logs: [log('abdomen_ul', 1)], nowMs: NOW });
  assert.equal(one.days, null, 'a never-used site comes first');
  assert.notEqual(one.site.id, 'abdomen_ul');
  const front = ['abdomen_ul', 'abdomen_ur', 'abdomen_ll', 'abdomen_lr', 'thigh_f_l', 'thigh_f_r'];
  const all = front.map((id, i) => log(id, i + 1));
  const lg = b.siteLongest({ view: 'front', type: 'subq', logs: all, nowMs: NOW });
  assert.equal(lg.site.id, 'thigh_f_r');
  assert.equal(lg.days, 6);
  // The back view: an arm used through its old front-view id counts for the drawn arm.
  const back = ['arm_back_r_b', 'flank_l', 'flank_r', 'glute_dimple_l', 'glute_dimple_r', 'thigh_b_l', 'thigh_b_r'].map((id) => log(id, 1));
  const lb = b.siteLongest({ view: 'back', type: 'subq', logs: back.concat(log('arm_back_l_f', 9)), nowMs: NOW });
  assert.equal(lb.site.id, 'arm_back_l_b');
  assert.equal(lb.days, 9);
  // Intramuscular looks at both sides.
  const im = b.siteLongest({ view: 'right', type: 'im', logs: ['deltoid_r', 'ventroglute_r', 'dorsoglute_r', 'vastus_r', 'deltoid_l', 'ventroglute_l', 'dorsoglute_l'].map((id) => log(id, 2)), nowMs: NOW });
  assert.equal(im.site.id, 'vastus_l');
});

test('item 27: the picker opens on the saved route, else the one this protocol last used, else subcutaneous', () => {
  const logs = [log('deltoid_r', 3, { protocol_id: 7 }), log('abdomen_lr', 1, { protocol_id: 8 }), log('abdomen_ul', 9, { protocol_id: 7 })];
  assert.equal(b.openingRoute({ protocolId: 7, logs }), 'im');
  assert.equal(b.openingRoute({ protocolId: 8, logs }), 'subq');
  assert.equal(b.openingRoute({ protocolId: 9, logs }), 'subq');
  assert.equal(b.openingRoute({ protocolId: null, logs }), 'subq');
  assert.equal(b.openingRoute({ initialStored: JSON.stringify({ type: 'subq', sites: ['flank_l'] }), protocolId: 7, logs }), 'subq');
  assert.equal(b.openingRoute({ initialStored: JSON.stringify(['deltoid_l']), protocolId: 8, logs }), 'im', 'an older array row: the route of its sites');
  assert.equal(b.openingRoute({ initialStored: 'left glute', protocolId: 7, logs }), 'im', 'typed text: the protocol\'s last route');
});

test('item 27: the stored route is the picked sites\' own when they agree', () => {
  assert.equal(b.storedType(['deltoid_l'], 'subq'), 'im');
  assert.equal(b.storedType(['abdomen_ul', 'flank_r'], 'im'), 'subq');
  assert.equal(b.storedType(['abdomen_ul', 'deltoid_r'], 'im'), 'im');
  assert.equal(b.storedType([], 'subq'), 'subq');
});

test('item 27: the picker is built on the images (old drawn figure gone), saves "Somewhere else" as plain text and keeps the S-20 / A-55 paths', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'screens', 'components', 'BodyMapModal.js'), 'utf8');
  assert.doesNotMatch(src, /bodyPart|const SCALE = 1\.8|suggestNextSite/, 'rebuild = replace');
  assert.match(src, /require\('\.\.\/\.\.\/assets\/body\/f_left\.png'\)/);
  assert.match(src, /figurePoints\(/);
  const i = src.indexOf('function handleSave(');
  assert.match(src.slice(i, i + 400), /!selected\.length && typed \? typed : siteToStore\(/, 'typed words stored as they are, else siteToStore');
  // Typed words round-trip as the existing free-text format.
  assert.equal(sites.parseStored('right calf').freeText, 'right calf');
  assert.equal(sites.hasSavedSite('right calf'), true);
});
