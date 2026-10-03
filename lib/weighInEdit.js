'use strict';
// Fix or delete a weigh-in (founder 2026-10-02, docs/specs/progress-one-card.md PO-19..PO-26).
// The date of a weigh-in never changes. Save corrects that day's calc_snapshots row in place;
// Delete marks every row of that day sync_status='deleted' (the tombstone lib/syncCore pushes
// as a cloud delete, so the row never comes back from the cloud). The weigh-in that started
// the open reality check can be fixed but not deleted. Pure / db-injected (node --test).
const { parseDecimal } = require('./doseMath');
const { lbToKg, kgToLb, inToCm, cmToIn } = require('./energyCalc');

// The app's sane ranges (lib/energyCalc INPUT_RANGES for weight and body fat; waist 30–250 cm).
const RANGES = { weightKg: [25, 300], bodyFatPct: [3, 70], waistCm: [30, 250] };
const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
const one = (v) => String(Math.round(v * 10) / 10);
const day = (iso) => String(iso || '').slice(0, 10);

// What the sheet shows for a row, in the user's unit.
function weighInFormValues(row, unit) {
  const imp = unit === 'imperial';
  const r = row || {};
  return {
    weight: r.weight_kg == null ? '' : (Math.round((imp ? kgToLb(r.weight_kg) : r.weight_kg) * 10) / 10).toFixed(1), // "86.0" as the table shows it
    bodyFat: r.body_fat_pct == null ? '' : one(r.body_fat_pct),
    waist: r.waist_cm == null ? '' : one(imp ? cmToIn(r.waist_cm) : r.waist_cm),
  };
}

// The typed form → metric values, or { ok: false }. Comma decimals are read (parseDecimal).
// A field the user did not change keeps the stored metric value exactly (no unit drift).
function readWeighInForm({ weight, bodyFat = '', waist = '', unit = 'metric', original = null }) {
  const imp = unit === 'imperial';
  const shown = original ? weighInFormValues(original, unit) : null;
  const opt = (s) => (s == null || String(s).trim() === '' ? null : parseDecimal(s));
  const w = opt(weight);
  if (w == null || !Number.isFinite(w)) return { ok: false, field: 'weight' };
  const weightKg = shown && String(weight).trim() === shown.weight ? original.weight_kg : (imp ? lbToKg(w) : w);
  const bf = opt(bodyFat);
  const wc = opt(waist);
  const waistCm = wc == null ? null : (shown && String(waist).trim() === shown.waist ? original.waist_cm : (imp ? inToCm(wc) : wc));
  if (!inRange(weightKg, RANGES.weightKg)) return { ok: false, field: 'weight' };
  if (bf != null && !inRange(bf, RANGES.bodyFatPct)) return { ok: false, field: 'bodyFat' };
  if (waistCm != null && !inRange(waistCm, RANGES.waistCm)) return { ok: false, field: 'waist' };
  return { ok: true, weightKg: Math.round(weightKg * 100) / 100, bodyFatPct: bf, waistCm: waistCm == null ? null : Math.round(waistCm * 100) / 100 };
}

// What the sheet offers for a day: the open check's start weigh-in cannot be deleted.
function weighInActions(dateISO, rcStart) {
  const isCheckStart = !!(rcStart && rcStart.date && day(rcStart.date) === day(dateISO));
  return { canDelete: !isCheckStart, isCheckStart };
}

// Fixing the start weigh-in moves the open check's start weight with it (same day).
function checkStartPatch(rcStart, dateISO, weightKg) {
  if (!rcStart || !rcStart.date || day(rcStart.date) !== day(dateISO) || weightKg == null) return null;
  return { date: day(rcStart.date), weightKg };
}

// Save: the newest live row of that day, corrected in place (computed fields kept). One write.
function correctWeighIn(db, userId, dateISO, { weightKg, bodyFatPct = null, waistCm = null }, nowISO) {
  const row = db.getFirstSync(
    `SELECT id FROM calc_snapshots WHERE user_id = ? AND entry_date = ? AND sync_status != 'deleted' ORDER BY updated_at DESC LIMIT 1`,
    [userId, day(dateISO)],
  );
  if (!row) return false;
  db.runSync(
    `UPDATE calc_snapshots SET weight_kg = ?, body_fat_pct = ?, waist_cm = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
    [weightKg, bodyFatPct, waistCm, nowISO, row.id],
  );
  return true;
}

// Delete: every live row of that day becomes a tombstone (a second device's duplicate too).
function deleteWeighIn(db, userId, dateISO, nowISO, rcStart = null) {
  if (!weighInActions(dateISO, rcStart).canDelete) throw new Error('This weigh-in starts the reality check');
  db.runSync(
    `UPDATE calc_snapshots SET sync_status = 'deleted', updated_at = ? WHERE user_id = ? AND entry_date = ? AND sync_status != 'deleted'`,
    [nowISO, userId, day(dateISO)],
  );
}

module.exports = { RANGES, weighInFormValues, readWeighInForm, weighInActions, checkStartPatch, correctWeighIn, deleteWeighIn };
