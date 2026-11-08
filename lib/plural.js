// Singular and plural counts (bug 2026-10-02: "1 doses restantes sur 4", "Faible · 1 restantes").
// A count string has a plural key (protocols_doses_left) and a singular key with the same
// placeholders (protocols_doses_left_one). French uses the singular for 0 and 1 ("0 dose
// restante"); English, Spanish, Portuguese, German and Italian only for 1. Pure, so it is
// tested (__tests__/pluralCounts.test.js).

export function isOne(n, language) {
  const v = Math.abs(Number(n));
  if (!Number.isFinite(v)) return false;
  return language === 'fr' ? v < 2 : v === 1;
}

// The key to use for the count n: key_one in the singular, key otherwise.
export function pluralKey(key, n, language) {
  return isOne(n, language) ? `${key}_one` : key;
}

// An AMOUNT of units that can be a fraction (serving calculator, S25 2026-11-07: "½ comprimidos").
// Whole amounts keep the count rule above. A fraction: Portuguese and French keep the singular
// below 2 ("½ comprimido", "1½ comprimido", "1,5 medida"; "1½ comprimé"); English, Spanish, German
// and Italian read the ½ sign as "half a…" (singular: "½ tablet", "½ Tablette", "½ compressa") and
// use the plural for 1½ and for any amount printed as a decimal ("1½ tablets", "0.5 tablets").
// glyph: the amount is printed with the ½ sign (lib/oralMath servingText does it for every half).
const isHalfAmount = (v) => { const h = Math.round(v * 2); return Math.abs(v * 2 - h) < 1e-9 && h % 2 === 1; };
export function servingIsOne(n, language, { glyph } = {}) {
  const v = Math.abs(Number(n));
  if (!Number.isFinite(v)) return false;
  if (Math.abs(v - Math.round(v)) < 1e-9) return isOne(Math.round(v), language);
  if (language === 'pt' || language === 'fr') return v < 2;
  const shownAsHalf = glyph == null ? isHalfAmount(v) : glyph && isHalfAmount(v);
  return shownAsHalf && v < 1;
}
export function servingPluralKey(key, n, language, opts) {
  return servingIsOne(n, language, opts) ? `${key}_one` : key;
}
