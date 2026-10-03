'use strict';
// The adherence report's numbers (Settings → Adherence report; it goes to health providers).
// One definition, per protocol and overall:
//   adherence = complete ÷ (complete + skipped + missed), over the scheduled doses of the period.
// Missed = the app's own Missed rows (lib/doseActions scanMissedDoses → lib/missedDoses, the
// rows Today and the Dose log show), except a Missed for a slot before the protocol existed
// (created_at − 1 h, the creation-day grace of lib/schedule.js; F-MISS-1). Overall is the sum
// of the protocols listed, so the two figures can never disagree. Nothing due → null, never a
// made-up 0 % or 100 %. Pure — runs under plain node --test (__tests__/adherenceReport.test.js).

const CREATION_GRACE_MS = 60 * 60 * 1000;

function ms(v) {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function pct(taken, total) {
  return total > 0 ? Math.round((100 * taken) / total) : null;
}

function adherenceStats({ protocols = [], logs = [], sinceMs, nowMs = Date.now() }) {
  const perProtocol = protocols.map((p) => {
    const created = p.created_at ? ms(p.created_at) : null;
    let taken = 0, skipped = 0, missed = 0;
    for (const l of logs) {
      if (l.protocol_id !== p.id) continue;
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
    return { id: p.id, taken, skipped, missed, total, adherence: pct(taken, total) };
  });
  const sum = (k) => perProtocol.reduce((a, r) => a + r[k], 0);
  const taken = sum('taken'), skipped = sum('skipped'), missed = sum('missed');
  const total = taken + skipped + missed;
  return { perProtocol, overall: { taken, skipped, missed, total, adherence: pct(taken, total) } };
}

// "{percent}%" with nothing due → "—" (the percent sign goes too, also the spaced " %").
function fillPercent(line, value) {
  if (value == null) return line.replace(/\{percent\}\s?%/, '—').replace('{percent}', '—');
  return line.replace('{percent}', String(value));
}

module.exports = { adherenceStats, fillPercent };
