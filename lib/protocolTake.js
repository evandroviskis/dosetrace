'use strict';
// A-42: whether a My Protocols card shows "Mark complete" — exactly when Today would show that
// dose as actionable: today's open slot (lib/dosePageState cardPlan, Today's own card plan) or
// the slot pending from yesterday (lib/pendingYesterday, A-40). Returns the focus Today opens on
// ({ kind: 'today' | 'pending', focus: { protocolId, dayKey, slotMs, ti } }) or null. Pure.
const { cardPlan } = require('./dosePageState');
const { pendingPromptFor } = require('./pendingYesterday');

function protocolTakeAction({ protocol, todayLogs = [], pending = [], nowMs = Date.now() }) {
  if (!protocol) return null;
  const cp = cardPlan({ protocol, logs: todayLogs, nowMs });
  if (cp.next) {
    return { kind: 'today', focus: { protocolId: protocol.id, dayKey: cp.next.dayKey, slotMs: cp.next.slotMs, ti: cp.next.ti } };
  }
  const pend = pendingPromptFor(pending, protocol.id);
  if (pend) return { kind: 'pending', focus: { protocolId: protocol.id, dayKey: pend.dayKey, slotMs: pend.slotMs, ti: pend.ti != null ? pend.ti : null } };
  return null;
}

module.exports = { protocolTakeAction };
