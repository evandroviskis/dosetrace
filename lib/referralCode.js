'use strict';
// The referral (creator) code typed on the entry offer — app side of the creators program
// (admin-panel/codigo/docs/specs/creators-app-side.md AP1, AP4). Pure CommonJS with the storage
// and the RevenueCat call passed in, so it runs under node --test (__tests__/referralCode.test.js);
// the screen passes AsyncStorage and lib/purchases setCreatorAttributes.
//
// For now (the creators server is not live) the code is kept on the phone under its own key and
// sent to RevenueCat as creator_code / creator_source, and sent again right before every purchase
// (AP4: the webhook only credits a purchase whose attributes were already on the customer).
// No server is called here: validation (AP2) and the attribution record (AP5) come with the server.

const REFERRAL_KEY = 'dosetrace_referral_code';
const SOURCES = ['typed', 'link', 'play_referrer'];
// The server's code shape (admin-panel api/_creators.js parseCode): a 3-12 letter/digit base and
// an optional platform suffix of 1-4 letters ("ANA", "ANA10", "ANA-IG").
const CODE_RE = /^[A-Z0-9]{3,12}(?:-[A-Z]{1,4})?$/;

function normalizeReferralCode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/\s+/g, '');
}

function isReferralCodeShape(code) {
  return CODE_RE.test(String(code || ''));
}

function referralAttributes(rec) {
  if (!rec || !rec.code) return { creator_code: null, creator_source: null }; // null deletes the attribute
  return { creator_code: rec.code, creator_source: SOURCES.includes(rec.source) ? rec.source : 'typed' };
}

async function loadReferralCode(storage) {
  try {
    const raw = await storage.getItem(REFERRAL_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || !isReferralCodeShape(rec.code)) return null;
    return rec;
  } catch {
    return null;
  }
}

async function tryAttr(setAttributes, attrs) {
  try { return (await setAttributes(attrs)) !== false; } catch { return false; }
}

// { ok: true, code } | { ok: false, reason: 'shape' | 'save' }. Kept when either the phone or
// RevenueCat took it (the purchase re-sends it).
async function applyReferralCode(raw, { storage, setAttributes, now = Date.now, source = 'typed' }) {
  const code = normalizeReferralCode(raw);
  if (!isReferralCodeShape(code)) return { ok: false, reason: 'shape' };
  const rec = { code, source: SOURCES.includes(source) ? source : 'typed', savedAt: now() };
  let stored = false;
  try { await storage.setItem(REFERRAL_KEY, JSON.stringify(rec)); stored = true; } catch { stored = false; }
  const sent = await tryAttr(setAttributes, referralAttributes(rec));
  return stored || sent ? { ok: true, code } : { ok: false, reason: 'save' };
}

async function removeReferralCode({ storage, setAttributes }) {
  let removed = false;
  try { await storage.removeItem(REFERRAL_KEY); removed = true; } catch { removed = false; }
  const sent = await tryAttr(setAttributes, referralAttributes(null));
  return removed || sent;
}

// Right before a purchase: the stored code goes to RevenueCat again. true = sent.
async function syncReferralAttributes({ storage, setAttributes }) {
  const rec = await loadReferralCode(storage);
  if (!rec) return false;
  return tryAttr(setAttributes, referralAttributes(rec));
}

module.exports = {
  REFERRAL_KEY, normalizeReferralCode, isReferralCodeShape, referralAttributes,
  loadReferralCode, applyReferralCode, removeReferralCode, syncReferralAttributes,
};
