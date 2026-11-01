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

// DV-200: a ready-to-use box is good THROUGH its expiry day (Journey 2026-10-27 F2). Calendar days, so the
// expiry day is 1 and the next day 0 (past). null without a date.
function boxDaysLeft(expiresOn, now) {
  const exp = parseDateOnly(expiresOn);
  if (!exp) return null;
  const ref = new Date(now);
  ref.setHours(0, 0, 0, 0);
  return Math.round((exp - ref) / 86400000) + 1;
}

// DV-018 (AD-65): THE days left of a vial — recon: mix date + the protocol's validity window (default
// 30); ready to use: the box date, good through that day. null when unknown. Every screen reads this.
function vialDaysLeft(vial, protocol, now) {
  if (!vial || !protocol) return null;
  if (protocol.type === 'recon') return vial.mixed_on ? daysUntilExpiry(vial.mixed_on, protocol.vial_valid_days || DEFAULT_VALID_DAYS, now) : null;
  return vial.expires_on ? boxDaysLeft(vial.expires_on, now) : null;
}

module.exports = { DEFAULT_VALID_DAYS, parseDateOnly, daysUntilExpiry, boxDaysLeft, vialDaysLeft };
