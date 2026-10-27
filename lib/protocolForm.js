// The add / edit protocol form as plain data (My Protocols redesign, founder decisions
// 2026-10-02). Pure, CommonJS so it's unit-testable under Node.
//
// Decision 2: a NEW protocol starts with "Today" as its first dose; EDITING a protocol
// writes ONLY what the user changed. The edit form is a snapshot of the stored row
// (formFromProtocol); on Save both the snapshot and the current form go through the same
// payload builder and only the fields whose value differs are written (editPatch). So the
// defaults the form fills in for empty columns (start date, times, water, colour mapping,
// vial size, ...) are never written back on a Save without changes.
const { parseDecimal, dosesPerVial } = require('./doseMath');
const { BLEND_IDS } = require('./compounds');
const { DEFAULT_VALID_DAYS } = require('./vialExpiry');
const { inputNumber } = require('./localeFormat');
const { displayColor, DEFAULT_PROTOCOL_COLOR } = require('./protocolColors');

const PRESET_INTERVALS = [1, 2, 3, 4, 5, 6, 7, 10, 14];
const DILUENT_TOKENS = ['bacteriostatic_water', 'sterile_water', 'sodium_chloride_09', 'other'];

// The user's local calendar day, `offset` days from `now`, as YYYY-MM-DD (never a UTC date).
function isoDay(now, offset) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (offset || 0), 12);
  const m = d.getMonth() + 1, day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

// Which first-dose quick pick the date is: 0 Today, 1 Tomorrow, null neither.
function firstDoseChoice(startDate, now) {
  if (startDate === isoDay(now, 0)) return 0;
  if (startDate === isoDay(now, 1)) return 1;
  return null;
}

function timeRounded5(now) {
  const mins = Math.round(now.getMinutes() / 5) * 5;
  const h = mins === 60 ? now.getHours() + 1 : now.getHours();
  const m = mins === 60 ? 0 : mins;
  return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function trimNum(n) {
  if (!isFinite(n)) return null;
  return Number.isInteger(n) ? n : Number(n.toFixed(2));
}

// A new protocol: the first dose is Today (decision 2), one dose a day at the time now.
function newProtocolForm(now) {
  return {
    name: '', compoundId: null, type: 'recon', color: DEFAULT_PROTOCOL_COLOR,
    amount: '', unit: 'mg', water: '2', diluentChoice: '', diluentOther: '',
    dose: '', doseUnit: 'mg', syringeSize: 100, concentration: '', concentrationUnit: 'mg',
    intervalDays: 1, customIntervalOpen: false, customIntervalText: '', dosesPerDay: 1,
    startDate: isoDay(now, 0), reminderTimes: [timeRounded5(now)],
    goals: [], notes: '', note: '', composition: '',
    servingStrength: '', servingStrengthUnit: 'mg', servingUnits: '1', containerUnits: '', divisible: null,
    vialValidDays: String(DEFAULT_VALID_DAYS), vialMl: '', vialExpMonth: null, vialExpYear: null,
  };
}

// The edit form from a stored row (and its active vial). Same mapping the screen always used.
// language: the app language — a stored number shows its decimal ("0,5" in Portuguese,
// founder 2026-10-02); protocolPayload reads it back with parseDecimal, so an untouched
// field is the same value and editPatch writes nothing.
function formFromProtocol(p, vial, now, language = 'en') {
  // An older row stored as text ("5,000" IU, "0,5") is read with the stored-value rule first,
  // so the field shows its number in the app language ("5000", "0,5") and saves the same value.
  const num = (v) => { const n = typeof v === 'number' ? v : parseDecimal(v); return inputNumber(Number.isFinite(n) ? n : v, language); };
  const f = newProtocolForm(now);
  f.name = p.name || ''; f.compoundId = p.compound_id || null;
  f.type = p.type || 'recon';
  f.color = displayColor(p.color) || DEFAULT_PROTOCOL_COLOR;
  f.amount = p.amount ? num(p.amount) : ''; f.unit = p.unit || 'mg';
  f.water = p.water ? num(p.water) : '2';
  if (p.diluent && DILUENT_TOKENS.includes(p.diluent) && p.diluent !== 'other') {
    f.diluentChoice = p.diluent; f.diluentOther = '';
  } else if (p.diluent) {
    f.diluentChoice = 'other'; f.diluentOther = p.diluent;
  }
  f.dose = p.dose ? num(p.dose) : ''; f.doseUnit = p.dose_unit || 'mg';
  f.syringeSize = p.syringe_size || 100;
  f.concentration = p.concentration ? num(p.concentration) : '';
  f.concentrationUnit = p.concentration_unit || 'mg';
  if (p.type === 'rtu') {
    // Prefer the active vial's volume; else rebuild it from the stored vial total.
    const ml = vial && vial.water_ml != null ? vial.water_ml
      : (p.amount && p.concentration ? trimNum(parseDecimal(p.amount) / parseDecimal(p.concentration)) : null);
    f.vialMl = ml != null ? num(ml) : '';
    if (vial && vial.expires_on) {
      const ed = new Date(String(vial.expires_on).slice(0, 10) + 'T00:00:00');
      if (!isNaN(ed.getTime())) { f.vialExpMonth = ed.getMonth(); f.vialExpYear = ed.getFullYear(); }
    }
  }
  const interval = p.interval_days || 1;
  f.intervalDays = interval;
  if (!PRESET_INTERVALS.includes(interval)) { f.customIntervalOpen = true; f.customIntervalText = String(interval); }
  const dpd = p.doses_per_day || 1;
  f.dosesPerDay = dpd;
  // A bare YYYY-MM-DD (a timestamp or junk made the iOS wheel show 1969). A row with no
  // start date stays without one: nothing is preselected (decision 2) and the payload's
  // fallback is the same on both sides of the diff, so it is never written by itself.
  const sd = typeof p.start_date === 'string' ? p.start_date.slice(0, 10) : '';
  f.startDate = /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : '';
  const times = (p.reminder_time || timeRounded5(now)).split(',').filter(Boolean);
  const defaults = [timeRounded5(now), '14:00', '21:00'];
  while (times.length < dpd) times.push(defaults[times.length] || '12:00');
  f.reminderTimes = times.slice(0, dpd);
  f.goals = p.goal ? p.goal.split(',').filter(Boolean) : [];
  f.notes = p.notes || ''; f.note = p.note || ''; f.composition = p.composition || '';
  f.servingStrength = p.serving_strength != null ? num(p.serving_strength) : '';
  f.servingStrengthUnit = p.serving_strength_unit || 'mg';
  f.servingUnits = p.serving_units != null ? num(p.serving_units) : '1';
  f.containerUnits = p.container_units != null ? num(p.container_units) : '';
  f.divisible = p.divisible == null ? null : (p.divisible === 1 || p.divisible === true);
  f.vialValidDays = String(p.vial_valid_days || DEFAULT_VALID_DAYS);
  return f;
}

// The stored diluent: a preset token, the trimmed own text, or null.
function resolvedDiluent(f) {
  if (f.type !== 'recon') return null;
  return f.diluentChoice === 'other' ? ((f.diluentOther || '').trim() || null) : (f.diluentChoice || null);
}

// The protocol columns the form writes (insert or edit). `frequencyLabel(n)` gives the
// stored frequency words. start_date is always a valid YYYY-MM-DD.
// language: the app language the form was typed in (parseDecimal reads "1,25" / "1.250" its way).
function protocolPayload(f, frequencyLabel, language) {
  const isRtu = f.type === 'rtu', isOral = f.type === 'oral';
  const rtuVialMg = (isRtu && parseDecimal(f.concentration, language) > 0 && parseDecimal(f.vialMl, language) > 0)
    ? parseDecimal(f.concentration, language) * parseDecimal(f.vialMl, language) : null;
  return {
    name: f.name, compound_id: f.compoundId, type: f.type, color: f.color,
    amount: isRtu ? rtuVialMg : (parseDecimal(f.amount, language) || null),
    unit: isRtu ? f.concentrationUnit : f.unit,
    water: parseDecimal(f.water, language) || null,
    diluent: resolvedDiluent(f),
    dose: parseDecimal(f.dose, language) || null, dose_unit: f.doseUnit,
    syringe_size: f.syringeSize,
    concentration: parseDecimal(f.concentration, language) || null,
    concentration_unit: f.concentrationUnit,
    frequency: frequencyLabel(f.intervalDays), reminder_time: f.reminderTimes.join(','),
    interval_days: f.intervalDays, doses_per_day: f.dosesPerDay,
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(f.startDate) ? f.startDate : isoDay(new Date(), 0),
    schedule_total: null,
    vial_valid_days: parseInt(f.vialValidDays, 10) || null,
    goal: f.goals.join(','), notes: f.notes, note: f.note,
    // Blend composition label — only for blends. NEVER feeds the curve/math.
    composition: (f.compoundId && BLEND_IDS.includes(f.compoundId)) ? ((f.composition || '').trim() || null) : null,
    serving_strength: isOral ? (parseDecimal(f.servingStrength, language) || null) : null,
    serving_strength_unit: isOral ? f.servingStrengthUnit : null,
    serving_units: isOral ? (parseDecimal(f.servingUnits, language) || null) : null,
    container_units: isOral ? (parseDecimal(f.containerUnits, language) || null) : null,
    divisible: isOral ? f.divisible : null,
  };
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Only the columns whose value the user's changes moved (decision 2).
function editPatch(before, after, frequencyLabel, language) {
  const a = protocolPayload(before, frequencyLabel, language), b = protocolPayload(after, frequencyLabel, language);
  const out = {};
  for (const k of Object.keys(b)) if (!same(a[k], b[k])) out[k] = b[k];
  return out;
}

// A box's month + year → the last day of that month ('YYYY-MM-DD'); null unless both are picked
// (blank allowed). The form, "Edit vial" and the ready-to-use "New vial" share it (AD-80).
function boxExpiresOn(month, year) {
  if (month == null || year == null) return null;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// The ready-to-use vial the form describes, or null when it can't be counted yet.
function rtuVialFields(f, language) {
  if (f.type !== 'rtu') return null;
  const ml = parseDecimal(f.vialMl, language), conc = parseDecimal(f.concentration, language), dose = parseDecimal(f.dose, language);
  if (!(ml > 0 && conc > 0 && dose > 0)) return null;
  const expiresOn = boxExpiresOn(f.vialExpMonth, f.vialExpYear);
  const total = dosesPerVial({ amount: conc * ml, unit: f.concentrationUnit, dose: f.dose, doseUnit: f.doseUnit, language }) || 0;
  return { water_ml: ml, total_doses: total, expires_on: expiresOn };
}

// The vial columns an edit changed (null = nothing to write; never a vial nobody touched).
function rtuVialPatch(before, after, language) {
  const a = rtuVialFields(before, language), b = rtuVialFields(after, language);
  if (!b) return null;
  const out = {};
  for (const k of Object.keys(b)) if (!a || !same(a[k], b[k])) out[k] = b[k];
  return Object.keys(out).length ? out : null;
}

// Part 20: anything typed into a new protocol (Cancel then asks before it is lost).
function hasNewProtocolInput(f, searchQuery) {
  const txt = [searchQuery, f.amount, f.dose, f.concentration, f.vialMl, f.servingStrength,
    f.containerUnits, f.note, f.composition, f.diluentOther, f.customIntervalText];
  return txt.some((v) => String(v || '').trim().length > 0) || (f.goals || []).length > 0;
}

// Decision 3 (prototype wnext): leaving step 1 needs a name. A chosen name advances; typed
// text is taken — the listed compound when it is exactly one, else the user's own label;
// an empty field shows "Missing name".
function nameOnNext(searchQuery, compoundId, name, compounds) {
  if (name) return { action: 'advance' };
  const q = String(searchQuery || '').trim();
  if (!q) return { action: 'missing' };
  const hit = (compounds || []).find((c) => String(c.label).toLowerCase() === q.toLowerCase());
  if (hit) return { action: 'select', key: hit.key, label: hit.label };
  return { action: 'custom', name: q };
}

// DL-15 (DV-015 / DV-223): a dose edit recomputes the vial's capacity from the mass left — the vial's
// content does not change with the dose. The doses left are worth (total − taken) × old dose (council
// block 2026-10-27: never "mass − taken × old dose", which is wrong once the vial has been through an
// earlier dose change). fixed (AD-95 "Estava errada"): how many doses of THIS vial the person said were
// really the new dose — each gives back (old − new). When every dose taken from the vial was corrected
// (or none was taken: a typo) and the content is known, the content itself counts: mass − taken × new.
// mass (massUnit): ml × concentration (ready-to-use) or the amount (reconstituted), when known.
// → the new total_doses (never below the doses taken), or null (nothing to change).
const MASS_F = { mcg: 0.001, mg: 1, g: 1000 };
const normUnit = (u) => String(u || 'mg').trim().toLowerCase();
function inBase(v, u, iuOk) {
  if (u === 'iu') return iuOk ? v : null;
  return MASS_F[u] ? v * MASS_F[u] : null;
}
function vialTotalAfterDoseEdit({ total, taken = 0, mass = null, massUnit = null, oldDose, oldUnit, newDose, newUnit, fixed = 0, language }) {
  const o = parseDecimal(oldDose, language), n = parseDecimal(newDose, language);
  if (!(o > 0) || !(n > 0)) return null;
  const ou = normUnit(oldUnit), nu = normUnit(newUnit);
  const iuOk = ou === 'iu' && nu === 'iu';
  const oB = inBase(o, ou, iuOk), nB = inBase(n, nu, iuOk);
  if (oB == null || nB == null) return null;
  const t = Math.max(0, Number(taken) || 0);
  const fx = Math.min(t, Math.max(0, Number(fixed) || 0));
  const tot = Number(total) || 0;
  const m = mass != null && Number(mass) > 0 ? inBase(Number(mass), normUnit(massUnit), iuOk || normUnit(massUnit) === 'iu') : null;
  let left;
  if (m != null && fx >= t) left = m - t * nB;
  else if (tot > 0) left = (tot - t) * oB + fx * (oB - nB);
  else return null;
  return t + Math.floor(Math.max(0, left) / nB + 1e-9);
}

// AD-95 F3 (council 2026-10-27, decided by logic with DL-15): one marked dose corrected to another amount
// ("Alterar dose") moves the vial by the difference — the doses left are worth (total − taken) × the
// protocol dose, plus (old − new) of that one dose. → the new total_doses, or null.
function vialTotalAfterOneDoseEdit({ total, taken = 0, dose, doseUnit, oldAmount, oldUnit, newAmount, newUnit, language }) {
  const d = parseDecimal(dose, language);
  const o = Number(oldAmount), n = Number(newAmount);
  if (!(d > 0) || !(o > 0) || !(n > 0)) return null;
  const du = normUnit(doseUnit);
  const iuOk = du === 'iu' && normUnit(oldUnit) === 'iu' && normUnit(newUnit) === 'iu';
  const dB = inBase(d, du, iuOk), oB = inBase(o, normUnit(oldUnit), iuOk), nB = inBase(n, normUnit(newUnit), iuOk);
  if (dB == null || oB == null || nB == null) return null;
  const tot = Number(total) || 0;
  const t = Math.max(0, Number(taken) || 0);
  if (!(tot > 0)) return null;
  const left = (tot - t) * dB + (oB - nB);
  return t + Math.floor(Math.max(0, left) / dB + 1e-9);
}

module.exports = {
  vialTotalAfterDoseEdit, vialTotalAfterOneDoseEdit,
  isoDay, firstDoseChoice, timeRounded5, newProtocolForm, formFromProtocol, protocolPayload,
  editPatch, rtuVialFields, rtuVialPatch, hasNewProtocolInput, nameOnNext, PRESET_INTERVALS,
  boxExpiresOn,
};
