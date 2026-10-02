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
function formFromProtocol(p, vial, now) {
  const f = newProtocolForm(now);
  f.name = p.name || ''; f.compoundId = p.compound_id || null;
  f.type = p.type || 'recon';
  f.color = displayColor(p.color) || DEFAULT_PROTOCOL_COLOR;
  f.amount = p.amount ? String(p.amount) : ''; f.unit = p.unit || 'mg';
  f.water = p.water ? String(p.water) : '2';
  if (p.diluent && DILUENT_TOKENS.includes(p.diluent) && p.diluent !== 'other') {
    f.diluentChoice = p.diluent; f.diluentOther = '';
  } else if (p.diluent) {
    f.diluentChoice = 'other'; f.diluentOther = p.diluent;
  }
  f.dose = p.dose ? String(p.dose) : ''; f.doseUnit = p.dose_unit || 'mg';
  f.syringeSize = p.syringe_size || 100;
  f.concentration = p.concentration ? String(p.concentration) : '';
  f.concentrationUnit = p.concentration_unit || 'mg';
  if (p.type === 'rtu') {
    // Prefer the active vial's volume; else rebuild it from the stored vial total.
    const ml = vial && vial.water_ml != null ? vial.water_ml
      : (p.amount && p.concentration ? trimNum(parseDecimal(p.amount) / parseDecimal(p.concentration)) : null);
    f.vialMl = ml != null ? String(ml) : '';
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
  f.servingStrength = p.serving_strength != null ? String(p.serving_strength) : '';
  f.servingStrengthUnit = p.serving_strength_unit || 'mg';
  f.servingUnits = p.serving_units != null ? String(p.serving_units) : '1';
  f.containerUnits = p.container_units != null ? String(p.container_units) : '';
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
function protocolPayload(f, frequencyLabel) {
  const isRtu = f.type === 'rtu', isOral = f.type === 'oral';
  const rtuVialMg = (isRtu && parseDecimal(f.concentration) > 0 && parseDecimal(f.vialMl) > 0)
    ? parseDecimal(f.concentration) * parseDecimal(f.vialMl) : null;
  return {
    name: f.name, compound_id: f.compoundId, type: f.type, color: f.color,
    amount: isRtu ? rtuVialMg : (parseDecimal(f.amount) || null),
    unit: isRtu ? f.concentrationUnit : f.unit,
    water: parseDecimal(f.water) || null,
    diluent: resolvedDiluent(f),
    dose: parseDecimal(f.dose) || null, dose_unit: f.doseUnit,
    syringe_size: f.syringeSize,
    concentration: parseDecimal(f.concentration) || null,
    concentration_unit: f.concentrationUnit,
    frequency: frequencyLabel(f.intervalDays), reminder_time: f.reminderTimes.join(','),
    interval_days: f.intervalDays, doses_per_day: f.dosesPerDay,
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(f.startDate) ? f.startDate : isoDay(new Date(), 0),
    schedule_total: null,
    vial_valid_days: parseInt(f.vialValidDays, 10) || null,
    goal: f.goals.join(','), notes: f.notes, note: f.note,
    // Blend composition label — only for blends. NEVER feeds the curve/math.
    composition: (f.compoundId && BLEND_IDS.includes(f.compoundId)) ? ((f.composition || '').trim() || null) : null,
    serving_strength: isOral ? (parseDecimal(f.servingStrength) || null) : null,
    serving_strength_unit: isOral ? f.servingStrengthUnit : null,
    serving_units: isOral ? (parseDecimal(f.servingUnits) || null) : null,
    container_units: isOral ? (parseDecimal(f.containerUnits) || null) : null,
    divisible: isOral ? f.divisible : null,
  };
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Only the columns whose value the user's changes moved (decision 2).
function editPatch(before, after, frequencyLabel) {
  const a = protocolPayload(before, frequencyLabel), b = protocolPayload(after, frequencyLabel);
  const out = {};
  for (const k of Object.keys(b)) if (!same(a[k], b[k])) out[k] = b[k];
  return out;
}

// The ready-to-use vial the form describes, or null when it can't be counted yet.
function rtuVialFields(f) {
  if (f.type !== 'rtu') return null;
  const ml = parseDecimal(f.vialMl), conc = parseDecimal(f.concentration), dose = parseDecimal(f.dose);
  if (!(ml > 0 && conc > 0 && dose > 0)) return null;
  let expiresOn = null;
  if (f.vialExpMonth != null && f.vialExpYear != null) {
    const lastDay = new Date(f.vialExpYear, f.vialExpMonth + 1, 0).getDate();
    expiresOn = `${f.vialExpYear}-${String(f.vialExpMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  const total = dosesPerVial({ amount: conc * ml, unit: f.concentrationUnit, dose: f.dose, doseUnit: f.doseUnit }) || 0;
  return { water_ml: ml, total_doses: total, expires_on: expiresOn };
}

// The vial columns an edit changed (null = nothing to write; never a vial nobody touched).
function rtuVialPatch(before, after) {
  const a = rtuVialFields(before), b = rtuVialFields(after);
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

module.exports = {
  isoDay, firstDoseChoice, timeRounded5, newProtocolForm, formFromProtocol, protocolPayload,
  editPatch, rtuVialFields, rtuVialPatch, hasNewProtocolInput, nameOnNext, PRESET_INTERVALS,
};
