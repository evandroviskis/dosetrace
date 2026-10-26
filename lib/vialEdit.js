// AD-80 (founder 2026-10-26, docs/design/ad80-edit-vial.html): "Edit vial" on the protocol page.
// Corrects the vial in use — a reconstituted vial's mix date, the protocol's validity in days (one
// number per protocol, so it also applies to the next vials) and the doses already used; a
// ready-to-use vial's box month/year (blank allowed) and the doses already used. Only the vial row
// and that protocol column change: the dose history, the curve, adherence and the reports never do.
// Pure, CommonJS so it's unit-testable; the writes go through lib/database.js updateVial /
// updateProtocol (synced by syncCore).
const { supplyState } = require('./supplyLow');
const { DEFAULT_VALID_DAYS } = require('./vialExpiry');
const { boxExpiresOn } = require('./protocolForm');

const pad = (n) => String(n).padStart(2, '0');

// Shown on every active reconstituted or ready-to-use vial (option A, beside "New vial").
function showsEditVialButton(protocol, vial) {
  return !!(protocol && vial && (protocol.type === 'recon' || protocol.type === 'rtu'));
}

// The form's six box years (this year and the next five).
function expiryYears(now) {
  const y = new Date(now).getFullYear();
  return [0, 1, 2, 3, 4, 5].map((o) => y + o);
}

// The window opens with the vial's current values.
function editVialStart(protocol, vial) {
  const p = protocol || {}; const v = vial || {};
  const { capacity } = supplyState(v, p);
  const out = { month: null, day: '', validDays: '', dosesUsed: String(v.doses_taken || 0), capacity: capacity || null, expMonth: null, expYear: null };
  if (p.type === 'recon') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v.mixed_on || ''));
    if (m) { out.month = Number(m[2]) - 1; out.day = String(Number(m[3])); }
    out.validDays = String(p.vial_valid_days || DEFAULT_VALID_DAYS);
  } else if (p.type === 'rtu') {
    const m = /^(\d{4})-(\d{2})/.exec(String(v.expires_on || ''));
    if (m) { out.expMonth = Number(m[2]) - 1; out.expYear = Number(m[1]); }
  }
  return out;
}

// Whole numbers, up to 3 digits (the protocol form's rule); '' while typing.
function acceptValidDaysText(text) { return text === '' || /^\d{1,3}$/.test(String(text)); }
// Empty or 0 = the app default (30).
function validDaysValue(text) { return parseInt(text, 10) || DEFAULT_VALID_DAYS; }
// 0 up to the vial's doses; a larger number does not go in (as the day field refuses 32).
function acceptDosesUsedText(text, capacity) {
  if (text === '') return true;
  if (!/^\d+$/.test(String(text))) return false;
  return capacity == null || Number(text) <= capacity;
}

// The corrected mix date: the nearer of this year's and last year's day. When the nearer one is
// after today it is refused ("Date in the future", the picture's Nov 5 on Oct 20) — never silently
// moved a year back, which would expire the vial without the person seeing it. Last year's day
// is used only when it is the nearer one (a December vial corrected in January). The stored date
// is never used (data review 2026-10-26), so it is not passed. An empty day field (or no month) is
// { error: 'empty' } — "mix date missing", never "invalid date" (review 2026-10-26).
function editMixDate(monthIdx, dayStr, now) {
  if (monthIdx == null || String(dayStr == null ? '' : dayStr).trim() === '') return { error: 'empty' };
  const day = parseInt(dayStr, 10);
  if (!day) return { error: 'invalid' };
  const ref = new Date(now);
  const todayStart = new Date(ref); todayStart.setHours(0, 0, 0, 0);
  const at = (y) => { const d = new Date(y, monthIdx, day); return d.getMonth() === monthIdx && d.getDate() === day ? d : null; };
  const year = ref.getFullYear();
  const cur = at(year);
  if (!cur) return { error: 'invalid' };
  if (cur <= todayStart) return { date: `${year}-${pad(monthIdx + 1)}-${pad(day)}` };
  const last = at(year - 1);
  if (last && (todayStart - last) < (cur - todayStart)) return { date: `${year - 1}-${pad(monthIdx + 1)}-${pad(day)}` };
  return { error: 'future' };
}

// The window's message for a refused mix date ({ title, body }, one rule for every window that
// reads a typed mix date): after today → "Date in the future"; an empty day → the mix date is
// missing; an impossible day (Feb 31) → "Invalid date".
function mixDateError(error, t) {
  if (error === 'future') return { title: t('vial_edit_future_title'), body: t('vial_edit_future_body') };
  if (error === 'empty') return { title: t('vial_edit_day_empty_title'), body: t('vial_edit_day_empty_body') };
  return { title: t('error'), body: t('today_invalid_date') };
}

// What Save writes: only the changed vial columns and, for a reconstituted vial, the protocol's
// validity in days. { error } when the mix date is refused. Never a dose log.
function editVialPlan(protocol, vial, input, now) {
  const p = protocol || {}; const v = vial || {}; const i = input || {};
  const vialUpdate = {}; let protocolUpdate = null;
  const { capacity } = supplyState(v, p);
  if (p.type === 'recon') {
    const r = editMixDate(i.month, i.day, now);
    if (r.error) return { error: r.error };
    if (r.date !== String(v.mixed_on || '').slice(0, 10)) vialUpdate.mixed_on = r.date;
    const days = validDaysValue(i.validDays);
    if (days !== (p.vial_valid_days || DEFAULT_VALID_DAYS)) protocolUpdate = { vial_valid_days: days };
  } else if (p.type === 'rtu') {
    const exp = boxExpiresOn(i.expMonth, i.expYear);
    if (exp !== (v.expires_on ? String(v.expires_on).slice(0, 10) : null)) vialUpdate.expires_on = exp;
  }
  let finished = false;
  if (capacity && i.dosesUsed !== '' && i.dosesUsed != null && acceptDosesUsedText(String(i.dosesUsed), capacity)) {
    const used = Number(i.dosesUsed);
    if (used !== (v.doses_taken || 0)) vialUpdate.doses_taken = used;
    // Data review 2026-10-26 (product logic): every dose used = the state the last dose leaves
    // (lib/markTaken: { doses_taken: capacity, active: 0 }) — the vial is finished.
    if (used >= capacity) { vialUpdate.active = 0; finished = true; }
  }
  const out = { vialUpdate: Object.keys(vialUpdate).length ? vialUpdate : null, protocolUpdate };
  if (finished) out.finished = true;
  return out;
}

// Save: the plan, written through the existing database functions. Returns the plan.
function applyVialEdit(protocol, vial, input, now, db) {
  const plan = editVialPlan(protocol, vial, input, now);
  if (plan.error) return plan;
  if (plan.vialUpdate) db.updateVial(vial.id, plan.vialUpdate);
  if (plan.protocolUpdate) db.updateProtocol(protocol.id, plan.protocolUpdate);
  return plan;
}

module.exports = {
  showsEditVialButton, expiryYears, editVialStart, acceptValidDaysText, validDaysValue,
  acceptDosesUsedText, editMixDate, mixDateError, editVialPlan, applyVialEdit, boxExpiresOn,
};
