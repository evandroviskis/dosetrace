'use strict';
// A-51: wall-clock time in a named time zone ↔ the instant, with Intl (Hermes has it on iOS and
// Android). No zone, or Intl without time-zone support → the device's own local time (the
// behaviour before A-51). Pure, CommonJS (runs under node --test).

const fmtCache = {};
function formatter(tz) {
  if (!fmtCache[tz]) {
    fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
  }
  return fmtCache[tz];
}

// { y, m (1-12), d, h, min } of the instant in the zone (device local without a zone).
function wallParts(tz, ms) {
  if (tz) {
    try {
      const o = {};
      for (const part of formatter(tz).formatToParts(new Date(ms))) o[part.type] = part.value;
      const h = Number(o.hour) % 24;
      return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h, min: Number(o.minute) };
    } catch { /* fall through to local */ }
  }
  const dt = new Date(ms);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), h: dt.getHours(), min: dt.getMinutes() };
}

function offsetMs(tz, ms) {
  const p = wallParts(tz, ms);
  const sec = new Date(ms).getUTCSeconds();
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, sec) - (ms - (ms % 1000 + 1000) % 1000);
}

// The instant of y-m-d h:min in the zone. A wall time skipped by a DST jump lands one hour
// later (as the device clock would show it); a repeated hour takes its first occurrence.
function wallToEpoch(tz, y, m, d, h = 0, min = 0) {
  if (tz) {
    try {
      const wall = Date.UTC(y, m - 1, d, h, min, 0);
      let t = wall - offsetMs(tz, wall);
      const t2 = wall - offsetMs(tz, t);
      if (t2 !== t) t = Math.min(t, t2);
      const back = wallParts(tz, t);
      if (back.h !== h || back.min !== min) t = wall - offsetMs(tz, t + 3600000);
      return t;
    } catch { /* fall through to local */ }
  }
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

const pad = (n) => (n < 10 ? '0' + n : '' + n);
const dayKeyOf = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;

// The calendar days (in the zone) touched by [fromMs, toMs): [{ y, m, d, key, startMs, endMs }].
function daysBetween(tz, fromMs, toMs) {
  const out = [];
  if (!(toMs > fromMs)) return out;
  let p = wallParts(tz, fromMs);
  for (let guard = 0; guard < 800; guard++) {
    const startMs = wallToEpoch(tz, p.y, p.m, p.d, 0, 0);
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    const np = { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
    const endMs = wallToEpoch(tz, np.y, np.m, np.d, 0, 0);
    out.push({ y: p.y, m: p.m, d: p.d, key: dayKeyOf(p), startMs, endMs });
    if (endMs >= toMs) break;
    p = np;
  }
  return out;
}

// Does this engine convert named zones? (A known instant both ways; Hermes builds without time-zone
// data would fall back to local time, and rebuilding past slots in local time is what A-49 was —
// so the zone history is used only when this is true.)
let _works = null;
function zonesWork() {
  if (_works != null) return _works;
  try {
    _works = wallToEpoch('Asia/Tokyo', 2026, 1, 1, 9, 0) === Date.UTC(2026, 0, 1, 0, 0)
      && wallToEpoch('America/New_York', 2026, 7, 1, 8, 0) === Date.UTC(2026, 6, 1, 12, 0);
  } catch { _works = false; }
  return _works;
}

module.exports = { zonesWork, wallParts, wallToEpoch, daysBetween, dayKeyOf };
