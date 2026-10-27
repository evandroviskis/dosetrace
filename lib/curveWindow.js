'use strict';
// The curve's time window (founder 2026-10-26, picture docs/design/curve-short-half-life.html, option A):
// when every compound on the curve has a short half-life (under 6 h: BPC-157, TB-500, GHK-Cu,
// Ipamorelin…), each dose rises and falls within hours — in a window of days it is a one-pixel needle.
// Then the curve is drawn by the hour: the last 24 h and the next 12 h on an hourly grid. With any slower
// compound selected, or a day window the person picked, or an estimate on another date, it stays in
// days. Only the window changes, never the math (precision principle). Pure.
const { curveGridStart, STEP_HOURS } = require('./serumModel');

const H = 3600 * 1000;
const SHORT_HOURS = 6;
const HOURS_PAST = 24;
const HOURS_FUTURE = 12;

// Short: the half-life and, for a modeled rise, the time to peak are both under 6 h.
function isShortHalfLife(entry) {
  if (!entry || !(entry.hours > 0)) return false;
  return entry.hours < SHORT_HOURS && !(entry.tmaxHours >= SHORT_HOURS);
}

function useHoursWindow({ entries, dayPicked = false, readoutDate = null }) {
  if (dayPicked || readoutDate) return false;
  return !!(entries && entries.length) && entries.every(isShortHalfLife);
}

// { start, end, stepMs } of the drawn window.
function curveTimeWindow({ hours, now, pastDays, futureDays }) {
  if (hours) {
    const s = new Date(now - HOURS_PAST * H);
    s.setMinutes(0, 0, 0);
    return { start: s.getTime(), end: now + HOURS_FUTURE * H, stepMs: H };
  }
  return { start: curveGridStart(now, pastDays), end: now + futureDays * 24 * H, stepMs: STEP_HOURS * H };
}

module.exports = { isShortHalfLife, useHoursWindow, curveTimeWindow, HOURS_PAST, HOURS_FUTURE, SHORT_HOURS };
