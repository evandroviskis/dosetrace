'use strict';
// A-30, option C: history from BEFORE a protocol was added to the app is DECLARED, never logged.
// A dose row dated before the protocol existed in the app (created_at − 1 h: the A-32 creation
// grace, so a Missed slot minutes before creation that the user fixes stays logged) is declared —
// the old backfill dialog wrote such rows. Adherence, the streaks and the Log counts use logged
// rows only; the rows stay in the Dose log and the export (never deleted). The curve still draws
// the declared time from the start date, marked as estimated (lib/serumModel estimatedBeforeMs).
// Pure, CommonJS.

const CREATION_GRACE_MS = 60 * 60 * 1000;
const DAY = 86400000;

function isDeclared(log, protocolCreatedAt) {
  if (!log || !protocolCreatedAt) return false;
  const created = Date.parse(protocolCreatedAt);
  const at = Date.parse(log.logged_at);
  return Number.isFinite(created) && Number.isFinite(at) && at < created - CREATION_GRACE_MS;
}

// The logged rows only, judged against each row's own protocol (protocols: rows with id + created_at).
function loggedOnly(logs, protocols) {
  const createdOf = {};
  for (const p of protocols || []) if (p) createdOf[p.id] = p.created_at;
  return (logs || []).filter((l) => !isDeclared(l, l.protocol_created_at || createdOf[l.protocol_id]));
}

// Taken / Skipped / Missed counts of the Log (rows carry protocol_created_at from the join).
function outcomeCounts(rows) {
  const c = { Taken: 0, Skipped: 0, Missed: 0 };
  for (const l of rows || []) {
    if (c[l.outcome] == null || isDeclared(l, l.protocol_created_at)) continue;
    c[l.outcome]++;
  }
  return c;
}

// (c) "Same dose for the last N weeks?" when a protocol is added with a past start date. N ≈ 5
// half-lives (the curve then carries ~3 % of older doses), never longer than since the start.
// null = no question: the start is today or later, no half-life data (no curve), or a half-life
// under a day (history does not change today's curve).
function historyQuestion(p, nowMs = Date.now()) {
  if (!p || !p.start_date) return null;
  let entry = null;
  try {
    const { getHalfLifeEntry } = require('./halfLives');
    const { matchName } = require('./serumModel');
    entry = getHalfLifeEntry(matchName(p));
  } catch { entry = null; }
  if (!entry || !(entry.hours >= 24)) return null;
  const start = new Date(p.start_date + 'T00:00:00').getTime();
  const t = new Date(nowMs);
  const today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  if (!Number.isFinite(start) || start >= today0) return null;
  const sinceStart = Math.round((today0 - start) / DAY);
  const span = Math.min((5 * entry.hours) / 24, sinceStart);
  if (span >= 14) return { unit: 'weeks', n: Math.round(span / 7) };
  return { unit: 'days', n: Math.max(1, Math.ceil(span)) };
}

module.exports = { CREATION_GRACE_MS, isDeclared, loggedOnly, outcomeCounts, historyQuestion };
