'use strict';
// A-135 (founder 2026-10-17, picture docs/design/a135-today-skeleton.html, "aprovo, pulso ligado"):
// the rules behind Today's opening skeleton. Pure (no React, no storage): the layout memory
// ("mould") and its sanitizing, the default shape set, which block may fill in, the opening's
// choice, and the pulse. Spec: docs/specs/today-skeleton.md.
//
// The mould holds ONLY which blocks Today showed, how many rows / cards, and their measured
// heights (the vertical room each block takes, its bottom margin included) — never data: no name,
// dose, time, text or value. Every read and write goes through sanitizeLayout.

const PULSE_MS = 1600;
// Today's blocks, in Today's order (header → alerts → pending from yesterday → ring → food log →
// "add a protocol" → doses).
const BLOCK_KEYS = ['alerts', 'pending', 'tracker', 'food', 'empty', 'doses'];
const POSTURES = ['single', 'book'];
const MAX_H = 4000;
const MAX_ROWS = 8;
const MAX_CARDS = 8;

// The default shape set (picture: "anel, comida, 2 doses, sem alertas"), measured on a 412 pt
// phone (TodayTracker slab 283 + 26, the emphasised food card 194 + 26, a dose card 181).
const DEFAULT_LAYOUT = {
  tracker: { h: 309 },
  food: { h: 220 },
  doses: { h: 28 + 10 + 181 + 10 + 181 + 26, cards: [181, 181] },
};

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const height = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_H ? Math.round(v) : null);
const rows = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(MAX_ROWS, Math.round(v)) : 1);

function sanitizeBlock(key, v) {
  if (!isObj(v)) return null;
  const h = height(v.h);
  if (h == null) return null;
  if (key === 'alerts' || key === 'pending') return { h, n: rows(v.n) };
  if (key === 'doses') {
    const cards = Array.isArray(v.cards) ? v.cards.map(height).filter((x) => x != null).slice(0, MAX_CARDS) : [];
    return { h, cards };
  }
  return { h };
}

// Only the known blocks, each with only its known fields; null for anything that is not a layout.
function sanitizeLayout(raw) {
  if (!isObj(raw)) return null;
  const out = {};
  for (const key of BLOCK_KEYS) {
    const b = sanitizeBlock(key, raw[key]);
    if (b) out[key] = b;
  }
  return out;
}

// The stored value: { user, single, book } — one owner (the last signed-in user id) and a mould per
// posture (phone / book). Anything else is dropped; a broken value is no store at all.
function parseStore(raw) {
  let v = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return null; } }
  if (!isObj(v) || typeof v.user !== 'string' || !v.user || v.user.length > 128) return null;
  return { user: v.user, single: sanitizeLayout(v.single), book: sanitizeLayout(v.book) };
}

function lastSignedInUser(store) {
  return store && typeof store.user === 'string' && store.user ? store.user : null;
}

// The mould of this user and posture. userId null = the opening (no user read yet): the owner's.
function layoutFor(store, userId, posture) {
  if (!store || !lastSignedInUser(store)) return null;
  if (userId && store.user !== userId) return null;
  const p = POSTURES.includes(posture) ? posture : 'single';
  return store[p] ? sanitizeLayout(store[p]) : null;
}

// A new store with this user's mould for the posture; another user starts a fresh store.
function withLayout(store, userId, posture, layout) {
  const base = store && store.user === userId ? store : { user: userId, single: null, book: null };
  const p = POSTURES.includes(posture) ? posture : 'single';
  return { user: userId, single: sanitizeLayout(base.single), book: sanitizeLayout(base.book), [p]: sanitizeLayout(layout) };
}

// What Today drew: present = { alerts: rows, pending: rows, tracker: bool, empty: bool, doses: bool }
// (the food card is present when it is taller than 0), heights = measured room per block,
// cards = the dose cards' measured heights in order.
function layoutFromMeasure({ present = {}, heights = {}, cards = [] } = {}) {
  const out = {};
  const h = (k) => height(heights[k]);
  if (present.alerts > 0 && h('alerts')) out.alerts = { h: h('alerts'), n: rows(present.alerts) };
  if (present.pending > 0 && h('pending')) out.pending = { h: h('pending'), n: rows(present.pending) };
  if (present.tracker && h('tracker')) out.tracker = { h: h('tracker') };
  if (h('food')) out.food = { h: h('food') };
  if (present.empty && h('empty')) out.empty = { h: h('empty') };
  if (present.doses && h('doses')) out.doses = { h: h('doses'), cards: (cards || []).map(height).filter((x) => x != null).slice(0, MAX_CARDS) };
  return sanitizeLayout(out);
}

// Equal within 1 pt (a re-measure that changes nothing is not written again).
function sameLayout(a, b) {
  const x = sanitizeLayout(a), y = sanitizeLayout(b);
  if (!x || !y) return false;
  const near = (p, q) => Math.abs(p - q) <= 1;
  for (const key of BLOCK_KEYS) {
    const p = x[key], q = y[key];
    if (!p !== !q) return false;
    if (!p) continue;
    if (!near(p.h, q.h) || (p.n || 0) !== (q.n || 0)) return false;
    if (key === 'doses') {
      if (p.cards.length !== q.cards.length) return false;
      if (p.cards.some((c, i) => !near(c, q.cards[i]))) return false;
    }
  }
  return true;
}

// The placeholder blocks to draw, in Today's order: the mould, or the default set without one.
function skeletonPlan(layout) {
  const lay = layout ? sanitizeLayout(layout) : null;
  const src = lay || DEFAULT_LAYOUT;
  return BLOCK_KEYS.filter((k) => src[k]).map((k) => ({ key: k, ...src[k] }));
}

// Which block may show its real content: each needs only its own first reads (reads = { name: true }
// as each first read finishes). The empty state and the doses need the protocols read — never "add a
// protocol" before. firstLoaded (every read done, or the 4 s cap of A-120) ends every placeholder.
function sectionsReady(reads = {}, firstLoaded = false) {
  if (firstLoaded) return { alerts: true, pending: true, tracker: true, food: true, doses: true };
  const r = reads || {};
  return {
    alerts: !!(r.alerts && r.protocols),
    pending: !!(r.pending && r.protocols),
    tracker: !!(r.protocols && r.todayLogs && r.streak),
    food: !!r.food,
    doses: !!(r.protocols && r.todayLogs && r.pStreaks && r.sites),
  };
}

// The app's loading gate. lastUser: the mould's owner (string), null (no signed-in session last
// time), undefined (not read yet). Today's opening needs the fonts, the language and the theme read,
// so its first frame is already the final one; until then a plain ground (a few ms), never a spinner.
function bootView({ lastUser, fontsLoaded, langReady, themeReady }) {
  if (lastUser === undefined) return 'blank';
  if (!lastUser) return 'spinner';
  return fontsLoaded && langReady && themeReady ? 'today' : 'blank';
}

const shouldPulse = ({ reduceMotion } = {}) => reduceMotion !== true;
// 1 → 0.5 → 1 over one period (ease in-out, as the picture's keyframes).
const pulseOpacity = (p) => 0.75 + 0.25 * Math.cos(2 * Math.PI * p);
// The wall clock's place in the period, so every placeholder pulses together.
const pulsePhase = (nowMs) => (((nowMs % PULSE_MS) + PULSE_MS) % PULSE_MS) / PULSE_MS;

module.exports = {
  PULSE_MS, BLOCK_KEYS, DEFAULT_LAYOUT,
  sanitizeLayout, parseStore, lastSignedInUser, layoutFor, withLayout, layoutFromMeasure, sameLayout,
  skeletonPlan, sectionsReady, bootView, shouldPulse, pulseOpacity, pulsePhase,
};
