// Today redesign (founder 2026-10-02): the counts and labels of the Today screen, pure so
// they are tested (__tests__/todayCopy.test.js), and the prototype's vial cells.

// "4 of 5 taken" (Doses header, part 5).
export function dosesTakenLabel(done, total, t) {
  return t('today_doses_taken').replace('{x}', String(done)).replace('{y}', String(total));
}

// "1 dose" / "5 doses" (Tomorrow / Next 5 days folds, part 12).
export function doseCountLabel(n, t) {
  return `${n} ${n === 1 ? t('today_dose_one') : t('today_doses')}`;
}

// "1 dose remaining" / "2 doses remaining" (vial line, part 8).
export function vialRemainingLabel(n, t) {
  return `${n} ${n === 1 ? t('today_vial_remaining_one') : t('today_vial_remaining')}`;
}

// One cell per dose in the vial, the remaining ones filled (prototype cells(total, left):
// cell pitch min(12, floor(150 / total)), cell = pitch - 3 wide, 9 high, rx 2). A vial with
// more doses than fit as readable cells (pitch under 5, cells under 2 pt) shows text only.
export function vialCells(total, left) {
  const n = Math.floor(Number(total) || 0);
  if (n <= 0) return null;
  const cellW = Math.min(12, Math.floor(150 / n));
  if (cellW < 5) return null;
  const l = Math.max(0, Math.min(n, Math.floor(Number(left) || 0)));
  const cells = [];
  for (let k = 0; k < n; k++) cells.push({ x: k * cellW + 0.5, w: cellW - 3, filled: k < l });
  return { cellW, width: n * cellW, cells };
}

// The alert snooze strip (part 2): "Tomorrow" and "In 3 days", both at 09:00.
export const SNOOZE_KINDS = ['tomorrow', 'in3'];
export function snoozeUntil(kind, nowMs) {
  const d = new Date(nowMs);
  const days = kind === 'in3' ? 3 : 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 9, 0, 0, 0).getTime();
}
