// Dose accumulation estimate — pure math, no React Native or Expo imports, so it
// runs under plain Node's test runner. CommonJS for the same reason (Metro imports it
// fine). Moved out of SerumCurveScreen unchanged (Journey dashboard, founder approved
// 2026-09-29) so the Curve screen and the Journey tile always show the same
// "Est. level": a math estimate from published half-lives and, since AD-96 B (1.3.2, curvePlan),
// the doses the person LOGGED as Taken for the past and the protocol's planned schedule (its own
// dose times, DL-31) for the future — never a measurement, never advice.

const { getHalfLifeEntry, curveUnit, doseInCurveUnit, amountFraction, riseRate } = require('./halfLives');
const { expectedDosesOn, expectedSlotTimesOn, sortedDoseTimes } = require('./schedule');
const { stampMs } = require('./labReports');
const { sampleLevelsAt } = require('./curveSampling');
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
// expectedDosesOn counts — the same count as Today's slots. One slot list everywhere (DL-06): a
// user's time is never moved. A count above the times listed (legacy rows with fewer times than
// doses a day; the creation-day floor of 1 after its slot passed) goes where Today's agenda puts
// it (lib/schedule upcomingAgenda): the protocol's first time, 08:00 without times (DL-77). So
// "08:00,08:00" or a legacy "08:00" at 2 a day is two doses at 08:00 — one double spike, as
// planned (re-review 2026-10-20). Nothing is placed after an end.
function slotMs(day, t24) {
  const [h, m] = String(t24 || '').split(':').map(Number);
  const ok = Number.isFinite(h) && Number.isFinite(m);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), ok ? h : 8, ok ? m : 0, 0, 0).getTime();
}
function doseTimesOn(p, day) {
  const cnt = expectedDosesOn(p, day);
  if (!cnt) return [];
  const slots = expectedSlotTimesOn(p, day);
  // The extra dose sits at the slot Today shows for it (position dpd − 1, lib/dosePageState
  // daySlots), else the first time, else 08:00 (DL-77).
  const own = sortedDoseTimes(p);
  const first = own.slice(0, p.doses_per_day || 1)[(p.doses_per_day || 1) - 1] || own[0] || DEFAULT_SLOT;
  const endMs = endedAtMs(p);
  const out = [];
  for (let k = 0; k < cnt; k++) out.push(slotMs(day, slots[k] || first));
  return out.filter((ts) => endMs == null || ts <= endMs).sort((a, b) => a - b);
}

// Curve fix 2 (1.3.1, spec R15: look-back max(16 d, window shown, 6 × t½), capped 600 d): ONE
// look-back per compound, the same for the Curve screen at any window, the Journey tile and the
// date estimate. The history before the EARLIEST instant the curve can draw or estimate is
// max(16 d, 6 × t½), capped at 600 d counted from that instant (coordinator 2026-10-20, decided
// by logic: the curve must be right at every date it shows). That instant is the left edge of
// the longest window the screen can show (CURVE_MAX_PAST_DAYS + 2 days before Now), so the scan
// from Now is that window plus the history — whatever the window shown, so the doses up to any
// moment are the same everywhere and tile == screen == date estimate exactly (Undecanoate:
// 367 + 540 days). A date estimate before that window (the picker reaches 10 years back) gets its
// own history before its date (levelOnDate). It used to be max(16 d, window shown, 6 × t½) from
// Now, capped at 600 from Now: a 90-day window of a 7-day t½ compound started from ~2 days of
// history, the tile (14 days) and the screen (90 days) differed ~1.6 %, and a long-term
// Undecanoate user read ~20 % low at the left edge of a 365-day window.
// What the rule leaves out (pharmacometrics review 2026-10-20, PK-2): with H days of history and a
// dose every τ days, the first left-out dose is between H and H + τ before the instant, so the share
// left out is between 2^(−(H+τ)/t½) and 2^(−(H−τ)/t½) of the level there, depending on where the
// instant falls in the dosing interval (not a flat 2^−6): Undecanoate every 70 days ≤ 2.7 %, every
// 84 days ≤ 3.0 % at the left edge of a 365-day window; a daily dose ≈ 2^−6 = 1.6 %. Every half-life
// in the table has 6 × t½ ≤ the 600-day cap (curveLookback.test.js), so the cap never cuts the rule.
const LOOKBACK_CAP_DAYS = 600;
function curveHistoryDays(entry) {
  const sixHalfLives = Math.ceil((6 * ((entry && entry.hours) || 0)) / 24);
  return Math.min(LOOKBACK_CAP_DAYS, Math.max(PAST_DAYS + 2, sixHalfLives));
}
function curveLookbackDays(entry) {
  return CURVE_MAX_PAST_DAYS + 2 + curveHistoryDays(entry);
}
// The Dose log read for the curve and the Journey tile (AD-96 B, spec PK-15): the longest window plus
// the longest history the look-back can ask for (the 600-day cap) — 967 days, so a logged dose is
// read wherever curveLookbackDays reaches (Undecanoate 367 + 540 days).
const CURVE_LOG_LOOKBACK_DAYS = CURVE_MAX_PAST_DAYS + 2 + LOOKBACK_CAP_DAYS;

// Dose timestamps from the protocol's SCHEDULE (start date + interval + doses/day), from
// curveLookbackDays before now (or the start date / history_from when later). AD-96 B: the curve
// draws only three parts of it (curvePlan) — the declared part before the protocol was added, the
// plan after now, and the planned slots its ticks mark; the logged past comes from the Dose log. `start` is the earliest instant asked for: inside the longest window it changes
// nothing; earlier (a date estimate before the window) the scan reaches its history before it.
// Engineering review ENG-1: the list depends only on the protocol, the time zone (its local slot
// times and midnights), its first scanned day and its last day, so it is kept (frozen, read-only)
// for those and reused by every rebuild of that day — a date
// chip, a toggle, a reload or the Journey tile never regenerate the 367 + history days, and the
// carried sums of lib/curveSampling stay with the list.
// The zone's name, plus its January and July offsets in case Intl has no name to give.
function zoneKey(now) {
  let name = '';
  try { name = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { name = ''; }
  const y = new Date(now).getFullYear();
  return name + ':' + new Date(y, 0, 1).getTimezoneOffset() + ':' + new Date(y, 6, 1).getTimezoneOffset();
}
const DOSE_CACHE = new Map();
const DOSE_CACHE_MAX = 200;
function scheduledDoses(p, entry, start, end, now) {
  let scanStart = Math.min(now - curveLookbackDays(entry) * DAY_MS, start - curveHistoryDays(entry) * DAY_MS);
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
  const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
  // The zone too (final verify): America/Phoenix and America/Denver share January's midnights, but
  // not their summer days.
  const key = JSON.stringify(p) + '|' + zoneKey(now) + '|' + scanStartDay.getTime() + '|' + endDay.getTime();
  const hit = DOSE_CACHE.get(key);
  if (hit) return hit;
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
  Object.freeze(doses);
  DOSE_CACHE.set(key, doses);
  if (DOSE_CACHE.size > DOSE_CACHE_MAX) DOSE_CACHE.delete(DOSE_CACHE.keys().next().value);
  return doses;
}

// Estimated amount (mg or IU) of one compound at timestamp T: the summed decay of
// every scheduled dose at or before T.
function levelAt(doses, doseMg, entry, T) {
  let lv = 0;
  for (const d of doses) if (d <= T) lv += doseMg * amountFraction(entry, (T - d) / 3600000);
  return lv;
}

// A-160 (founder 2026-10-26, option B): "Doses in level" — the scheduled doses at or before T that
// still add at least minFraction (1%) of their own amount to the level at T. The count beside the
// level now means the doses that make it, whatever the window shown (the window count is on the top
// line). af: the amount curve (lib/halfLives amountFraction); a dose not absorbed 1% yet is not counted.
function dosesInLevel(doses, entry, T, af = amountFraction, minFraction = 0.01) {
  let n = 0;
  for (const d of doses || []) if (d <= T && af(entry, (T - d) / 3600000) >= minFraction) n++;
  return n;
}

// "Estimate on a date" for one line at moment T: the drawn doses inside the longest window (so its
// dot sits on the line and matches the tile at Now); before that window, or after the projection
// (winEnd), the protocol's own doses up to T (AD-96 B: the logged past and the plan, curvePlan), with
// the full history before T. data: as curvePlan.
function levelOnDate(p, entry, doseMg, doses, T, now, winEnd, data) {
  const earliest = now - (CURVE_MAX_PAST_DAYS + 2) * DAY_MS;
  if (T >= earliest && T <= winEnd) return levelAt(doses, doseMg, entry, T);
  return levelAt(curvePlan(p, entry, Math.min(T, earliest), Math.max(T, now), now, data).doses, doseMg, entry, T);
}

// The Curve screen's "Est. level" for one (expanded) protocol at `now`:
// { value, unit, entry } or null when the protocol isn't charted. AD-96 B: from the doses logged
// (data.logs) and the declared part before the protocol was added (curvePlan).
function estimatedLevelNow(p, now = Date.now(), data = null) {
  if (!p || !['recon', 'rtu'].includes(p.type)) return null;
  const entry = getHalfLifeEntry(matchName(p));
  if (!entry || !(parseDecimal(p.dose) > 0)) return null;
  const doseMg = doseInCurveUnit(parseDecimal(p.dose), p.dose_unit, entry); // a stored "0,5" (older rows) is 0.5
  if (doseMg == null) return null;
  const start = curveGridStart(now);
  // Doses after `now` don't count, so the projection horizon doesn't change the value.
  const doses = curvePlan(p, entry, start, now, now, data).doses;
  return { value: levelAt(doses, doseMg || 0, entry, now), unit: curveUnit(entry), entry };
}

// What the Curve screen opens on — the first compound the user left selected there (savedView,
// lib/curveView; founder 2026-10-02), else the first charted compound (a blend → its first
// component) — and its Est. level now: the Journey tile's number. data: { logs, history } — the Dose
// log rows and the protocols the Curve offers (active + ended, for a Restart's declared part, R12),
// read as the Curve screen reads them, so tile == screen.
function defaultCurveLevel(rawProtocols, now = Date.now(), t = identity, savedView = null, data = null) {
  const { active } = splitCurveProtocols(rawProtocols, t);
  const unitOf = (id) => { const p = active.find(x => x.id === id); return p ? curveUnit(getHalfLifeEntry(matchName(p))) : null; };
  const first = tileProtocol({ saved: savedView, active, unitOf });
  if (!first) return null;
  const siblings = data && data.history ? splitCurveProtocols(curveHistoryProtocols(data.history, now), t).active : active;
  const lv = estimatedLevelNow(first, now, { logs: (data && data.logs) || [], siblings });
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

// Part 19: the next n distinct days with a planned dose after `now` (local YYYY-MM-DD),
// across the given (charted) protocols — the "Estimate on a date" chips. AD-96 B: the plan (R7: a
// dose of today already logged leaves no dose planned today). data: as curvePlan.
function upcomingDoseDays(protocols, now = Date.now(), n = 3, horizonDays = 180, data = null) {
  const pad = (x) => (x < 10 ? '0' + x : '' + x);
  const iso = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const start = curveGridStart(now);
  const end = now + horizonDays * DAY_MS;
  const days = new Set();
  for (const p of protocols || []) {
    const entry = getHalfLifeEntry(matchName(p));
    if (!entry) continue;
    for (const ts of curvePlan(p, entry, start, end, now, data).plan) if (ts > now) days.add(iso(ts));
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
// every line pay for every other line's doses). None for a compound with a LONG modeled rise
// (entry.tmaxHours ≥ 36 h, the depot esters and weekly GLP-1s): its dose adds 0 at the instant and
// rises over days, so there is no jump to draw; a short rise still samples its doses. In a window
// over 30 days the instants are merged to the chart's pixel resolution: in each plot pixel the
// dose with the HIGHEST level is kept (one pixel shows one spike — its top). The numbers shown
// never come from the samples (levelAt), so they stay exact. Curve fix 3 (1.3.1) adds the bottom of
// each pixel (curveTroughInstants) and the fast falls (curveDecaySamples) — lineSamples.
const MERGE_AFTER_DAYS = 30;
const LONG_RISE_HOURS = 36;
// The level (per mg dosed) right after each of `at` (sorted dose instants), counting every dose —
// and, with { pre: true }, also the level just before each (the doses at that instant left out).
// One sampler for both shapes (lib/curveSampling; the model's own amountFraction carries the sums).
function levelsAtDoses(doses, entry, at, af, opts) {
  const s = sampleLevelsAt(doses, 1, entry, at, af);
  return opts && opts.pre ? { post: s.points, pre: s.pre } : s.points;
}
// The pixel column of moment d (the window end belongs to the last one).
function pixelOf(d, start, px, plotWidthPx) {
  return Math.min(Math.ceil(plotWidthPx) - 1, Math.floor((d - start) / px));
}
// Curve fix 3 (1.3.1): the bottom of each pixel column. Where one sample per pixel keeps only the
// highest dose (a window over 30 days), the LOWEST point of the column — the level just before
// one of its doses — could be left out, and the straight line then never reaches it (a TB-500
// 4-a-day dip drawn ~10 % of the top too high). So in those windows each pixel also samples the
// dose with the lowest level just before it, when that is not the kept one. A LONG rise has no
// dose instants (no jump: its dose adds 0 at the instant), but its line still turns at each dose
// — the dip sits AT the dose instant — so it samples the dose with the lowest level in each pixel,
// in every window (a weekly Semaglutide dip was drawn ~3.6 % of the top too high between the 6 h
// samples). At most one per pixel.
function curveTroughInstants(doses, entry, start, end, plotWidthPx, instants, af = amountFraction) {
  if (!entry || !(plotWidthPx > 0) || !(end > start)) return [];
  const longRise = entry.tmaxHours >= LONG_RISE_HOURS;
  if (!longRise && (end - start) / DAY_MS <= MERGE_AFTER_DAYS) return []; // every dose is a sample already
  const inWin = (doses || []).filter((d) => d >= start && d <= end).sort((a, b) => a - b);
  if (!inWin.length) return [];
  const px = (end - start) / plotWidthPx;
  const { pre } = levelsAtDoses(doses || [], entry, inWin, af, { pre: true });
  const kept = new Set(instants || []);
  const out = [];
  let bucket = null, best = -1;
  const flush = () => { if (best >= 0 && !kept.has(inWin[best])) out.push(inWin[best]); };
  inWin.forEach((d, i) => {
    // the level just BEFORE a dose that sits exactly on a column edge belongs to the column on its left
    const b = Math.max(0, pixelOf(d - 1, start, px, plotWidthPx));
    if (b !== bucket) { flush(); bucket = b; best = i; return; }
    if (pre[i] < pre[best]) best = i;
  });
  flush();
  return out;
}
function curveDoseInstants(doses, entry, start, end, plotWidthPx, af = amountFraction) {
  if (entry && entry.tmaxHours >= LONG_RISE_HOURS) return [];
  const inWin = (doses || []).filter((d) => d >= start && d <= end).sort((a, b) => a - b);
  if ((end - start) / DAY_MS <= MERGE_AFTER_DAYS || !(plotWidthPx > 0)) return inWin;
  const px = (end - start) / plotWidthPx;
  const lv = levelsAtDoses(doses || [], entry, inWin, af);
  const out = [];
  const outLv = [];
  let lastBucket = null;
  inWin.forEach((d, i) => {
    const b = pixelOf(d, start, px, plotWidthPx); // the end belongs to the last pixel
    if (b !== lastBucket) { out.push(d); outLv.push(lv[i]); lastBucket = b; return; }
    if (lv[i] > outLv[outLv.length - 1]) { out[out.length - 1] = d; outLv[outLv.length - 1] = lv[i]; }
  });
  return out;
}

// Curve fix 3 (1.3.1, founder-approved): the fast fall after each drawn dose. Between two samples
// the screen draws a straight line, and a first-order fall is a curve: from a BPC-157 spike (t½
// 0.5 h) to the next 6 h grid sample the straight line showed ~80 % of the spike an hour later,
// where the level is ~25 % — the peak looked wide and flat. So after each dose instant the line is
// also sampled on the plot's own pixel columns while the level is still falling steeply: every m-th
// column edge, m = the most columns that fit in half a half-life (at least 1). Why that holds the
// drawn line within the tolerance (DRAW_TOLERANCE, 2 % of the chart's top, per pixel column):
//   - half a half-life or less between samples: a straight line over a first-order fall is at most
//     L·x²/8 off it (x = ln2/2 ≈ 0.35) ≈ 1.5 % of the level at the sample, never above the top;
//   - more than half a half-life per column (a fast compound on a wide window): a sample on every
//     column edge, so each column's drawn top and bottom ARE the exact ones (the fall is monotone);
//   - it stops 6.64 half-lives after the dose (the level is then ≤ 1 % of that dose's top: the
//     rest of the straight line is off by less than that), at the next drawn dose, or the window end.
// None when the 6 h grid alone is within the tolerance: its straight line over a change with
// half-time T is at most (ln2 · 6 h / T)² / 8 off, ≤ 2 % while 6 h ≤ 0.577 T. The time T that
// counts is the FASTEST change of the line: the half-life, or for a modeled rise the half-time
// of its rise, ln2/kr, when shorter (pharmacometrics review PK-1: Sustanon, t½ 7 d but a rise
// half-time of ~7.7 h, drew the top of its first hours as one 6 h chord, the peak ~3 % low with a
// dose on the 6 h grid). A long rise has no dose instants, so its own doses seed those samples.
// Bounded by the plot width: at most one sample per column edge per line.
const DRAW_TOLERANCE = 0.02;
const DECAY_SPAN_HALF_LIVES = Math.log2(100);
const GRID_ENOUGH = Math.sqrt(8 * DRAW_TOLERANCE) / Math.LN2; // ≈ 0.577: 6 h grid steps per half-time T
function curveDecaySamples(doses, instants, entry, start, end, plotPx, stepMs) {
  if (!entry || !(entry.hours > 0) || !(plotPx > 0) || !(end > start)) return [];
  const kr = entry.tmaxHours ? riseRate(entry.hours, entry.tmaxHours) : null; // 1/h, null = no rise
  const halfMs = Math.min(entry.hours, kr ? Math.LN2 / kr : Infinity) * HOUR_MS;
  if (stepMs <= GRID_ENOUGH * halfMs) return [];
  // A long rise draws no jumps (no dose instants): its doses inside the window seed the samples.
  if (entry.tmaxHours >= LONG_RISE_HOURS) instants = (doses || []).filter((d) => d >= start && d <= end).sort((a, b) => a - b);
  const pxMs = (end - start) / plotPx;
  const m = Math.max(1, Math.floor(halfMs / 2 / pxMs));
  const span = halfMs * DECAY_SPAN_HALF_LIVES + pxMs;
  // The fall of the last dose before the window still runs into it.
  let before = null;
  for (const d of doses || []) if (d < start && (before == null || d > before)) before = d;
  const seeds = before != null && start - before < span ? [before, ...(instants || [])] : [...(instants || [])];
  const out = [];
  let lastCol = -1;
  for (let i = 0; i < seeds.length; i++) {
    const d = seeds[i];
    const stop = Math.min(end, d + span, i + 1 < seeds.length ? seeds[i + 1] : Infinity);
    let c = Math.max(lastCol + 1, Math.floor((d - start) / pxMs) + 1, 0);
    for (; c <= plotPx; c += m) {
      const b = start + c * pxMs;
      if (b >= stop) break;
      out.push(b);
      lastCol = c;
    }
  }
  return out;
}

// The sample moments: the 6 h grid, the given dose instants inside the window (each dose draws
// as a vertical jump at its own time), Now (the solid line ends on the Now dot at the number
// shown) and any extra moment (the date estimate, so its dot sits on the drawn line). Sorted,
// unique.
function curveSampleTimes(start, stepMs, nSteps, doseLists, now, extraTimes) {
  const end = start + nSteps * stepMs;
  const set = new Set();
  for (let i = 0; i <= nSteps; i++) set.add(start + i * stepMs);
  for (const list of doseLists || []) for (const d of list || []) if (d >= start && d <= end) set.add(d);
  for (const tm of [now, ...(extraTimes || [])]) if (Number.isFinite(tm) && tm >= start && tm <= end) set.add(tm);
  return [...set].sort((a, b) => a - b);
}

// One line's drawing: its own dose instants, its sample moments (x = position in 6 h steps) and
// the level at each (`pre` = just before a dose on the sample). ctx: { start, stepMs, nSteps,
// now, plotPx, extraTimes }.
function lineSamples(doses, doseMg, entry, ctx, af = amountFraction) {
  const { start, stepMs, nSteps, now, plotPx, extraTimes } = ctx;
  const end = start + nSteps * stepMs;
  const instants = curveDoseInstants(doses, entry, start, end, plotPx, af);
  const troughs = curveTroughInstants(doses, entry, start, end, plotPx, instants, af);
  const decay = curveDecaySamples(doses, instants, entry, start, end, plotPx, stepMs);
  const times = curveSampleTimes(start, stepMs, nSteps, [instants, troughs, decay], now, extraTimes);
  const xs = times.map((ts) => (ts - start) / stepMs);
  const { points, pre } = sampleLevelsAt(doses, doseMg, entry, times, af);
  return { instants, troughs, decay, times, xs, points, pre };
}

// A combined total (members of one substance), point by point (curve fix 3, 1.3.1): sampled at every
// moment any member is sampled at (each member's dose jumps, dips and fast falls); each member is
// computed only at the moments it lacks and its own samples are reused as they are — members
// sampled at the same moments are just added, no second pass.
function combinedLine(members, ctx, af = amountFraction) {
  const { start, stepMs } = ctx;
  const set = new Set();
  for (const m of members) for (const ts of m.times) set.add(ts);
  const times = [...set].sort((a, b) => a - b);
  const xs = times.map((ts) => (ts - start) / stepMs);
  const n = times.length;
  const points = new Array(n).fill(0), pre = new Array(n).fill(0);
  for (const m of members) {
    const own = new Map();
    m.times.forEach((ts, j) => own.set(ts, j));
    const missing = times.filter((ts) => !own.has(ts));
    const lv = missing.length ? sampleLevelsAt(m.doses, m.doseMg, m.entry, missing, af) : null;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const j = own.get(times[i]);
      if (j != null) { points[i] += m.points[j]; pre[i] += m.pre[j]; } else { points[i] += lv.points[k]; pre[i] += lv.pre[k]; k++; }
    }
  }
  return { times, xs, points, pre };
}

// DV-072 C (AD-96 C; spec R1, R3, R9, R16): one tick per planned dose; hollow when the dose is in
// the logged era (from the protocol's creation − 1 h, the lib/declared grace), at or before now,
// and no Taken row covers it — Skipped, Missed, never answered, or due and still open. Rows are
// matched per local day as the reminders do (lib/notificationPlan handledSlotIndexes): a row
// within a minute of a slot first, then the rest in time order to the remaining slots in order.
// Deleted rows, other protocols' rows, rows dated after now and unparseable times count as
// nothing. A blend component reads its blend protocol's rows. The ticks only mark the slots; the
// level of the logged past is curvePlan's (AD-96 B, below): a hollow dose is not in it.
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

// ── AD-96 B (1.3.2, docs/specs/curve-logged-doses.md R1–R16): the PAST from the doses the person
// logged, the FUTURE from the plan ─────────────────────────────────────────────────────────────────
// One protocol's dose instants for the level and the drawing, from (protocols, logs, now) only (R8):
//   declared — before C = created_at − 1 h (the lib/declared grace), the protocol's own schedule: the
//              A-30 part estimated from the start date. Only when the start date is before the creation
//              day and the history was not answered "different dose" (history_from: nothing before C).
//              Never over an earlier logged-era Taken row of another protocol of the same compound (a
//              Restart with a past start, R12). On the creation day, declared slots plus the rows that
//              closed that day after C never exceed the day's expected count (R2).
//   taken    — from C to now: every Taken row of THIS protocol (a blend component: its blend's rows), at
//              its exact logged_at (R4, no snap). Taken rows before C add nothing (the schedule covers
//              that time, R2); Skipped / Missed / deleted rows add nothing (R3); rows after now and
//              unparseable times are left out, never thrown on (R9); SQLite "YYYY-MM-DD HH:MM:SS" is UTC.
//   plan     — after now: the protocol's own slot times (R5, scheduledDoses); for TODAY only the slots
//              no row has closed yet — max(0, expected − today's Taken / Skipped / Missed rows), matched
//              to the slots as the reminders and the ticks match them (R7), so an early dose or a zone
//              change never plans a second one. A slot already due with no row yet (open) is not in the
//              level now; it is projected as a dose placed at now (R6: OPEN_AT_NOW_MS after it, so the
//              level AT now never includes it), and drops out once a row closes it. No plan after an end
//              (the schedule stops there, R12).
//   planned  — the schedule's slots the ticks are drawn for (declared, logged era, future); a slot
//              before C that is not declared was never planned in the app (a creation-day floor slot
//              with a start today) — no tick, no dose.
// The amount of every dose is the protocol's current dose (R10 interim until AD-95 dated versions:
// curve_current_dose_note). data: { logs: Dose log rows (any protocol), siblings: the charted protocols
// (blends expanded), for R12 }.
const OPEN_AT_NOW_MS = 1;
const CLOSING = { Taken: true, Skipped: true, Missed: true };
const PLAN_CACHE = new WeakMap(); // frozen schedule list → { key, value }
function hashTimes(lists) {
  let h = 2166136261;
  for (const list of lists) {
    h = Math.imul(h ^ list.length, 16777619);
    for (const v of list) {
      h = Math.imul(h ^ (v % 4294967296), 16777619);
      h = Math.imul(h ^ Math.floor(v / 4294967296), 16777619);
    }
  }
  return (h >>> 0).toString(36);
}
function rowsOf(pid, logs, now) {
  const out = [];
  for (const l of logs || []) {
    if (!l || String(l.protocol_id) !== pid || l.sync_status === 'deleted' || l.deleted_at) continue;
    const t = stampMs(l.logged_at);
    if (!Number.isFinite(t) || t > now) continue;
    out.push({ t, outcome: l.outcome, id: l.id || 0 });
  }
  return out.sort((a, b) => a.t - b.t || a.id - b.id);
}
function localMidnight(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
// Rows closing slots by number, the doseTicks matching (a row within a minute of a slot first, then the
// rest in time order to the remaining slots in order): the slots (sorted instants) no row closes.
function openSlots(slots, rows) {
  const used = new Set();
  const closed = new Set();
  slots.forEach((s, i) => {
    const hit = rows.find((r) => !used.has(r) && Math.abs(r.t - s) < 60 * 1000);
    if (hit) { used.add(hit); closed.add(i); }
  });
  const rest = rows.filter((r) => !used.has(r));
  slots.forEach((s, i) => { if (!closed.has(i) && rest.length) { rest.shift(); closed.add(i); } });
  return slots.filter((s, i) => !closed.has(i));
}
function curvePlan(p, entry, start, end, now, data) {
  const logs = (data && data.logs) || [];
  const sched = scheduledDoses(p, entry, start, end, now);
  const createdMs = p && p.created_at ? stampMs(p.created_at) : NaN;
  // A created_at after now (a phone clock that was behind) never moves the boundary into the future.
  const C = Number.isFinite(createdMs) ? Math.min(createdMs - DECLARED_GRACE_MS, now) : -Infinity;
  const pid = sourceProtocolId(p);
  const rows = rowsOf(pid, logs, now);
  const startMs = p && p.start_date ? new Date(p.start_date + 'T00:00:00').getTime() : NaN;
  const hasDeclared = !p.history_from && Number.isFinite(createdMs) && Number.isFinite(startMs) && startMs < localMidnight(createdMs);
  let historyFloor = -Infinity;
  if (p.history_from) {
    const hf = new Date(String(p.history_from).slice(0, 10) + 'T00:00:00').getTime();
    if (Number.isFinite(hf)) historyFloor = hf;
  }
  // R12: the latest logged-era Taken row of another protocol of the same compound, before C.
  let overlapUntil = -Infinity;
  if (hasDeclared) {
    const name = matchName(p);
    for (const q of (data && data.siblings) || []) {
      if (!q || sourceProtocolId(q) === pid || matchName(q) !== name) continue;
      const qc = q.created_at ? stampMs(q.created_at) : NaN;
      const qC = Number.isFinite(qc) ? qc - DECLARED_GRACE_MS : -Infinity;
      for (const r of rowsOf(sourceProtocolId(q), logs, now)) {
        if (r.outcome === 'Taken' && r.t >= qC && r.t < C && r.t > overlapUntil) overlapUntil = r.t;
      }
    }
  }
  const declared = [];
  const planned = [];
  const todayKey = localDayKey(now);
  const today = [];
  for (const ts of sched) {
    if (ts < C) {
      if (!hasDeclared || ts <= overlapUntil) continue;
      declared.push(ts);
      planned.push(ts);
      continue;
    }
    planned.push(ts);
    if (localDayKey(ts) === todayKey) today.push(ts);
  }
  // Logged-era rows (from C; with history_from, nothing before it either).
  const era = rows.filter((r) => r.t >= C && r.t >= historyFloor);
  const taken = era.filter((r) => r.outcome === 'Taken').map((r) => r.t);
  let closingToday = era.filter((r) => CLOSING[r.outcome] && localDayKey(r.t) === todayKey);
  // R2: on the creation day, the declared slots plus the rows that closed it after C ≤ its expected count.
  if (declared.length && Number.isFinite(createdMs)) {
    const cKey = localDayKey(createdMs);
    const onDay = declared.filter((ts) => localDayKey(ts) === cKey);
    if (onDay.length) {
      const closing = era.filter((r) => CLOSING[r.outcome] && localDayKey(r.t) === cKey);
      const expected = expectedDosesOn(p, new Date(createdMs));
      const drop = onDay.length - Math.max(0, Math.min(onDay.length, expected - closing.length));
      // The rows answer the earliest slots: the latest ones stay declared (counted per slot — two at one
      // instant are two).
      let toDrop = drop;
      for (let i = 0; i < declared.length && toDrop > 0;) {
        if (localDayKey(declared[i]) === cKey) { declared.splice(i, 1); toDrop--; } else i++;
      }
      // The rows that answered those declared slots (one each, earliest first) close nothing else today.
      if (cKey === todayKey) closingToday = closingToday.slice(drop);
    }
  }
  const left = openSlots(today, closingToday);
  const open = left.filter((ts) => ts <= now).map(() => now + OPEN_AT_NOW_MS);
  // After now: every later day as scheduled; today only the slots left open (two doses at one instant
  // are two slots, so they are counted, never matched by timestamp).
  const want = new Map();
  for (const ts of left) if (ts > now) want.set(ts, (want.get(ts) || 0) + 1);
  const planList = [];
  for (const ts of sched) {
    if (ts <= now) continue;
    if (localDayKey(ts) !== todayKey) { planList.push(ts); continue; }
    const n = want.get(ts) || 0;
    if (n > 0) { planList.push(ts); want.set(ts, n - 1); }
  }
  const lookFrom = Math.min(now - curveLookbackDays(entry) * DAY_MS, start - curveHistoryDays(entry) * DAY_MS);
  const takenIn = taken.filter((t) => t >= lookFrom && t <= end);
  const doses = [...declared, ...takenIn, ...open.filter((t) => t <= end), ...planList.filter((t) => t <= end)].sort((a, b) => a - b);
  // ENG-1: the same doses come back as the same frozen list, so lib/curveSampling keeps its carried sums.
  const key = hashTimes([doses, planned, declared, takenIn, planList, [open.length]]);
  const hit = PLAN_CACHE.get(sched);
  if (hit && hit.key === key && hit.value.doses.length === doses.length) return hit.value;
  const value = Object.freeze({
    doses: Object.freeze(doses), planned: Object.freeze(planned), declared: Object.freeze(declared),
    taken: Object.freeze(takenIn), open: open.length, plan: Object.freeze(planList),
  });
  PLAN_CACHE.set(sched, { key, value });
  return value;
}

module.exports = {
  readoutMoment, curveDoseInstants, curveSampleTimes, lineSamples, combinedLine, LONG_RISE_HOURS, doseTicks,
  curveDecaySamples, curveTroughInstants, DRAW_TOLERANCE, curveLookbackDays, curveHistoryDays, levelOnDate, LOOKBACK_CAP_DAYS, CURVE_LOG_LOOKBACK_DAYS,
  curveHistoryProtocols, estimatedBeforeMs, curvePlan, OPEN_AT_NOW_MS,
  CURVE_DEFAULT_PAST_DAYS, CURVE_MAX_PAST_DAYS, curveWindowDays, curveTicks, axisLabel, upcomingDoseDays,
  PAST_DAYS, STEP_HOURS, DEFAULT_SLOT, BLEND_COLORS,
  matchName, splitCurveProtocols, curveGridStart, scheduledDoses, levelAt, dosesInLevel,
  estimatedLevelNow, defaultCurveLevel, levelLabel,
};
