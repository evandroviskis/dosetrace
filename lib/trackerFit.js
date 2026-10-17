// Today tracker fit (A-136 (3), Fold 7 2026-10-17: on the unfolded left page "30 dias" wrapped to
// "30 / dias" and "12 de 98" wrapped). The row of a small ring is 44 gauge + 12 + text + 12 + the
// % column, beside the 132 big gauge and an 18 gap. On a ~300 dp slab interior that left ~38 dp
// for the text. The text column gets at least TEXT_MIN, taking only what it needs, in this
// order: the gap beside the big gauge tightens (to GAP_MIN), the big gauge shrinks (to BIG_MIN),
// then the % column may shrink (to PCT_MIN_SCALE of its width). A wide slab keeps the approved
// 132 / 18. The label, count and % also shrink on one line (adjustsFontSizeToFit) before wrapping.
export const TRACKER = { BIG: 132, BIG_MIN: 116, GAP: 18, GAP_MIN: 12, SMALL: 44, ROW_GAP: 12, TEXT_MIN: 50, PCT_MIN_SCALE: 0.72 };

// The % column (26 pt digits + the 14 pt sign), estimated on the generous side.
export function pctWidth(p) {
  const digits = p == null ? 1 : String(Math.round(p)).length;
  return 16 * digits + 9;
}

const widestPct = (pcts) => Math.max(pctWidth(null), ...pcts.map(pctWidth));

// The text column left in a small-ring row for a slab interior width and a fit.
export function textColumn(inner, fit, pcts = []) {
  const pct = fit.pctMax == null ? widestPct(pcts) : Math.min(fit.pctMax, widestPct(pcts));
  return inner - fit.big - fit.gap - TRACKER.SMALL - 2 * TRACKER.ROW_GAP - pct;
}

// inner: the slab's interior width (0 = not measured yet); pcts: the two small rings' values.
// Returns { big, gap, pctMax } (pctMax null: the % keeps its natural width).
export function trackerFit(inner, pcts = []) {
  const fit = { big: TRACKER.BIG, gap: TRACKER.GAP, pctMax: null };
  if (!inner) return fit;
  let short = TRACKER.TEXT_MIN - textColumn(inner, fit, pcts);
  if (short <= 0) return fit;
  const fromGap = Math.min(short, TRACKER.GAP - TRACKER.GAP_MIN);
  fit.gap -= fromGap;
  short -= fromGap;
  if (short <= 0) return fit;
  const fromBig = Math.min(Math.ceil(short), TRACKER.BIG - TRACKER.BIG_MIN);
  fit.big -= fromBig;
  short -= fromBig;
  if (short <= 0) return fit;
  const pct = widestPct(pcts);
  fit.pctMax = Math.max(Math.ceil(pct * TRACKER.PCT_MIN_SCALE), Math.floor(pct - short));
  return fit;
}
