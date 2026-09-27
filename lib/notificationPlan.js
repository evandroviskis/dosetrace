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

// Days (local "YYYY-MM-DD", ascending) to send the 20:00 "anything else
// today?" question, looking `windowDays` calendar days ahead from todayKey.
// Rule (founder 2026-09-27, FL-18): while the reality check runs
// (startKey … startKey + rcDays − 1), once a day at 20:00 — unless the user
// already closed that local day ("Nothing else today" / "that's it"). Logging
// food no longer cancels the evening's question (a day with breakfast logged
// still needs its dinner), and there is no every-other-day backoff.
function foodNudgeDays(startKey, todayKey, closedKeys, windowDays, rcDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startKey)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayKey))) return [];
  const closed = closedKeys instanceof Set ? closedKeys : new Set(closedKeys || []);
  const lastKey = ymd(addDays(parseYmd(startKey), rcDays - 1));
  const firstKey = todayKey < startKey ? startKey : todayKey;
  const out = [];
  for (let i = 0; i < windowDays; i++) {
    const d = ymd(addDays(parseYmd(firstKey), i));
    if (d > lastKey) break;
    if (closed.has(d)) continue;
    out.push(d);
  }
  return out;
}

// Local day a food reminder is about: its data.dayKey, else its id
// ("food-log-2026-09-27"), else null.
function foodReminderDay(id, data) {
  const k = data && typeof data.dayKey === 'string' ? data.dayKey : null;
  if (k && /^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
  const m = /^(?:snz-)?food-log-(\d{4}-\d{2}-\d{2})$/.exec(String(id || ''));
  return m ? m[1] : null;
}

// ── Snooze + notification actions (founder 2026-09-24) ─────────────
// "In 1 hour" is exactly that. "Tomorrow" is the same time tomorrow — except
// late-evening / night snoozes, which land at 09:00 instead of the middle of the night.
const SNOOZE_HOUR_MS = 60 * 60 * 1000;
function snoozeFireAt(kind, nowMs) {
  if (kind === 'hour') return nowMs + SNOOZE_HOUR_MS;
  const n = new Date(nowMs);
  const h = n.getHours();
  if (h >= 7 && h < 21) return nowMs + 24 * SNOOZE_HOUR_MS;
  const t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + (h >= 21 ? 1 : 0), 9, 0, 0, 0);
  return t.getTime();
}

// Snoozed copy id. Its own prefix, so no routine resync (which clears "dose-",
// "vial-", "food-log-"…) ever wipes it; re-snoozing a copy keeps one id.
function snoozeId(origId) {
  const id = String(origId || '');
  return id.startsWith('snz-') ? id : 'snz-' + id;
}

// Protocol/day/slot of a dose reminder id ("dose-12-2026-09-24-t1[-f0]",
// optionally "snz-"-prefixed). null for anything else.
function parseDoseId(id) {
  const m = /^(?:snz-)?dose-(\d+)-(\d{4}-\d{2}-\d{2})-t(\d+)(?:-f\d+)?$/.exec(String(id || ''));
  return m ? { protocolId: Number(m[1]), dayKey: m[2], ti: Number(m[3]) } : null;
}

// Keep only snoozes still in the future and still wanted, newest 4 (iOS caps
// pending local notifications at 64; the regular plan uses ~56).
const MAX_SNOOZES = 4;
function pruneSnoozes(records, nowMs, stillWanted) {
  return (records || [])
    .filter((r) => r && r.id && r.fireAt > nowMs && (!stillWanted || stillWanted(r)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_SNOOZES);
}

module.exports = { ymd, parseYmd, addDays, dayDiff, dueDateKeys, morningSummaryPlan, foodNudgeDays, foodReminderDay, snoozeFireAt, snoozeId, parseDoseId, pruneSnoozes, MAX_SNOOZES };
