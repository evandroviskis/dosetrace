// Syringe sizes (AP-21, founder 2026-10-02). Pure, CommonJS (unit-tested under Node).
//
// A size is stored as its capacity on the U-100 scale, the same column as always
// (protocols.syringe_size): 30 / 50 / 100 are the insulin syringes (0.3 / 0.5 / 1 ml,
// marked in units); 200 / 300 / 500 are the larger 2 / 3 / 5 ml syringes, which are
// marked in ml. The larger ones are offered for Ready to use only: a powder adjusts the
// water instead (founder 2026-10-02). With an ml syringe the draw and the drawn syringe
// read in ml, never in units.
//
// Facts only: nothing here suggests a syringe, a dose or a mix.
const { decimalText } = require('./localeFormat');
const { trimZeros } = require('./doseMath');

const INSULIN_SIZES = [30, 50, 100];
const ML_SIZES = [200, 300, 500];

const syringeMl = (size) => (Number(size) > 0 ? Number(size) / 100 : 1);
const isMlSyringe = (size) => Number(size) > 100;

// The picker groups (option B list): insulin syringes, then (Ready to use only) the
// larger ones. Oral has no syringe.
function syringeGroups(type) {
  if (type === 'oral') return [];
  const groups = [{ titleKey: 'ap_syr_group_insulin', sizes: INSULIN_SIZES.slice() }];
  if (type === 'rtu') groups.push({ titleKey: 'ap_syr_group_ml', sizes: ML_SIZES.slice() });
  return groups;
}

// A size the protocol type may hold; anything else falls back to the 1 ml default.
function allowedSyringe(type, size) {
  const n = Number(size);
  const ok = syringeGroups(type).some((g) => g.sizes.includes(n));
  return ok ? n : 100;
}

// The label of a size: "1 ml · 100 u" for an insulin syringe, "3 ml" for a larger one.
function sizeLabel(size, language) {
  const n = Number(size) > 0 ? Number(size) : 100;
  const ml = decimalText(String(syringeMl(n)), language);
  return isMlSyringe(n) ? `${ml} ml` : `${ml} ml · ${n} u`;
}

// The draw to show for a computeDraw result: ml on an ml syringe, units otherwise.
function drawReading(draw, size) {
  if (isMlSyringe(size)) return { value: String(draw && draw.drawML), unit: 'ml', ml: true };
  return { value: String(draw && draw.drawUnits), unit: 'u', ml: false };
}

// AP-23: one dose under 10 units on an insulin syringe (small marks are hard to read).
// A neutral fact, shown next to the draw; it never suggests changing anything.
function smallDraw(drawUnits, size) {
  if (isMlSyringe(size)) return false;
  const u = Number(drawUnits);
  return Number.isFinite(u) && u > 0 && u < 10;
}

// The smallest syringe in the list for this type that holds `ml` (null when none does).
// Used to state the fact "it needs a syringe that holds at least …" — never a choice.
function sizesThatHold(type, ml) {
  const need = Number(ml);
  if (!(need > 0)) return [];
  const all = syringeGroups(type).flatMap((g) => g.sizes);
  return all.filter((s) => syringeMl(s) + 1e-9 >= need);
}

// The draw line on Today and the dose page: "56.0 u · 0.56 ml", or "1.68 ml" on an ml syringe.
function drawLine(draw, size, language) {
  const ml = decimalText(trimZeros(draw.drawML), language);
  if (isMlSyringe(size)) return { big: ml, small: ' ml' };
  return { big: decimalText(draw.drawUnits, language), small: ` u · ${ml} ml` };
}

// The over-capacity line, in units on an insulin syringe and in ml on a larger one.
function exceedsMessage(t, draw, size, language) {
  const n = Number(size) > 0 ? Number(size) : 100;
  if (isMlSyringe(n)) {
    return t('protocols_draw_exceeds_warning_ml').replace('{ml}', decimalText(trimZeros(draw.drawML), language)).replace('{size}', decimalText(String(syringeMl(n)), language));
  }
  return t('protocols_draw_exceeds_warning').replace('{units}', decimalText(draw.drawUnits, language)).replace('{size}', String(n));
}

module.exports = { drawLine, exceedsMessage, INSULIN_SIZES, ML_SIZES, syringeMl, isMlSyringe, syringeGroups, allowedSyringe, sizeLabel, drawReading, smallDraw, sizesThatHold };
