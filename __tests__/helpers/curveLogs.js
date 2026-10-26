'use strict';
// AD-96 B test helper: the Dose log of a person who marked EVERY planned dose as Taken at its slot time
// (lib/serumModel scheduledDoses up to `upTo`). With these rows the logged past equals the old planned
// curve, so the 1.3.1 guards (exact times, look-back, tile == screen) keep proving the same numbers
// through the logged-doses model. A blend component's rows are its blend protocol's rows.
const M = require('../../lib/serumModel');
const H = require('../../lib/halfLives');

function takenAtEverySlot(protocols, upTo, opts = {}) {
  const rows = [];
  const seen = new Set();
  for (const p of protocols) {
    const pid = p.__blend ? String(p.id).split('__')[0] : String(p.id);
    if (seen.has(pid)) continue;
    seen.add(pid);
    const entry = H.getHalfLifeEntry(M.matchName(p));
    if (!entry) continue;
    const from = opts.from != null ? opts.from : M.curveGridStart(upTo);
    for (const ts of M.scheduledDoses(p, entry, from, upTo, upTo)) {
      if (ts <= upTo) rows.push({ protocol_id: p.__blend ? pid : p.id, outcome: 'Taken', logged_at: new Date(ts).toISOString(), sync_status: 'synced' });
    }
  }
  return rows;
}

module.exports = { takenAtEverySlot };
