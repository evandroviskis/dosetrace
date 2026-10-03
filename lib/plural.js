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
