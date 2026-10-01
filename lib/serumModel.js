// Dose accumulation estimate — pure math, no React Native or Expo imports, so it
// runs under plain Node's test runner. CommonJS for the same reason (Metro imports it
// fine). Moved out of SerumCurveScreen unchanged (Journey dashboard, founder approved
// 2026-09-29) so the Curve screen and the Journey tile always show the same
// "Est. level": a math estimate from the protocol's PLANNED schedule and published
// half-lives — never a measurement, never advice.

const { getHalfLifeEntry, curveUnit, doseInCurveUnit, amountFraction } = require('./halfLives');
const { expectedDosesOn } = require('./schedule');
const { BLEND_IDS, blendComponents } = require('./compounds');
const { translations } = require('../i18n/translations');

const PAST_DAYS = 14;
const STEP_HOURS = 6;
const STEP_MS = STEP_HOURS * 3600 * 1000;
const DAY_MS = 86400000;
// Local hours for N scheduled doses in one day (on the 00/06/12/18 sample grid).
const DOSE_SLOTS = { 1: [12], 2: [6, 18], 3: [6, 12, 18], 4: [0, 6, 12, 18] };
// Blend component lines: from the protocol palette, avoiding the data blue and the
// success green so a blend line never reads as "data" or "good".
const BLEND_COLORS = ['#7F77DD', '#D85A30', '#0E8C8C', '#BA7517'];

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
  const noDose = (p) => !(Number(p.dose) > 0);
  const isIU = (p) => { const e = entryOf(p); return e != null && !noDose(p) && doseInCurveUnit(p.dose, p.dose_unit, e) == null; };
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
// time. Doses are placed at 12:00, so every dose lands exactly ON a sample — otherwise
// a fast compound (t½ ≲ 2h) sampled at arbitrary times of day draws near-zero or
// random spikes that change with the minute you open the screen.
function curveGridStart(now) {
  const s0 = new Date(now - PAST_DAYS * 24 * 3600 * 1000);
  s0.setHours(Math.floor(s0.getHours() / STEP_HOURS) * STEP_HOURS, 0, 0, 0);
  return s0.getTime();
}

// Dose timestamps from the protocol's SCHEDULE (start date + interval + doses/day),
// not from hand-logged doses — so the curve reflects the protocol automatically, past
// and projected. Scans back far enough that long esters' earlier doses still
// contribute at the window start: 6 half-lives of history (Undecanoate's 90d → 540d),
// capped at 600 days. `start` is the grid start (curveGridStart(now)).
function scheduledDoses(p, entry, start, end, now) {
  const lookbackDays = Math.min(600, Math.max(PAST_DAYS + 2, Math.ceil(6 * entry.hours / 24)));
  let scanStart = now - lookbackDays * DAY_MS;
  if (p.start_date) {
    const sd = new Date(p.start_date + 'T00:00:00').getTime();
    if (isFinite(sd) && sd > scanStart) scanStart = sd;
  }
  const scanStartDay = new Date(scanStart); scanStartDay.setHours(0, 0, 0, 0);
  // Snap onto the sample grid: after a clock change local 12:00 is 1h off the fixed
  // 6h steps, and a fast compound's spike would fall between samples.
  const snap = (ts) => start + Math.round((ts - start) / STEP_MS) * STEP_MS;
  const doses = [];
  for (let dts = scanStartDay.getTime(); dts <= end; dts += DAY_MS) {
    const day = new Date(dts);
    // Count of scheduled doses that day (reminder-time-independent), spread over the
    // day's 6h sample slots — 1/day at 12:00, 2/day at 06+18, … — so two doses draw
    // as two spikes, not one double-height spike.
    const cnt = expectedDosesOn(p, day);
    const slots = DOSE_SLOTS[cnt] || DOSE_SLOTS[4];
    for (let k = 0; k < cnt; k++) {
      const dd = new Date(day); dd.setHours(slots[k % slots.length], 0, 0, 0);
      doses.push(snap(dd.getTime()));
    }
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
  if (!entry || !(Number(p.dose) > 0)) return null;
  const doseMg = doseInCurveUnit(p.dose, p.dose_unit, entry);
  if (doseMg == null) return null;
  const start = curveGridStart(now);
  // Doses after `now` don't count, so the projection horizon doesn't change the value.
  const doses = scheduledDoses(p, entry, start, now, now);
  return { value: levelAt(doses, doseMg || 0, entry, now), unit: curveUnit(entry), entry };
}

// What the Curve screen opens on by default (the first charted compound; a blend →
// its first component) and its Est. level now — the Journey tile's number.
function defaultCurveLevel(rawProtocols, now = Date.now(), t = identity) {
  const first = splitCurveProtocols(rawProtocols, t).active[0];
  if (!first) return null;
  const lv = estimatedLevelNow(first, now);
  return lv ? { protocol: first, ...lv } : null;
}

// The screen's number format: one decimal below 10, whole numbers above.
function levelLabel(v) {
  if (!isFinite(v) || v <= 0) return '0';
  if (v < 10) return v.toFixed(1);
  return String(Math.round(v));
}

module.exports = {
  PAST_DAYS, STEP_HOURS, DOSE_SLOTS, BLEND_COLORS,
  matchName, splitCurveProtocols, curveGridStart, scheduledDoses, levelAt,
  estimatedLevelNow, defaultCurveLevel, levelLabel,
};
