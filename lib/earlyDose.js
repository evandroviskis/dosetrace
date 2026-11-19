'use strict';
// Dose marked before its time (docs/specs/early-dose-guard.md, founder 2026-11-19 10:42, option B,
// 2 h; picture docs/design/early-dose-guard.html). The one owner of the rule: a dose is early when
// its scheduled time is MORE than 2 h after the tap; exactly 2 h or less, a late dose or a dose
// without a time is not. Today splits its doses with it ("Agora" / "Mais tarde hoje") and its one
// take (handleTake) asks before writing an early dose. Pure CommonJS, tested in
// __tests__/earlyDoseGuard.test.js.
const { cardPlan } = require('./dosePageState');

const EARLY_LIMIT_MS = 2 * 60 * 60 * 1000;

function isEarlyTake(slotMs, nowMs) {
  return Number.isFinite(slotMs) && Number.isFinite(nowMs) && slotMs - nowMs > EARLY_LIMIT_MS;
}

// cards: Today's open dose cards (one per protocol, in Today's order). Each card offers its next
// open slot (A-78 cardPlan). now = the cards whose next slot is not early (due within 2 h, late,
// untimed), drawn as full cards; later = { protocol, slot } for the early ones, by time. A card
// that still holds a skipped slot of today it can log stays whole in now (that line is something
// to do now; its main Concluir for the later slot asks).
function splitTodayDoses({ cards = [], logs = [], nowMs = Date.now() }) {
  const now = [];
  const later = [];
  for (const p of cards) {
    const cp = cardPlan({ protocol: p, logs, nowMs });
    const early = !!(cp.next && isEarlyTake(cp.next.slotMs, nowMs));
    if (early && !cp.skipped.some((s) => s.canTake)) later.push({ protocol: p, slot: cp.next });
    else now.push(p);
  }
  later.sort((a, b) => a.slot.slotMs - b.slot.slotMs);
  return { now, later };
}

// "Faltam cerca de 12 horas": whole hours, rounded (always 2 or more for an early dose).
function hoursLeft(slotMs, nowMs) {
  return Math.round((slotMs - nowMs) / 3600000);
}

// "em 11 h 50 min" / "em 12 h" in the app language (t = the app's translate function).
function laterInLabel(slotMs, nowMs, t) {
  const mins = Math.max(0, Math.round((slotMs - nowMs) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m
    ? t('today_later_in_hm').replace('{h}', String(h)).replace('{m}', String(m))
    : t('today_later_in_h').replace('{h}', String(h));
}

module.exports = { EARLY_LIMIT_MS, isEarlyTake, splitTodayDoses, hoursLeft, laterInLabel };
