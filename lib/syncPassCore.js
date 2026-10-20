'use strict';
// A-119 (OD-4, OD-5, OD-7): one sync pass, as plain logic (lib/sync.js wires Supabase; the
// two-device harness wires the in-memory cloud). The active-device check is the FIRST server call of
// every pass: a phone the server says was replaced never pushes and never pulls. A request the
// server refuses as "not the active device" (DT001/DT002/DT003) leaves the rows as they are (syncCore
// keeps pending rows pending on any error) and ends the pass before the pull; the check then runs
// again and turns a confirmed answer into the verdict. A pass that leaves nothing unsent records the
// server time of this phone's last full backup (the sign-out sheet, screen 3).

const { isDeviceRefusal } = require('./deviceRules');

// d: { gate(ctx) → { go }, push(), pull(), refused() → bool (and resets), pendingCount() → n,
//      markSent() }  → { ran, refused?, reason? }
async function runSyncPass(d) {
  let g = { go: true };
  if (d.gate) { try { g = await d.gate('sync'); } catch { g = { go: true, reason: 'gate_error' }; } }
  if (!g || !g.go) return { ran: false, reason: g && g.reason };
  if (d.refused) d.refused(); // a fresh pass: forget refusals of an earlier one
  await d.push();
  if (d.refused && d.refused()) {
    try { if (d.gate) await d.gate('refused'); } catch { /* the next pass asks again */ }
    return { ran: true, refused: true };
  }
  await d.pull();
  if (d.refused && d.refused()) {
    try { if (d.gate) await d.gate('refused'); } catch { /* the next pass asks again */ }
    return { ran: true, refused: true };
  }
  if (d.markSent && d.pendingCount) {
    let left = null;
    try { left = await d.pendingCount(); } catch { left = null; }
    if (left === 0) { try { await d.markSent(); } catch { /* best effort */ } }
  }
  return { ran: true };
}

// The cloud adapter with a note of whether the server refused this device during the pass.
function trackRefusals(cloud) {
  let refused = false;
  const out = Object.create(cloud);
  for (const m of ['delete', 'update', 'insert', 'fetchSince', 'fetchAll', 'fetchIds', 'fetchIn']) {
    if (typeof cloud[m] !== 'function') continue;
    out[m] = async (...args) => {
      const r = await cloud[m](...args);
      if (r && isDeviceRefusal(r.error)) refused = true;
      return r;
    };
  }
  out.takeRefused = () => { const v = refused; refused = false; return v; };
  return out;
}

module.exports = { runSyncPass, trackRefusals };
