// Dose accumulation estimate — pure math, no React Native or Expo imports, so it
// runs under plain Node's test runner. CommonJS for the same reason (Metro imports it
// fine). Moved out of SerumCurveScreen unchanged (Journey dashboard, founder approved
// 2026-09-29) so the Curve screen and the Journey tile always show the same
// "Est. level": a math estimate from the protocol's PLANNED schedule (its own dose times,
// DL-31) and published half-lives — never a measurement, never advice.

const { getHalfLifeEntry, curveUnit, doseInCurveUnit, amountFraction } = require('./halfLives');
const { expectedDosesOn, expectedSlotTimesOn, sortedDoseTimes } = require('./schedule');
const { stampMs } = require('./labReports');
const { BLEND_IDS, blendComponents } = require('./compounds');
const { translations } = require('../i18n/translations');
const { paletteHex } = require('./protocolColors');
const { tileProtocol } = require('./curveView');
const { formatNumber } = require('./localeFormat');
const { parseDecimal } = require('./doseMath');
const { isEnded, endedAtMs } = require('./protocolEnd');

// PAST_DAYS: the history the MODEL keeps (dose look-back floor, the tile number). The curve
// SCREEN opens on a shorter window (founder 2026-10-02: the last 3 days, so a new protocol
// fills the chart) and reaches back further only when an earlier date is chosen.
const PAST_DAYS = 14;
const CURVE_DEFAULT_PAST_DAYS = 3;
const CURVE_MAX_PAST_DAYS = 365;
const STEP_HOURS = 6;
const DAY_MS = 86400000;
const HOUR_MS = 3600 * 1000;
// DV-069 / DL-31: doses sit at the protocol's own slot times; DL-77: 08:00 only for a protocol
// without times (what the phone already reminds). The old fixed hours (12:00; 06/18 …, on the
// 6 h sample grid) are gone, and so is the snap onto that grid (DV-068).
const DEFAULT_SLOT = '08:00';
// Blend component lines: from the protocol palette, avoiding the data blue and the
// success green so a blend line never reads as "data" or "good".
const BLEND_COLORS = [paletteHex('lavender'), paletteHex('coral'), paletteHex('teal'), paletteHex('amber')];

// Matching must run on the ENGLISH compound name: compound_id renders localized
// via t(), but the half-life table is keyed in English.
function matchName(protocol) {
  if (protocol.compound_id && translations.en[protocol.compound_id]) {
    return translations.en[protocol.compound_id];
  }
  return protocol.name || '';
}

const identity = (k) => k;

// The protocols the curve can chart, blends expanded into one virtual protocol per
// component (dose split by the common ratio, lib/compounds BLEND_RATIOS), plus the
// names of those it can't, one list per reason (never dropped silently):
//   iu     — an IU dose of a mass-dosed compound (IU→mg is not a unit conversion)
//   noData — no reliable half-life data
//   noDose — no dose set yet
// The Curve screen opens on active[0].
function splitCurveProtocols(rawAll, t = identity) {
  const raw = (rawAll || []).filter(p => ['recon', 'rtu'].includes(p.type));
  const expanded = [];
  for (const p of raw) {
    const comps = p.compound_id && BLEND_IDS.includes(p.compound_id) ? blendComponents(p.compound_id, p.dose) : null;
    if (comps && comps.length) {
      comps.forEach((c, idx) => expanded.push({
        ...p, id: `${p.id}__${c.id}`, compound_id: c.id, dose: c.dose,
        color: BLEND_COLORS[idx % BLEND_COLORS.length],
        __label: `${t(p.compound_id)} · ${t(c.id)} ${t('blend_est_marker')}`, __blend: p.compound_id,
      }));
    } else {
      expanded.push(p);
    }
  }
  const entryOf = (p) => getHalfLifeEntry(matchName(p));
  const noDose = (p) => !(parseDecimal(p.dose) > 0);
  const isIU = (p) => { const e = entryOf(p); return e != null && !noDose(p) && doseInCurveUnit(parseDecimal(p.dose), p.dose_unit, e) == null; };
  const active = expanded.filter(p => entryOf(p) != null && !noDose(p) && !isIU(p));
  const nameOf = (p) => p.__blend ? t(p.__blend) : (p.compound_id ? t(p.compound_id) : p.name);
  const uniqNames = (list) => [...new Set(list.map(nameOf).filter(Boolean))];
  return {
    active,
    iu: uniqNames(expanded.filter(isIU)),
    noData: uniqNames(expanded.filter(p => entryOf(p) == null)),
    noDose: uniqNames(expanded.filter(p => entryOf(p) != null && noDose(p))),
  };
}

// Start of the curve's 6h sampling grid: PAST_DAYS back, aligned to 00/06/12/18 local
// time. The grid only sets the drawing's regular samples (and the look-back length); doses
// are NOT snapped onto it (DV-068): the screen also samples every dose instant
// (curveSampleTimes), so a fast compound's spike is drawn at its real time.
function curveGridStart(now, pastDays = PAST_DAYS) {
  const s0 = new Date(now - pastDays * 24 * 3600 * 1000);
  s0.setHours(Math.floor(s0.getHours() / STEP_HOURS) * STEP_HOURS, 0, 0, 0);
  return s0.getTime();
}

// The exact moments of the doses p expects on one local calendar day: the day's own slot times
// (lib/schedule expectedSlotTimesOn — start date, interval, creation day, end day), as many as
// expectedDosesOn counts, always at DISTINCT instants (two doses on one instant drew one
// double-height spike). One rule for a count above the distinct times listed (legacy rows: fewer
// times than doses a day, or one time picked twice): the first time is the day's own (or, on the
// creation day after its slots passed, the protocol's first time; no times at all → 08:00,
// DL-77), and the extra doses are spread evenly between the last listed time and midnight
// (08:00 ×2 → 08:00, 16:00). Nothing is placed after an end.
function toMinutes(t24) {
  const [h, m] = String(t24 || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function doseTimesOn(p, day) {
  const cnt = expectedDosesOn(p, day);
  if (!cnt) return [];
  const asc = (a, b) => a - b;
  let mins = [...new Set(expectedSlotTimesOn(p, day).map(toMinutes).filter((v) => v != null))].sort(asc);
  if (!mins.length) {
    const own = sortedDoseTimes(p).map(toMinutes).filter((v) => v != null).sort(asc);
    mins = [own.length ? own[0] : toMinutes(DEFAULT_SLOT)];
  }
  mins = mins.slice(0, cnt);
  const extra = cnt - mins.length;
  const last = mins[mins.length - 1];
  for (let j = 1; j <= extra; j++) {
    let v = Math.floor(last + ((24 * 60 - last) * j) / (extra + 1));
    if (v <= mins[mins.length - 1]) v = mins[mins.length - 1] + 1;
    if (v > 24 * 60 - 1) break;
    mins.push(v);
  }
  const endMs = endedAtMs(p);
  return mins
    .map((v) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(v / 60), v % 60, 0, 0).getTime())
    .filter((ts) => endMs == null || ts <= endMs);
}

// Dose timestamps from the protocol's SCHEDULE (start date + interval + doses/day),
// not from hand-logged doses — so the curve reflects the protocol automatically, past
// and projected. Scans back far enough that long esters' earlier doses still
// contribute at the window start: 6 half-lives of history (Undecanoate's 90d → 540d),
// capped at 600 days. `start` is the grid start (curveGridStart(now)).
function scheduledDoses(p, entry, start, end, now) {
  // Never shorter than the window shown (an earlier chosen date widens it), never shorter
  // than before (PAST_DAYS + 2), so the estimate at any moment never changes with the window.
  const shown = Math.floor((now - start) / DAY_MS) + 2;
  const lookbackDays = Math.min(600, Math.max(PAST_DAYS + 2, shown, Math.ceil(6 * entry.hours / 24)));
  let scanStart = now - lookbackDays * DAY_MS;
  if (p.start_date) {
    const sd = new Date(p.start_date + 'T00:00:00').getTime();
    if (isFinite(sd) && sd > scanStart) scanStart = sd;
  }
  // A-30: the user said the dose before the protocol was added was different → nothing before.
  if (p.history_from) {
    const hf = new Date(String(p.history_from).slice(0, 10) + 'T00:00:00').getTime();
    if (isFinite(hf) && hf > scanStart) scanStart = hf;
  }
  const scanStartDay = new Date(scanStart); scanStartDay.setHours(0, 0, 0, 0);
  const doses = [];
  // A-101b: step by CALENDAR day (a fixed 24 h step visited the 25 h fall-back day twice and
  // counted its dose twice — the 649 mg spike on the store prints).
  for (let i = 0; ; i++) {
    const day = new Date(scanStartDay.getFullYear(), scanStartDay.getMonth(), scanStartDay.getDate() + i);
    if (day.getTime() > end) break;
    // DV-068 / DV-069: each dose at its exact local slot time — the same instant for the
    // Journey tile, the curve and the date estimate, whatever the window or a clock change.
    for (const ts of doseTimesOn(p, day)) doses.push(ts);
  }
  return doses;
}

// Estimated amount (mg or IU) of one compound at timestamp T: the summed decay of
// every scheduled dose at or before T.
function levelAt(doses, doseMg, entry, T) {
  let lv = 0;
  for (const d of doses) if (d <= T) lv += doseMg * amountFraction(entry, (T - d) / 3600000);
  return lv;
}

// The Curve screen's "Est. level" for one (expanded) protocol at `now`:
// { value, unit, entry } or null when the protocol isn't charted.
function estimatedLevelNow(p, now = Date.now()) {
  if (!p || !['recon', 'rtu'].includes(p.type)) return null;
  const entry = getHalfLifeEntry(matchName(p));
  if (!entry || !(parseDecimal(p.dose) > 0)) return null;
  const doseMg = doseInCurveUnit(parseDecimal(p.dose), p.dose_unit, entry); // a stored "0,5" (older rows) is 0.5
  if (doseMg == null) return null;
  const start = curveGridStart(now);
  // Doses after `now` don't count, so the projection horizon doesn't change the value.
  const doses = scheduledDoses(p, entry, start, now, now);
  return { value: levelAt(doses, doseMg || 0, entry, now), unit: curveUnit(entry), entry };
}

// What the Curve screen opens on — the first compound the user left selected there (savedView,
// lib/curveView; founder 2026-10-02), else the first charted compound (a blend → its first
// component) — and its Est. level now: the Journey tile's number.
function defaultCurveLevel(rawProtocols, now = Date.now(), t = identity, savedView = null) {
  const { active } = splitCurveProtocols(rawProtocols, t);
  const unitOf = (id) => { const p = active.find(x => x.id === id); return p ? curveUnit(getHalfLifeEntry(matchName(p))) : null; };
  const first = tileProtocol({ saved: savedView, active, unitOf });
  if (!first) return null;
  const lv = estimatedLevelNow(first, now);
  return lv ? { protocol: first, ...lv } : null;
}

// The screen's number format: one decimal below 10, whole numbers above, in the app
// language ("3,5" in Portuguese, founder 2026-10-02).
function levelLabel(v, language = 'en') {
  if (!isFinite(v) || v <= 0) return '0';
  if (v < 10) return formatNumber(v, language, { digits: 1 });
  return String(Math.round(v)); // never grouped (as before)
}

// The curve's past window in days: 3 by default; a chosen date further back widens it to
// reach that date (capped), a date inside the 3 days or in the future leaves it at 3.
function curveWindowDays(readoutISO, todayISO) {
  if (!readoutISO || !todayISO || readoutISO >= todayISO) return CURVE_DEFAULT_PAST_DAYS;
  const back = Math.round((new Date(todayISO + 'T12:00:00') - new Date(readoutISO + 'T12:00:00')) / DAY_MS);
  if (!(back > CURVE_DEFAULT_PAST_DAYS)) return CURVE_DEFAULT_PAST_DAYS;
  return Math.min(CURVE_MAX_PAST_DAYS, back + 1);
}

// Journey redesign part 17 (prototype curveScreen): three grid lines — 0, half the peak,
// the peak — on an axis whose top is the peak × 1.12 (headroom, nothing clips).
// The half line is drawn at the value its label shows (half the peak, cut to the label's
// precision: 0.25 → 0.2 as the prototype shows), so a line never sits off its own number.
function curveTicks(max) {
  if (!(max > 0)) return { top: 1, ticks: [] };
  const half = max / 2;
  const step = half < 10 ? 0.1 : 1;
  const cut = Math.floor(half / step + 1e-9) * step;
  const mid = cut > 0 ? Math.round(cut * 10) / 10 : half;
  return { top: max * 1.12, ticks: [0, mid, max] };
}
// Axis numbers: one decimal below 10 ("0.0", "0.3"), whole numbers above.
function axisLabel(v, language = 'en') {
  if (!isFinite(v) || v <= 0) return formatNumber(0, language, { digits: 1 });
  return v < 10 ? formatNumber(v, language, { digits: 1 }) : String(Math.round(v));
}

// Part 19: the next n distinct days with a scheduled dose after `now` (local YYYY-MM-DD),
// across the given (charted) protocols — the "Estimate on a date" chips.
function upcomingDoseDays(protocols, now = Date.now(), n = 3, horizonDays = 180) {
  const pad = (x) => (x < 10 ? '0' + x : '' + x);
  const iso = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const start = curveGridStart(now);
  const end = now + horizonDays * DAY_MS;
  const days = new Set();
  for (const p of protocols || []) {
    const entry = getHalfLifeEntry(matchName(p));
    if (!entry) continue;
    for (const ts of scheduledDoses(p, entry, start, end, now)) if (ts > now) days.add(iso(ts));
  }
  return [...days].sort().slice(0, n);
}

// A-83: the protocols the Curve screen offers — the active ones first (so the default pick and a
// remembered view are unchanged), then the ENDED ones whose end lies inside the longest past
// window the screen can show (CURVE_MAX_PAST_DAYS), most recently ended first. An ended protocol
// draws its past from its schedule up to the end (lib/schedule stops there), so nothing is
// projected after it. Deleted protocols are never offered.
// A-30 (a): where the curve stops being drawn from logged-era schedule and starts being estimated
// from the start date — the latest moment a selected protocol was added, when its start date is
// earlier, it was not answered "different dose" (history_from) and it lies inside the window.
function estimatedBeforeMs(selected, windowStartMs) {
  let best = null;
  for (const p of selected || []) {
    if (!p || p.history_from || !p.start_date || !p.created_at) continue;
    const created = Date.parse(p.created_at);
    const start = new Date(p.start_date + 'T00:00:00').getTime();
    if (!Number.isFinite(created) || !Number.isFinite(start)) continue;
    const createdDay = new Date(created); createdDay.setHours(0, 0, 0, 0);
    if (start >= createdDay.getTime() || created <= windowStartMs) continue;
    if (best == null || created > best) best = created;
  }
  return best;
}

function curveHistoryProtocols(raw, now = Date.now()) {
  const list = (raw || []).filter((p) => p && !p.deleted_at && p.sync_status !== 'deleted');
  const live = list.filter((p) => !isEnded(p));
  const ended = list
    .filter((p) => isEnded(p) && endedAtMs(p) != null && endedAtMs(p) >= now - CURVE_MAX_PAST_DAYS * DAY_MS)
    .sort((a, b) => endedAtMs(b) - endedAtMs(a));
  return [...live, ...ended];
}

// DV-068: "Estimate on a date" reads today at this moment and any other date at its own local
// noon — never moved onto the 6 h grid (which sits 1 h off local noon after a clock change).
function readoutMoment(readoutISO, todayISOStr, now) {
  if (!readoutISO || readoutISO === todayISOStr) return now;
  const t = new Date(readoutISO + 'T12:00:00').getTime();
  return Number.isFinite(t) ? t : now;
}

// DV-068 (spec R4: drawing samples the exact instants): the dose instants ONE line is sampled at,
// besides the grid and Now. Each line uses only its own (review 2026-10-20: a shared list made
// every line pay for every other line's doses). None for a compound with a modeled rise
// (entry.tmaxHours): its dose adds 0 at the instant and rises after, so there is no jump to draw.
// In a window over 30 days the instants are merged to the chart's pixel resolution (the first
// dose in each plot pixel; one pixel can show one spike). The numbers shown never come from the
// samples (levelAt), so they stay exact.
const MERGE_AFTER_DAYS = 30;
function curveDoseInstants(doses, entry, start, end, plotWidthPx) {
  if (entry && entry.tmaxHours) return [];
  const inWin = (doses || []).filter((d) => d >= start && d <= end).sort((a, b) => a - b);
  if ((end - start) / DAY_MS <= MERGE_AFTER_DAYS || !(plotWidthPx > 0)) return inWin;
  const px = (end - start) / plotWidthPx;
  const out = [];
  let lastBucket = null;
  for (const d of inWin) {
    const b = Math.min(Math.ceil(plotWidthPx) - 1, Math.floor((d - start) / px)); // the end belongs to the last pixel
    if (b !== lastBucket) { out.push(d); lastBucket = b; }
  }
  return out;
}

// The sample moments: the 6 h grid, the given dose instants inside the window (each dose draws
// as a vertical jump at its own time) and Now (the solid line ends on the Now dot at the number
// shown). Sorted, unique.
function curveSampleTimes(start, stepMs, nSteps, doseLists, now) {
  const end = start + nSteps * stepMs;
  const set = new Set();
  for (let i = 0; i <= nSteps; i++) set.add(start + i * stepMs);
  for (const list of doseLists || []) for (const d of list || []) if (d >= start && d <= end) set.add(d);
  if (Number.isFinite(now) && now >= start && now <= end) set.add(now);
  return [...set].sort((a, b) => a - b);
}

// DV-072 C (AD-96 C; spec R1, R3, R9, R16): one tick per planned dose; hollow when the dose is in
// the logged era (from the protocol's creation − 1 h, the lib/declared grace), at or before now,
// and no Taken row covers it — Skipped, Missed, never answered, or due and still open. Rows are
// matched per local day as the reminders do (lib/notificationPlan handledSlotIndexes): a row
// within a minute of a slot first, then the rest in time order to the remaining slots in order.
// Deleted rows, other protocols' rows, rows dated after now and unparseable times count as
// nothing. A blend component reads its blend protocol's rows. The LEVEL is not changed here:
// the curve stays the planned schedule in 1.3.1 (option B, logged doses, is 1.3.2).
const DECLARED_GRACE_MS = HOUR_MS;
function sourceProtocolId(p) {
  return p && p.__blend ? String(p.id).split('__')[0] : String(p && p.id);
}
function localDayKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function doseTicks(p, doses, logs, now) {
  const createdMs = p && p.created_at ? stampMs(p.created_at) : NaN;
  const cutoff = Number.isFinite(createdMs) ? createdMs - DECLARED_GRACE_MS : -Infinity;
  const pid = sourceProtocolId(p);
  const rowsByDay = new Map();
  for (const l of logs || []) {
    if (!l || String(l.protocol_id) !== pid || l.sync_status === 'deleted' || l.deleted_at) continue;
    const t = stampMs(l.logged_at);
    if (!Number.isFinite(t) || t > now) continue;
    const k = localDayKey(t);
    if (!rowsByDay.has(k)) rowsByDay.set(k, []);
    rowsByDay.get(k).push({ t, taken: l.outcome === 'Taken', id: l.id || 0 });
  }
  // Planned doses are tracked by their position in `doses` (never by timestamp: two at one instant
  // are two slots).
  const list = doses || [];
  const slotsByDay = new Map();
  list.forEach((ts, idx) => {
    if (ts > now || ts < cutoff) return;
    const k = localDayKey(ts);
    if (!slotsByDay.has(k)) slotsByDay.set(k, []);
    slotsByDay.get(k).push(idx);
  });
  const takenIdx = new Set();
  for (const [k, idxs] of slotsByDay) {
    const rows = (rowsByDay.get(k) || []).sort((a, b) => a.t - b.t || a.id - b.id);
    const sorted = [...idxs].sort((a, b) => list[a] - list[b] || a - b);
    const byPos = new Map();
    const used = new Set();
    sorted.forEach((di, i) => {
      const hit = rows.find((r) => !used.has(r) && Math.abs(r.t - list[di]) < 60 * 1000);
      if (hit) { used.add(hit); byPos.set(i, hit); }
    });
    const rest = rows.filter((r) => !used.has(r));
    sorted.forEach((di, i) => {
      if (byPos.has(i)) return;
      const r = rest.shift();
      if (r) byPos.set(i, r);
    });
    for (const [i, r] of byPos) if (r.taken) takenIdx.add(sorted[i]);
  }
  return list.map((ts, idx) => ({ ts, hollow: ts <= now && ts >= cutoff && !takenIdx.has(idx) }));
}

module.exports = {
  readoutMoment, curveDoseInstants, curveSampleTimes, doseTicks,
  curveHistoryProtocols, estimatedBeforeMs,
  CURVE_DEFAULT_PAST_DAYS, CURVE_MAX_PAST_DAYS, curveWindowDays, curveTicks, axisLabel, upcomingDoseDays,
  PAST_DAYS, STEP_HOURS, DEFAULT_SLOT, BLEND_COLORS,
  matchName, splitCurveProtocols, curveGridStart, scheduledDoses, levelAt,
  estimatedLevelNow, defaultCurveLevel, levelLabel,
};
