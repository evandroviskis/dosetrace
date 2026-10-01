'use strict';
// Injection-site picker on the founder's body images (Graduated redesign item 27, founder
// approved 2026-09-30; prototype siteSheet() in docs/design/prototype.html). Pure.
//
// The images are the founder's mannequins cropped shoulders to knees, 768 x 960
// (assets/body/<m|f>_<front|back|right|left>@2x/@3x.png). Every point below sits on the
// image where the site really is, in those 768 x 960 image units; the screen scales them
// to the rendered size. Display only: a log stores the site id (lib/injectionSites.js),
// never a position, so the ids never change.
//   Subcutaneous: Front / Back. The front faces you (chart convention: your right is on
//     the viewer's left); the back shows your left on the left.
//   Intramuscular: Right side / Left side. The female left side image is the female right
//     side mirrored, so its points are the right side's mirrored (x -> 768 - x).
// Sex follows the profile's "Sex at birth" (user_metadata.gender); male when unknown.

const { SITES, getSiteById, parseStored } = require('./injectionSites');

const IMG_W = 768;
const IMG_H = 960;

const PTS = {
  male: {
    front: { abdomen_ur: [329, 355], abdomen_ul: [439, 355], abdomen_lr: [329, 460], abdomen_ll: [439, 460], thigh_f_r: [300, 690], thigh_f_l: [468, 690], deltoid_r: [205, 165], deltoid_l: [563, 165], vastus_r: [258, 700], vastus_l: [510, 700] },
    right: { deltoid_r: [350, 150], ventroglute_r: [400, 478], dorsoglute_r: [328, 476], vastus_r: [390, 720] },
    left: { deltoid_l: [440, 150], ventroglute_l: [368, 478], dorsoglute_l: [456, 476], vastus_l: [395, 720] },
    back: { arm_back_l_b: [185, 255], arm_back_r_b: [583, 255], flank_l: [285, 395], flank_r: [483, 395], glute_dimple_l: [310, 480], glute_dimple_r: [458, 480], thigh_b_l: [300, 720], thigh_b_r: [468, 720], ventroglute_l: [262, 470], ventroglute_r: [506, 470], dorsoglute_l: [298, 495], dorsoglute_r: [470, 495] },
  },
  female: {
    front: { abdomen_ur: [334, 345], abdomen_ul: [434, 345], abdomen_lr: [334, 435], abdomen_ll: [434, 435], thigh_f_r: [305, 690], thigh_f_l: [463, 690], deltoid_r: [228, 170], deltoid_l: [540, 170], vastus_r: [256, 690], vastus_l: [512, 690] },
    right: { deltoid_r: [335, 150], ventroglute_r: [382, 470], dorsoglute_r: [308, 470], vastus_r: [376, 720] },
    left: { deltoid_l: [433, 150], ventroglute_l: [386, 470], dorsoglute_l: [460, 470], vastus_l: [392, 720] },
    back: { arm_back_l_b: [210, 260], arm_back_r_b: [558, 260], flank_l: [290, 380], flank_r: [478, 380], glute_dimple_l: [305, 480], glute_dimple_r: [463, 480], thigh_b_l: [305, 720], thigh_b_r: [463, 720], ventroglute_l: [263, 462], ventroglute_r: [505, 462], dorsoglute_l: [298, 492], dorsoglute_r: [470, 492] },
  },
};

// The shaded zone around a picked (or longest-unused) point: ellipse radii in image units.
const SZONE = { abdomen: [40, 34], thigh: [40, 68], arm: [24, 48], flank: [18, 40], glute: [36, 32], deltoid: [26, 40], vastus: [20, 66], ventroglute: [18, 30], dorsoglute: [32, 32] };

// The named list: one row per area, the two buttons in the image's order
// (front: your right first; back: your left first; intramuscular: Right then Left like the tabs).
const ROWS = {
  subq: {
    front: [['abdomen_upper', 'abdomen_ur', 'abdomen_ul'], ['abdomen_lower', 'abdomen_lr', 'abdomen_ll'], ['thigh_front', 'thigh_f_r', 'thigh_f_l']],
    back: [['arm_back', 'arm_back_l_b', 'arm_back_r_b'], ['flank', 'flank_l', 'flank_r'], ['glute_dimple', 'glute_dimple_l', 'glute_dimple_r'], ['thigh_back', 'thigh_b_l', 'thigh_b_r']],
  },
  im: [['deltoid', 'deltoid_r', 'deltoid_l'], ['ventroglute', 'ventroglute_r', 'ventroglute_l'], ['dorsoglute', 'dorsoglute_r', 'dorsoglute_l'], ['vastus', 'vastus_r', 'vastus_l']],
};

function figureSex(meta) {
  return meta && meta.gender === 'female' ? 'female' : 'male';
}

function viewsFor(type) {
  return type === 'im' ? ['right', 'left'] : ['front', 'back'];
}

function defaultView(type) {
  return type === 'im' ? 'right' : 'front';
}

// Image asset key, e.g. 'f_left'.
function imageKey(sex, view) {
  return (sex === 'female' ? 'f' : 'm') + '_' + view;
}

// The back of the upper arm has a front-view id and a back-view id (older logs hold either):
// one physical spot.
function spot(id) {
  return String(id).replace(/^(arm_back_[lr])_[fb]$/, '$1');
}

function siteOn(selected, id) {
  return (selected || []).some((x) => spot(x) === spot(id));
}

// Tap a spot: off if it (or its other-view twin) is picked, else added.
function toggleSite(selected, id) {
  const list = selected || [];
  return siteOn(list, id) ? list.filter((x) => spot(x) !== spot(id)) : [...list, id];
}

// The points drawn on one image for one route, in image units, or scaled to a rendered width.
function figurePoints(sex, view, type, renderWidth = IMG_W) {
  const pv = (PTS[sex === 'female' ? 'female' : 'male'] || {})[view] || {};
  const k = renderWidth / IMG_W;
  return SITES.filter((s) => s.type === type && pv[s.id]).map((s) => ({
    id: s.id,
    group: s.group,
    side: s.side,
    labelKey: s.labelKey,
    x: pv[s.id][0] * k,
    y: pv[s.id][1] * k,
    rx: SZONE[s.group][0] * k,
    ry: SZONE[s.group][1] * k,
  }));
}

function listRows(type, view) {
  const rows = type === 'im' ? ROWS.im : (ROWS.subq[view] || ROWS.subq.front);
  return rows.map(([area, a, b]) => ({ area, sites: [getSiteById(a), getSiteById(b)] }));
}

function startOfDayMs(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Whole calendar days since each spot was last used in the user's own log.
function siteAges(logs, nowMs = Date.now()) {
  const age = {};
  const today = startOfDayMs(nowMs);
  for (const log of logs || []) {
    const p = parseStored(log && log.injection_site);
    if (!p.sites.length) continue;
    const t = new Date(log.logged_at).getTime();
    if (!Number.isFinite(t)) continue;
    const d = Math.max(0, Math.round((today - startOfDayMs(t)) / 86400000));
    for (const id of p.sites) {
      const k = spot(id);
      if (age[k] == null || d < age[k]) age[k] = d;
    }
  }
  return age;
}

// "Longest unused in your log": the site of this route (subcutaneous: in this view) that has
// gone longest without use; never-used first. Hidden (null) until one of them is in the log.
// A recall of the user's own log, not advice.
function siteLongest({ view, type, logs, nowMs = Date.now() }) {
  const age = siteAges(logs, nowMs);
  let best = null;
  let bd = -1;
  let any = false;
  for (const s of SITES) {
    if (s.type !== type) continue;
    if (type !== 'im' && s.view !== view) continue;
    if (/^arm_back_[lr]_f$/.test(s.id)) continue; // the arm is drawn once, on the back
    const d = age[spot(s.id)];
    if (d != null) any = true;
    const dd = d == null ? Infinity : d;
    if (dd > bd) { bd = dd; best = s; }
  }
  return any && best ? { site: best, days: bd === Infinity ? null : bd } : null;
}

function typeOfSites(ids) {
  for (const id of ids || []) {
    const s = getSiteById(id);
    if (s) return s.type;
  }
  return null;
}

// The route the picker opens on: the saved site's, else the one this protocol last used in
// the log, else subcutaneous.
function openingRoute({ initialStored = null, protocolId = null, logs = [] } = {}) {
  const saved = parseStored(initialStored);
  const own = saved.type || typeOfSites(saved.sites);
  if (own === 'subq' || own === 'im') return own;
  if (protocolId == null) return 'subq';
  let bestMs = -Infinity;
  let route = null;
  for (const log of logs || []) {
    if (!log || String(log.protocol_id) !== String(protocolId)) continue;
    const p = parseStored(log.injection_site);
    const ty = p.type || typeOfSites(p.sites);
    if (ty !== 'subq' && ty !== 'im') continue;
    const t = new Date(log.logged_at).getTime();
    if (Number.isFinite(t) && t > bestMs) { bestMs = t; route = ty; }
  }
  return route || 'subq';
}

// The route stored with the picked sites: theirs when they agree, else the one on screen.
function storedType(selected, type) {
  const types = new Set();
  for (const id of selected || []) {
    const s = getSiteById(id);
    if (s) types.add(s.type);
  }
  return types.size === 1 ? [...types][0] : type;
}

module.exports = {
  IMG_W,
  IMG_H,
  PTS,
  SZONE,
  ROWS,
  figureSex,
  viewsFor,
  defaultView,
  imageKey,
  spot,
  siteOn,
  toggleSite,
  figurePoints,
  listRows,
  siteAges,
  siteLongest,
  openingRoute,
  storedType,
};
