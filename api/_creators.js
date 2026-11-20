'use strict';
/**
 * Creators program (affiliates): shared, dependency-free logic for api/go.js, api/creator.js,
 * api/rc-webhook.js and api/adm-creators.js. Vercel does not route files that start with "_".
 * Spec: docs/specs/creators.md (approved by the founder 2026-11-20). Nothing here logs.
 *
 * Sections: codes and links · device of a click · validation of the sign-up form per country ·
 * encryption of sensitive fields and tokens · RevenueCat events (net revenue, refunds) ·
 * attribution · commission per month · aggregates for the admin tab and the creator portal.
 */
const crypto = require('crypto');

// ------------------------------------------------------------------ codes and links
const PLATFORMS = { instagram: 'IG', youtube: 'YT', tiktok: 'TT', facebook: 'FB', x: 'X', site: 'SITE', outro: 'OUT' };
const SUFFIX_TO_PLATFORM = Object.fromEntries(Object.entries(PLATFORMS).map(([p, s]) => [s, p]));
const BASE_RE = /^[A-Z0-9]{3,12}$/;
const APPLE_APP_ID = '6761788157';
const PLAY_PACKAGE = 'io.outcom.dosetrace';
const SITE = 'https://dosetrace.io';

function normBase(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function validBase(s) { return BASE_RE.test(String(s || '')); }
// "Ana Ribeiro" → "ANA"; "Jo" → "JORIB…" style: first word, then more letters until 3.
function suggestCode(name) {
  const words = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (!words.length) return '';
  let c = words[0].slice(0, 12);
  for (let i = 1; c.length < 3 && i < words.length; i++) c = (c + words[i]).slice(0, 12);
  return c.length >= 3 ? c : (c + 'DT').slice(0, 12);
}
function slugOf(base) { return String(base || '').toLowerCase(); }
function platformCode(base, platform) { return PLATFORMS[platform] ? base + '-' + PLATFORMS[platform] : base; }
// "ana-yt" / "ANA-YT" / " ana " → { base, platform } ; null when it is not a code shape.
function parseCode(s) {
  const v = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
  const m = v.match(/^([A-Z0-9]{3,12})(?:-([A-Z]{1,4}))?$/);
  if (!m) return null;
  if (m[2] && !SUFFIX_TO_PLATFORM[m[2]]) return null;
  return { base: m[1], platform: m[2] ? SUFFIX_TO_PLATFORM[m[2]] : null, code: m[2] ? m[1] + '-' + m[2] : m[1] };
}
function goLink(base, platform) { return SITE + '/go/' + slugOf(base) + '/' + platform; }
function appleCt(base, platform) { return ('cr-' + slugOf(base) + '-' + (PLATFORMS[platform] || 'na').toLowerCase()).slice(0, 40); }
function appleUrl(pt, base, platform) {
  const q = new URLSearchParams();
  if (pt) q.set('pt', String(pt));
  if (base) q.set('ct', appleCt(base, platform));
  q.set('mt', '8');
  return 'https://apps.apple.com/app/apple-store/id' + APPLE_APP_ID + '?' + q.toString();
}
// Play referrer: utm_source=<platform>&utm_medium=creator&utm_campaign=<slug>&utm_content=<CODE-SUF>, encoded once.
function playUrl(base, platform) {
  if (!base) return 'https://play.google.com/store/apps/details?id=' + PLAY_PACKAGE;
  const ref = 'utm_source=' + platform + '&utm_medium=creator&utm_campaign=' + slugOf(base) + '&utm_content=' + platformCode(base, platform);
  return 'https://play.google.com/store/apps/details?id=' + PLAY_PACKAGE + '&referrer=' + encodeURIComponent(ref);
}

// ------------------------------------------------------------------ device of a click
// Link-preview robots fetch the URL when a link is pasted; they never count as a click.
const BOT_RE = /bot\b|crawler|spider|facebookexternalhit|facebot|twitterbot|slackbot|whatsapp|telegrambot|discordbot|linkedinbot|embedly|pinterest|skypeuripreview|vkshare|redditbot|applebot|googlebot|bingbot|headlesschrome|preview|curl\/|wget\/|python-requests|okhttp\/|go-http-client/i;
function deviceOf(ua) {
  const u = String(ua || '');
  if (!u || BOT_RE.test(u)) return 'bot';
  if (/iPhone|iPad|iPod/i.test(u)) return 'ios';
  if (/Android/i.test(u)) return 'android';
  return 'desktop';
}

// ------------------------------------------------------------------ validation (sign-up form)
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const E164_RE = /^\+[1-9][0-9]{7,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY_RE = /^[A-Z]{2}$/;
const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');

function validCpf(s) {
  const d = digits(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n) => { let sum = 0; for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i); const r = (sum * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
function validCnpj(s) {
  const d = digits(s);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let sum = 0; for (let i = 0; i < n; i++) sum += Number(d[i]) * w[i]; const r = sum % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
function normPhone(s) { const v = String(s == null ? '' : s).trim(); const d = digits(v); return d ? '+' + d : ''; }
// PIX key by type; returns the normalised key or null.
function normPix(type, key) {
  const k = String(key == null ? '' : key).trim();
  if (type === 'cpf') return validCpf(k) ? digits(k) : null;
  if (type === 'cnpj') return validCnpj(k) ? digits(k) : null;
  if (type === 'email') return EMAIL_RE.test(k) && k.length <= 77 ? k.toLowerCase() : null;
  if (type === 'phone') { const p = normPhone(k); return /^\+55[1-9][0-9]{9,10}$/.test(p) ? p : null; }
  if (type === 'random') return UUID_RE.test(k) ? k.toLowerCase() : null;
  return null;
}
function txt(v, min, max) { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); return s.length >= min && s.length <= max ? s : null; }

const METHODS = { BR: ['pix'], US: ['paypal', 'wise', 'ach'], OTHER: ['wise', 'paypal'] };
function methodsFor(country) { return country === 'BR' ? METHODS.BR : country === 'US' ? METHODS.US : METHODS.OTHER; }
const RULES_VERSION = 'draft-2026-11-20';

// The creator's form → { profile (to encrypt), masked (shown), country, method } or { error, field }.
function validateProfile(b) {
  const err = (field) => ({ error: 'invalid', field });
  if (!b || typeof b !== 'object' || Array.isArray(b)) return err('body');
  const country = String(b.country || '').toUpperCase();
  if (!COUNTRY_RE.test(country)) return err('country');
  const legal = txt(b.legal_name, 2, 120); if (!legal) return err('legal_name');
  const email = String(b.email || '').trim().toLowerCase(); if (!EMAIL_RE.test(email) || email.length > 200) return err('email');
  const phone = normPhone(b.phone); if (!E164_RE.test(phone)) return err('phone');
  const handles = {};
  if (b.handles != null) {
    if (typeof b.handles !== 'object' || Array.isArray(b.handles)) return err('handles');
    for (const [p, h] of Object.entries(b.handles)) {
      if (!PLATFORMS[p]) return err('handles');
      if (h == null || h === '') continue;
      const v = txt(h, 1, 120); if (!v) return err('handles'); handles[p] = v;
    }
  }
  const method = String(b.method || '');
  if (methodsFor(country).indexOf(method) < 0) return err('method');
  if (b.rules_accepted !== true || b.rules_version !== RULES_VERSION) return err('rules');
  const profile = { country, legal_name: legal, email, phone, handles, method, rules_version: RULES_VERSION };
  const masked = { country, method, legal_name: maskName(legal), email: maskEmail(email), phone: maskPhone(phone), handles };
  if (method === 'pix') {
    const type = String(b.pix_type || '');
    if (['cpf', 'cnpj', 'email', 'phone', 'random'].indexOf(type) < 0) return err('pix_type');
    const key = normPix(type, b.pix_key); if (!key) return err('pix_key');
    const docType = String(b.doc_type || '');
    if (docType !== 'cpf' && docType !== 'cnpj') return err('doc_type');
    const doc = docType === 'cpf' ? (validCpf(b.doc) ? digits(b.doc) : null) : (validCnpj(b.doc) ? digits(b.doc) : null);
    if (!doc) return err('doc');
    const invoice = String(b.invoice || '');
    if (['mei', 'company', 'none'].indexOf(invoice) < 0) return err('invoice');
    Object.assign(profile, { pix_type: type, pix_key: key, doc_type: docType, doc, invoice });
    Object.assign(masked, { pix_type: type, pix_key: maskPix(type, key), doc_type: docType, doc: maskDoc(docType, doc), invoice });
  } else if (method === 'paypal' || method === 'wise') {
    const pe = String(b.payout_email || '').trim().toLowerCase(); if (!EMAIL_RE.test(pe) || pe.length > 200) return err('payout_email');
    profile.payout_email = pe; masked.payout_email = maskEmail(pe);
  }
  // ach: the bank details are entered by the creator on the payout service's own page, never here.
  if (country === 'US') { profile.tax_form = 'w9'; masked.tax_form = 'w9'; }
  else if (country !== 'BR') { profile.tax_form = 'w8ben'; masked.tax_form = 'w8ben'; }
  // Never a bank account, routing number, SSN/ITIN or tax document, whatever the body carries.
  return { profile, masked, country, method };
}

function maskEmail(e) { const s = String(e || ''); const at = s.indexOf('@'); if (at < 1) return '•••'; return s[0] + '•••' + s.slice(at); }
function maskPhone(p) { const s = String(p || ''); return s.length > 6 ? s.slice(0, 3) + ' ••• ••' + s.slice(-2) : '•••'; }
function maskName(n) { return String(n || '').split(' ').filter(Boolean).map((w, i) => (i === 0 ? w : w[0] + '•••')).join(' '); }
function maskDoc(type, d) { const s = digits(d); if (type === 'cpf' && s.length === 11) return '•••.' + s.slice(3, 6) + '.' + s.slice(6, 9) + '-••'; if (type === 'cnpj' && s.length === 14) return '••.' + s.slice(2, 5) + '.' + s.slice(5, 8) + '/••••-••'; return '•••'; }
function maskPix(type, k) {
  if (type === 'cpf' || type === 'cnpj') return maskDoc(type, k);
  if (type === 'email') return maskEmail(k);
  if (type === 'phone') return maskPhone(k);
  return String(k).slice(0, 4) + '••••••••' + String(k).slice(-4);
}

// ------------------------------------------------------------------ encryption and tokens
// AES-256-GCM with CREATOR_DATA_KEY (32 bytes, base64). Format "v1.<base64url iv(12)|tag(16)|ciphertext>".
function dataKey(env) {
  const raw = (env || process.env).CREATOR_DATA_KEY;
  if (!raw) return null;
  let k; try { k = Buffer.from(String(raw), 'base64'); } catch (e) { return null; }
  return k.length === 32 ? k : null;
}
function seal(value, key) {
  if (!key) throw new Error('no key');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(value), 'utf8')), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function open(sealed, key) {
  if (!key || typeof sealed !== 'string' || !sealed.startsWith('v1.')) return null;
  try {
    const b = Buffer.from(sealed.slice(3), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function tokenHash(t) { return crypto.createHash('sha256').update(String(t), 'utf8').digest('hex'); }
function validToken(t) { return TOKEN_RE.test(String(t || '')); }
function inviteLink(token) { return SITE + '/criador/convite#' + token; }
function portalLink(token) { return SITE + '/criador/portal#' + token; }
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ------------------------------------------------------------------ RevenueCat events
// The ledger keeps only these fields of a webhook event (no e-mail, no other subscriber attribute).
function ledgerRow(ev, now) {
  if (!ev || typeof ev !== 'object' || typeof ev.id !== 'string' || !ev.id || ev.id.length > 128) return null;
  const ms = (v) => (typeof v === 'number' && isFinite(v) ? new Date(v).toISOString() : null);
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n || 200) : null);
  const attrs = ev.subscriber_attributes && typeof ev.subscriber_attributes === 'object' ? ev.subscriber_attributes : {};
  const attr = (k) => (attrs[k] && typeof attrs[k].value === 'string' ? attrs[k].value.slice(0, 40) : null);
  const aliases = Array.isArray(ev.aliases) ? ev.aliases.filter((a) => typeof a === 'string').slice(0, 20).map((a) => a.slice(0, 128)) : [];
  return {
    id: ev.id, type: str(ev.type, 40), environment: str(ev.environment, 20),
    app_user_id: str(ev.app_user_id, 128), original_app_user_id: str(ev.original_app_user_id, 128), aliases,
    product_id: str(ev.product_id, 200), store: str(ev.store, 40), period_type: str(ev.period_type, 20),
    is_trial_conversion: ev.is_trial_conversion === true, renewal_number: num(ev.renewal_number),
    cancel_reason: str(ev.cancel_reason, 40),
    event_at: ms(ev.event_timestamp_ms) || new Date(now || Date.now()).toISOString(),
    purchased_at: ms(ev.purchased_at_ms), expiration_at: ms(ev.expiration_at_ms),
    price_usd: num(ev.price), price_local: num(ev.price_in_purchased_currency), currency: str(ev.currency, 8),
    tax_pct: num(ev.tax_percentage), commission_pct: num(ev.commission_percentage), country_code: str(ev.country_code, 4),
    transaction_id: str(ev.transaction_id, 200), original_transaction_id: str(ev.original_transaction_id, 200),
    creator_code: attr('creator_code'), creator_source: attr('creator_source'),
  };
}
const PURCHASE_TYPES = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE'];
function isRefund(e) { return e.type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT'; }
// Net revenue in US cents of one event (positive purchase, negative refund, 0 otherwise).
// price × (1 − tax) × (1 − store commission); RevenueCat sends tax/commission as fractions.
function netCents(e) {
  const p = Number(e.price_usd);
  if (!isFinite(p) || p === 0) return 0;
  const tax = isFinite(Number(e.tax_pct)) ? Number(e.tax_pct) : 0;
  const com = isFinite(Number(e.commission_pct)) ? Number(e.commission_pct) : 0;
  const net = Math.abs(p) * (1 - tax) * (1 - com);
  if (PURCHASE_TYPES.indexOf(e.type) >= 0 && p > 0) return Math.round(net * 100);
  if (isRefund(e)) return -Math.round(net * 100);
  if (e.type === 'REFUND_REVERSED') return Math.round(net * 100);
  return 0;
}
function isTrialStart(e) { return e.type === 'INITIAL_PURCHASE' && e.period_type === 'TRIAL'; }
// The account an event belongs to: the Supabase id (uuid) among app_user_id / original / aliases, else the app_user_id.
function canonicalUser(e) {
  const ids = [e.app_user_id, e.original_app_user_id].concat(e.aliases || []).filter(Boolean);
  return ids.find((x) => UUID_RE.test(x)) || e.app_user_id || e.original_app_user_id || null;
}
const monthOf = (iso) => String(iso || '').slice(0, 7);

// ------------------------------------------------------------------ attribution
/**
 * users: Map canonical id → sorted events. attributions: { user_id → { creator_id, platform, first_seen_at } }.
 * creatorsByBase: { BASE → creator }. Returns Map canonical id → { creator_id, platform, via, late } or nothing.
 * Rule (spec §6): the account counts for a creator only if the code existed before its first purchase
 * (trial included). A later code is kept as late=true (shown as "chegou depois da compra", never commissioned).
 */
function resolveAttributions(users, attributions, creatorsByBase) {
  const out = new Map();
  for (const [uid, evs] of users) {
    const first = evs.find((e) => e.type === 'INITIAL_PURCHASE' || PURCHASE_TYPES.indexOf(e.type) >= 0);
    const row = attributions[uid];
    if (row && (!first || Date.parse(row.first_seen_at) <= Date.parse(first.event_at))) { out.set(uid, { creator_id: row.creator_id, platform: row.platform || null, via: 'app', late: false }); continue; }
    const pc = first && parseCode(first.creator_code);
    const cr = pc && creatorsByBase[pc.base];
    if (cr) { out.set(uid, { creator_id: cr.id, platform: pc.platform, via: 'event', late: false }); continue; }
    if (row) out.set(uid, { creator_id: row.creator_id, platform: row.platform || null, via: 'app', late: true });
  }
  return out;
}

// ------------------------------------------------------------------ commission
const addMonths = (iso, n) => { const d = new Date(iso); const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())); return r.toISOString(); };
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).getTime(); }; // exclusive, ms
function monthsBetween(fromYm, toYm) { const out = []; let [y, m] = fromYm.split('-').map(Number); const [ty, tm] = toYm.split('-').map(Number); while (y < ty || (y === ty && m <= tm)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return out; }
function termsAt(terms, iso) { let v = null; for (const t of terms) if (String(t.valid_from) <= String(iso).slice(0, 10)) v = t; return v; }

/**
 * The commission lines of one creator.
 * userEvents: Map canonical id → events of the accounts attributed to this creator (late ones excluded).
 * terms: versions sorted by valid_from { valid_from, pct, duration ('lifetime'|'while_subscribed'|'months'),
 * duration_months, basis ('all'|'first_only'), fixed_month_cents, fixed_post_cents }.
 * Returns [{ month, user, cents, net, kind ('rev'|'refund'|'fixed_month'|'fixed_post'), tx }].
 */
function commissionLines(userEvents, terms, opts) {
  const o = opts || {};
  const lines = [];
  for (const [uid, evs] of userEvents) {
    const paid = evs.filter((e) => netCents(e) > 0 && e.type !== 'REFUND_REVERSED');
    if (!paid.length && !evs.some(isRefund)) continue;
    const firstPaid = paid[0] ? paid[0].event_at : null;
    const firstExp = firstPaid ? (evs.find((e) => e.type === 'EXPIRATION' && e.event_at >= firstPaid) || {}).event_at : null;
    const byTx = {};
    for (const e of evs) {
      const net = netCents(e);
      if (!net) continue;
      const refund = net < 0;
      if (refund) {
        const orig = byTx[e.transaction_id] || byTx[e.original_transaction_id];
        const cents = orig ? -orig.cents : 0;
        lines.push({ month: monthOf(e.event_at), user: uid, cents, net, kind: 'refund', tx: e.transaction_id });
        if (orig) orig.refunded = true;
        continue;
      }
      if (e.type === 'REFUND_REVERSED') {
        const ref = lines.find((l) => l.kind === 'refund' && l.user === uid && l.tx && (l.tx === e.transaction_id || l.tx === e.original_transaction_id));
        lines.push({ month: monthOf(e.event_at), user: uid, cents: ref ? -ref.cents : 0, net, kind: 'rev', tx: e.transaction_id });
        continue;
      }
      const t = termsAt(terms, e.event_at);
      let cents = 0;
      if (t && Number(t.pct) > 0) {
        let ok = true;
        if (t.basis === 'first_only' && paid[0] !== e) ok = false;
        if (t.duration === 'months' && firstPaid && e.event_at >= addMonths(firstPaid, Number(t.duration_months) || 0)) ok = false;
        if (t.duration === 'while_subscribed' && firstExp && e.event_at > firstExp) ok = false;
        if (ok) cents = Math.round(net * Number(t.pct) / 100);
      }
      const line = { month: monthOf(e.event_at), user: uid, cents, net, kind: 'rev', tx: e.transaction_id };
      lines.push(line);
      if (e.transaction_id) byTx[e.transaction_id] = line;
    }
  }
  // Fixed fees: per month while the version is in force (from the creator's start to its end), per post.
  const months = o.months || [];
  for (const ym of months) {
    const t = termsAt(terms, new Date(monthEnd(ym) - 1).toISOString());
    if (!t) continue;
    if (Number(t.fixed_month_cents) > 0 && (!o.endedAt || o.endedAt >= ym + '-01') && (!o.startedAt || String(o.startedAt).slice(0, 7) <= ym)) lines.push({ month: ym, user: null, cents: Number(t.fixed_month_cents), net: 0, kind: 'fixed_month' });
    if (Number(t.fixed_post_cents) > 0) { const n = (o.posts || []).filter((p) => String(p.posted_on).slice(0, 7) === ym).length; if (n) lines.push({ month: ym, user: null, cents: n * Number(t.fixed_post_cents), net: 0, kind: 'fixed_post', n }); }
  }
  return lines;
}

/**
 * Month statement: open (current month) → holdback (until end + holdback_days) → due → paid; a due balance under the
 * minimum is carried to the next month ("below_min"). Paid months use the frozen amount of their payout row.
 * Returns [{ month, revenue_cents, commission_cents, carry_in_cents, payable_cents, status, release_on, paid }].
 */
function statement(lines, months, settings, payouts, now, hasTerms) {
  const s = settings || {};
  const hold = Number.isFinite(Number(s.holdback_days)) ? Number(s.holdback_days) : 30;
  const min = Number.isFinite(Number(s.min_payout_cents)) ? Number(s.min_payout_cents) : 2000;
  const paidBy = {}; for (const p of payouts || []) paidBy[String(p.month).slice(0, 7)] = p;
  const curYm = new Date(now).toISOString().slice(0, 7);
  let carry = 0;
  const out = [];
  for (const ym of months) {
    const ls = lines.filter((l) => l.month === ym);
    const revenue = ls.reduce((a, l) => a + (l.kind === 'rev' || l.kind === 'refund' ? l.net : 0), 0);
    const com = ls.reduce((a, l) => a + l.cents, 0);
    const releaseMs = monthEnd(ym) + (hold - 1) * 864e5; // last day of the month + holdback days
    const release = new Date(releaseMs).toISOString().slice(0, 10);
    const row = { month: ym, revenue_cents: revenue, commission_cents: com, carry_in_cents: carry, payable_cents: 0, status: 'open', release_on: release, paid: null };
    if (!hasTerms) { row.status = 'no_terms'; row.commission_cents = 0; out.push(row); continue; }
    if (paidBy[ym]) { row.status = 'paid'; row.paid = paidBy[ym]; row.payable_cents = Number(paidBy[ym].amount_due_cents) || 0; carry = 0; out.push(row); continue; }
    const balance = carry + com;
    if (ym >= curYm) row.status = 'open';
    else if (now < releaseMs) row.status = 'holdback';
    else if (balance === 0) { row.status = 'zero'; out.push(row); continue; }
    else if (balance < min) { row.status = 'below_min'; carry = balance; out.push(row); continue; }
    else { row.status = 'due'; row.payable_cents = balance; carry = 0; out.push(row); continue; }
    row.payable_cents = balance; // shown as "a pagar quando liberar"; carry resolves when the month becomes due
    out.push(row);
  }
  return out;
}

// ------------------------------------------------------------------ portal masking
// Counts under 5 become "<5" for the creator (spec §7.4); money stays exact (base of the payout).
function small(n) { return typeof n === 'number' && n > 0 && n < 5 ? '<5' : n; }

module.exports = {
  PLATFORMS, SUFFIX_TO_PLATFORM, APPLE_APP_ID, PLAY_PACKAGE, SITE, RULES_VERSION, METHODS,
  normBase, validBase, suggestCode, slugOf, platformCode, parseCode, goLink, appleCt, appleUrl, playUrl,
  deviceOf, validCpf, validCnpj, normPix, normPhone, validateProfile, methodsFor, maskEmail, maskDoc, maskPix, maskPhone, maskName,
  dataKey, seal, open, newToken, tokenHash, validToken, inviteLink, portalLink, safeEqual,
  ledgerRow, netCents, isRefund, isTrialStart, canonicalUser, monthOf, PURCHASE_TYPES,
  resolveAttributions, commissionLines, statement, monthsBetween, termsAt, addMonths, small, UUID_RE,
};
