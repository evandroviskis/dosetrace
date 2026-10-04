'use strict';
// A-40 (S-17), founder option 1 "Pending from yesterday". Pure — no React Native /
// Expo imports — so it runs under plain node --test (__tests__/pendingYesterday.test.js).
//
// After midnight, yesterday's un-logged dose slots stay visible on Today until
// slot + 12 h. That is the Missed scan's LATE_MS (lib/missedDoses.js): from then on
// the scan writes a Missed row, which the Dose log can correct. A slot counts as
// logged when a row of ANY outcome covers it, with the SAME matching as the scan
// (nearest unused log within [coverStartMs(slot), slot + 12 h], earliest slot
// first — the window helper is the scan's own, S-18), so the block and the scan
// never disagree (consistency test).
const { expectedSlotTimesOn } = require('./schedule');
const { LATE_MS, coverStartMs, lateSameDayPass, zoneSlots, todayStartMs } = require('./missedDoses');

const HOUR = 60 * 60 * 1000;
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function slotsOn(p, day) {
  return expectedSlotTimesOn(p, day).map((s, ti) => {
    const [h, m] = s.split(':').map(Number);
    const dt = new Date(day);
    dt.setHours(h, m, 0, 0);
    return { ti, slotMs: dt.getTime() };
  });
}

// Returns [{ protocolId, dayKey, ti, slotMs }] for yesterday's slots that are not
// covered by any log and are still inside slot + 12 h, earliest first.
//   protocols: protocol rows; logs: dose_log rows ({ protocol_id, outcome, logged_at })
//   tzSinceMs: when the device's time zone last changed (A-49 guard, S-19) — a slot
//   from before it was rebuilt in the new zone and may already be logged in the old one.
//   zoneHistory: the device's zone history (A-51) — when given, the slots are those of the last
//   12 h before today's start, each built in the zone of its own day (tzSinceMs is then not needed).
function pendingFromYesterday({ protocols, logs, nowMs = Date.now(), tzSinceMs = null, zoneHistory = null }) {
  if (Array.isArray(zoneHistory) && zoneHistory.length) return pendingInZones({ protocols, logs, nowMs, zoneHistory });
  const yesterday = new Date(nowMs);
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayKey = keyOf(yesterday);
  const out = [];

  for (const p of protocols || []) {
    if (!p || p.active === 0 || p.deleted_at || p.sync_status === 'deleted') continue;
    let slots = slotsOn(p, yesterday);
    // Never a slot from before the protocol existed (A-32 contract: created − 1 h).
    const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
    if (Number.isFinite(createdMs)) slots = slots.filter((s) => s.slotMs >= createdMs - HOUR);
    if (Number.isFinite(tzSinceMs)) slots = slots.filter((s) => s.slotMs >= tzSinceMs);
    if (!slots.length) continue;

    // Only offer slots Mark taken can write: planMarkTaken refuses once that
    // calendar day already has doses_per_day Taken rows (A-35 cap). Since S-18 the shared window
    // already covers an early same-day dose; this stays as the write-side guard.
    const dayStart = yesterday.getTime();
    const dayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1).getTime();
    const takenThatDay = (logs || []).filter((l) => l.protocol_id === p.id && l.outcome === 'Taken'
      && Date.parse(l.logged_at) >= dayStart && Date.parse(l.logged_at) < dayEnd).length;
    if (takenThatDay >= (p.doses_per_day || 1)) continue;

    const avail = (logs || [])
      .filter((l) => l.protocol_id === p.id)
      .map((l) => Date.parse(l.logged_at))
      .filter((t) => Number.isFinite(t));
    const used = new Array(avail.length).fill(false);
    const uncovered = [];

    for (const s of slots) {
      const startMs = coverStartMs(s.slotMs);
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < avail.length; i++) {
        if (used[i]) continue;
        const d = avail[i] - s.slotMs;
        if (avail[i] >= startMs && d <= LATE_MS && Math.abs(d) < bestDist) { bestDist = Math.abs(d); best = i; }
      }
      if (best >= 0) { used[best] = true; continue; }
      uncovered.push(s);
    }
    // F1: the same second pass as the scan (a late dose on the slot's own day covers it).
    const left = new Set(lateSameDayPass(uncovered.map((s) => s.slotMs), avail, used));
    for (const s of uncovered) {
      if (left.has(s.slotMs) && nowMs - s.slotMs < LATE_MS) out.push({ protocolId: p.id, dayKey, ti: s.ti, slotMs: s.slotMs });
    }
  }
  return out.sort((a, b) => a.slotMs - b.slotMs);
}

// A-51: the same block with zone-aware slots: every slot before today's start (in the zone the
// device is in now) that is still inside slot + 12 h, built in the zone of its own day; the
// same matching as the scan, with each slot's own day bounds.
function pendingInZones({ protocols, logs, nowMs, zoneHistory }) {
  const today0 = todayStartMs(zoneHistory, nowMs);
  const out = [];
  for (const p of protocols || []) {
    if (!p || p.active === 0 || p.deleted_at || p.sync_status === 'deleted') continue;
    let slots = zoneSlots(p, zoneHistory, today0 - 2 * 86400000, today0);
    const createdMs = p.created_at ? Date.parse(p.created_at) : NaN;
    if (Number.isFinite(createdMs)) slots = slots.filter((s) => s.slotMs >= createdMs - HOUR);
    const mine = (logs || []).filter((l) => l.protocol_id === p.id);
    // The write-side cap (A-35): a day that already has doses_per_day Taken rows offers nothing.
    slots = slots.filter((s) => mine.filter((l) => l.outcome === 'Taken'
      && Date.parse(l.logged_at) >= s.dayStartMs && Date.parse(l.logged_at) <= s.dayEndMs).length < (p.doses_per_day || 1));
    if (!slots.length) continue;
    const avail = mine.map((l) => Date.parse(l.logged_at)).filter((t) => Number.isFinite(t));
    const used = new Array(avail.length).fill(false);
    const uncovered = [];
    for (const s of slots) {
      const startMs = coverStartMs(s.slotMs, s.dayStartMs);
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < avail.length; i++) {
        if (used[i]) continue;
        const d = avail[i] - s.slotMs;
        if (avail[i] >= startMs && d <= LATE_MS && Math.abs(d) < bestDist) { bestDist = Math.abs(d); best = i; }
      }
      if (best >= 0) { used[best] = true; continue; }
      uncovered.push(s);
    }
    const bySlot = {};
    for (const s of uncovered) bySlot[s.slotMs] = s;
    const left = new Set(lateSameDayPass(uncovered.map((s) => s.slotMs), avail, used, (ms) => bySlot[ms].dayEndMs));
    for (const s of uncovered) {
      if (left.has(s.slotMs) && nowMs - s.slotMs < LATE_MS) out.push({ protocolId: p.id, dayKey: s.dayKey, ti: s.ti, slotMs: s.slotMs });
    }
  }
  return out.sort((a, b) => a.slotMs - b.slotMs);
}

// Mark taken on a TODAY card while that protocol has a pending slot from yesterday:
// the prompt asks which day the dose is for, about the EARLIEST pending slot. After
// the user chose (pendingResolved), the retap never prompts again.
function pendingPromptFor(pendingList, protocolId, { pendingResolved = false } = {}) {
  if (pendingResolved) return null;
  const mine = (pendingList || []).filter((x) => x && x.protocolId === protocolId);
  if (!mine.length) return null;
  return mine.reduce((a, b) => (b.slotMs < a.slotMs ? b : a));
}

module.exports = { pendingFromYesterday, pendingPromptFor };
