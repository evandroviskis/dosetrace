'use strict';
// Today v2.1 tracker rings (founder approved 2026-09-29; docs/design/today-build-handoff.md
// §2). DOSES, not days: scheduled doses taken ÷ doses scheduled.
//   today   — every dose scheduled today (day progress); none → null ("Nothing due").
//   week    — the last 7 days (today included), doses whose time has passed.
//   month   — the last 30 days, same rule.
// A protocol counts from its start_date and the moment it was added (the creation-day
// rule of lib/schedule.js); paused / deleted protocols are left out.
// A logged dose matches the nearest unmatched scheduled dose within ± half its interval
// (a weekly dose taken a day late counts); each scheduled dose matches at most once, so
// an extra Taken never adds and a ring never passes 100%. A skip is not taken.
// Pure — runs under plain node --test (__tests__/adherenceRings.test.js).
const { expectedSlotTimesOn, expectedDosesOn } = require('./schedule');
const { endedAtMs } = require('./protocolEnd');
const { isDeclared, CREATION_GRACE_MS } = require('./declared');

const DAY = 86400000;

function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

// Scheduled moments of p from fromMs to toMs (day by day).
function slotsBetween(p, fromMs, toMs) {
  const out = [];
  const c = p.created_at ? Date.parse(p.created_at) : NaN;
  const createdFloor = Number.isFinite(c) ? c - CREATION_GRACE_MS : -Infinity;
  for (let day = startOfDay(fromMs); day <= toMs; day = startOfDay(day + DAY + 3600000)) {
    const date = new Date(day);
    let times = expectedSlotTimesOn(p, date);
    // A protocol without reminder times still has doses that day: place them at noon.
    if (!times.length) times = Array.from({ length: expectedDosesOn(p, date) }, () => '12:00');
    for (const t24 of times) {
      const [h, m] = t24.split(':').map(Number);
      const slot = new Date(day); slot.setHours(h, m, 0, 0);
      const ms = slot.getTime();
      // A-30: never a slot from before the protocol was added (created_at − 1 h).
      if (ms >= fromMs && ms <= toMs && ms >= createdFloor) out.push(ms);
    }
  }
  return out;
}

function countWindow(protocols, logs, fromMs, toMs) {
  let taken = 0, due = 0;
  for (const p of protocols) {
    const slots = slotsBetween(p, fromMs, toMs);
    if (!slots.length) continue;
    due += slots.length;
    const half = ((p.interval_days || 1) * DAY) / 2;
    const pool = logs
      .filter((l) => l.protocol_id === p.id && l.outcome === 'Taken' && !isDeclared(l, p.created_at))
      .map((l) => Date.parse(l.logged_at))
      .filter(Number.isFinite);
    const used = new Set();
    for (const s of slots) {
      let best = -1, bestGap = Infinity;
      pool.forEach((t, i) => {
        if (used.has(i)) return;
        const gap = Math.abs(t - s);
        if (gap <= half && gap < bestGap) { best = i; bestGap = gap; }
      });
      if (best >= 0) { used.add(best); taken++; }
    }
  }
  return { taken, due };
}

function adherenceRings({ protocols = [], logs = [], nowMs = Date.now() }) {
  // Active and ENDED protocols (A-83: an ended one keeps its past days; lib/schedule expects
  // nothing after its end). Deleted ones, and a stopped one with no known end, never count.
  const live = protocols.filter((p) => p && !p.deleted_at && p.sync_status !== 'deleted'
    && ((p.active !== 0 && p.active !== false) || endedAtMs(p) != null));
  const today0 = startOfDay(nowMs);
  const todayEnd = today0 + DAY - 1;
  const today = countWindow(live, logs, today0, todayEnd);
  const week = countWindow(live, logs, startOfDay(today0 - 6 * DAY + 3600000), nowMs);
  const month = countWindow(live, logs, startOfDay(today0 - 29 * DAY + 3600000), nowMs);
  return { today: today.due ? today : null, week, month };
}

function ringPct(r) {
  if (!r || !r.due) return null;
  return Math.min(100, Math.round((100 * r.taken) / r.due));
}

module.exports = { adherenceRings, ringPct };
