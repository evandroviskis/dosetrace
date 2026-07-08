// Vial beyond-use countdown — the user's own mix date + their chosen validity
// window (default 30, a general reference the user can change). This is a
// personal tracking calculation, not a medical or regulatory determination of
// any specific compound's stability. CommonJS so it's unit-testable under Node.

const DEFAULT_VALID_DAYS = 30;

// Parse 'YYYY-MM-DD' (or an ISO string) into a local-midnight Date, or null.
function parseDateOnly(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Whole days remaining until the vial reaches its validity window.
// Negative = past the window; null if inputs are unusable.
function daysUntilExpiry(mixedOn, validDays, now) {
  const mixed = parseDateOnly(mixedOn);
  const days = parseInt(validDays, 10);
  if (!mixed || !days || days <= 0) return null;
  const expiry = new Date(mixed);
  expiry.setDate(expiry.getDate() + days);
  const ref = new Date(now);
  ref.setHours(0, 0, 0, 0);
  return Math.round((expiry - ref) / 86400000);
}

// Traffic-light color for a days-remaining value (pure data, no RN import).
function expiryColor(days) {
  if (days == null) return '#888780'; // unknown / stone
  if (days <= 3) return '#E24B4A';    // red
  if (days <= 7) return '#BA7517';    // amber
  return '#1D9E75';                   // green
}

module.exports = { DEFAULT_VALID_DAYS, parseDateOnly, daysUntilExpiry, expiryColor };
