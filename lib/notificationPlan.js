'use strict';
// Pure, side-effect-free planning for dose reminders and the morning summary.
// No native modules or DB access here, so it can be unit-tested under `node --test`.
// notifications.js turns these plans into scheduled OS notifications.
//
// All dates are handled as local-midnight "YYYY-MM-DD" keys. That format sorts
// and compares correctly as plain strings, which keeps the lookahead logic simple.

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// Local-date key for a Date, e.g. "2026-08-11".
function ymd(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

// Parse a "YYYY-MM-DD" key back to a local-midnight Date.
function parseYmd(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Whole days from key a to key b (b - a). Negative if b is before a.
function dayDiff(aKey, bKey) {
  return Math.round((parseYmd(bKey) - parseYmd(aKey)) / 86400000);
}

// Due-dose date keys for one protocol within [fromKey, fromKey + horizonDays).
// Respects start_date, interval_days and an optional finite schedule_total.
function dueDateKeys(protocol, fromKey, horizonDays) {
  const interval = Math.max(1, protocol.interval_days || 1);
  const total = protocol.schedule_total || 0; // 0 / null = open-ended
  const start = parseYmd(protocol.start_date || fromKey);
  const from = parseYmd(fromKey);
  const end = addDays(from, horizonDays); // exclusive upper bound

  const keys = [];
  const cursor = new Date(start);
  let idx = 0;
  let guard = 0;
  while (cursor < end && guard++ < 4000) {
    if (total && idx >= total) break;
    if (cursor >= from) keys.push(ymd(cursor));
    idx++;
    cursor.setDate(cursor.getDate() + interval);
  }
  return keys;
}

// Per-day morning-summary plan for the next `windowDays` days.
// Each entry is one of:
//   { dateKey, kind: 'due',   list: [names] }   — doses are due that day
//   { dateKey, kind: 'next',  days }            — nothing that day; next dose is `days` (>=2) away
//   { dateKey, kind: 'next1' }                  — nothing that day; next dose is tomorrow
//   { dateKey, kind: 'none' }                   — nothing that day and nothing upcoming (stay quiet)
// `horizonDays` bounds how far ahead the "next dose" lookahead reaches.
function morningSummaryPlan(protocols, todayKey, windowDays, horizonDays) {
  const dueByDay = new Map();
  for (const p of (protocols || [])) {
    for (const k of dueDateKeys(p, todayKey, horizonDays)) {
      if (!dueByDay.has(k)) dueByDay.set(k, []);
      dueByDay.get(k).push(p.name || '');
    }
  }
  const allDueKeys = [...dueByDay.keys()].sort();

  const plans = [];
  for (let i = 0; i < windowDays; i++) {
    const dayKey = ymd(addDays(parseYmd(todayKey), i));
    const names = dueByDay.get(dayKey);
    if (names && names.length) {
      plans.push({ dateKey: dayKey, kind: 'due', list: names.filter(Boolean) });
      continue;
    }
    const next = allDueKeys.find((k) => k > dayKey);
    if (!next) {
      plans.push({ dateKey: dayKey, kind: 'none' });
    } else {
      const days = dayDiff(dayKey, next);
      plans.push(days === 1 ? { dateKey: dayKey, kind: 'next1' } : { dateKey: dayKey, kind: 'next', days });
    }
  }
  return plans;
}

module.exports = { ymd, parseYmd, addDays, dayDiff, dueDateKeys, morningSummaryPlan };
