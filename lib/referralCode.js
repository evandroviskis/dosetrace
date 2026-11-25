'use strict';
// The referral (creator) code typed on the entry offer — app side of the creators program
// (admin-panel/codigo/docs/specs/creators-app-side.md, "Contrato já no ar"). Pure CommonJS with the
// storage, the RevenueCat call, the token and fetch passed in, so it runs under node --test
// (__tests__/referralCode.test.js); lib/referralSync.js passes the app's own (AsyncStorage,
// lib/purchases setCreatorAttributes, the Supabase session token, the global fetch).
//  - Aplicar asks the server (GET /api/creator?op=code): valid (+ benefit_text) | unknown | ended.
//    Offline, a server error or an odd answer = "could not check now": nothing is applied.
//  - A valid code is kept on the phone (its own key), sent to RevenueCat as creator_code /
//    creator_source (AP4) — again right before every purchase — and recorded on the server
//    (POST /api/creator op attribution, the user's JWT, AP5). A record that could not be sent
//    stays pending (its own key) and flushPendingAttribution sends it on the next open.

const CREATOR_API = 'https://dosetrace.io/api/creator';
const REFERRAL_KEY = 'dosetrace_referral_code';
const PENDING_KEY = 'dosetrace_referral_attribution_pending';
const SOURCES = ['typed', 'link', 'play_referrer'];
const TIMEOUT_MS = 10000;
// The server's code shape (admin-panel api/_creators.js parseCode): a 3-12 letter/digit base and
// an optional platform suffix of 1-4 letters ("ANA", "ANA10", "ANA-IG").
const CODE_RE = /^[A-Z0-9]{3,12}(?:-[A-Z]{1,4})?$/;

function normalizeReferralCode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/\s+/g, '');
}

function isReferralCodeShape(code) {
  return CODE_RE.test(String(code || ''));
}

const sourceOf = (s) => (SOURCES.includes(s) ? s : 'typed');

function referralAttributes(rec) {
  if (!rec || !rec.code) return { creator_code: null, creator_source: null }; // null deletes the attribute
  return { creator_code: rec.code, creator_source: sourceOf(rec.source) };
}

// fetch with a time limit: a request that never answers is "offline", not a spinner forever.
async function request(fetchImpl, url, opts, timeoutMs) {
  let timer = null;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); });
  try {
    const res = await Promise.race([fetchImpl(url, opts), late]);
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, ok: !!res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

// { status: 'valid', code, benefitText } | { status: 'unknown' | 'ended' | 'offline' | 'shape' }.
// The platform the server returns is not used: the app never shows creator data.
async function checkReferralCode(raw, { fetch: fetchImpl, timeoutMs = TIMEOUT_MS }) {
  const code = normalizeReferralCode(raw);
  if (!isReferralCodeShape(code)) return { status: 'shape' };
  let r;
  try {
    r = await request(fetchImpl, `${CREATOR_API}?op=code&c=${encodeURIComponent(code)}`, { method: 'GET', headers: { Accept: 'application/json' } }, timeoutMs);
  } catch {
    return { status: 'offline' };
  }
  const b = r.body;
  if (!r.ok || !b || typeof b !== 'object') return { status: 'offline' };
  if (b.valid === true) {
    const canon = normalizeReferralCode(b.code || code);
    if (!isReferralCodeShape(canon)) return { status: 'offline' };
    const benefit = typeof b.benefit_text === 'string' && b.benefit_text.trim() ? b.benefit_text.trim() : null;
    return { status: 'valid', code: canon, benefitText: benefit };
  }
  if (b.valid === false) return { status: b.reason === 'ended' ? 'ended' : 'unknown' };
  return { status: 'offline' };
}

async function readJSON(storage, key) {
  try {
    const raw = await storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// The applied code, or null. Only a code the server said is valid is ever stored as applied.
async function loadReferralCode(storage) {
  const rec = await readJSON(storage, REFERRAL_KEY);
  if (!rec || rec.valid !== true || !isReferralCodeShape(rec.code)) return null;
  return rec;
}

async function tryAttr(setAttributes, attrs) {
  try { return (await setAttributes(attrs)) !== false; } catch { return false; }
}

// Aplicar: { ok: true, code, benefitText } | { ok: false, reason: 'shape' | 'unknown' | 'ended' | 'offline' | 'save' }.
// The server record is NOT sent here: it is left pending for flushPendingAttribution (needs the token).
async function applyReferralCode(raw, { storage, setAttributes, fetch: fetchImpl, now = Date.now, source = 'typed', timeoutMs }) {
  const chk = await checkReferralCode(raw, { fetch: fetchImpl, timeoutMs });
  if (chk.status !== 'valid') return { ok: false, reason: chk.status };
  const rec = { code: chk.code, source: sourceOf(source), savedAt: now(), valid: true, benefitText: chk.benefitText };
  let stored = false;
  try {
    await storage.setItem(REFERRAL_KEY, JSON.stringify(rec));
    await storage.setItem(PENDING_KEY, JSON.stringify({ code: rec.code, source: rec.source }));
    stored = true;
  } catch { stored = false; }
  const sent = await tryAttr(setAttributes, referralAttributes(rec));
  return stored || sent ? { ok: true, code: rec.code, benefitText: rec.benefitText } : { ok: false, reason: 'save' };
}

async function removeReferralCode({ storage, setAttributes }) {
  let removed = false;
  try { await storage.removeItem(REFERRAL_KEY); await storage.removeItem(PENDING_KEY); removed = true; } catch { removed = false; }
  const sent = await tryAttr(setAttributes, referralAttributes(null));
  return removed || sent;
}

// Right before a purchase: the stored code goes to RevenueCat again. true = sent.
async function syncReferralAttributes({ storage, setAttributes }) {
  const rec = await loadReferralCode(storage);
  if (!rec) return false;
  return tryAttr(setAttributes, referralAttributes(rec));
}

// The pending record → RevenueCat (attributes) and the server (POST op attribution, Bearer JWT).
// Returns 'none' (nothing pending) | 'recorded' | 'already' (the account had a code: the first one
// counts) | 'refused' (the server will never take it: cleared) | 'pending' (offline, no session,
// 401, server error: kept for the next open). Never throws.
async function flushPendingAttribution({ storage, setAttributes, getAccessToken, fetch: fetchImpl, timeoutMs = TIMEOUT_MS }) {
  const pend = await readJSON(storage, PENDING_KEY);
  if (!pend || !isReferralCodeShape(pend.code)) return 'none';
  const item = { code: pend.code, source: sourceOf(pend.source) };
  if (setAttributes) await tryAttr(setAttributes, referralAttributes(item));
  let token = null;
  try { token = await getAccessToken(); } catch { token = null; }
  if (!token) return 'pending';
  let r;
  try {
    r = await request(fetchImpl, CREATOR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ op: 'attribution', code: item.code, source: item.source }),
    }, timeoutMs);
  } catch {
    return 'pending';
  }
  const b = r.body;
  const clear = async () => { try { await storage.removeItem(PENDING_KEY); } catch { /* retried next open */ } };
  if (r.ok && b && b.ok === true) { await clear(); return b.recorded === false ? 'already' : 'recorded'; }
  if ((r.ok && b && b.ok === false) || r.status === 400) { await clear(); return 'refused'; }
  return 'pending';
}

module.exports = {
  CREATOR_API, REFERRAL_KEY, PENDING_KEY, normalizeReferralCode, isReferralCodeShape, referralAttributes,
  checkReferralCode, loadReferralCode, applyReferralCode, removeReferralCode, syncReferralAttributes, flushPendingAttribution,
};
