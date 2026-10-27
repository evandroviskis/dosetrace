'use strict';
// The curve's time window (founder 2026-10-26, pictures docs/design/curve-short-half-life.html option A
// and docs/design/curve-hours-choice.html): when every compound on the curve has a short half-life
// (under 6 h: BPC-157, TB-500, GHK-Cu, Ipamorelin…), each dose rises and falls within hours — in a
// window of days it is a one-pixel needle. Then the curve is drawn ONLY by the hour (12/24/36/48/72 h,
// opens on 36 h; 2/3 back, 1/3 ahead). With any slower compound selected it is ONLY in days. Never both
// ("Não faz sentido deixar os dois"). Only the window changes, never the math (precision). Pure.
const { curveGridStart, STEP_HOURS } = require('./serumModel');

const H = 3600 * 1000;
const SHORT_HOURS = 6;
const HOUR_PRESETS = [12, 24, 36, 48, 72];
const DEFAULT_HOURS = 36;

// Short: the half-life and, for a modeled rise, the time to peak are both under 6 h.
function isShortHalfLife(entry) {
  if (!entry || !(entry.hours > 0)) return false;
  return entry.hours < SHORT_HOURS && !(entry.tmaxHours >= SHORT_HOURS);
}

function useHoursWindow({ entries }) {
  return !!(entries && entries.length) && entries.every(isShortHalfLife);
}

// A window of `total` hours: 2/3 back, 1/3 ahead.
function hoursSplit(total) {
  const t = HOUR_PRESETS.includes(total) ? total : DEFAULT_HOURS;
  return { past: (t * 2) / 3, future: t / 3 };
}

// { start, end, stepMs } of the drawn window. hours: the hour choice (0 / null = days).
function curveTimeWindow({ hours, now, pastDays, futureDays }) {
  if (hours) {
    const { past, future } = hoursSplit(hours);
    const s = new Date(now - past * H);
    s.setMinutes(0, 0, 0);
    return { start: s.getTime(), end: now + future * H, stepMs: H };
  }
  return { start: curveGridStart(now, pastDays), end: now + futureDays * 24 * H, stepMs: STEP_HOURS * H };
}

module.exports = { isShortHalfLife, useHoursWindow, curveTimeWindow, hoursSplit, HOUR_PRESETS, DEFAULT_HOURS, SHORT_HOURS };
