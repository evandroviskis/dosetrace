'use strict';
/**
 * Admin panel — Creators tab API. Spec docs/specs/creators.md §4, §7.1, §7.2, §8 (founder approved 2026-11-20).
 * Every request goes through api/_admAuth.js: GET needs an allow-listed aal2 session (or the DT Admin device);
 * POST also needs Origin https://dosetrace.io, role admin and the 15-minute step-up (device: biometrics).
 *
 * GET              → { months, creators (stats, test creators flagged), totals, summary, program }
 * GET ?id=<uuid>   → { creator (stats), links: { invite, portal } (the same links, shown again: founder P3),
 *                      history (audit, last 50) }
 * POST { action, ... }: create · review · set_status · rotate_link · add_terms · add_post · delete_post ·
 *   mark_paid · reveal · tax_form · settings. Each write is recorded in creator_audit (no e-mail, no document).
 * Default commission model for a new creator: the founder's 2026-11-19 decision (file 65): 35 % of net revenue,
 * 12 months from the first payment, renewals included, paid subscriptions only. Configurable per creator.
 */
const { checkAdmin } = require('./_admAuth.js');
const C = require('./_creators.js');
const D = require('./_creatorsData.js');

const DEFAULT_TERMS = { pct: 35, duration: 'months', duration_months: 12, basis: 'all', fixed_month_cents: 0, fixed_post_cents: 0 };
const INVITE_DAYS = 14;
const UUID_RE = C.UUID_RE;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(res, status, o) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(o)); }
async function readBody(req) {
  if (req.body != null) { if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } } return req.body; }
  return new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { resolve(null); } }); req.on('error', () => resolve(null)); });
}
const bad = (field) => ({ error: 'invalid', field });
const W = { 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function audit(sb, actor, action, creatorId, detail) {
  const d = detail ? JSON.parse(JSON.stringify(detail).replace(/@/g, '(at)')) : null;
  await D.rest(sb, 'creator_audit', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ actor, action, creator_id: creatorId || null, detail: d }) });
}
async function creatorRow(sb, id) {
  const r = await D.rest(sb, `creators?select=id,code,slug,display_name,country,platforms,status,is_test,created_at,approved_at,ended_at&id=eq.${encodeURIComponent(id)}`);
  return r.ok && Array.isArray(r.j) && r.j[0] ? r.j[0] : null;
}

// ------------------------------------------------------------------ validation of the terms body
function validTerms(t, requireDate) {
  if (!t || typeof t !== 'object') return bad('terms');
  const pct = Number(t.pct);
  if (!isFinite(pct) || pct < 0 || pct > 100) return bad('pct');
  if (['lifetime', 'while_subscribed', 'months'].indexOf(t.duration) < 0) return bad('duration');
  const months = t.duration === 'months' ? Number(t.duration_months) : null;
  if (t.duration === 'months' && (!Number.isInteger(months) || months < 1 || months > 120)) return bad('duration_months');
  if (['all', 'first_only'].indexOf(t.basis) < 0) return bad('basis');
  const fm = t.fixed_month_cents == null ? 0 : Number(t.fixed_month_cents), fp = t.fixed_post_cents == null ? 0 : Number(t.fixed_post_cents);
  if (!Number.isInteger(fm) || fm < 0 || fm > 10000000) return bad('fixed_month_cents');
  if (!Number.isInteger(fp) || fp < 0 || fp > 10000000) return bad('fixed_post_cents');
  if (requireDate && !DATE_RE.test(String(t.valid_from || ''))) return bad('valid_from');
  if (t.contract_signed_on != null && t.contract_signed_on !== '' && !DATE_RE.test(String(t.contract_signed_on))) return bad('contract_signed_on');
  const ref = t.contract_ref == null || t.contract_ref === '' ? null : String(t.contract_ref).slice(0, 200);
  return { pct, duration: t.duration, duration_months: months, basis: t.basis, fixed_month_cents: fm, fixed_post_cents: fp, valid_from: t.valid_from || null, contract_signed_on: t.contract_signed_on || null, contract_ref: ref };
}

// ------------------------------------------------------------------ actions
async function actCreate(sb, who, b, now) {
  const name = String(b.display_name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 80) return [400, bad('display_name')];
  const code = C.normBase(b.code || C.suggestCode(name));
  if (!C.validBase(code)) return [400, bad('code')];
  const platforms = Array.isArray(b.platforms) ? Array.from(new Set(b.platforms.map(String))) : [];
  if (!platforms.length || platforms.some((p) => !C.PLATFORMS[p])) return [400, bad('platforms')];
  const country = b.country ? String(b.country).toUpperCase() : null;
  if (country && !/^[A-Z]{2}$/.test(country)) return [400, bad('country')];
  let terms = null;
  if (b.terms === 'default' || b.terms == null) terms = Object.assign({ valid_from: new Date(now).toISOString().slice(0, 10) }, DEFAULT_TERMS);
  else if (b.terms !== 'none') { const t = validTerms(b.terms, false); if (t.error) return [400, t]; terms = Object.assign({}, t, { valid_from: t.valid_from || new Date(now).toISOString().slice(0, 10) }); }
  const key = C.dataKey();
  if (!key) return [503, { error: 'not_configured', field: 'CREATOR_DATA_KEY' }];
  const invite = C.newToken(), portal = C.newToken();
  const r = await D.rpc(sb, 'creator_create', { p: {
    code, display_name: name, country, platforms, is_test: b.is_test === true, actor: who.id, terms,
    invite_hash: C.tokenHash(invite), invite_enc: C.seal(invite, key), invite_expires_at: new Date(now + INVITE_DAYS * 864e5).toISOString(),
    portal_hash: C.tokenHash(portal), portal_enc: C.seal(portal, key),
  } });
  if (!r.ok) return [503, { error: 'store' }];
  if (r.j && r.j.error === 'code_taken') return [409, { error: 'code_taken', field: 'code' }];
  return [200, { ok: true, id: r.j && r.j.id, code, links: { invite: C.inviteLink(invite), portal: C.portalLink(portal), invite_expires_at: new Date(now + INVITE_DAYS * 864e5).toISOString() },
    codes: platforms.map((p) => ({ platform: p, code: C.platformCode(code, p), link: C.goLink(code, p) })) }];
}

async function actReview(sb, who, b, now) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  if (['approve', 'changes', 'reject'].indexOf(b.decision) < 0) return [400, bad('decision')];
  const note = b.note == null ? null : String(b.note).slice(0, 500);
  const p = await D.rest(sb, `creator_profiles?select=id,review&creator_id=eq.${c.id}&order=submitted_at.desc&limit=1`);
  const last = p.ok && Array.isArray(p.j) && p.j[0];
  if (!last) return [409, { error: 'no_profile' }];
  const review = b.decision === 'approve' ? 'approved' : b.decision === 'changes' ? 'changes_requested' : 'rejected';
  await D.rest(sb, `creator_profiles?id=eq.${last.id}`, { method: 'PATCH', headers: W, body: JSON.stringify({ review, review_note: note, reviewed_at: new Date(now).toISOString() }) });
  const patch = { updated_at: new Date(now).toISOString() };
  if (b.decision === 'approve' && c.status !== 'active') { patch.status = 'active'; patch.approved_at = c.approved_at || new Date(now).toISOString(); }
  if (b.decision === 'reject' && c.status !== 'active') patch.status = 'rejected';
  await D.rest(sb, `creators?id=eq.${c.id}`, { method: 'PATCH', headers: W, body: JSON.stringify(patch) });
  await audit(sb, who.id, 'review_' + b.decision, c.id, null);
  return [200, { ok: true }];
}

async function actStatus(sb, who, b, now) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  const to = String(b.status || '');
  const NEXT = { active: ['paused', 'ended'], paused: ['active', 'ended'], invited: ['ended'], submitted: ['ended'] };
  if ((NEXT[c.status] || []).indexOf(to) < 0) return [409, { error: 'transition' }];
  const patch = { status: to, updated_at: new Date(now).toISOString() };
  if (to === 'ended') patch.ended_at = new Date(now).toISOString();
  await D.rest(sb, `creators?id=eq.${c.id}`, { method: 'PATCH', headers: W, body: JSON.stringify(patch) });
  await audit(sb, who.id, 'status_' + to, c.id, null);
  return [200, { ok: true }];
}

async function actRotate(sb, who, b, now) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  if (b.kind !== 'invite' && b.kind !== 'portal') return [400, bad('kind')];
  const key = C.dataKey(); if (!key) return [503, { error: 'not_configured' }];
  const tok = C.newToken();
  const exp = b.kind === 'invite' ? new Date(now + INVITE_DAYS * 864e5).toISOString() : null;
  const r = await D.rpc(sb, 'creator_link_rotate', { p_creator: c.id, p_kind: b.kind, p_hash: C.tokenHash(tok), p_enc: C.seal(tok, key), p_expires: exp, p_actor: who.id });
  if (!r.ok) return [503, { error: 'store' }];
  return [200, { ok: true, link: b.kind === 'invite' ? C.inviteLink(tok) : C.portalLink(tok), expires_at: exp }];
}

async function actTerms(sb, who, b) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  const t = validTerms(b, true); if (t.error) return [400, t];
  const r = await D.rest(sb, 'creator_terms', { method: 'POST', headers: W, body: JSON.stringify(Object.assign({ creator_id: c.id, created_by: who.id }, t)) });
  if (r.status === 409) return [409, { error: 'duplicate_date' }];
  if (!r.ok) return [503, { error: 'store' }];
  await audit(sb, who.id, 'terms', c.id, { pct: t.pct, duration: t.duration, months: t.duration_months, basis: t.basis, from: t.valid_from });
  return [200, { ok: true }];
}

async function actPost(sb, who, b) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  if (!DATE_RE.test(String(b.posted_on || ''))) return [400, bad('posted_on')];
  const platform = b.platform && C.PLATFORMS[b.platform] ? b.platform : null;
  const note = b.note ? String(b.note).replace(/@/g, '').slice(0, 200) : null;
  const r = await D.rest(sb, 'creator_posts', { method: 'POST', headers: W, body: JSON.stringify({ creator_id: c.id, posted_on: b.posted_on, platform, note }) });
  if (!r.ok) return [503, { error: 'store' }];
  await audit(sb, who.id, 'post_add', c.id, { on: b.posted_on, platform });
  return [200, { ok: true }];
}
async function actPostDelete(sb, who, b) {
  if (!Number.isInteger(Number(b.post_id))) return [400, bad('post_id')];
  const r = await D.rest(sb, `creator_posts?id=eq.${Number(b.post_id)}`, { method: 'DELETE', headers: W });
  if (!r.ok) return [503, { error: 'store' }];
  const row = Array.isArray(r.j) && r.j[0];
  await audit(sb, who.id, 'post_delete', row ? row.creator_id : null, { id: Number(b.post_id) });
  return [200, { ok: true }];
}

async function actPaid(sb, who, b, now) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  if (!/^\d{4}-\d{2}$/.test(String(b.month || ''))) return [400, bad('month')];
  if (!DATE_RE.test(String(b.paid_on || ''))) return [400, bad('paid_on')];
  const amount = Number(b.paid_amount); if (!isFinite(amount) || amount < 0 || amount > 1e9) return [400, bad('paid_amount')];
  const cur = String(b.paid_currency || '').toUpperCase(); if (!/^[A-Z]{3}$/.test(cur)) return [400, bad('paid_currency')];
  const fx = b.fx == null || b.fx === '' ? null : Number(b.fx); if (fx != null && (!isFinite(fx) || fx <= 0)) return [400, bad('fx')];
  const method = String(b.method || '').trim().slice(0, 60); if (!method) return [400, bad('method')];
  const reference = b.reference ? String(b.reference).replace(/@/g, '').slice(0, 120) : null;
  const data = await D.load(sb, c.id);
  if (!c.is_test && !(data.settings && data.settings.payouts_enabled)) return [409, { error: 'payouts_disabled' }];
  const built = D.build(data, now);
  const st = built.creators.find((s) => s.id === c.id);
  const row = st && st.statement.find((r) => r.month === b.month);
  if (!row || row.status !== 'due') return [409, { error: 'not_due', status: row ? row.status : null }];
  const r = await D.rest(sb, 'creator_payouts', { method: 'POST', headers: W, body: JSON.stringify({ creator_id: c.id, month: b.month + '-01', amount_due_cents: row.payable_cents, paid_on: b.paid_on, paid_amount: amount, paid_currency: cur, fx, method, reference, created_by: who.id }) });
  if (r.status === 409) return [409, { error: 'already_paid' }];
  if (!r.ok) return [503, { error: 'store' }];
  await audit(sb, who.id, 'mark_paid', c.id, { month: b.month, due_cents: row.payable_cents, paid: amount, currency: cur });
  return [200, { ok: true, amount_due_cents: row.payable_cents }];
}

async function actReveal(sb, who, b) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  const key = C.dataKey(); if (!key) return [503, { error: 'not_configured' }];
  const p = await D.rest(sb, `creator_profiles?select=id,profile_enc&creator_id=eq.${c.id}&order=submitted_at.desc&limit=1`);
  const last = p.ok && Array.isArray(p.j) && p.j[0];
  if (!last) return [404, { error: 'no_profile' }];
  const prof = C.open(last.profile_enc, key);
  if (!prof) return [500, { error: 'decrypt' }];
  await audit(sb, who.id, 'reveal', c.id, { profile: last.id });
  return [200, { ok: true, profile: prof }];
}

async function actTaxForm(sb, who, b) {
  const c = await creatorRow(sb, b.id); if (!c) return [404, { error: 'unknown' }];
  if (!DATE_RE.test(String(b.date || ''))) return [400, bad('date')];
  const p = await D.rest(sb, `creator_profiles?select=id&creator_id=eq.${c.id}&order=submitted_at.desc&limit=1`);
  const last = p.ok && Array.isArray(p.j) && p.j[0]; if (!last) return [404, { error: 'no_profile' }];
  await D.rest(sb, `creator_profiles?id=eq.${last.id}`, { method: 'PATCH', headers: W, body: JSON.stringify({ tax_form_received_on: b.date }) });
  await audit(sb, who.id, 'tax_form', c.id, { on: b.date });
  return [200, { ok: true }];
}

async function actSettings(sb, who, b, now) {
  const cur = await D.rest(sb, 'creator_program_settings?select=*&id=eq.1');
  const s = cur.ok && Array.isArray(cur.j) && cur.j[0]; if (!s) return [503, { error: 'not_configured' }];
  const patch = { updated_at: new Date(now).toISOString(), updated_by: who.id };
  if (b.min_payout_cents != null) { const v = Number(b.min_payout_cents); if (!Number.isInteger(v) || v < 0 || v > 1000000) return [400, bad('min_payout_cents')]; patch.min_payout_cents = v; }
  if (b.holdback_days != null) { const v = Number(b.holdback_days); if (!Number.isInteger(v) || v < 0 || v > 120) return [400, bad('holdback_days')]; patch.holdback_days = v; }
  if (b.benefit_text !== undefined) { const v = b.benefit_text == null ? null : String(b.benefit_text).trim().slice(0, 200); if (v && /@|https?:|www\./i.test(v)) return [400, bad('benefit_text')]; patch.benefit_text = v || null; }
  if (b.apple_pt !== undefined) { const v = b.apple_pt == null || b.apple_pt === '' ? null : String(b.apple_pt).trim(); if (v && !/^[0-9]{3,20}$/.test(v)) return [400, bad('apple_pt')]; patch.apple_pt = v; }
  if (b.accountant_ok !== undefined) patch.accountant_ok_at = b.accountant_ok ? (s.accountant_ok_at || new Date(now).toISOString()) : null;
  if (b.lawyer_ok !== undefined) patch.lawyer_ok_at = b.lawyer_ok ? (s.lawyer_ok_at || new Date(now).toISOString()) : null;
  const acc = patch.accountant_ok_at !== undefined ? patch.accountant_ok_at : s.accountant_ok_at;
  const law = patch.lawyer_ok_at !== undefined ? patch.lawyer_ok_at : s.lawyer_ok_at;
  if (b.payouts_enabled !== undefined) { if (b.payouts_enabled && (!acc || !law)) return [409, { error: 'reviews_missing' }]; patch.payouts_enabled = !!b.payouts_enabled; }
  else if (s.payouts_enabled && (!acc || !law)) patch.payouts_enabled = false;
  const r = await D.rest(sb, 'creator_program_settings?id=eq.1', { method: 'PATCH', headers: W, body: JSON.stringify(patch) });
  if (!r.ok) return [503, { error: 'store' }];
  const d = Object.assign({}, patch); delete d.updated_at; delete d.updated_by;
  await audit(sb, who.id, 'settings', null, d);
  return [200, { ok: true }];
}

const ACTIONS = { create: actCreate, review: actReview, set_status: actStatus, rotate_link: actRotate, add_terms: actTerms, add_post: actPost, delete_post: actPostDelete, mark_paid: actPaid, reveal: actReveal, tax_form: actTaxForm, settings: actSettings };

async function handler(req, res, opts) {
  const auth = await checkAdmin(req, opts);
  if (!auth.ok) return json(res, auth.status, auth.body);
  const sb = D.sbConf();
  if (!sb) return json(res, 503, { error: 'not_configured' });
  const now = (opts && opts.now) || Date.now();
  try {
    if (!auth.write) {
      let q; try { q = new URL(req.url || '/', 'http://x').searchParams; } catch (e) { q = new URLSearchParams(); }
      const id = q.get('id');
      if (id) {
        if (!UUID_RE.test(id)) return json(res, 400, bad('id'));
        const data = await D.load(sb, id);
        if (!data.creators.length) return json(res, 404, { error: 'unknown' });
        const built = D.build(data, now);
        const key = C.dataKey();
        const lk = await D.rest(sb, `creator_links?select=kind,token_enc,expires_at,created_at,last_used_at&creator_id=eq.${encodeURIComponent(id)}&revoked_at=is.null`);
        const links = {};
        for (const l of (lk.ok && Array.isArray(lk.j) ? lk.j : [])) { const t = key ? C.open(l.token_enc, key) : null; links[l.kind] = { url: t ? (l.kind === 'invite' ? C.inviteLink(t) : C.portalLink(t)) : null, expires_at: l.expires_at, last_used_at: l.last_used_at, created_at: l.created_at }; }
        const h = await D.rest(sb, `creator_audit?select=at,action,detail&creator_id=eq.${encodeURIComponent(id)}&order=at.desc&limit=50`);
        const st = built.creators[0];
        st.codes = st.platforms.map((p) => ({ platform: p, code: C.platformCode(st.code, p), link: C.goLink(st.code, p) }));
        return json(res, 200, { months: built.months, creator: st, links, history: h.ok ? h.j : [], program: built.program, generated_at: new Date(now).toISOString() });
      }
      const data = await D.load(sb, null);
      const built = D.build(data, now);
      for (const st of built.creators) { delete st.posts; st.codes = st.platforms.map((p) => ({ platform: p, code: C.platformCode(st.code, p), link: C.goLink(st.code, p) })); }
      return json(res, 200, Object.assign(built, { generated_at: new Date(now).toISOString(), defaults: DEFAULT_TERMS }));
    }
    const b = await readBody(req);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, bad('body'));
    const fn = ACTIONS[b.action];
    if (!fn) return json(res, 400, bad('action'));
    if (b.action !== 'create' && b.action !== 'settings' && b.action !== 'delete_post' && !UUID_RE.test(String(b.id || ''))) return json(res, 400, bad('id'));
    const [status, body] = await fn(sb, auth.user, b, now);
    return json(res, status, body);
  } catch (e) {
    if (e && e.table) return json(res, 503, { error: 'not_configured', table: e.table });
    return json(res, 503, { error: 'unavailable' });
  }
}

module.exports = handler;
module.exports.DEFAULT_TERMS = DEFAULT_TERMS;
module.exports.validTerms = validTerms;
