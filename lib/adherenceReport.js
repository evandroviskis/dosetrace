'use strict';
// The adherence report's numbers (Settings → Adherence report; it goes to health providers).
// DV-033 (DL-02): the % is Today's 30-day ring — scheduled doses taken ÷ scheduled doses, the rings' slot
// matching (lib/adherenceRings slotCounts) over the ring's window — so the provider sees the user's number.
// A dose the A-177 rule still holds back (`held`, A-181) leaves the due count. The Taken / Skipped /
// Missed numbers are the rows, labelled as rows. Missed = the app's own Missed rows (lib/doseActions scanMissedDoses → lib/missedDoses, the
// rows Today and the Dose log show), except a Missed for a slot before the protocol existed
// (created_at − 1 h, the creation-day grace of lib/schedule.js; F-MISS-1). Overall is the sum
// of the protocols listed, so the two figures can never disagree. Nothing due → null, never a
// made-up 0 % or 100 %. Pure — runs under plain node --test (__tests__/adherenceReport.test.js).

const CREATION_GRACE_MS = 60 * 60 * 1000;

const { isDeclared } = require('./declared');
const { slotCounts } = require('./adherenceRings');

function ms(v) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function pct(taken, total) {
  return total > 0 ? Math.round((100 * taken) / total) : null;
}

function adherenceStats({ protocols = [], logs = [], sinceMs, nowMs = Date.now(), held = {} }) {
  const slots = slotCounts(protocols, logs, sinceMs, nowMs);
  const owed = (p) => { const s = slots[p.id] || { taken: 0, due: 0 }; return { taken: s.taken, due: Math.max(0, s.due - (held[p.id] || 0)) }; };
  const perProtocol = protocols.map((p) => {
    const created = p.created_at ? ms(p.created_at) : null;
    let taken = 0, skipped = 0, missed = 0;
    for (const l of logs) {
      if (l.protocol_id !== p.id) continue;
      if (isDeclared(l, p.created_at)) continue; // A-30: declared history is not a logged dose
      const at = ms(l.logged_at);
      if (at == null || at < sinceMs || at > nowMs) continue;
      if (l.outcome === 'Taken') taken++;
      else if (l.outcome === 'Skipped') skipped++;
      else if (l.outcome === 'Missed') {
        if (created != null && at < created - CREATION_GRACE_MS) continue; // before the protocol existed
        missed++;
      }
    }
    const total = taken + skipped + missed;
    const o = owed(p);
    return { id: p.id, taken, skipped, missed, total, adherence: pct(Math.min(o.taken, o.due), o.due) };
  });
  const sum = (k) => perProtocol.reduce((a, r) => a + r[k], 0);
  const taken = sum('taken'), skipped = sum('skipped'), missed = sum('missed');
  const total = taken + skipped + missed;
  const o = protocols.map(owed).reduce((a, r) => ({ taken: a.taken + Math.min(r.taken, r.due), due: a.due + r.due }), { taken: 0, due: 0 });
  return { perProtocol, overall: { taken, skipped, missed, total, adherence: pct(o.taken, o.due) } };
}

// "{percent}%" with nothing due → "—" (the percent sign goes too, also the spaced " %").
function fillPercent(line, value) {
  if (value == null) return line.replace(/\{percent\}\s?%/, '—').replace('{percent}', '—');
  return line.replace('{percent}', String(value));
}

module.exports = { adherenceStats, fillPercent };
